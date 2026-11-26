-- 030: Quản lý giá gói Swipe Nest Plus cho người dùng (user_billing_plans) từ trang Admin.
--
-- Cho phép Admin xem, chỉnh sửa giá / chu kỳ / trạng thái mở bán, hẹn giờ áp dụng theo giờ VN
-- và xem lịch sử thay đổi cho gói USER_PLUS, tương tự cấu trúc gói môi giới (017/018).
-- Yêu cầu 017, 020, 026. Chạy lại nhiều lần vẫn an toàn (idempotent). Không sửa dữ liệu hiện có.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_plan_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL REFERENCES public.user_billing_plans(code),
  amount_vnd integer NOT NULL CHECK (amount_vnd BETWEEN 2000 AND 500000000),
  duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 12),
  active boolean NOT NULL,
  effective_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'APPLIED', 'CANCELLED')),
  actor_id integer NOT NULL REFERENCES public.users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS user_one_plan_schedule_idx
  ON public.user_plan_schedules(plan_code) WHERE status = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS user_due_plan_schedule_idx
  ON public.user_plan_schedules(effective_at) WHERE status = 'SCHEDULED';

CREATE TABLE IF NOT EXISTS public.user_plan_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_code text NOT NULL REFERENCES public.user_billing_plans(code),
  action text NOT NULL CHECK (action IN ('UPDATED', 'SCHEDULED', 'APPLIED', 'CANCELLED')),
  actor_id integer NOT NULL REFERENCES public.users(id),
  actor_name text NOT NULL,
  request_id uuid,
  request_payload jsonb,
  before_config jsonb NOT NULL,
  after_config jsonb NOT NULL,
  effective_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, request_id)
);
CREATE INDEX IF NOT EXISTS user_plan_audit_page_idx
  ON public.user_plan_audit(created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.apply_due_user_plan_changes()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET statement_timeout = '8s' AS $$
DECLARE
  v_plan public.user_billing_plans%ROWTYPE;
  v_schedule public.user_plan_schedules%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_plan_schedules WHERE status = 'SCHEDULED' AND effective_at <= now()) THEN
    RETURN;
  END IF;
  FOR v_plan IN SELECT * FROM public.user_billing_plans ORDER BY code FOR UPDATE LOOP
    SELECT * INTO v_schedule FROM public.user_plan_schedules
      WHERE plan_code = v_plan.code AND status = 'SCHEDULED' AND effective_at <= now() FOR UPDATE;
    IF FOUND THEN
      UPDATE public.user_billing_plans
        SET amount_vnd = v_schedule.amount_vnd,
            duration_months = v_schedule.duration_months,
            active = v_schedule.active,
            version = version + 1,
            updated_at = now()
        WHERE code = v_plan.code;
      UPDATE public.user_plan_schedules
        SET status = 'APPLIED', completed_at = now()
        WHERE id = v_schedule.id;
      INSERT INTO public.user_plan_audit(plan_code, action, actor_id, actor_name, before_config, after_config, effective_at, reason)
        SELECT v_plan.code, 'APPLIED', v_schedule.actor_id, coalesce(u.name, 'Admin'), to_jsonb(v_plan),
          jsonb_build_object('amount_vnd', v_schedule.amount_vnd, 'duration_months', v_schedule.duration_months, 'active', v_schedule.active),
          v_schedule.effective_at, v_schedule.reason
        FROM public.users u WHERE u.id = v_schedule.actor_id;
    END IF;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.user_service_catalog()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET statement_timeout = '8s' AS $$
DECLARE v_plans jsonb;
BEGIN
  PERFORM public.apply_due_user_plan_changes();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code', b.code,
    'name', b.name,
    'amount_vnd', b.amount_vnd,
    'duration_months', b.duration_months,
    'active', b.active,
    'version', b.version
  ) ORDER BY b.amount_vnd, b.code), '[]'::jsonb)
    INTO v_plans FROM public.user_billing_plans b WHERE b.active IS TRUE;
  RETURN jsonb_build_object('plans', v_plans, 'snapshotAt', now());
END; $$;

