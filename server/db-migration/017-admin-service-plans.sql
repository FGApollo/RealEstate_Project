-- Requires 014. All prices are server-owned; existing orders remain immutable.
BEGIN;
ALTER TABLE public.agent_billing_plans
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.agent_service_packages (
  code text PRIMARY KEY CHECK (code IN ('FREE_TRIAL','PAID','ENTERPRISE')),
  name text NOT NULL, description text NOT NULL,
  price_kind text NOT NULL CHECK (price_kind IN ('FREE','FIXED','CONTACT')),
  duration_months integer CHECK (duration_months BETWEEN 1 AND 12),
  contact_url text CHECK (contact_url IS NULL OR contact_url ~ '^mailto:[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),
  sort_order integer NOT NULL,
  CHECK ((code='PAID' AND price_kind='FIXED') OR (code='FREE_TRIAL' AND price_kind='FREE' AND duration_months=1)
    OR (code='ENTERPRISE' AND price_kind='CONTACT'))
);
INSERT INTO public.agent_service_packages(code,name,description,price_kind,duration_months,sort_order) VALUES
  ('FREE_TRIAL','Miễn phí dùng thử','Một lần cho mỗi tài khoản · Không yêu cầu thanh toán','FREE',1,1),
  ('PAID','Premium','Gói trả phí cho môi giới · Thanh toán qua payOS','FIXED',NULL,2),
  ('ENTERPRISE','Giải pháp doanh nghiệp','Báo giá theo nhu cầu · Trao đổi trước khi đăng ký','CONTACT',NULL,3)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.agent_plan_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL REFERENCES public.agent_billing_plans(code),
  amount_vnd integer NOT NULL CHECK (amount_vnd BETWEEN 2000 AND 500000000),
  duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 12),
  active boolean NOT NULL, effective_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','APPLIED','CANCELLED')),
  actor_id integer NOT NULL REFERENCES public.users(id), reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_one_plan_schedule_idx ON public.agent_plan_schedules(plan_code) WHERE status='SCHEDULED';
CREATE INDEX IF NOT EXISTS agent_due_plan_schedule_idx ON public.agent_plan_schedules(effective_at) WHERE status='SCHEDULED';
CREATE TABLE IF NOT EXISTS public.agent_plan_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_code text NOT NULL REFERENCES public.agent_billing_plans(code),
  action text NOT NULL CHECK (action IN ('UPDATED','SCHEDULED','APPLIED','CANCELLED')),
  actor_id integer NOT NULL REFERENCES public.users(id), actor_name text NOT NULL,
  request_id uuid, request_payload jsonb,
  before_config jsonb NOT NULL, after_config jsonb NOT NULL,
  effective_at timestamptz NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id,request_id)
);
CREATE INDEX IF NOT EXISTS agent_plan_audit_page_idx ON public.agent_plan_audit(created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION public.assert_plan_admin(p_actor_id integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND upper(role)='ADMIN'
    AND is_active IS TRUE AND email_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';
  END IF;
END; $$;

-- Scheduling is applied by DB time on the next catalog read or reservation;
-- payment correctness does not depend on a timer in a particular server process.
CREATE OR REPLACE FUNCTION public.apply_due_agent_plan_changes()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_plan public.agent_billing_plans%ROWTYPE; v_schedule public.agent_plan_schedules%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.agent_plan_schedules WHERE status='SCHEDULED' AND effective_at<=now()) THEN RETURN; END IF;
  FOR v_plan IN SELECT * FROM public.agent_billing_plans ORDER BY code FOR UPDATE LOOP
    SELECT * INTO v_schedule FROM public.agent_plan_schedules
      WHERE plan_code=v_plan.code AND status='SCHEDULED' AND effective_at<=now() FOR UPDATE;
    IF FOUND THEN
      UPDATE public.agent_billing_plans SET amount_vnd=v_schedule.amount_vnd,duration_months=v_schedule.duration_months,
        active=v_schedule.active,version=version+1,updated_at=now() WHERE code=v_plan.code;
      UPDATE public.agent_plan_schedules SET status='APPLIED',completed_at=now() WHERE id=v_schedule.id;
      INSERT INTO public.agent_plan_audit(plan_code,action,actor_id,actor_name,before_config,after_config,effective_at,reason)
        SELECT v_plan.code,'APPLIED',v_schedule.actor_id,coalesce(u.name,'Admin'),to_jsonb(v_plan),
          jsonb_build_object('amount_vnd',v_schedule.amount_vnd,'duration_months',v_schedule.duration_months,'active',v_schedule.active),
          v_schedule.effective_at,v_schedule.reason FROM public.users u WHERE u.id=v_schedule.actor_id;
    END IF;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.agent_service_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_plans jsonb;
BEGIN
  PERFORM public.apply_due_agent_plan_changes();
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',coalesce(b.name,c.name),'description',c.description,
    'price_kind',c.price_kind,'amount_vnd',CASE WHEN c.price_kind='FREE' THEN 0 ELSE b.amount_vnd END,
    'duration_months',coalesce(b.duration_months,c.duration_months),'active',coalesce(b.active,true),
    'version',b.version,'contact_url',c.contact_url) ORDER BY c.sort_order),'[]'::jsonb)
    INTO v_plans FROM public.agent_service_packages c LEFT JOIN public.agent_billing_plans b ON b.code=c.code;
  RETURN jsonb_build_object('plans',v_plans,'snapshotAt',now());
END; $$;

