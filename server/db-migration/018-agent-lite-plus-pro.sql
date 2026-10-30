-- Requires 017. Existing invoices keep their amount and purchased entitlements.
BEGIN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

ALTER TABLE public.agent_billing_plans
  ADD COLUMN IF NOT EXISTS listing_limit integer NOT NULL DEFAULT 50 CHECK (listing_limit BETWEEN 1 AND 10000),
  ADD COLUMN IF NOT EXISTS priority_points integer NOT NULL DEFAULT 300 CHECK (priority_points BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS support_tier text NOT NULL DEFAULT 'PRO' CHECK (support_tier IN ('LITE','PLUS','PRO'));
ALTER TABLE public.seller_subscriptions
  ADD COLUMN IF NOT EXISTS listing_limit integer NOT NULL DEFAULT 10 CHECK (listing_limit BETWEEN 1 AND 10000),
  ADD COLUMN IF NOT EXISTS priority_points integer NOT NULL DEFAULT 0 CHECK (priority_points BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS support_tier text NOT NULL DEFAULT 'LITE' CHECK (support_tier IN ('LITE','PLUS','PRO'));
UPDATE public.seller_subscriptions SET listing_limit=50,priority_points=300,support_tier='PRO' WHERE plan_name='PAID';
ALTER TABLE public.agent_payment_orders
  ADD COLUMN IF NOT EXISTS listing_limit integer NOT NULL DEFAULT 50 CHECK (listing_limit BETWEEN 1 AND 10000),
  ADD COLUMN IF NOT EXISTS priority_points integer NOT NULL DEFAULT 300 CHECK (priority_points BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS support_tier text NOT NULL DEFAULT 'PRO' CHECK (support_tier IN ('LITE','PLUS','PRO'));

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.agent_service_packages'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%code%' LOOP
    EXECUTE format('ALTER TABLE public.agent_service_packages DROP CONSTRAINT %I',c.conname);
  END LOOP;
END; $$;
ALTER TABLE public.agent_service_packages ADD CONSTRAINT agent_package_code_check
  CHECK (code IN ('FREE_TRIAL','PAID','ENTERPRISE','LITE','PLUS','PRO'));
UPDATE public.agent_billing_plans SET active=false,version=version+1,updated_at=now() WHERE code NOT IN ('LITE','PLUS','PRO') AND active;
UPDATE public.agent_plan_schedules SET status='CANCELLED',completed_at=now() WHERE status='SCHEDULED' AND plan_code NOT IN ('LITE','PLUS','PRO');
INSERT INTO public.agent_billing_plans(code,name,amount_vnd,duration_months,listing_limit,priority_points,support_tier) VALUES
  ('LITE','Lite',349000,1,10,100,'LITE'),('PLUS','Plus',499000,1,20,200,'PLUS'),('PRO','Pro',999000,1,50,300,'PRO') ON CONFLICT (code) DO NOTHING;
INSERT INTO public.agent_service_packages(code,name,description,price_kind,duration_months,sort_order) VALUES
  ('LITE','Lite','Dành cho môi giới có danh mục nhỏ','FIXED',1,1),
  ('PLUS','Plus','Mở rộng danh mục và tăng ưu tiên hiển thị','FIXED',1,2),
  ('PRO','Pro','Danh mục lớn với ưu tiên hiển thị cao nhất','FIXED',1,3) ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.agent_service_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_plans jsonb;
BEGIN
  PERFORM public.apply_due_agent_plan_changes();
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',b.code,'name',b.name,'description',c.description,
    'price_kind','FIXED','amount_vnd',b.amount_vnd,'duration_months',b.duration_months,'active',b.active,'version',b.version,
    'listing_limit',b.listing_limit,'priority_points',b.priority_points,'support_tier',b.support_tier) ORDER BY c.sort_order),'[]'::jsonb)
    INTO v_plans FROM public.agent_billing_plans b JOIN public.agent_service_packages c USING(code) WHERE b.code IN ('LITE','PLUS','PRO');
  RETURN jsonb_build_object('plans',v_plans,'snapshotAt',now());
END; $$;

