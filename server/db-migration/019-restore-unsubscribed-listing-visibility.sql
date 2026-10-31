-- Requires 018. A subscription adds priority and caps its current paid period;
-- it must not be a prerequisite for viewing an already published listing.
-- This migration changes no property, user, subscription or payment records.
BEGIN;

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
  ORDER BY listing.id DESC LIMIT e.listing_limit
) p
WHERE u.is_active IS TRUE AND u.role='AGENT' AND u.verification_status='VERIFIED' AND coalesce(u.trust_score,50)>30;

REVOKE ALL ON public.ranked_properties FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ranked_properties TO service_role;

CREATE OR REPLACE FUNCTION public.agent_subscription_state(p_user_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET timezone='UTC' SET statement_timeout='8s' AS $$
DECLARE v_subscription public.seller_subscriptions%ROWTYPE; v_upcoming jsonb; v_count bigint; v_visible bigint;
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
  SELECT count(*) INTO v_count FROM public.properties
    WHERE owner_id=p_user_id AND status='AVAILABLE' AND is_hidden IS NOT TRUE AND is_public IS TRUE;
  SELECT count(*) INTO v_visible FROM public.ranked_properties WHERE owner_id=p_user_id;
  RETURN to_jsonb(v_subscription)||jsonb_build_object('public_listing_count',v_count,'visible_listing_count',v_visible,'upcoming',v_upcoming);
END; $$;

REVOKE ALL ON FUNCTION public.agent_subscription_state(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_subscription_state(integer) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
