-- 023: quản lý gói dịch vụ môi giới — nâng cấp có hiệu lực ngay, hạ cấp/gia hạn xếp hàng,
-- môi giới hủy các kỳ đang chờ, admin cấp / đổi hạng / gỡ gói, kèm nhật ký.
-- Yêu cầu 018, 019, 020. Chạy lại nhiều lần vẫn an toàn. Không sửa dữ liệu hiện có.
--
-- Khái niệm: mỗi dòng seller_subscriptions là một "kỳ". Kỳ đang chạy = ACTIVE và start_date <= now < end_date.
-- Kỳ đang chờ = ACTIVE và start_date > now. Hạng gói so theo support_tier: LITE < PLUS < PRO.
BEGIN;

ALTER TABLE public.seller_subscriptions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PAYOS',
  ADD COLUMN IF NOT EXISTS ended_reason text;
ALTER TABLE public.seller_subscriptions DROP CONSTRAINT IF EXISTS seller_subscriptions_source_check;
ALTER TABLE public.seller_subscriptions ADD CONSTRAINT seller_subscriptions_source_check CHECK (source IN ('PAYOS', 'ADMIN'));

CREATE TABLE IF NOT EXISTS public.agent_subscription_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES public.users(id),
  actor_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('GRANTED', 'CHANGED', 'REMOVED', 'CANCELLED_QUEUED')),
  request_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_subscription_audit_actor_request_key UNIQUE (actor_id, request_id)
);
CREATE INDEX IF NOT EXISTS agent_subscription_audit_user_idx ON public.agent_subscription_audit (user_id, created_at DESC, id DESC);
ALTER TABLE public.agent_subscription_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_subscription_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.agent_subscription_audit TO service_role;

CREATE OR REPLACE FUNCTION public.agent_tier_rank(p_tier text)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT CASE upper(coalesce(p_tier, '')) WHEN 'LITE' THEN 1 WHEN 'PLUS' THEN 2 WHEN 'PRO' THEN 3 ELSE 0 END;
$$;

-- Thêm một kỳ mới cho môi giới theo quy tắc chung (dùng cho cả thanh toán payOS và admin cấp):
--   chưa có kỳ đang chạy  -> bắt đầu ngay;
--   hạng cao hơn kỳ đang chạy (nâng cấp) -> kỳ đang chạy kết thúc ngay, kỳ mới bắt đầu ngay;
--   cùng hạng (gia hạn) hoặc thấp hơn (hạ cấp) -> xếp sau kỳ cuối cùng.
-- Khi kỳ mới bắt đầu ngay, các kỳ đang chờ được dời ra sau nó và giữ nguyên độ dài.
-- Hàm nội bộ: người gọi phải khóa dòng users của môi giới trước.
CREATE OR REPLACE FUNCTION public.agent_apply_period(
  p_user_id integer, p_plan_code text, p_price_vnd numeric, p_months integer,
  p_listing_limit integer, p_priority_points integer, p_support_tier text, p_source text
) RETURNS public.seller_subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET timezone = 'UTC' AS $$
DECLARE
  v_now timestamp := now() AT TIME ZONE 'UTC';
  v_current public.seller_subscriptions%ROWTYPE;
  v_new public.seller_subscriptions%ROWTYPE;
  v_queued public.seller_subscriptions%ROWTYPE;
  v_start timestamp;
  v_cursor timestamp;
  v_immediate boolean;
