-- Paged Admin detail for the activeAgents KPI from migration 010.
-- The eligibility and tie-breaking rules intentionally match that KPI.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_analytics_active_agents(
  p_snapshot_at timestamptz,p_page integer DEFAULT 1,p_limit integer DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_cutoff timestamp; v_result jsonb;
BEGIN
  IF p_snapshot_at IS NULL OR p_snapshot_at<'2000-01-01'::timestamptz
    OR p_snapshot_at>now()+interval '5 seconds' OR p_page IS NULL OR p_limit IS NULL
    OR p_page NOT BETWEEN 1 AND 10000 OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid active Agent query' USING ERRCODE='22023';
  END IF;
  v_cutoff:=p_snapshot_at AT TIME ZONE 'UTC';
  WITH current_plans AS MATERIALIZED (
    SELECT DISTINCT ON (s.user_id)
      s.user_id AS "agentId",
      coalesce(nullif(btrim(u.name),''),'Agent #'||u.id::text) AS name,
      u.email,u.is_active AS "accountActive",
      coalesce(nullif(btrim(s.plan_name),''),'Không xác định') AS "planName",
      s.start_date AT TIME ZONE 'UTC' AS "startDate",
      s.end_date AT TIME ZONE 'UTC' AS "endDate"
    FROM public.seller_subscriptions s
    JOIN public.users u ON u.id=s.user_id AND u.role='AGENT'
    WHERE s.status='ACTIVE' AND s.start_date<v_cutoff AND s.end_date>v_cutoff
      AND (s.created_at<v_cutoff OR s.created_at IS NULL)
      AND (u.created_at<v_cutoff OR u.created_at IS NULL)
    ORDER BY s.user_id,s.start_date DESC,s.created_at DESC NULLS LAST,s.id DESC
  ), page AS (
    SELECT * FROM current_plans ORDER BY "endDate","agentId"
    LIMIT p_limit OFFSET (p_page-1)*p_limit
  ) SELECT jsonb_build_object(
    'snapshotAt',p_snapshot_at,'timeZone','Asia/Ho_Chi_Minh',
    'total',(SELECT count(*) FROM current_plans),'page',p_page,'limit',p_limit,
    'items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY "endDate","agentId") FROM page),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_analytics_active_agents(timestamptz,integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_active_agents(timestamptz,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
