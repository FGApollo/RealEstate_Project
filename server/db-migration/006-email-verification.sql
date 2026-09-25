-- Email verification for password registrations.
-- Existing accounts are grandfathered as verified during rollout so deployment
-- does not lock out current users; new password registrations explicitly use NULL.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate users.email after normalization; resolve before email verification migration';
  END IF;
END;
$$;

UPDATE public.users SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique
  ON public.users (lower(btrim(email)));

DO $$
BEGIN
  -- Backfill only when this migration introduces the column. Re-running the
  -- migration must never mark accounts created later as verified.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN email_verified_at timestamptz;
    UPDATE public.users
    SET email_verified_at = coalesce(created_at, now());
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_created_idx
  ON public.email_verification_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_verification_tokens_expiry_idx
  ON public.email_verification_tokens (expires_at);

ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_verification_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_email_verification_token(
  p_user_id integer,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE (issued boolean, retry_after_seconds integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_verified_at timestamptz;
  v_latest timestamptz;
  v_count integer;
  v_oldest timestamptz;
  v_retry integer;
  v_cleanup_locked boolean;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0
    OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now OR p_expires_at > v_now + INTERVAL '25 hours' THEN
    RAISE EXCEPTION 'Invalid email verification token parameters';
  END IF;

  SELECT email_verified_at INTO v_verified_at
  FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'NOT_ISSUED'::text;
    RETURN;
  END IF;
  IF v_verified_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 0, 'ALREADY_VERIFIED'::text;
    RETURN;
  END IF;

  SELECT max(created_at), count(*)::integer, min(created_at)
  INTO v_latest, v_count, v_oldest
  FROM public.email_verification_tokens
  WHERE user_id = p_user_id AND created_at >= v_now - INTERVAL '1 hour';

  IF v_latest IS NOT NULL AND v_latest > v_now - INTERVAL '60 seconds' THEN
    v_retry := greatest(1, ceil(extract(epoch FROM (v_latest + INTERVAL '60 seconds' - v_now)))::integer);
    RETURN QUERY SELECT false, v_retry, 'COOLDOWN'::text;
    RETURN;
  END IF;

  IF v_count >= 5 THEN
    v_retry := greatest(1, ceil(extract(epoch FROM (v_oldest + INTERVAL '1 hour' - v_now)))::integer);
    RETURN QUERY SELECT false, v_retry, 'HOURLY_LIMIT'::text;
    RETURN;
  END IF;

  UPDATE public.email_verification_tokens
  SET revoked_at = v_now
  WHERE user_id = p_user_id AND consumed_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.email_verification_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, p_expires_at);

  v_cleanup_locked := pg_try_advisory_xact_lock(hashtextextended('email_verification_cleanup', 0));
  IF v_cleanup_locked THEN
    DELETE FROM public.email_verification_tokens
    WHERE created_at < v_now - INTERVAL '30 days';
  END IF;

  RETURN QUERY SELECT true, 0, 'ISSUED'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_email_verification_token(p_token_hash text)
RETURNS TABLE (verified boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_token public.email_verification_tokens%ROWTYPE;
  v_user_id integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.email_verification_tokens
  WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  -- Use the same user-then-token lock order as issuance to avoid deadlocks.
  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_token
  FROM public.email_verification_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND OR v_token.consumed_at IS NOT NULL OR v_token.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;
  IF v_token.expires_at <= v_now THEN
    RETURN QUERY SELECT false, 'EXPIRED'::text;
    RETURN;
  END IF;

  UPDATE public.email_verification_tokens
  SET consumed_at = v_now
  WHERE id = v_token.id;

  UPDATE public.users
  SET email_verified_at = coalesce(email_verified_at, v_now)
  WHERE id = v_token.user_id;

  RETURN QUERY SELECT true, 'VERIFIED'::text;
END;
$$;

-- Google ID tokens are separately verified server-side; preserve that proof
-- when atomically provisioning a new Google account.
CREATE OR REPLACE FUNCTION public.provision_google_user(
  p_subject text,
  p_email text,
  p_name text,
  p_avatar text,
  p_phone text,
  p_role text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user_id integer;
BEGIN
  IF nullif(btrim(p_subject), '') IS NULL OR nullif(btrim(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'Google subject and email are required';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('USER', 'AGENT') THEN
    RAISE EXCEPTION 'Unsupported public registration role';
  END IF;
  IF p_role = 'AGENT' AND nullif(btrim(p_phone), '') IS NULL THEN
    RAISE EXCEPTION 'Agent phone is required';
  END IF;

  INSERT INTO public.users (name, email, password, role, phone, avatar, email_verified_at)
  VALUES (
    coalesce(nullif(btrim(p_name), ''), split_part(lower(btrim(p_email)), '@', 1)),
    lower(btrim(p_email)),
    NULL,
    p_role,
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_avatar), ''),
    clock_timestamp()
  ) RETURNING id INTO v_user_id;

  INSERT INTO public.google_identities (subject, user_id)
  VALUES (p_subject, v_user_id);

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_email_verification_token(integer, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_email_verification_token(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provision_google_user(text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_email_verification_token(integer, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_email_verification_token(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_google_user(text, text, text, text, text, text)
  TO service_role;

COMMIT;
