-- 026: Gói Swipe Nest Plus cho người dùng + tài khoản chính thức của Swipe Nest + nhãn "Swipe Nest đã kiểm tra".
--
-- 1. users.is_official: tài khoản môi giới do đội Swipe Nest vận hành (đăng lại nguồn hàng, đăng hộ môi giới
--    ngoài nền tảng). Không cần KYC, không cần gói, không giới hạn số tin. Liên hệ (chat/SĐT) tin của tài khoản
--    này chỉ dành cho người có gói Plus (kiểm tra ở backend).
-- 2. property_admin_checks: tin được đội Swipe Nest kiểm tra thực tế (bảng riêng để không đổi cột của view
--    ranked_properties). Nhãn hiện cho mọi người; mục "Đã kiểm tra" ở trang chủ chỉ dành cho Plus.
-- 3. Gói Plus: user_billing_plans, user_subscriptions (mỗi kỳ một dòng, mua thêm thì cộng dồn sau kỳ cuối),
--    thanh toán dùng chung bảng agent_payment_orders (cột audience) để thống kê doanh thu admin tự cộng vào.
-- Chạy lại nhiều lần vẫn an toàn. Dòng UPDATE duy nhất đánh dấu tài khoản "Nhà mẫu Swipe Nest" là chính thức.
BEGIN;

-- ---------- 1. Tài khoản chính thức ----------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;
UPDATE public.users SET is_official = true
  WHERE lower(email) = 'swipenest.discovery.seed@estate.test' AND upper(role) = 'AGENT' AND is_official IS NOT TRUE;

-- Tin công khai: môi giới đã KYC, hoặc tài khoản chính thức (không giới hạn số tin).
CREATE OR REPLACE VIEW public.ranked_properties AS
WITH current_entitlements AS (
  SELECT DISTINCT ON (s.user_id) s.user_id,s.priority_points,s.listing_limit
  FROM public.seller_subscriptions s
  WHERE s.status='ACTIVE' AND s.start_date<=now() AT TIME ZONE 'UTC' AND s.end_date>now() AT TIME ZONE 'UTC'
  ORDER BY s.user_id,s.start_date DESC,s.id DESC
)
SELECT p.*,coalesce(e.priority_points,0)+coalesce(p.priority_score,0) AS display_priority,
  public.listing_property_type_key(p.property_type) AS property_type_key,
  ARRAY(SELECT lower(feature_name) FROM public.property_features WHERE property_id=p.id
    UNION SELECT lower(tag_name) FROM public.lifestyle_tags WHERE property_id=p.id) AS search_features
FROM public.users u
LEFT JOIN current_entitlements e ON e.user_id=u.id
CROSS JOIN LATERAL (
  SELECT listing.* FROM public.properties listing
  WHERE listing.owner_id=u.id AND listing.status='AVAILABLE'
    AND listing.is_hidden IS NOT TRUE AND listing.is_public IS TRUE
  ORDER BY listing.id DESC LIMIT CASE WHEN u.is_official THEN NULL ELSE e.listing_limit END
) p
WHERE u.is_active IS TRUE AND u.role='AGENT' AND (u.verification_status='VERIFIED' OR u.is_official IS TRUE)
  AND coalesce(u.trust_score,50)>30;

