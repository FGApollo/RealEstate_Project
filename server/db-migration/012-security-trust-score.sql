-- Apply together with the security release. Trust-score writes fail closed
-- until this service-role-only, transactional function is available.
BEGIN;

CREATE INDEX IF NOT EXISTS trust_score_security_action_idx
  ON public.trust_score_logs (user_id, action, related_report_id);

CREATE OR REPLACE FUNCTION public.security_apply_trust_score(
  p_user_id bigint, p_action text, p_delta integer, p_reason text,
  p_property_id bigint DEFAULT NULL, p_report_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET statement_timeout = '8s'
AS $$
DECLARE
  v_old integer;
  v_new integer;
  v_skip boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_user_id < 1 OR p_action IS NULL
    OR length(p_action) NOT BETWEEN 1 AND 80 OR p_delta IS NULL
    OR p_delta NOT BETWEEN -100 AND 100 OR p_reason IS NULL
    OR length(p_reason) > 6000 THEN
    RAISE EXCEPTION 'Invalid trust-score mutation' USING ERRCODE = '22023';
  END IF;

  -- All claims/mutations for one account serialize across server processes.
  SELECT coalesce(trust_score, 50) INTO v_old FROM public.users
    WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002'; END IF;

  IF p_action IN ('PROFILE_COMPLETED', 'ACCOUNT_30_DAYS_CLEAN', 'PHONE_VERIFIED') THEN
    SELECT EXISTS (SELECT 1 FROM public.trust_score_logs
      WHERE user_id = p_user_id AND action = p_action) INTO v_skip;
  ELSIF p_action = 'KYC_APPROVED' THEN
    SELECT count(*) FILTER (WHERE action = 'KYC_APPROVED')
      > count(*) FILTER (WHERE action = 'KYC_REVOKED') INTO v_skip
      FROM public.trust_score_logs WHERE user_id = p_user_id
      AND action IN ('KYC_APPROVED', 'KYC_REVOKED');
  ELSIF p_action = 'KYC_REVOKED' THEN
    SELECT count(*) FILTER (WHERE action = 'KYC_APPROVED')
      <= count(*) FILTER (WHERE action = 'KYC_REVOKED') INTO v_skip
      FROM public.trust_score_logs WHERE user_id = p_user_id
      AND action IN ('KYC_APPROVED', 'KYC_REVOKED');
  ELSIF p_report_id IS NOT NULL AND (p_action = 'APPEAL_PENALTY_REFUND' OR left(p_action, 7) = 'REPORT_') THEN
    SELECT EXISTS (SELECT 1 FROM public.trust_score_logs
      WHERE user_id = p_user_id AND related_report_id = p_report_id
      AND ((p_action = 'APPEAL_PENALTY_REFUND' AND action = p_action)
        OR (left(p_action, 7) = 'REPORT_' AND left(action, 7) = 'REPORT_'))) INTO v_skip;
  END IF;

  IF v_skip THEN RETURN jsonb_build_object('applied', false, 'oldScore', v_old, 'newScore', v_old); END IF;
  v_new := greatest(0, least(100, v_old + p_delta));
  UPDATE public.users SET trust_score = v_new WHERE id = p_user_id;
  INSERT INTO public.trust_score_logs
    (user_id, action, point_change, old_score, new_score, reason, related_property_id, related_report_id)
    VALUES (p_user_id, p_action, p_delta, v_old, v_new, p_reason, p_property_id, p_report_id);
  RETURN jsonb_build_object('applied', true, 'oldScore', v_old, 'newScore', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.security_apply_trust_score(bigint, text, integer, text, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_apply_trust_score(bigint, text, integer, text, bigint, bigint)
  TO service_role;
COMMIT;
