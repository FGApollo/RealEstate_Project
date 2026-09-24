-- Run in staging first. The migration deliberately fails if existing email
-- values collide after case-folding; resolve duplicates before retrying.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate users.email after normalization; resolve before Google identity migration';
  END IF;
END;
$$;

UPDATE public.users SET email = lower(btrim(email))
WHERE email IS DISTINCT FROM lower(btrim(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique
  ON public.users (lower(btrim(email)));

CREATE TABLE IF NOT EXISTS public.google_identities (
  subject text PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_identities FROM anon, authenticated;

-- Called only by the server's service-role client after ID-token verification.
-- The DB transaction makes account + Google subject creation atomic.
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
SET search_path = public, pg_temp
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

  INSERT INTO public.users (name, email, password, role, phone, avatar)
  VALUES (
    coalesce(nullif(btrim(p_name), ''), split_part(lower(btrim(p_email)), '@', 1)),
    lower(btrim(p_email)),
    NULL,
    p_role,
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_avatar), '')
  ) RETURNING id INTO v_user_id;

  INSERT INTO public.google_identities (subject, user_id)
  VALUES (p_subject, v_user_id);

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_google_user(text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_google_user(text, text, text, text, text, text) TO service_role;

COMMIT;