REVOKE ALL ON public.ranked_properties FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ranked_properties TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_agent_listing_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE v_limit integer; v_count bigint; v_official boolean;
BEGIN
  IF NEW.status<>'AVAILABLE' OR NEW.is_hidden IS TRUE OR NEW.is_public IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.owner_id=NEW.owner_id AND OLD.status='AVAILABLE' AND OLD.is_hidden IS NOT TRUE AND OLD.is_public IS TRUE THEN RETURN NEW; END IF;
  END IF;
  SELECT is_official INTO v_official FROM public.users WHERE id=NEW.owner_id AND role='AGENT' AND is_active IS TRUE
    AND (verification_status='VERIFIED' OR is_official IS TRUE) AND coalesce(trust_score,50)>30 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LISTING_OWNER_INELIGIBLE' USING ERRCODE='P0001'; END IF;
  IF v_official THEN RETURN NEW; END IF;
  SELECT listing_limit INTO v_limit FROM public.seller_subscriptions WHERE user_id=NEW.owner_id AND status='ACTIVE'
    AND start_date<=now() AT TIME ZONE 'UTC' AND end_date>now() AT TIME ZONE 'UTC'
    ORDER BY start_date DESC,id DESC LIMIT 1;
  IF v_limit IS NULL THEN RAISE EXCEPTION 'LISTING_SUBSCRIPTION_REQUIRED' USING ERRCODE='P0001'; END IF;
  SELECT count(*) INTO v_count FROM public.properties WHERE owner_id=NEW.owner_id AND status='AVAILABLE' AND is_hidden IS NOT TRUE AND is_public IS TRUE;
  IF v_count>=v_limit THEN RAISE EXCEPTION 'LISTING_QUOTA_EXCEEDED' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END; $$;

-- Admin bật / tắt tài khoản chính thức (chỉ áp dụng cho tài khoản môi giới).
CREATE OR REPLACE FUNCTION public.admin_set_official_account(p_actor_id integer, p_user_id integer, p_official boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_user public.users%ROWTYPE;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_official IS NULL THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
  UPDATE public.users SET is_official=p_official WHERE id=p_user_id AND upper(role)='AGENT' RETURNING * INTO v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent not found' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('id',v_user.id,'name',v_user.name,'email',v_user.email,'is_official',v_user.is_official);
END $$;

-- ---------- 2. Nhãn "Swipe Nest đã kiểm tra" ----------
CREATE TABLE IF NOT EXISTS public.property_admin_checks (
  property_id integer PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  checked_by integer NOT NULL REFERENCES public.users(id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR length(note) <= 500)
);
CREATE INDEX IF NOT EXISTS property_admin_checks_checked_idx ON public.property_admin_checks (checked_at DESC);
ALTER TABLE public.property_admin_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_admin_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.property_admin_checks TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_property_check(p_actor_id integer, p_property_id integer, p_checked boolean, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_checked IS NULL OR (p_note IS NOT NULL AND length(p_note) > 500) THEN
    RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.properties WHERE id=p_property_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Property not found' USING ERRCODE='P0002'; END IF;
  IF p_checked THEN
    INSERT INTO public.property_admin_checks (property_id, checked_by, checked_at, note)
    VALUES (p_property_id, p_actor_id, now(), nullif(btrim(p_note), ''))
    ON CONFLICT (property_id) DO UPDATE SET checked_by=EXCLUDED.checked_by, checked_at=EXCLUDED.checked_at, note=EXCLUDED.note;
  ELSE
    DELETE FROM public.property_admin_checks WHERE property_id=p_property_id;
  END IF;
  RETURN jsonb_build_object('property_id',p_property_id,'admin_checked',p_checked);
END $$;

-- ---------- 3. Gói Plus cho người dùng ----------
CREATE TABLE IF NOT EXISTS public.user_billing_plans (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z_]{3,30}$'),
  name text NOT NULL,
  amount_vnd integer NOT NULL CHECK (amount_vnd > 0),
  duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 12),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.user_billing_plans (code, name, amount_vnd, duration_months)
VALUES ('USER_PLUS', 'Swipe Nest Plus', 20000, 1) ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  price_vnd integer NOT NULL CHECK (price_vnd >= 0),
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL CHECK (end_date > start_date),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  source text NOT NULL CHECK (source IN ('PAYOS', 'ADMIN')),
  ended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_subscriptions_user_idx ON public.user_subscriptions (user_id, end_date DESC);

CREATE TABLE IF NOT EXISTS public.user_subscription_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES public.users(id),
  actor_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('GRANTED', 'REMOVED')),
  request_id uuid NOT NULL,
  months integer,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_subscription_audit_actor_request_key UNIQUE (actor_id, request_id)
);
CREATE INDEX IF NOT EXISTS user_subscription_audit_user_idx ON public.user_subscription_audit (user_id, created_at DESC);

