-- Run before deploying the authenticated API. Only the backend service-role
-- client may read or write sessions; there are intentionally no RLS policies.
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx
  ON public.auth_sessions (user_id);

CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx
  ON public.auth_sessions (expires_at);

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.auth_sessions FROM anon, authenticated;
