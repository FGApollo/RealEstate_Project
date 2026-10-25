-- Read-only analytics over existing facts. No payment ledger is invented and
-- no production users/subscriptions are changed. Legacy timestamps are UTC.
BEGIN;

CREATE INDEX IF NOT EXISTS users_analytics_created_role_idx
  ON public.users (created_at, role);
CREATE INDEX IF NOT EXISTS subscriptions_analytics_created_idx
  ON public.seller_subscriptions (created_at, user_id);
CREATE INDEX IF NOT EXISTS subscriptions_analytics_current_idx
  ON public.seller_subscriptions (user_id, start_date DESC, id DESC)
  INCLUDE (end_date, plan_name) WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION public.admin_analytics_dashboard(
  p_start date, p_end date, p_bucket text DEFAULT 'day',
  p_as_of timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
SET timezone = 'UTC'
SET statement_timeout = '8s'
AS $$
DECLARE
  v_zone constant text := 'Asia/Ho_Chi_Minh';
  v_start timestamp;
  v_end timestamp;
  v_previous_start timestamp;
  v_cutoff timestamp;
  v_result jsonb;
  v_days integer;
BEGIN
  v_days := p_end - p_start + 1;
  IF p_start IS NULL OR p_end IS NULL OR p_bucket IS NULL OR p_as_of IS NULL
    OR p_start < date '2000-01-01'
    OR p_end > (p_as_of AT TIME ZONE v_zone)::date
    OR v_days NOT BETWEEN 1 AND 3660
    OR p_bucket NOT IN ('day', 'week', 'month', 'year')
    OR (p_bucket = 'day' AND v_days > 366)
    OR (p_bucket = 'week' AND v_days > 2793) THEN
    RAISE EXCEPTION 'Invalid analytics range or bucket' USING ERRCODE = '22023';
  END IF;

  -- Convert boundaries, not indexed columns, for range predicates.
  v_start := (p_start::timestamp AT TIME ZONE v_zone) AT TIME ZONE 'UTC';
  v_end := ((p_end + 1)::timestamp AT TIME ZONE v_zone) AT TIME ZONE 'UTC';
  v_previous_start := v_start - make_interval(days => v_days);
  v_cutoff := least(v_end, p_as_of AT TIME ZONE 'UTC');

  WITH user_counts AS (
    SELECT count(*) AS total,
      count(*) FILTER (WHERE role = 'USER') AS customers,
      count(*) FILTER (WHERE role = 'AGENT') AS agents,
      count(*) FILTER (WHERE role = 'ADMIN') AS admins,
      count(*) FILTER (WHERE role IS NULL OR role NOT IN ('USER','AGENT','ADMIN')) AS other_roles,
      count(*) FILTER (WHERE is_active IS TRUE) AS active,
      count(*) FILTER (WHERE is_active IS FALSE) AS inactive,
      count(*) FILTER (WHERE is_active IS NULL) AS unknown_status,
      count(*) FILTER (WHERE created_at IS NULL) AS unknown_dates,
      count(*) FILTER (WHERE created_at >= v_start) AS new_accounts,
      count(*) FILTER (WHERE created_at >= v_start AND role = 'USER') AS new_customers,
      count(*) FILTER (WHERE created_at >= v_start AND role = 'AGENT') AS new_agents,
      count(*) FILTER (WHERE created_at >= v_previous_start AND created_at < v_start) AS previous_new,
      count(*) FILTER (WHERE created_at < v_start OR created_at IS NULL) AS opening_total,
      count(*) FILTER (WHERE (created_at < v_start OR created_at IS NULL) AND role = 'USER') AS opening_customers,
      count(*) FILTER (WHERE (created_at < v_start OR created_at IS NULL) AND role = 'AGENT') AS opening_agents
    FROM public.users WHERE created_at < v_cutoff OR created_at IS NULL
  ), buckets AS (
    SELECT generate_series(date_trunc(p_bucket, p_start::timestamp),
      date_trunc(p_bucket, p_end::timestamp), ('1 ' || p_bucket)::interval) AS bucket
  ), registrations AS (
    SELECT date_trunc(p_bucket, created_at AT TIME ZONE 'UTC' AT TIME ZONE v_zone) AS bucket,
      count(*) AS total, count(*) FILTER (WHERE role = 'USER') AS customers,
      count(*) FILTER (WHERE role = 'AGENT') AS agents
    FROM public.users WHERE created_at >= v_start AND created_at < v_cutoff
    GROUP BY 1
  ), agent_subscriptions AS MATERIALIZED (
    SELECT s.* FROM public.seller_subscriptions s
    JOIN public.users u ON u.id = s.user_id AND u.role = 'AGENT'
    WHERE (u.created_at < v_cutoff OR u.created_at IS NULL)
      AND (s.created_at < v_cutoff OR s.created_at IS NULL)
  ), current_plans AS (
    -- Deterministic: one eligible record per distinct agent, latest start wins.
    SELECT DISTINCT ON (s.user_id) s.user_id, coalesce(nullif(btrim(s.plan_name), ''), 'Không xác định') AS plan_name
    FROM public.seller_subscriptions s JOIN public.users u ON u.id = s.user_id AND u.role = 'AGENT'
    WHERE s.status = 'ACTIVE' AND s.start_date < v_cutoff AND s.end_date > v_cutoff
      AND (s.created_at < v_cutoff OR s.created_at IS NULL)
      AND (u.created_at < v_cutoff OR u.created_at IS NULL)
    ORDER BY s.user_id, s.start_date DESC, s.created_at DESC NULLS LAST, s.id DESC
  ), subscription_counts AS (
    SELECT count(*) AS records, count(DISTINCT user_id) AS ever_subscribed,
      count(*) FILTER (WHERE created_at >= v_start) AS new_records,
      count(*) FILTER (WHERE created_at >= v_previous_start AND created_at < v_start) AS previous_new,
      count(*) FILTER (WHERE status = 'EXPIRED' OR (status = 'ACTIVE' AND end_date <= v_cutoff)) AS expired,
      count(*) FILTER (WHERE status IN ('CANCELLED','CANCELED')) AS cancelled,
      count(*) FILTER (WHERE end_date >= v_start AND end_date < v_cutoff AND status IN ('ACTIVE','EXPIRED')) AS ended_in_period,
      count(*) FILTER (WHERE start_date IS NULL OR end_date IS NULL OR created_at IS NULL) AS unknown_dates
    FROM agent_subscriptions
  ), package_records AS (
    SELECT coalesce(nullif(btrim(plan_name), ''), 'Không xác định') AS plan_name,
      count(*) AS records, count(*) FILTER (WHERE created_at >= v_start) AS new_records
    FROM agent_subscriptions GROUP BY 1
  ), package_active AS (
    SELECT plan_name, count(*) AS agents FROM current_plans GROUP BY 1
  ), packages AS (
    SELECT r.plan_name, r.records, r.new_records, coalesce(a.agents, 0) AS agents,
      CASE WHEN (SELECT count(*) FROM current_plans) > 0
        THEN coalesce(a.agents, 0)::numeric * 100 / (SELECT count(*) FROM current_plans) ELSE 0 END AS share
    FROM package_records r LEFT JOIN package_active a USING (plan_name)
  )
  SELECT jsonb_build_object(
    'generatedAt', p_as_of,
    'snapshotAt', v_cutoff AT TIME ZONE 'UTC',
    'previousPeriod', jsonb_build_object('start', p_start - v_days, 'end', p_start - 1),
    'users', (SELECT jsonb_build_object(
      'total', total, 'customers', customers, 'agents', agents, 'admins', admins, 'otherRoles', other_roles,
      'active', active, 'inactive', inactive, 'unknownStatus', unknown_status, 'unknownDates', unknown_dates,
      'newAccounts', new_accounts, 'newCustomers', new_customers, 'newAgents', new_agents,
      'previousNewAccounts', previous_new,
      'newGrowthPercent', CASE WHEN previous_new > 0 THEN (new_accounts - previous_new)::numeric * 100 / previous_new ELSE NULL END,
      'openingTotal', opening_total, 'openingCustomers', opening_customers, 'openingAgents', opening_agents,
      'totalGrowthPercent', CASE WHEN opening_total > 0 THEN (total - opening_total)::numeric * 100 / opening_total ELSE NULL END,
      'customerGrowthPercent', CASE WHEN opening_customers > 0 THEN (customers - opening_customers)::numeric * 100 / opening_customers ELSE NULL END,
      'agentGrowthPercent', CASE WHEN opening_agents > 0 THEN (agents - opening_agents)::numeric * 100 / opening_agents ELSE NULL END,
      'customerShare', CASE WHEN customers + agents > 0 THEN customers::numeric * 100 / (customers + agents) ELSE 0 END,
      'agentShare', CASE WHEN customers + agents > 0 THEN agents::numeric * 100 / (customers + agents) ELSE 0 END
    ) FROM user_counts),
    'userGrowth', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'date', to_char(b.bucket, 'YYYY-MM-DD'), 'total', coalesce(r.total, 0),
      'customers', coalesce(r.customers, 0), 'agents', coalesce(r.agents, 0)
    ) ORDER BY b.bucket), '[]'::jsonb) FROM buckets b LEFT JOIN registrations r USING (bucket)),
    'subscriptions', (SELECT jsonb_build_object(
      'totalAgents', (SELECT agents FROM user_counts), 'records', records, 'everSubscribed', ever_subscribed,
      'activeAgents', (SELECT count(*) FROM current_plans),
      'neverSubscribed', (SELECT agents FROM user_counts) - ever_subscribed,
      'withoutActive', (SELECT agents FROM user_counts) - (SELECT count(*) FROM current_plans),
      'newRecords', new_records, 'previousNewRecords', previous_new,
      'newGrowthPercent', CASE WHEN previous_new > 0 THEN (new_records - previous_new)::numeric * 100 / previous_new ELSE NULL END,
      'expiredRecords', expired, 'cancelledRecords', cancelled, 'endedInPeriod', ended_in_period, 'unknownDates', unknown_dates
    ) FROM subscription_counts),
    'packages', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', plan_name, 'activeAgents', agents, 'sharePercent', share,
      'newSubscriptions', new_records, 'records', records, 'revenue', NULL
    ) ORDER BY agents DESC, plan_name), '[]'::jsonb) FROM packages)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- PostgREST must never expose this RPC to browser/anonymous clients. The
-- service-role key stays on Express; HTTP routes also require a current ADMIN.
REVOKE ALL ON FUNCTION public.admin_analytics_dashboard(date, date, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_dashboard(date, date, text, timestamptz) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