ALTER TABLE public.user_billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscription_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_billing_plans, public.user_subscriptions, public.user_subscription_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_billing_plans, public.user_subscriptions, public.user_subscription_audit TO service_role;

-- Đơn thanh toán dùng chung bảng với môi giới: audience phân biệt, đơn của người dùng gắn user_subscription_id.
ALTER TABLE public.agent_payment_orders
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'AGENT',
  ADD COLUMN IF NOT EXISTS user_subscription_id bigint REFERENCES public.user_subscriptions(id);
ALTER TABLE public.agent_payment_orders DROP CONSTRAINT IF EXISTS agent_payment_orders_audience_check;
ALTER TABLE public.agent_payment_orders ADD CONSTRAINT agent_payment_orders_audience_check CHECK (audience IN ('AGENT', 'USER'));
ALTER TABLE public.agent_payment_orders DROP CONSTRAINT IF EXISTS agent_payment_orders_check;
ALTER TABLE public.agent_payment_orders DROP CONSTRAINT IF EXISTS agent_payment_orders_paid_check;
ALTER TABLE public.agent_payment_orders ADD CONSTRAINT agent_payment_orders_paid_check CHECK (
  status <> 'PAID' OR (paid_at IS NOT NULL AND verified_at IS NOT NULL AND payment_link_id IS NOT NULL AND grant_end IS NOT NULL
    AND ((audience = 'AGENT' AND subscription_id IS NOT NULL) OR (audience = 'USER' AND user_subscription_id IS NOT NULL))));

-- Thêm một kỳ: bắt đầu ngay nếu đang không có Plus, ngược lại nối tiếp sau kỳ cuối cùng.
CREATE OR REPLACE FUNCTION public.user_apply_plus_period(p_user_id integer, p_plan_code text, p_price_vnd integer, p_months integer, p_source text)
RETURNS public.user_subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_start timestamptz; v_row public.user_subscriptions%ROWTYPE;
BEGIN
  IF p_months IS NULL OR p_months NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Invalid months' USING ERRCODE='22023'; END IF;
  SELECT greatest(now(), coalesce(max(end_date), now())) INTO v_start
    FROM public.user_subscriptions WHERE user_id=p_user_id AND status='ACTIVE' AND end_date>now();
  INSERT INTO public.user_subscriptions (user_id, plan_code, price_vnd, start_date, end_date, source)
    VALUES (p_user_id, p_plan_code, p_price_vnd, v_start, v_start + make_interval(months => p_months), p_source)
    RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Trạng thái Plus: active, ngày hết hạn của toàn bộ chuỗi kỳ, các kỳ còn hiệu lực.
