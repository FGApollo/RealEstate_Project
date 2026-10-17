-- Backend-only billing ledger. Apply before enabling PAYOS_ENABLED.
BEGIN;
CREATE TABLE IF NOT EXISTS public.agent_billing_plans (
  code text PRIMARY KEY, name text NOT NULL,
  amount_vnd integer NOT NULL CHECK (amount_vnd > 0),
  duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 12),
  active boolean NOT NULL DEFAULT true
);
INSERT INTO public.agent_billing_plans(code,name,amount_vnd,duration_months)
VALUES ('PAID','Premium',1000000,1) ON CONFLICT (code) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS public.agent_payment_order_code_seq
  START WITH 1000000000000 MAXVALUE 9007199254740991 NO CYCLE;
CREATE TABLE IF NOT EXISTS public.agent_payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code bigint NOT NULL UNIQUE DEFAULT nextval('public.agent_payment_order_code_seq'),
  user_id integer NOT NULL REFERENCES public.users(id),
  request_id uuid NOT NULL,
  plan_code text NOT NULL, plan_name text NOT NULL,
  amount_vnd integer NOT NULL CHECK (amount_vnd > 0),
  duration_months integer NOT NULL CHECK (duration_months BETWEEN 1 AND 12),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  provider text NOT NULL DEFAULT 'PAYOS' CHECK (provider = 'PAYOS'),
  status text NOT NULL DEFAULT 'CREATING'
    CHECK (status IN ('CREATING','PENDING','PAID','CANCELLED','EXPIRED','FAILED')),
  payment_link_id text UNIQUE, checkout_url text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  paid_at timestamptz, verified_at timestamptz, provider_reference text,
  subscription_id integer REFERENCES public.seller_subscriptions(id),
  grant_start timestamptz, grant_end timestamptz,
  UNIQUE (user_id, request_id),
  CHECK (status <> 'PAID' OR (paid_at IS NOT NULL AND verified_at IS NOT NULL
    AND payment_link_id IS NOT NULL AND subscription_id IS NOT NULL AND grant_end IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_one_open_payment_idx ON public.agent_payment_orders(user_id)
  WHERE status IN ('CREATING','PENDING');
CREATE INDEX IF NOT EXISTS agent_payment_history_idx ON public.agent_payment_orders(user_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS agent_payment_revenue_idx ON public.agent_payment_orders(paid_at,verified_at)
  WHERE status='PAID';

CREATE OR REPLACE FUNCTION public.reserve_agent_payment(p_user_id integer,p_plan_code text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET timezone='UTC'
SET statement_timeout='8s' AS $$
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
  SELECT * INTO v_plan FROM public.agent_billing_plans WHERE code=p_plan_code AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.agent_payment_orders(user_id,request_id,plan_code,plan_name,amount_vnd,duration_months)
  VALUES(p_user_id,p_request_id,v_plan.code,v_plan.name,v_plan.amount_vnd,v_plan.duration_months) RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

-- A short DB lease bounds provider reads across tabs/server instances. Failure is
-- retryable after five seconds. It is not evidence of a successful payment.
CREATE OR REPLACE FUNCTION public.claim_agent_payment_sync(p_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  WITH claimed AS (UPDATE public.agent_payment_orders SET last_synced_at=now()
    WHERE id=p_id AND status<>'PAID' AND (last_synced_at IS NULL OR last_synced_at<now()-interval '5 seconds')
    RETURNING id) SELECT EXISTS(SELECT 1 FROM claimed);
$$;

CREATE OR REPLACE FUNCTION public.update_agent_payment(p_id uuid,p_link_id text,p_checkout_url text,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET statement_timeout='8s' AS $$
DECLARE v_order public.agent_payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_order FROM public.agent_payment_orders WHERE id=p_id FOR UPDATE;
  IF p_status NOT IN ('PENDING','CANCELLED','EXPIRED','FAILED') OR p_link_id IS NULL OR length(p_link_id)>100
    OR (v_order.payment_link_id IS NOT NULL AND v_order.payment_link_id<>p_link_id) THEN
    RAISE EXCEPTION 'Payment identity mismatch' USING ERRCODE='22023';
  END IF;
  IF v_order.status='PAID' THEN RETURN to_jsonb(v_order); END IF;
  UPDATE public.agent_payment_orders SET payment_link_id=p_link_id,
    checkout_url=coalesce(p_checkout_url,checkout_url),
    status=CASE WHEN status IN ('CANCELLED','EXPIRED','FAILED') AND p_status='PENDING' THEN status ELSE p_status END,
    updated_at=now() WHERE id=p_id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

CREATE OR REPLACE FUNCTION public.settle_agent_payment(
  p_order_code bigint,p_link_id text,p_amount integer,p_paid_at timestamptz,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET timezone='UTC'
SET statement_timeout='8s' AS $$
DECLARE v_order public.agent_payment_orders%ROWTYPE; v_subscription public.seller_subscriptions%ROWTYPE;
  v_user_id integer; v_start timestamptz; v_end timestamptz;
BEGIN
  SELECT user_id INTO v_user_id FROM public.agent_payment_orders WHERE order_code=p_order_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='22023'; END IF;
  -- Same lock order as reservation/free trial; concurrent callbacks cannot grant twice.
  PERFORM 1 FROM public.users WHERE id=v_user_id FOR UPDATE;
  SELECT * INTO STRICT v_order FROM public.agent_payment_orders WHERE order_code=p_order_code FOR UPDATE;
  IF p_link_id IS NULL OR length(p_link_id)>100 OR p_amount IS DISTINCT FROM v_order.amount_vnd
    OR (v_order.payment_link_id IS NOT NULL AND v_order.payment_link_id<>p_link_id)
    OR p_paid_at IS NULL OR p_paid_at>now()+interval '5 minutes'
    OR p_paid_at<v_order.created_at-interval '5 minutes' THEN
    RAISE EXCEPTION 'Payment verification mismatch' USING ERRCODE='22023';
  END IF;
  IF v_order.status='PAID' THEN RETURN to_jsonb(v_order); END IF;
  SELECT * INTO v_subscription FROM public.seller_subscriptions WHERE user_id=v_user_id
    ORDER BY (status='ACTIVE' AND start_date<=now() AT TIME ZONE 'UTC' AND end_date>now() AT TIME ZONE 'UTC') DESC NULLS LAST,
      end_date DESC NULLS LAST,id DESC LIMIT 1 FOR UPDATE;
  v_start:=now();
  v_end:=v_start;
  IF v_subscription.id IS NOT NULL AND v_subscription.status='ACTIVE' AND v_subscription.start_date<=now() AT TIME ZONE 'UTC'
    AND v_subscription.end_date>now() AT TIME ZONE 'UTC' THEN
    v_end:=v_subscription.end_date AT TIME ZONE 'UTC';
  END IF;
  v_end:=v_end+make_interval(months=>v_order.duration_months);
  IF v_subscription.id IS NULL THEN
    INSERT INTO public.seller_subscriptions(user_id,plan_name,price_vnd,start_date,end_date,status,created_at,updated_at)
    VALUES(v_user_id,v_order.plan_code,v_order.amount_vnd,v_start AT TIME ZONE 'UTC',v_end AT TIME ZONE 'UTC','ACTIVE',
      now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC') RETURNING * INTO v_subscription;
  ELSE
    UPDATE public.seller_subscriptions SET plan_name=v_order.plan_code,price_vnd=v_order.amount_vnd,
      start_date=CASE WHEN status='ACTIVE' AND start_date<=now() AT TIME ZONE 'UTC' AND end_date>now() AT TIME ZONE 'UTC' THEN start_date ELSE v_start AT TIME ZONE 'UTC' END,
      end_date=v_end AT TIME ZONE 'UTC',status='ACTIVE',updated_at=now() AT TIME ZONE 'UTC'
      WHERE id=v_subscription.id RETURNING * INTO v_subscription;
  END IF;
  -- Consolidate legacy overlapping active rows into the renewed entitlement.
  -- Their original paid amounts are never turned into ledger entries.
  UPDATE public.seller_subscriptions SET status='EXPIRED',end_date=least(end_date,now() AT TIME ZONE 'UTC'),
    updated_at=now() AT TIME ZONE 'UTC'
    WHERE user_id=v_user_id AND id<>v_subscription.id AND status='ACTIVE' AND end_date>now() AT TIME ZONE 'UTC';
  UPDATE public.agent_payment_orders SET status='PAID',payment_link_id=p_link_id,paid_at=p_paid_at,verified_at=now(),
    provider_reference=left(p_reference,200),subscription_id=v_subscription.id,grant_start=v_start,grant_end=v_end,updated_at=now()
    WHERE id=v_order.id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

CREATE OR REPLACE FUNCTION public.start_agent_free_trial(p_user_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET timezone='UTC'
SET statement_timeout='8s' AS $$
DECLARE v_subscription public.seller_subscriptions%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.users WHERE id=p_user_id AND upper(role)='AGENT' AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agent unavailable' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.seller_subscriptions WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'Trial already used' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.seller_subscriptions(user_id,plan_name,price_vnd,start_date,end_date,status,created_at,updated_at)
  VALUES(p_user_id,'FREE_TRIAL',0,now() AT TIME ZONE 'UTC',(now()+interval '1 month') AT TIME ZONE 'UTC','ACTIVE',
    now() AT TIME ZONE 'UTC',now() AT TIME ZONE 'UTC') RETURNING * INTO v_subscription;
  RETURN to_jsonb(v_subscription);
END; $$;

ALTER TABLE public.agent_billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_payment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_billing_plans,public.agent_payment_orders FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.agent_payment_order_code_seq FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_billing_plans,public.agent_payment_orders TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.agent_payment_order_code_seq TO service_role;
REVOKE ALL ON FUNCTION public.reserve_agent_payment(integer,text,uuid),public.claim_agent_payment_sync(uuid),
  public.update_agent_payment(uuid,text,text,text),public.settle_agent_payment(bigint,text,integer,timestamptz,text),
  public.start_agent_free_trial(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_agent_payment(integer,text,uuid),public.claim_agent_payment_sync(uuid),
  public.update_agent_payment(uuid,text,text,text),public.settle_agent_payment(bigint,text,integer,timestamptz,text),
  public.start_agent_free_trial(integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