CREATE OR REPLACE FUNCTION public.admin_agent_plan_catalog(p_actor_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_catalog jsonb; v_pending jsonb;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  v_catalog:=public.agent_service_catalog();
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY effective_at),'[]'::jsonb) INTO v_pending
    FROM public.agent_plan_schedules s WHERE status='SCHEDULED';
  RETURN v_catalog || jsonb_build_object('pending',v_pending);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_change_agent_plan(
  p_actor_id integer,p_request_id uuid,p_expected_version integer,p_amount integer,p_duration integer,p_active boolean,
  p_effective_at timestamptz,p_reason text,p_action text DEFAULT 'SAVE')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_plan public.agent_billing_plans%ROWTYPE; v_previous public.agent_plan_audit%ROWTYPE;
  v_schedule public.agent_plan_schedules%ROWTYPE; v_payload jsonb; v_after jsonb; v_action text; v_actor_name text;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  SELECT * INTO STRICT v_plan FROM public.agent_billing_plans WHERE code='PAID' FOR UPDATE;
  PERFORM public.apply_due_agent_plan_changes();
  SELECT * INTO STRICT v_plan FROM public.agent_billing_plans WHERE code='PAID';
  v_payload:=jsonb_build_object('expectedVersion',p_expected_version,'amount',p_amount,'duration',p_duration,'active',p_active,
    'effectiveAt',p_effective_at,'reason',p_reason,'action',p_action);
  SELECT * INTO v_previous FROM public.agent_plan_audit WHERE actor_id=p_actor_id AND request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Request reused' USING ERRCODE='23505'; END IF;
    RETURN public.admin_agent_plan_catalog(p_actor_id);
  END IF;
  IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
    OR p_action IS NULL OR p_action NOT IN ('SAVE','CANCEL') THEN RAISE EXCEPTION 'Invalid change' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS DISTINCT FROM v_plan.version THEN RAISE EXCEPTION 'Stale plan' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_schedule FROM public.agent_plan_schedules WHERE plan_code='PAID' AND status='SCHEDULED' FOR UPDATE;
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
        VALUES('PAID',p_amount,p_duration,p_active,p_effective_at,p_actor_id,btrim(p_reason));
      v_action:='SCHEDULED';
    ELSE
      UPDATE public.agent_billing_plans SET amount_vnd=p_amount,duration_months=p_duration,active=p_active WHERE code='PAID';
      v_action:='UPDATED';
    END IF;
  END IF;
  UPDATE public.agent_billing_plans SET version=version+1,updated_at=now() WHERE code='PAID';
  SELECT coalesce(name,'Admin') INTO v_actor_name FROM public.users WHERE id=p_actor_id;
  INSERT INTO public.agent_plan_audit(plan_code,action,actor_id,actor_name,request_id,request_payload,before_config,after_config,effective_at,reason)
    VALUES('PAID',v_action,p_actor_id,v_actor_name,p_request_id,v_payload,to_jsonb(v_plan),v_after,coalesce(p_effective_at,now()),btrim(p_reason));
  RETURN public.admin_agent_plan_catalog(p_actor_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_agent_plan_history(p_actor_id integer,p_page integer DEFAULT 1,p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_items jsonb; v_total bigint;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_total FROM public.agent_plan_audit;
  SELECT coalesce(jsonb_agg(to_jsonb(a) - 'request_payload' - 'request_id' ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO v_items
    FROM (SELECT * FROM public.agent_plan_audit ORDER BY created_at DESC,id DESC LIMIT p_limit OFFSET (p_page-1)*p_limit) a;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'limit',p_limit);
END; $$;

-- The old signature is replaced so no caller can bypass version-aware reservation.
DROP FUNCTION IF EXISTS public.reserve_agent_payment(integer,text,uuid);
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
  IF FOUND THEN RETURN to_jsonb(v_order); END IF;
  SELECT * INTO v_order FROM public.agent_payment_orders WHERE user_id=p_user_id AND status IN ('CREATING','PENDING');
  IF FOUND THEN RETURN to_jsonb(v_order); END IF;
  PERFORM public.apply_due_agent_plan_changes();
  SELECT * INTO v_plan FROM public.agent_billing_plans WHERE code=p_plan_code AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version<>v_plan.version THEN RAISE EXCEPTION 'Stale plan' USING ERRCODE='40001'; END IF;
  INSERT INTO public.agent_payment_orders(user_id,request_id,plan_code,plan_name,amount_vnd,duration_months)
    VALUES(p_user_id,p_request_id,v_plan.code,v_plan.name,v_plan.amount_vnd,v_plan.duration_months) RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

ALTER TABLE public.agent_service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_plan_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_plan_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_service_packages,public.agent_plan_schedules,public.agent_plan_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.agent_service_packages,public.agent_plan_schedules,public.agent_plan_audit TO service_role;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.agent_billing_plans FROM service_role;
REVOKE ALL ON SEQUENCE public.agent_plan_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.assert_plan_admin(integer),public.apply_due_agent_plan_changes(),public.agent_service_catalog(),
  public.admin_agent_plan_catalog(integer),public.admin_change_agent_plan(integer,uuid,integer,integer,integer,boolean,timestamptz,text,text),
  public.admin_agent_plan_history(integer,integer,integer),public.reserve_agent_payment(integer,text,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.assert_plan_admin(integer),public.apply_due_agent_plan_changes() FROM service_role;
GRANT EXECUTE ON FUNCTION public.agent_service_catalog(),public.admin_agent_plan_catalog(integer),
  public.admin_change_agent_plan(integer,uuid,integer,integer,integer,boolean,timestamptz,text,text),
  public.admin_agent_plan_history(integer,integer,integer),public.reserve_agent_payment(integer,text,uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