CREATE OR REPLACE FUNCTION public.user_plus_state(p_user_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object(
    'active', EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id=p_user_id AND status='ACTIVE' AND start_date<=now() AND end_date>now()),
    'current_end', (SELECT max(end_date) FROM public.user_subscriptions WHERE user_id=p_user_id AND status='ACTIVE' AND end_date>now()),
    'periods', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'start_date',start_date,'end_date',end_date,'source',source,'price_vnd',price_vnd) ORDER BY start_date)
      FROM public.user_subscriptions WHERE user_id=p_user_id AND status='ACTIVE' AND end_date>now()), '[]'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.reserve_user_payment(p_user_id integer, p_plan_code text, p_request_id uuid, p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_plan public.user_billing_plans%ROWTYPE; v_order public.agent_payment_orders%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.users WHERE id=p_user_id AND upper(role)='USER' AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User unavailable' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  UPDATE public.agent_payment_orders SET status='EXPIRED',updated_at=now()
    WHERE user_id=p_user_id AND status IN ('CREATING','PENDING') AND expires_at<=now();
  SELECT * INTO v_order FROM public.agent_payment_orders WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_order.plan_code<>p_plan_code THEN RAISE EXCEPTION 'Request reused for another plan' USING ERRCODE='22023'; END IF;
    RETURN to_jsonb(v_order);
  END IF;
  SELECT * INTO v_order FROM public.agent_payment_orders WHERE user_id=p_user_id AND status IN ('CREATING','PENDING');
  IF FOUND THEN RETURN to_jsonb(v_order); END IF;
  SELECT * INTO v_plan FROM public.user_billing_plans WHERE code=p_plan_code AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS DISTINCT FROM v_plan.version THEN RAISE EXCEPTION 'Stale plan' USING ERRCODE='40001'; END IF;
  INSERT INTO public.agent_payment_orders(user_id,request_id,plan_code,plan_name,amount_vnd,duration_months,audience)
    VALUES(p_user_id,p_request_id,v_plan.code,v_plan.name,v_plan.amount_vnd,v_plan.duration_months,'USER')
    RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END $$;

-- Xác nhận thanh toán (webhook / đồng bộ payOS): đơn của môi giới giữ nguyên quy tắc 023, đơn của người dùng thêm kỳ Plus.
CREATE OR REPLACE FUNCTION public.settle_agent_payment(p_order_code bigint, p_link_id text, p_amount integer, p_paid_at timestamptz, p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public' SET "TimeZone" TO 'UTC' SET statement_timeout TO '8s' AS $$
DECLARE v_order public.agent_payment_orders%ROWTYPE; v_subscription public.seller_subscriptions%ROWTYPE;
  v_plus public.user_subscriptions%ROWTYPE; v_user_id integer;
BEGIN
  SELECT user_id INTO v_user_id FROM public.agent_payment_orders WHERE order_code = p_order_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  SELECT * INTO STRICT v_order FROM public.agent_payment_orders WHERE order_code = p_order_code FOR UPDATE;
  IF p_link_id IS NULL OR length(p_link_id) > 100 OR p_amount IS DISTINCT FROM v_order.amount_vnd
    OR (v_order.payment_link_id IS NOT NULL AND v_order.payment_link_id <> p_link_id)
    OR p_paid_at IS NULL OR p_paid_at > now() + interval '5 minutes' OR p_paid_at < v_order.created_at - interval '5 minutes' THEN
    RAISE EXCEPTION 'Payment verification mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_order.status = 'PAID' THEN RETURN to_jsonb(v_order); END IF;
  IF v_order.audience = 'USER' THEN
    v_plus := public.user_apply_plus_period(v_user_id, v_order.plan_code, v_order.amount_vnd, v_order.duration_months, 'PAYOS');
    UPDATE public.agent_payment_orders SET status = 'PAID', payment_link_id = p_link_id, paid_at = p_paid_at, verified_at = now(),
      provider_reference = left(p_reference, 200), user_subscription_id = v_plus.id,
      grant_start = v_plus.start_date, grant_end = v_plus.end_date, updated_at = now()
      WHERE id = v_order.id RETURNING * INTO v_order;
    RETURN to_jsonb(v_order);
  END IF;
  v_subscription := public.agent_apply_period(v_user_id, v_order.plan_code, v_order.amount_vnd, v_order.duration_months,
    v_order.listing_limit, v_order.priority_points, v_order.support_tier, 'PAYOS');
  UPDATE public.agent_payment_orders SET status = 'PAID', payment_link_id = p_link_id, paid_at = p_paid_at, verified_at = now(),
    provider_reference = left(p_reference, 200), subscription_id = v_subscription.id,
    grant_start = v_subscription.start_date AT TIME ZONE 'UTC', grant_end = v_subscription.end_date AT TIME ZONE 'UTC', updated_at = now()
    WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END $$;

-- Admin cấp thêm tháng Plus (miễn phí, cộng dồn) hoặc gỡ Plus. request_id chống bấm trùng.
CREATE OR REPLACE FUNCTION public.admin_grant_user_plus(p_actor_id integer, p_request_id uuid, p_user_id integer, p_months integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
    OR p_months IS NULL OR p_months NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.users WHERE id=p_user_id AND upper(role)='USER' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_subscription_audit WHERE actor_id=p_actor_id AND request_id=p_request_id) THEN
    RETURN public.user_plus_state(p_user_id);
  END IF;
  PERFORM public.user_apply_plus_period(p_user_id, 'USER_PLUS', 0, p_months, 'ADMIN');
  INSERT INTO public.user_subscription_audit (user_id, actor_id, actor_name, action, request_id, months, reason)
    SELECT p_user_id, p_actor_id, coalesce(u.name,'Admin'), 'GRANTED', p_request_id, p_months, btrim(p_reason) FROM public.users u WHERE u.id=p_actor_id;
  RETURN public.user_plus_state(p_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_user_plus(p_actor_id integer, p_request_id uuid, p_user_id integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.users WHERE id=p_user_id AND upper(role)='USER' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_subscription_audit WHERE actor_id=p_actor_id AND request_id=p_request_id) THEN
    RETURN public.user_plus_state(p_user_id);
  END IF;
  UPDATE public.user_subscriptions SET status='CANCELLED', ended_reason='ADMIN_REMOVED', updated_at=now(),
      end_date=CASE WHEN start_date<=now() THEN greatest(now(), start_date + interval '1 second') ELSE end_date END
    WHERE user_id=p_user_id AND status='ACTIVE' AND end_date>now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'No running period' USING ERRCODE='23505'; END IF;
  INSERT INTO public.user_subscription_audit (user_id, actor_id, actor_name, action, request_id, reason)
    SELECT p_user_id, p_actor_id, coalesce(u.name,'Admin'), 'REMOVED', p_request_id, btrim(p_reason) FROM public.users u WHERE u.id=p_actor_id;
  RETURN public.user_plus_state(p_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_user_plus(p_actor_id integer, p_user_id integer DEFAULT NULL, p_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_user public.users%ROWTYPE;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  SELECT * INTO v_user FROM public.users
    WHERE upper(role)='USER' AND ((p_user_id IS NOT NULL AND id=p_user_id)
      OR (p_user_id IS NULL AND p_email IS NOT NULL AND lower(btrim(email))=lower(btrim(p_email))))
    LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object(
    'user', jsonb_build_object('id',v_user.id,'name',v_user.name,'email',v_user.email,'is_active',v_user.is_active),
    'plus', public.user_plus_state(v_user.id),
    'audit', coalesce((SELECT jsonb_agg(jsonb_build_object('action',a.action,'actor_name',a.actor_name,'months',a.months,'reason',a.reason,'created_at',a.created_at) ORDER BY a.created_at DESC)
      FROM (SELECT * FROM public.user_subscription_audit WHERE user_id=v_user.id ORDER BY created_at DESC LIMIT 20) a), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.user_apply_plus_period(integer, text, integer, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_plus_state(integer), public.reserve_user_payment(integer, text, uuid, integer),
  public.settle_agent_payment(bigint, text, integer, timestamptz, text),
  public.admin_grant_user_plus(integer, uuid, integer, integer, text), public.admin_remove_user_plus(integer, uuid, integer, text),
  public.admin_user_plus(integer, integer, text), public.admin_set_official_account(integer, integer, boolean),
  public.admin_set_property_check(integer, integer, boolean, text), public.enforce_agent_listing_quota()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_plus_state(integer), public.reserve_user_payment(integer, text, uuid, integer),
  public.settle_agent_payment(bigint, text, integer, timestamptz, text),
  public.admin_grant_user_plus(integer, uuid, integer, integer, text), public.admin_remove_user_plus(integer, uuid, integer, text),
  public.admin_user_plus(integer, integer, text), public.admin_set_official_account(integer, integer, boolean),
  public.admin_set_property_check(integer, integer, boolean, text)
  TO service_role;

-- Danh sách tin công khai: thêm owner.is_official, admin_checked và bộ lọc adminChecked (mục "Đã kiểm tra" của Plus).
CREATE OR REPLACE FUNCTION public.search_ranked_properties(p_filters jsonb DEFAULT '{}'::jsonb, p_listing_type text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_ids integer[] DEFAULT NULL::integer[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' SET statement_timeout TO '8s' AS $$
DECLARE v_items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p_filters)<>'object'
    OR cardinality(p_ids)>500 THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
  WITH candidates AS (
    SELECT p.* FROM public.ranked_properties p
    WHERE (p_ids IS NULL OR p.id=ANY(p_ids))
      AND (p_listing_type IS NULL OR p.listing_type=p_listing_type OR p.listing_type IS NULL)
      AND (p_category IS NULL OR p.property_type_key=public.listing_property_type_key(p_category))
      AND (NOT p_filters ? 'categories' OR p_filters->'categories' ? p.property_type_key)
      AND (NOT p_filters ? 'wards' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_filters->'wards') w
        WHERE public.listing_location_key(w)=public.listing_location_key(p.ward)))
      AND (NOT p_filters ? 'city' OR public.listing_location_key(p.city)=public.listing_location_key(p_filters->>'city'))
      AND (NOT p_filters ? 'district' OR public.listing_location_key(p.district)=public.listing_location_key(p_filters->>'district'))
      AND (NOT p_filters ? 'listingType' OR p.listing_type=p_filters->>'listingType')
      AND (NOT p_filters ? 'minPrice' OR p.price>=(p_filters->>'minPrice')::numeric)
      AND (NOT p_filters ? 'maxPrice' OR p.price<=(p_filters->>'maxPrice')::numeric)
      AND (NOT p_filters ? 'minArea' OR p.area>=(p_filters->>'minArea')::numeric)
      AND (NOT p_filters ? 'maxArea' OR p.area<=(p_filters->>'maxArea')::numeric)
      AND (NOT p_filters ? 'bedrooms' OR p_filters->'bedrooms' ? p.bedrooms::text OR (p_filters->'bedrooms' ? '4+' AND p.bedrooms>=4))
      AND (NOT p_filters ? 'features' OR p.search_features @> ARRAY(SELECT jsonb_array_elements_text(p_filters->'features')))
      AND (NOT p_filters ? 'adminChecked' OR EXISTS (SELECT 1 FROM public.property_admin_checks c WHERE c.property_id=p.id))
    ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,p.id) END,
      p.display_priority DESC,p.id DESC LIMIT p_limit
  )
  SELECT coalesce(jsonb_agg(item ORDER BY position,display_priority DESC,id DESC),'[]'::jsonb) INTO v_items FROM (
    SELECT p.id,p.display_priority,array_position(p_ids,p.id) AS position,
      (to_jsonb(p)-'search_features'-'property_type_key') || jsonb_build_object(
        'owner',jsonb_build_object('name',u.name,'role',u.role,'avatar',u.avatar,'trust_score',u.trust_score,
          'verification_status',u.verification_status,'created_at',u.created_at,'is_official',u.is_official),
        'admin_checked',EXISTS (SELECT 1 FROM public.property_admin_checks c WHERE c.property_id=p.id),
        'property_features',coalesce((SELECT jsonb_agg(jsonb_build_object('feature_name',feature_name)) FROM public.property_features WHERE property_id=p.id),'[]'::jsonb),
        'property_images',coalesce((SELECT jsonb_agg(jsonb_build_object('image_url',image_url)) FROM public.property_images WHERE property_id=p.id),'[]'::jsonb),
        'lifestyle_tags',coalesce((SELECT jsonb_agg(jsonb_build_object('tag_name',tag_name)) FROM public.lifestyle_tags WHERE property_id=p.id),'[]'::jsonb)) AS item
    FROM candidates p JOIN public.users u ON u.id=p.owner_id
  ) rows;
  RETURN v_items;
END; $$;
REVOKE ALL ON FUNCTION public.search_ranked_properties(jsonb,text,text,integer,integer[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_ranked_properties(jsonb,text,text,integer,integer[]) TO service_role;

INSERT INTO public.app_schema_migrations (id) VALUES ('026') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