BEGIN
  IF p_months IS NULL OR p_months NOT BETWEEN 1 AND 12 OR public.agent_tier_rank(p_support_tier) = 0
    OR p_source NOT IN ('PAYOS', 'ADMIN') THEN
    RAISE EXCEPTION 'Invalid subscription period' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current FROM public.seller_subscriptions
    WHERE user_id = p_user_id AND status = 'ACTIVE' AND start_date <= v_now AND end_date > v_now
    ORDER BY start_date DESC, id DESC LIMIT 1 FOR UPDATE;

  v_immediate := v_current.id IS NULL
    OR public.agent_tier_rank(p_support_tier) > public.agent_tier_rank(v_current.support_tier);

  IF v_immediate THEN
    IF v_current.id IS NOT NULL THEN
      -- Nâng cấp: phần còn lại của kỳ cũ bị bỏ (không hoàn, không cộng ngày).
      UPDATE public.seller_subscriptions
        SET status = 'EXPIRED', end_date = v_now, ended_reason = 'UPGRADED', updated_at = v_now
        WHERE id = v_current.id;
    END IF;
    v_start := v_now;
  ELSE
    SELECT max(end_date) INTO v_start FROM public.seller_subscriptions
      WHERE user_id = p_user_id AND status = 'ACTIVE' AND end_date > v_now;
  END IF;

  INSERT INTO public.seller_subscriptions (user_id, plan_name, price_vnd, start_date, end_date, status, created_at,
      updated_at, listing_limit, priority_points, support_tier, source)
    VALUES (p_user_id, p_plan_code, p_price_vnd, v_start, v_start + make_interval(months => p_months), 'ACTIVE', v_now,
      v_now, p_listing_limit, p_priority_points, p_support_tier, p_source)
    RETURNING * INTO v_new;

  IF v_immediate THEN
    v_cursor := v_new.end_date;
    FOR v_queued IN SELECT * FROM public.seller_subscriptions
      WHERE user_id = p_user_id AND status = 'ACTIVE' AND start_date > v_now AND id <> v_new.id
      ORDER BY start_date, id FOR UPDATE LOOP
      UPDATE public.seller_subscriptions
        SET start_date = v_cursor, end_date = v_cursor + (v_queued.end_date - v_queued.start_date), updated_at = v_now
        WHERE id = v_queued.id;
      v_cursor := v_cursor + (v_queued.end_date - v_queued.start_date);
    END LOOP;
  END IF;

  RETURN v_new;
END $$;