-- A single account lock serializes reservations, settlements and new public listings.
CREATE OR REPLACE FUNCTION public.reserve_agent_payment(p_user_id integer,p_plan_code text,p_request_id uuid,p_expected_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_plan public.agent_billing_plans%ROWTYPE; v_order public.agent_payment_orders%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.users WHERE id=p_user_id AND upper(role)='AGENT' AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent unavailable' USING ERRCODE='42501'; END IF;
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
  PERFORM public.apply_due_agent_plan_changes();
  SELECT * INTO v_plan FROM public.agent_billing_plans WHERE code=p_plan_code AND code IN ('LITE','PLUS','PRO') AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS DISTINCT FROM v_plan.version THEN RAISE EXCEPTION 'Stale plan' USING ERRCODE='40001'; END IF;
  INSERT INTO public.agent_payment_orders(user_id,request_id,plan_code,plan_name,amount_vnd,duration_months,listing_limit,priority_points,support_tier)
    VALUES(p_user_id,p_request_id,v_plan.code,v_plan.name,v_plan.amount_vnd,v_plan.duration_months,v_plan.listing_limit,v_plan.priority_points,v_plan.support_tier)
    RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

CREATE OR REPLACE FUNCTION public.settle_agent_payment(p_order_code bigint,p_link_id text,p_amount integer,p_paid_at timestamptz,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_order public.agent_payment_orders%ROWTYPE; v_subscription public.seller_subscriptions%ROWTYPE;
  v_user_id integer; v_start timestamptz; v_end timestamptz;
BEGIN
  SELECT user_id INTO v_user_id FROM public.agent_payment_orders WHERE order_code=p_order_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.users WHERE id=v_user_id FOR UPDATE;
  SELECT * INTO STRICT v_order FROM public.agent_payment_orders WHERE order_code=p_order_code FOR UPDATE;
  IF p_link_id IS NULL OR length(p_link_id)>100 OR p_amount IS DISTINCT FROM v_order.amount_vnd
    OR (v_order.payment_link_id IS NOT NULL AND v_order.payment_link_id<>p_link_id)
    OR p_paid_at IS NULL OR p_paid_at>now()+interval '5 minutes' OR p_paid_at<v_order.created_at-interval '5 minutes' THEN
    RAISE EXCEPTION 'Payment verification mismatch' USING ERRCODE='22023';
  END IF;
  IF v_order.status='PAID' THEN RETURN to_jsonb(v_order); END IF;
  -- Queue each purchased period after the existing periods, preserving their
  -- individual plan/price/benefit snapshots; a cheaper renewal cannot extend Pro.
  SELECT greatest(now(),coalesce(max(end_date AT TIME ZONE 'UTC'),now())) INTO v_start
    FROM public.seller_subscriptions WHERE user_id=v_user_id AND status='ACTIVE' AND end_date>now() AT TIME ZONE 'UTC';
  v_end:=v_start+make_interval(months=>v_order.duration_months);
  INSERT INTO public.seller_subscriptions(user_id,plan_name,price_vnd,start_date,end_date,status,created_at,updated_at,listing_limit,priority_points,support_tier)
    VALUES(v_user_id,v_order.plan_code,v_order.amount_vnd,v_start AT TIME ZONE 'UTC',v_end AT TIME ZONE 'UTC','ACTIVE',
      now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC',v_order.listing_limit,v_order.priority_points,v_order.support_tier)
    RETURNING * INTO v_subscription;
  UPDATE public.agent_payment_orders SET status='PAID',payment_link_id=p_link_id,paid_at=p_paid_at,verified_at=now(),
    provider_reference=left(p_reference,200),subscription_id=v_subscription.id,grant_start=v_start,grant_end=v_end,updated_at=now()
    WHERE id=v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

-- The free trial is retired from sale. Previously granted trials retain their end date.
CREATE OR REPLACE FUNCTION public.start_agent_free_trial(p_user_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Free trial retired; choose Lite, Plus or Pro' USING ERRCODE='22023'; END; $$;

CREATE INDEX IF NOT EXISTS agent_public_listing_quota_idx ON public.properties(owner_id,id DESC)
  WHERE status='AVAILABLE' AND is_hidden IS NOT TRUE AND is_public IS TRUE;
CREATE INDEX IF NOT EXISTS agent_entitlement_period_idx ON public.seller_subscriptions(user_id,start_date,end_date) WHERE status='ACTIVE';

CREATE OR REPLACE FUNCTION public.enforce_agent_listing_quota()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' AS $$
DECLARE v_limit integer; v_count bigint;
BEGIN
  IF NEW.status<>'AVAILABLE' OR NEW.is_hidden IS TRUE OR NEW.is_public IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.owner_id=NEW.owner_id AND OLD.status='AVAILABLE' AND OLD.is_hidden IS NOT TRUE AND OLD.is_public IS TRUE THEN RETURN NEW; END IF;
  END IF;
  PERFORM 1 FROM public.users WHERE id=NEW.owner_id AND role='AGENT' AND is_active IS TRUE
    AND verification_status='VERIFIED' AND coalesce(trust_score,50)>30 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LISTING_OWNER_INELIGIBLE' USING ERRCODE='P0001'; END IF;
  SELECT listing_limit INTO v_limit FROM public.seller_subscriptions WHERE user_id=NEW.owner_id AND status='ACTIVE'
    AND start_date<=now() AT TIME ZONE 'UTC' AND end_date>now() AT TIME ZONE 'UTC'
    ORDER BY start_date DESC,id DESC LIMIT 1;
  IF v_limit IS NULL THEN RAISE EXCEPTION 'LISTING_SUBSCRIPTION_REQUIRED' USING ERRCODE='P0001'; END IF;
  SELECT count(*) INTO v_count FROM public.properties WHERE owner_id=NEW.owner_id AND status='AVAILABLE' AND is_hidden IS NOT TRUE AND is_public IS TRUE;
  IF v_count>=v_limit THEN RAISE EXCEPTION 'LISTING_QUOTA_EXCEEDED' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS agent_listing_quota ON public.properties;
CREATE TRIGGER agent_listing_quota BEFORE INSERT OR UPDATE OF owner_id,status,is_hidden,is_public ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_listing_quota();

CREATE OR REPLACE FUNCTION public.agent_subscription_state(p_user_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_subscription public.seller_subscriptions%ROWTYPE; v_upcoming jsonb; v_count bigint;
BEGIN
  SELECT * INTO v_subscription FROM public.seller_subscriptions WHERE user_id=p_user_id AND status='ACTIVE'
    AND start_date<=now() AT TIME ZONE 'UTC' AND end_date>now() AT TIME ZONE 'UTC' ORDER BY start_date DESC,id DESC LIMIT 1;
  IF v_subscription.id IS NULL THEN
    SELECT * INTO v_subscription FROM public.seller_subscriptions WHERE user_id=p_user_id AND start_date<=now() AT TIME ZONE 'UTC'
      ORDER BY end_date DESC NULLS LAST,id DESC LIMIT 1;
  END IF;
  IF v_subscription.id IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY start_date,id),'[]'::jsonb) INTO v_upcoming FROM
    (SELECT id,plan_name,start_date,end_date,listing_limit,priority_points,support_tier FROM public.seller_subscriptions
      WHERE user_id=p_user_id AND status='ACTIVE' AND start_date>now() AT TIME ZONE 'UTC' ORDER BY start_date,id LIMIT 50) s;
  SELECT count(*) INTO v_count FROM public.properties WHERE owner_id=p_user_id AND status='AVAILABLE' AND is_hidden IS NOT TRUE AND is_public IS TRUE;
  RETURN to_jsonb(v_subscription)||jsonb_build_object('public_listing_count',v_count,
    'visible_listing_count',CASE WHEN v_subscription.status='ACTIVE' AND v_subscription.end_date>now() AT TIME ZONE 'UTC'
      THEN least(v_count,v_subscription.listing_limit) ELSE 0 END,'upcoming',v_upcoming);
END; $$;

CREATE OR REPLACE FUNCTION public.listing_property_type_key(p_type text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT CASE
    WHEN lower(p_type) ~ '(chung.cư|chung_cu|condo)' THEN 'CHUNG_CU'
    WHEN lower(p_type) ~ '(căn.hộ|can_ho|apartment|studio)' THEN 'CAN_HO'
    WHEN lower(p_type) ~ '(phòng.trọ|phong_tro|nhà.trọ|nha_tro|room)' THEN 'PHONG_TRO'
    WHEN lower(p_type) ~ '(văn.phòng|van_phong|office)' THEN 'VAN_PHONG'
    WHEN lower(p_type) ~ '(mặt.bằng|mat_bang|retail|commercial)' THEN 'MAT_BANG'
    WHEN lower(p_type) ~ '(đất|dat_nen|land)' THEN 'DAT_NEN'
    WHEN lower(p_type) ~ '(biệt.thự|biet_thu|villa)' THEN 'BIET_THU'
    WHEN lower(p_type) ~ '(nhà|nha|house|townhouse)' THEN 'NHA_O'
    ELSE upper(p_type) END;
$$;
CREATE INDEX IF NOT EXISTS public_property_filter_idx ON public.properties(public.listing_property_type_key(property_type),ward,district,id DESC)
  WHERE status='AVAILABLE' AND is_hidden IS NOT TRUE AND is_public IS TRUE;

CREATE INDEX IF NOT EXISTS agent_rank_entitlement_idx ON public.seller_subscriptions(user_id,start_date DESC,id DESC)
  INCLUDE(end_date,priority_points,listing_limit) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS agent_rank_features_idx ON public.property_features(property_id);
CREATE INDEX IF NOT EXISTS agent_rank_images_idx ON public.property_images(property_id);
CREATE INDEX IF NOT EXISTS agent_rank_tags_idx ON public.lifestyle_tags(property_id);

-- Backend-only view: priority is computed at read time so expiry/queued periods
-- take effect even when no server timer runs. The client cannot assign a boost.
CREATE OR REPLACE VIEW public.ranked_properties AS
WITH current_entitlements AS (
  SELECT DISTINCT ON (s.user_id) s.user_id,s.priority_points,s.listing_limit FROM public.seller_subscriptions s
  WHERE s.status='ACTIVE' AND s.start_date<=now() AT TIME ZONE 'UTC' AND s.end_date>now() AT TIME ZONE 'UTC'
  ORDER BY s.user_id,s.start_date DESC,s.id DESC
)
SELECT p.*,e.priority_points+coalesce(p.priority_score,0) AS display_priority,
  public.listing_property_type_key(p.property_type) AS property_type_key,
  ARRAY(SELECT lower(feature_name) FROM public.property_features WHERE property_id=p.id
    UNION SELECT lower(tag_name) FROM public.lifestyle_tags WHERE property_id=p.id) AS search_features
  FROM current_entitlements e JOIN public.users u ON u.id=e.user_id
  CROSS JOIN LATERAL (
    SELECT listing.* FROM public.properties listing WHERE listing.owner_id=e.user_id AND listing.status='AVAILABLE'
      AND listing.is_hidden IS NOT TRUE AND listing.is_public IS TRUE ORDER BY listing.id DESC LIMIT e.listing_limit
  ) p
  WHERE u.is_active IS TRUE AND u.role='AGENT' AND u.verification_status='VERIFIED' AND coalesce(u.trust_score,50)>30;

REVOKE ALL ON public.ranked_properties FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ranked_properties TO service_role;
-- Return nested listing data directly from SQL. This does not depend on
-- PostgREST inferring foreign keys through the ranking/window-function view.
CREATE OR REPLACE FUNCTION public.listing_location_key(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
  SELECT btrim(regexp_replace(lower(p_value),'^(phường|p[.]|xã|thị trấn|thành phố|tp[.]|quận|q[.]|huyện)[[:space:]]+','','i'));
$$;
CREATE OR REPLACE FUNCTION public.search_ranked_properties(p_filters jsonb DEFAULT '{}',p_listing_type text DEFAULT NULL,
  p_category text DEFAULT NULL,p_limit integer DEFAULT 24,p_ids integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
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
    ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,p.id) END,
      p.display_priority DESC,p.id DESC LIMIT p_limit
  )
  SELECT coalesce(jsonb_agg(item ORDER BY position,display_priority DESC,id DESC),'[]'::jsonb) INTO v_items FROM (
    SELECT p.id,p.display_priority,array_position(p_ids,p.id) AS position,
      (to_jsonb(p)-'search_features'-'property_type_key') || jsonb_build_object(
        'owner',jsonb_build_object('name',u.name,'role',u.role,'avatar',u.avatar,'trust_score',u.trust_score,'verification_status',u.verification_status,'created_at',u.created_at),
        'property_features',coalesce((SELECT jsonb_agg(jsonb_build_object('feature_name',feature_name)) FROM public.property_features WHERE property_id=p.id),'[]'::jsonb),
        'property_images',coalesce((SELECT jsonb_agg(jsonb_build_object('image_url',image_url)) FROM public.property_images WHERE property_id=p.id),'[]'::jsonb),
        'lifestyle_tags',coalesce((SELECT jsonb_agg(jsonb_build_object('tag_name',tag_name)) FROM public.lifestyle_tags WHERE property_id=p.id),'[]'::jsonb)) AS item
    FROM candidates p JOIN public.users u ON u.id=p.owner_id
  ) rows;
  RETURN v_items;
END; $$;
REVOKE ALL ON FUNCTION public.search_ranked_properties(jsonb,text,text,integer,integer[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_ranked_properties(jsonb,text,text,integer,integer[]) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_agent_listing_quota(),public.agent_subscription_state(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_subscription_state(integer) TO service_role;

DROP FUNCTION IF EXISTS public.admin_change_agent_plan(integer,uuid,integer,integer,integer,boolean,timestamptz,text,text);
CREATE OR REPLACE FUNCTION public.admin_change_agent_plan(
  p_actor_id integer,p_request_id uuid,p_expected_version integer,p_amount integer,p_duration integer,p_active boolean,
  p_effective_at timestamptz,p_reason text,p_action text DEFAULT 'SAVE',p_plan_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_plan public.agent_billing_plans%ROWTYPE; v_previous public.agent_plan_audit%ROWTYPE;
  v_schedule public.agent_plan_schedules%ROWTYPE; v_payload jsonb; v_after jsonb; v_action text; v_actor_name text;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_plan_code IS NULL OR p_plan_code NOT IN ('LITE','PLUS','PRO') THEN RAISE EXCEPTION 'Invalid plan' USING ERRCODE='22023'; END IF;
  PERFORM public.apply_due_agent_plan_changes();
  SELECT * INTO STRICT v_plan FROM public.agent_billing_plans WHERE code=p_plan_code FOR UPDATE;
  v_payload:=jsonb_build_object('planCode',p_plan_code,'expectedVersion',p_expected_version,'amount',p_amount,'duration',p_duration,'active',p_active,
    'effectiveAt',p_effective_at,'reason',p_reason,'action',p_action);
  SELECT * INTO v_previous FROM public.agent_plan_audit WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Request reused' USING ERRCODE='23505'; END IF;
    RETURN public.admin_agent_plan_catalog(p_actor_id);
  END IF;
  IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
    OR p_action IS NULL OR p_action NOT IN ('SAVE','CANCEL') THEN RAISE EXCEPTION 'Invalid change' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS DISTINCT FROM v_plan.version THEN RAISE EXCEPTION 'Stale plan' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_schedule FROM public.agent_plan_schedules WHERE plan_code=p_plan_code AND status='SCHEDULED' FOR UPDATE;
  IF p_action='CANCEL' THEN
    IF v_schedule.id IS NULL THEN RAISE EXCEPTION 'No pending schedule' USING ERRCODE='23505'; END IF;
    UPDATE public.agent_plan_schedules SET status='CANCELLED',completed_at=now() WHERE id=v_schedule.id;
    v_action:='CANCELLED'; v_after:=to_jsonb(v_plan);
  ELSE
    IF v_schedule.id IS NOT NULL THEN RAISE EXCEPTION 'Cancel existing schedule first' USING ERRCODE='23505'; END IF;
    IF p_amount IS NULL OR p_amount NOT BETWEEN 2000 AND 500000000 OR p_duration IS NULL OR p_duration NOT BETWEEN 1 AND 12
      OR p_active IS NULL THEN RAISE EXCEPTION 'Invalid price' USING ERRCODE='22023'; END IF;
    IF p_amount=v_plan.amount_vnd AND p_duration=v_plan.duration_months AND p_active=v_plan.active THEN
      RAISE EXCEPTION 'No changes' USING ERRCODE='23505';
    END IF;
    v_after:=jsonb_build_object('amount_vnd',p_amount,'duration_months',p_duration,'active',p_active);
    IF p_effective_at IS NOT NULL THEN
      IF p_effective_at<now()+interval '5 minutes' OR p_effective_at>now()+interval '365 days' THEN
        RAISE EXCEPTION 'Invalid effective date' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.agent_plan_schedules(plan_code,amount_vnd,duration_months,active,effective_at,actor_id,reason)
        VALUES(p_plan_code,p_amount,p_duration,p_active,p_effective_at,p_actor_id,btrim(p_reason));
      v_action:='SCHEDULED';
    ELSE
      UPDATE public.agent_billing_plans SET amount_vnd=p_amount,duration_months=p_duration,active=p_active WHERE code=p_plan_code;
      v_action:='UPDATED';
    END IF;
  END IF;
  UPDATE public.agent_billing_plans SET version=version+1,updated_at=now() WHERE code=p_plan_code;
  SELECT coalesce(name,'Admin') INTO v_actor_name FROM public.users WHERE id=p_actor_id;
  INSERT INTO public.agent_plan_audit(plan_code,action,actor_id,actor_name,request_id,request_payload,before_config,after_config,effective_at,reason)
    VALUES(p_plan_code,v_action,p_actor_id,v_actor_name,p_request_id,v_payload,to_jsonb(v_plan),v_after,coalesce(p_effective_at,now()),btrim(p_reason));
  RETURN public.admin_agent_plan_catalog(p_actor_id);
END; $$;


REVOKE ALL ON FUNCTION public.admin_change_agent_plan(integer,uuid,integer,integer,integer,boolean,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_agent_plan(integer,uuid,integer,integer,integer,boolean,timestamptz,text,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