CREATE OR REPLACE FUNCTION public.admin_user_plan_catalog(p_actor_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET statement_timeout = '8s' AS $$
DECLARE v_plans jsonb; v_pending jsonb;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  PERFORM public.apply_due_user_plan_changes();
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code', b.code,
    'name', b.name,
    'description', 'Mở khóa nguồn hàng chính thức do đội Swipe Nest đăng, xem liên hệ và nhắn tin trực tiếp',
    'price_kind', 'FIXED',
    'amount_vnd', b.amount_vnd,
    'duration_months', b.duration_months,
    'active', b.active,
    'version', b.version
  ) ORDER BY b.code), '[]'::jsonb) INTO v_plans FROM public.user_billing_plans b;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY effective_at), '[]'::jsonb) INTO v_pending
    FROM public.user_plan_schedules s WHERE status = 'SCHEDULED';
  RETURN jsonb_build_object('plans', v_plans, 'pending', v_pending, 'snapshotAt', now());
END; $$;

CREATE OR REPLACE FUNCTION public.admin_change_user_plan(
  p_actor_id integer,
  p_request_id uuid,
  p_expected_version integer,
  p_amount integer,
  p_duration integer,
  p_active boolean,
  p_effective_at timestamptz,
  p_reason text,
  p_action text DEFAULT 'SAVE',
  p_plan_code text DEFAULT 'USER_PLUS'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET statement_timeout = '8s' AS $$
DECLARE
  v_plan public.user_billing_plans%ROWTYPE;
  v_previous public.user_plan_audit%ROWTYPE;
  v_schedule public.user_plan_schedules%ROWTYPE;
  v_payload jsonb;
  v_after jsonb;
  v_action text;
  v_actor_name text;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_plan_code IS NULL OR p_plan_code <> 'USER_PLUS' THEN
    RAISE EXCEPTION 'Invalid plan' USING ERRCODE = '22023';
  END IF;
  PERFORM public.apply_due_user_plan_changes();
  SELECT * INTO STRICT v_plan FROM public.user_billing_plans WHERE code = p_plan_code FOR UPDATE;
  v_payload := jsonb_build_object(
    'planCode', p_plan_code,
    'expectedVersion', p_expected_version,
    'amount', p_amount,
    'duration', p_duration,
    'active', p_active,
    'effectiveAt', p_effective_at,
    'reason', p_reason,
    'action', p_action
  );
  SELECT * INTO v_previous FROM public.user_plan_audit WHERE actor_id = p_actor_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Request reused' USING ERRCODE = '23505';
    END IF;
    RETURN public.admin_user_plan_catalog(p_actor_id);
  END IF;
  IF p_request_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500
    OR p_action IS NULL OR p_action NOT IN ('SAVE', 'CANCEL') THEN
    RAISE EXCEPTION 'Invalid change' USING ERRCODE = '22023';
  END IF;
  IF p_expected_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'Stale plan' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO v_schedule FROM public.user_plan_schedules WHERE plan_code = p_plan_code AND status = 'SCHEDULED' FOR UPDATE;
  IF p_action = 'CANCEL' THEN
    IF v_schedule.id IS NULL THEN
      RAISE EXCEPTION 'No pending schedule' USING ERRCODE = '23505';
    END IF;
    UPDATE public.user_plan_schedules SET status = 'CANCELLED', completed_at = now() WHERE id = v_schedule.id;
    v_action := 'CANCELLED';
    v_after := to_jsonb(v_plan);
  ELSE
    IF v_schedule.id IS NOT NULL THEN
      RAISE EXCEPTION 'Cancel existing schedule first' USING ERRCODE = '23505';
    END IF;
    IF p_amount IS NULL OR p_amount NOT BETWEEN 2000 AND 500000000 OR p_duration IS NULL OR p_duration NOT BETWEEN 1 AND 12
      OR p_active IS NULL THEN
      RAISE EXCEPTION 'Invalid price' USING ERRCODE = '22023';
    END IF;
    IF p_amount = v_plan.amount_vnd AND p_duration = v_plan.duration_months AND p_active = v_plan.active THEN
      RAISE EXCEPTION 'No changes' USING ERRCODE = '23505';
    END IF;
    v_after := jsonb_build_object('amount_vnd', p_amount, 'duration_months', p_duration, 'active', p_active);
    IF p_effective_at IS NOT NULL THEN
      IF p_effective_at < now() + interval '5 minutes' OR p_effective_at > now() + interval '365 days' THEN
        RAISE EXCEPTION 'Invalid effective date' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.user_plan_schedules(plan_code, amount_vnd, duration_months, active, effective_at, actor_id, reason)
        VALUES(p_plan_code, p_amount, p_duration, p_active, p_effective_at, p_actor_id, btrim(p_reason));
      v_action := 'SCHEDULED';
    ELSE
      UPDATE public.user_billing_plans SET amount_vnd = p_amount, duration_months = p_duration, active = p_active WHERE code = p_plan_code;
      v_action := 'UPDATED';
    END IF;
  END IF;
  UPDATE public.user_billing_plans SET version = version + 1, updated_at = now() WHERE code = p_plan_code;
  SELECT coalesce(name, 'Admin') INTO v_actor_name FROM public.users WHERE id = p_actor_id;
  INSERT INTO public.user_plan_audit(plan_code, action, actor_id, actor_name, request_id, request_payload, before_config, after_config, effective_at, reason)
    VALUES(p_plan_code, v_action, p_actor_id, v_actor_name, p_request_id, v_payload, to_jsonb(v_plan), v_after, coalesce(p_effective_at, now()), btrim(p_reason));
  RETURN public.admin_user_plan_catalog(p_actor_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_user_plan_history(p_actor_id integer, p_page integer DEFAULT 1, p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET statement_timeout = '8s' AS $$
DECLARE v_items jsonb; v_total bigint;
BEGIN
  PERFORM public.assert_plan_admin(p_actor_id);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid pagination' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_total FROM public.user_plan_audit;
  SELECT coalesce(jsonb_agg(to_jsonb(a) - 'request_payload' - 'request_id' ORDER BY created_at DESC, id DESC), '[]'::jsonb) INTO v_items
    FROM (SELECT * FROM public.user_plan_audit ORDER BY created_at DESC, id DESC LIMIT p_limit OFFSET (p_page - 1) * p_limit) a;
  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'page', p_page, 'limit', p_limit);
END; $$;

-- Cập nhật reserve_user_payment để áp dụng lịch giá Plus đến hạn trước khi chốt đơn thanh toán.
CREATE OR REPLACE FUNCTION public.reserve_user_payment(p_user_id integer, p_plan_code text, p_request_id uuid, p_expected_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public SET timezone = 'UTC' SET statement_timeout = '8s' AS $$
DECLARE v_plan public.user_billing_plans%ROWTYPE; v_order public.agent_payment_orders%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.users WHERE id = p_user_id AND upper(role) = 'USER' AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User unavailable' USING ERRCODE = '42501'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE = '22023'; END IF;
  UPDATE public.agent_payment_orders SET status = 'EXPIRED', updated_at = now()
    WHERE user_id = p_user_id AND status IN ('CREATING', 'PENDING') AND expires_at <= now();
  SELECT * INTO v_order FROM public.agent_payment_orders WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_order.plan_code <> p_plan_code THEN RAISE EXCEPTION 'Request reused for another plan' USING ERRCODE = '22023'; END IF;
    RETURN to_jsonb(v_order);
  END IF;
  SELECT * INTO v_order FROM public.agent_payment_orders WHERE user_id = p_user_id AND status IN ('CREATING', 'PENDING');
  IF FOUND THEN RETURN to_jsonb(v_order); END IF;
  PERFORM public.apply_due_user_plan_changes();
  SELECT * INTO v_plan FROM public.user_billing_plans WHERE code = p_plan_code AND active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE = '22023'; END IF;
  IF p_expected_version IS DISTINCT FROM v_plan.version THEN RAISE EXCEPTION 'Stale plan' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.agent_payment_orders(user_id, request_id, plan_code, plan_name, amount_vnd, duration_months, audience)
    VALUES(p_user_id, p_request_id, v_plan.code, v_plan.name, v_plan.amount_vnd, v_plan.duration_months, 'USER')
    RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END $$;

ALTER TABLE public.user_plan_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_plan_schedules, public.user_plan_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.user_plan_schedules, public.user_plan_audit TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_billing_plans FROM service_role;
REVOKE ALL ON SEQUENCE public.user_plan_audit_id_seq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_due_user_plan_changes(),
  public.user_service_catalog(),
  public.admin_user_plan_catalog(integer),
  public.admin_change_user_plan(integer, uuid, integer, integer, integer, boolean, timestamptz, text, text, text),
  public.admin_user_plan_history(integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_due_user_plan_changes() FROM service_role;
GRANT EXECUTE ON FUNCTION public.user_service_catalog(),
  public.admin_user_plan_catalog(integer),
  public.admin_change_user_plan(integer, uuid, integer, integer, integer, boolean, timestamptz, text, text, text),
  public.admin_user_plan_history(integer, integer, integer)
  TO service_role;

INSERT INTO public.app_schema_migrations (id) VALUES ('030') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