-- Thanh toán payOS thành công: tạo kỳ theo quy tắc chung ở trên (thay cho "luôn xếp sau kỳ hiện có").
CREATE OR REPLACE FUNCTION public.settle_agent_payment(p_order_code bigint, p_link_id text, p_amount integer, p_paid_at timestamp with time zone, p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE v_order public.agent_payment_orders%ROWTYPE; v_subscription public.seller_subscriptions%ROWTYPE; v_user_id integer;
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
  v_subscription := public.agent_apply_period(v_user_id, v_order.plan_code, v_order.amount_vnd, v_order.duration_months,
    v_order.listing_limit, v_order.priority_points, v_order.support_tier, 'PAYOS');
  UPDATE public.agent_payment_orders SET status = 'PAID', payment_link_id = p_link_id, paid_at = p_paid_at, verified_at = now(),
    provider_reference = left(p_reference, 200), subscription_id = v_subscription.id,
    grant_start = v_subscription.start_date AT TIME ZONE 'UTC', grant_end = v_subscription.end_date AT TIME ZONE 'UTC', updated_at = now()
    WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END $$;

-- Môi giới hủy các kỳ đang chờ; kỳ đang chạy giữ nguyên đến hết hạn. Không hoàn tiền trong hệ thống.
CREATE OR REPLACE FUNCTION public.agent_cancel_queued_periods(p_user_id integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE v_now timestamp := now() AT TIME ZONE 'UTC'; v_name text; v_before jsonb; v_count integer;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Invalid reason' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(name, 'Agent') INTO v_name FROM public.users
    WHERE id = p_user_id AND upper(role) = 'AGENT' AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent unavailable' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.start_date, s.id), '[]'::jsonb) INTO v_before
    FROM public.seller_subscriptions s WHERE s.user_id = p_user_id AND s.status = 'ACTIVE' AND s.start_date > v_now;
  UPDATE public.seller_subscriptions SET status = 'CANCELLED', ended_reason = 'AGENT_CANCELLED', updated_at = v_now
    WHERE user_id = p_user_id AND status = 'ACTIVE' AND start_date > v_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    INSERT INTO public.agent_subscription_audit (user_id, actor_id, actor_name, action, before_state, after_state, reason)
      VALUES (p_user_id, p_user_id, v_name, 'CANCELLED_QUEUED', v_before, '[]'::jsonb, btrim(p_reason));
  END IF;
  RETURN jsonb_build_object('cancelled', v_count);
END $$;

-- Phần chung của các thao tác admin: kiểm tra quyền, lý do, mã yêu cầu (chống gửi trùng) và khóa dòng môi giới.
-- Trả về true nếu yêu cầu này đã được xử lý trước đó.
CREATE OR REPLACE FUNCTION public.admin_subscription_guard(p_actor_id integer, p_request_id uuid, p_user_id integer, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'Invalid request' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.users WHERE id = p_user_id AND upper(role) = 'AGENT' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent not found' USING ERRCODE = 'P0002'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.agent_subscription_audit WHERE actor_id = p_actor_id AND request_id = p_request_id);
END $$;

-- Admin cấp một kỳ miễn phí (hạng + số tháng), áp dụng cùng quy tắc như thanh toán.
CREATE OR REPLACE FUNCTION public.admin_grant_agent_plan(p_actor_id integer, p_request_id uuid, p_user_id integer, p_plan_code text, p_months integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE v_plan public.agent_billing_plans%ROWTYPE; v_new public.seller_subscriptions%ROWTYPE; v_before jsonb;
BEGIN
  IF public.admin_subscription_guard(p_actor_id, p_request_id, p_user_id, p_reason) THEN
    RETURN public.agent_subscription_state(p_user_id);
  END IF;
  SELECT * INTO v_plan FROM public.agent_billing_plans WHERE code = p_plan_code AND code IN ('LITE', 'PLUS', 'PRO');
  IF NOT FOUND OR p_months IS NULL OR p_months NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
  END IF;
  v_before := public.agent_subscription_state(p_user_id);
  v_new := public.agent_apply_period(p_user_id, v_plan.code, 0, p_months, v_plan.listing_limit, v_plan.priority_points, v_plan.support_tier, 'ADMIN');
  INSERT INTO public.agent_subscription_audit (user_id, actor_id, actor_name, action, request_id, before_state, after_state, reason)
    SELECT p_user_id, p_actor_id, coalesce(u.name, 'Admin'), 'GRANTED', p_request_id, v_before, to_jsonb(v_new), btrim(p_reason)
    FROM public.users u WHERE u.id = p_actor_id;
  RETURN public.agent_subscription_state(p_user_id);
END $$;

-- Admin đổi hạng của kỳ đang chạy: có hiệu lực ngay (cả lên lẫn xuống), giữ ngày hết hạn, không thu tiền.
CREATE OR REPLACE FUNCTION public.admin_change_agent_period(p_actor_id integer, p_request_id uuid, p_user_id integer, p_plan_code text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE v_now timestamp := now() AT TIME ZONE 'UTC'; v_plan public.agent_billing_plans%ROWTYPE;
  v_current public.seller_subscriptions%ROWTYPE; v_after public.seller_subscriptions%ROWTYPE;
BEGIN
  IF public.admin_subscription_guard(p_actor_id, p_request_id, p_user_id, p_reason) THEN
    RETURN public.agent_subscription_state(p_user_id);
  END IF;
  SELECT * INTO v_plan FROM public.agent_billing_plans WHERE code = p_plan_code AND code IN ('LITE', 'PLUS', 'PRO');
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_current FROM public.seller_subscriptions
    WHERE user_id = p_user_id AND status = 'ACTIVE' AND start_date <= v_now AND end_date > v_now
    ORDER BY start_date DESC, id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No running period' USING ERRCODE = '23505'; END IF;
  IF v_current.support_tier = v_plan.support_tier THEN RAISE EXCEPTION 'No changes' USING ERRCODE = '23505'; END IF;
  UPDATE public.seller_subscriptions
    SET plan_name = v_plan.code, listing_limit = v_plan.listing_limit, priority_points = v_plan.priority_points,
      support_tier = v_plan.support_tier, updated_at = v_now
    WHERE id = v_current.id RETURNING * INTO v_after;
  INSERT INTO public.agent_subscription_audit (user_id, actor_id, actor_name, action, request_id, before_state, after_state, reason)
    SELECT p_user_id, p_actor_id, coalesce(u.name, 'Admin'), 'CHANGED', p_request_id, to_jsonb(v_current), to_jsonb(v_after), btrim(p_reason)
    FROM public.users u WHERE u.id = p_actor_id;
  RETURN public.agent_subscription_state(p_user_id);
END $$;

-- Admin gỡ gói: kỳ đang chạy kết thúc ngay, các kỳ đang chờ bị hủy.
CREATE OR REPLACE FUNCTION public.admin_remove_agent_plan(p_actor_id integer, p_request_id uuid, p_user_id integer, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE v_now timestamp := now() AT TIME ZONE 'UTC'; v_before jsonb; v_count integer;
BEGIN
  IF public.admin_subscription_guard(p_actor_id, p_request_id, p_user_id, p_reason) THEN
    RETURN coalesce(public.agent_subscription_state(p_user_id), 'null'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.start_date, s.id), '[]'::jsonb) INTO v_before
    FROM public.seller_subscriptions s WHERE s.user_id = p_user_id AND s.status = 'ACTIVE' AND s.end_date > v_now;
  UPDATE public.seller_subscriptions
    SET status = 'CANCELLED', ended_reason = 'ADMIN_REMOVED', updated_at = v_now,
      end_date = CASE WHEN start_date <= v_now THEN v_now ELSE end_date END
    WHERE user_id = p_user_id AND status = 'ACTIVE' AND end_date > v_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'No running period' USING ERRCODE = '23505'; END IF;
  INSERT INTO public.agent_subscription_audit (user_id, actor_id, actor_name, action, request_id, before_state, after_state, reason)
    SELECT p_user_id, p_actor_id, coalesce(u.name, 'Admin'), 'REMOVED', p_request_id, v_before, '[]'::jsonb, btrim(p_reason)
    FROM public.users u WHERE u.id = p_actor_id;
  RETURN coalesce(public.agent_subscription_state(p_user_id), 'null'::jsonb);
END $$;

-- Admin tra cứu gói của một môi giới theo id hoặc email, kèm nhật ký gần nhất.
CREATE OR REPLACE FUNCTION public.admin_agent_subscription(p_actor_id integer, p_user_id integer DEFAULT NULL, p_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE v_agent public.users%ROWTYPE;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  SELECT * INTO v_agent FROM public.users
    WHERE upper(role) = 'AGENT' AND ((p_user_id IS NOT NULL AND id = p_user_id)
      OR (p_user_id IS NULL AND p_email IS NOT NULL AND lower(btrim(email)) = lower(btrim(p_email))))
    LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'agent', jsonb_build_object('id', v_agent.id, 'name', v_agent.name, 'email', v_agent.email,
      'is_active', v_agent.is_active, 'verification_status', v_agent.verification_status, 'trust_score', v_agent.trust_score),
    'subscription', public.agent_subscription_state(v_agent.id),
    'audit', coalesce((SELECT jsonb_agg(to_jsonb(a) - 'request_id' ORDER BY a.created_at DESC, a.id DESC) FROM (
      SELECT id, action, actor_name, reason, before_state, after_state, created_at, request_id
      FROM public.agent_subscription_audit WHERE user_id = v_agent.id ORDER BY created_at DESC, id DESC LIMIT 20) a), '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.agent_tier_rank(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_apply_period(integer, text, numeric, integer, integer, integer, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_subscription_guard(integer, uuid, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_agent_payment(bigint, text, integer, timestamp with time zone, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_cancel_queued_periods(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_grant_agent_plan(integer, uuid, integer, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_change_agent_period(integer, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_remove_agent_plan(integer, uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_agent_subscription(integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_tier_rank(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_agent_payment(bigint, text, integer, timestamp with time zone, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_cancel_queued_periods(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_grant_agent_plan(integer, uuid, integer, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_change_agent_period(integer, uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_remove_agent_plan(integer, uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_agent_subscription(integer, integer, text) TO service_role;

INSERT INTO public.app_schema_migrations (id) VALUES ('023') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
