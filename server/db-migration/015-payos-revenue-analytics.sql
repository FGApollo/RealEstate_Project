-- Run after 014. No legacy subscription is converted into a payment.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_payment_revenue(
  p_start date,p_end date,p_bucket text DEFAULT 'day',p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_previous timestamptz; v_step interval; v_result jsonb;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_as_of IS NULL OR p_bucket IS NULL
    OR p_start<'2000-01-01'::date OR p_end>(p_as_of AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR p_end-p_start+1 NOT BETWEEN 1 AND 3660 OR p_bucket NOT IN ('day','week','month','year')
    OR (p_bucket='day' AND p_end-p_start+1>366) OR (p_bucket='week' AND p_end-p_start+1>2793) THEN
    RAISE EXCEPTION 'Invalid analytics range' USING ERRCODE='22023';
  END IF;
  v_start:=p_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';
  v_end:=least((p_end+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',p_as_of);
  v_previous:=v_start-make_interval(days=>p_end-p_start+1);
  v_step:=CASE p_bucket WHEN 'day' THEN interval '1 day' WHEN 'week' THEN interval '1 week'
    WHEN 'month' THEN interval '1 month' ELSE interval '1 year' END;
  WITH verified AS (
    SELECT * FROM public.agent_payment_orders WHERE status='PAID' AND verified_at<=p_as_of AND paid_at<=p_as_of
  ), period AS (
    SELECT * FROM verified WHERE paid_at>=v_start AND paid_at<v_end
  ), totals AS (
    SELECT coalesce(sum(amount_vnd),0) AS total,
      coalesce(sum(amount_vnd) FILTER(WHERE paid_at>=date_trunc('month',p_as_of AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'),0) AS month,
      coalesce(sum(amount_vnd) FILTER(WHERE paid_at>=v_start AND paid_at<v_end),0) AS gross,
      count(*) FILTER(WHERE paid_at>=v_start AND paid_at<v_end) AS transactions,
      coalesce(sum(amount_vnd) FILTER(WHERE paid_at>=v_previous AND paid_at<v_start),0) AS previous
    FROM verified
  ), buckets AS (
    SELECT d::date AS date FROM generate_series(date_trunc(p_bucket,p_start::timestamp),date_trunc(p_bucket,p_end::timestamp),v_step) d
  ), trend AS (
    SELECT b.date,coalesce(sum(p.amount_vnd),0) AS gross FROM buckets b LEFT JOIN period p
      ON date_trunc(p_bucket,p.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=b.date GROUP BY b.date
  ), months AS (
    SELECT to_char(paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM') AS name,sum(amount_vnd) AS gross
    FROM period GROUP BY 1
  ), packages AS (
    SELECT plan_code AS code,plan_name AS name,sum(amount_vnd) AS gross,count(*) AS transactions FROM period GROUP BY 1,2
  ) SELECT jsonb_build_object(
    'available',true,'currency','VND','recognition','verified_payment_date',
    'coverage','Giao dịch payOS được ghi nhận kể từ khi tích hợp; không gồm thanh toán ngoài hệ thống.',
    'refundsAvailable',false,'totalGross',t.total,'currentMonthGross',t.month,'periodGross',t.gross,
    'periodRefunds',NULL,'periodNet',NULL,'successfulTransactions',t.transactions,
    'averageTransaction',CASE WHEN t.transactions=0 THEN 0 ELSE t.gross::numeric/t.transactions END,
    'growthPercent',CASE WHEN t.previous=0 THEN NULL ELSE (t.gross-t.previous)*100.0/t.previous END,
    'trend',coalesce((SELECT jsonb_agg(to_jsonb(trend) ORDER BY date) FROM trend),'[]'::jsonb),
    'monthly',coalesce((SELECT jsonb_agg(to_jsonb(months) ORDER BY name) FROM months),'[]'::jsonb),
    'byPackage',coalesce((SELECT jsonb_agg(to_jsonb(packages)||jsonb_build_object('sharePercent',CASE WHEN t.gross=0 THEN 0 ELSE gross*100.0/t.gross END) ORDER BY code,name) FROM packages),'[]'::jsonb),
    'bySource',CASE WHEN t.gross=0 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('name','payOS','gross',t.gross,'sharePercent',100)) END
  ) INTO v_result FROM totals t;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_payment_transactions(p_start date,p_end date,p_page integer DEFAULT 1,p_limit integer DEFAULT 10,p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_page IS NULL OR p_limit IS NULL OR p_as_of IS NULL
    OR p_start<'2000-01-01'::date OR p_end>(p_as_of AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    OR p_end-p_start+1 NOT BETWEEN 1 AND 3660 OR p_page NOT BETWEEN 1 AND 10000 OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid transaction query' USING ERRCODE='22023';
  END IF;
  WITH orders AS (
    SELECT o.id,o.order_code AS "orderCode",coalesce(u.name,'Agent') AS agent,o.plan_name AS "planName",
      o.amount_vnd AS amount,o.currency,o.status,o.created_at AS "createdAt",o.paid_at AS "paidAt"
    FROM public.agent_payment_orders o JOIN public.users u ON u.id=o.user_id
    WHERE o.created_at>=p_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
      AND o.created_at<least((p_end+1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',p_as_of)
  ), page AS (SELECT * FROM orders ORDER BY "createdAt" DESC,id LIMIT p_limit OFFSET (p_page-1)*p_limit)
  SELECT jsonb_build_object('available',true,'total',(SELECT count(*) FROM orders),'page',p_page,'limit',p_limit,
    'items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY "createdAt" DESC,id) FROM page),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END; $$;
CREATE INDEX IF NOT EXISTS agent_payment_created_idx ON public.agent_payment_orders(created_at DESC,id);
REVOKE ALL ON FUNCTION public.admin_payment_revenue(date,date,text,timestamptz),
  public.admin_payment_transactions(date,date,integer,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payment_revenue(date,date,text,timestamptz),
  public.admin_payment_transactions(date,date,integer,integer,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
