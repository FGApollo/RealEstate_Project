-- Apply after deploying the reviewed security release. All browser data access
-- in this application uses the Express API and its own session/role checks.
-- No rows are deleted and no existing public grants are restored on rollback.
BEGIN;

DO $migration$
DECLARE
  app_table text;
  relation_kind "char";
  owned_sequence record;
  app_function record;
  column_list text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'users', 'auth_sessions', 'google_identities', 'email_verification_tokens',
    'phone_otps', 'otp_send_rate_events', 'identity_verifications', 'messages',
    'favorites', 'crm_notes', 'agent_user_funnel', 'lifestyle_tags', 'properties',
    'property_features', 'property_images', 'property_leads', 'property_links',
    'property_reports', 'property_report_appeals', 'property_reviews',
    'property_review_images', 'property_review_replies', 'property_review_helpful_votes',
    'property_transactions', 'property_view_events', 'swipe_actions',
    'seller_subscriptions', 'trust_score_logs', 'user_preferences', 'user_property_events'
  ] LOOP
    SELECT c.relkind INTO relation_kind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = app_table;
    IF relation_kind IS NULL THEN CONTINUE; END IF;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', app_table);
    -- Column grants survive a table-level REVOKE, so close them explicitly too.
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum) INTO column_list
      FROM pg_attribute a
      WHERE a.attrelid = format('public.%I', app_table)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped;
    IF column_list IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated', column_list, app_table);
    END IF;
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', app_table);
    IF relation_kind IN ('r', 'p') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    END IF;

    FOR owned_sequence IN
      SELECT DISTINCT seq.relname AS sequence_name
      FROM pg_class seq
      JOIN pg_namespace ns ON ns.oid = seq.relnamespace
      JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype IN ('a', 'i')
      JOIN pg_class tab ON tab.oid = dep.refobjid
      JOIN pg_namespace nt ON nt.oid = tab.relnamespace
      WHERE seq.relkind = 'S' AND ns.nspname = 'public'
        AND nt.nspname = 'public' AND tab.relname = app_table
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated', owned_sequence.sequence_name);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', owned_sequence.sequence_name);
    END LOOP;
  END LOOP;

  -- Explicit application RPC names: extension/unknown functions are untouched.
  FOR app_function IN
    SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'provision_google_user', 'issue_email_verification_token',
      'consume_email_verification_token', 'reserve_phone_otp_send',
      'admin_analytics_dashboard', 'reserve_kyc_selfie_attempt'
    ])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated', app_function.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', app_function.signature);
  END LOOP;
END;
$migration$;

ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS selfie_attempts integer NOT NULL DEFAULT 0
  CHECK (selfie_attempts BETWEEN 0 AND 5);

CREATE OR REPLACE FUNCTION public.reserve_kyc_selfie_attempt(p_verification_id bigint, p_user_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE reserved_attempt integer;
BEGIN
  UPDATE public.identity_verifications
  SET selfie_attempts = selfie_attempts + 1
  WHERE id = p_verification_id AND user_id = p_user_id
    AND status = 'PENDING' AND selfie_attempts < 5
  RETURNING selfie_attempts INTO reserved_attempt;
  RETURN reserved_attempt;
END;
$function$;
REVOKE ALL ON FUNCTION public.reserve_kyc_selfie_attempt(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_kyc_selfie_attempt(bigint, bigint) TO service_role;

-- These two buckets contain identity and dispute evidence, not listing photos.
-- Service-role uploads/downloads and short-lived signed previews remain valid.
UPDATE storage.buckets
SET public = false, file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id IN ('kyc-documents', 'evidence-documents');

-- Restrictive policies override legacy permissive storage policies. Clients
-- never write storage directly; listing/avatar public downloads still work.
DROP POLICY IF EXISTS app_private_documents_deny_direct_read ON storage.objects;
CREATE POLICY app_private_documents_deny_direct_read ON storage.objects
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (bucket_id NOT IN ('kyc-documents', 'evidence-documents'));
DROP POLICY IF EXISTS app_storage_deny_direct_insert ON storage.objects;
CREATE POLICY app_storage_deny_direct_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS app_storage_deny_direct_update ON storage.objects;
CREATE POLICY app_storage_deny_direct_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS app_storage_deny_direct_delete ON storage.objects;
CREATE POLICY app_storage_deny_direct_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

NOTIFY pgrst, 'reload schema';
COMMIT;
