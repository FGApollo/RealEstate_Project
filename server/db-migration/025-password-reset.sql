-- 025: Quên mật khẩu — liên kết đặt lại mật khẩu gửi qua email (cùng cơ chế với xác minh email 006).
-- Chỉ lưu SHA-256 của token; token dùng một lần, hết hạn sau 30 phút; mỗi tài khoản tối đa 1 lần/phút, 5 lần/giờ.
-- Đặt lại thành công: đổi mật khẩu, thu hồi mọi phiên đăng nhập và mọi token đặt lại khác trong cùng transaction.
-- Chạy lại nhiều lần vẫn an toàn. Không sửa hay xóa dữ liệu hiện có.
BEGIN;

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  consumed_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_created_idx
  ON public.password_reset_tokens (user_id, created_at DESC);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_reset_tokens FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_password_reset_token(
  p_user_id integer,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE (issued boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_active boolean;
  v_latest timestamptz;
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <= 0
    OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now OR p_expires_at > v_now + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'Invalid password reset token parameters';
  END IF;

  SELECT is_active INTO v_active FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_active IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'NOT_ISSUED'::text;
    RETURN;
  END IF;

  SELECT max(created_at), count(*)::integer INTO v_latest, v_count
  FROM public.password_reset_tokens
  WHERE user_id = p_user_id AND created_at >= v_now - INTERVAL '1 hour';

  IF v_latest IS NOT NULL AND v_latest > v_now - INTERVAL '60 seconds' THEN
    RETURN QUERY SELECT false, 'COOLDOWN'::text;
    RETURN;
  END IF;
  IF v_count >= 5 THEN
    RETURN QUERY SELECT false, 'HOURLY_LIMIT'::text;
    RETURN;
  END IF;

  UPDATE public.password_reset_tokens SET revoked_at = v_now
  WHERE user_id = p_user_id AND consumed_at IS NULL AND revoked_at IS NULL;

  INSERT INTO public.password_reset_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, p_expires_at);

  IF pg_try_advisory_xact_lock(hashtextextended('password_reset_cleanup', 0)) THEN
    DELETE FROM public.password_reset_tokens WHERE created_at < v_now - INTERVAL '30 days';
  END IF;

  RETURN QUERY SELECT true, 'ISSUED'::text;
END;
$$;

-- p_password_hash là bcrypt do backend tạo. Token hợp lệ chứng minh quyền sở hữu email,
-- nên email cũng được đánh dấu đã xác minh.
CREATE OR REPLACE FUNCTION public.consume_password_reset_token(p_token_hash text, p_password_hash text)
RETURNS TABLE (reset boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_token public.password_reset_tokens%ROWTYPE;
  v_user_id integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_password_hash IS NULL OR p_password_hash !~ '^\$2[aby]\$\d{2}\$.{53}$' THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id FROM public.password_reset_tokens WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  -- Cùng thứ tự khóa với lúc phát token (user rồi token) để tránh deadlock.
  PERFORM 1 FROM public.users WHERE id = v_user_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;

  SELECT * INTO v_token FROM public.password_reset_tokens WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_token.consumed_at IS NOT NULL OR v_token.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'INVALID'::text;
    RETURN;
  END IF;
  IF v_token.expires_at <= v_now THEN
    RETURN QUERY SELECT false, 'EXPIRED'::text;
    RETURN;
  END IF;

  UPDATE public.password_reset_tokens SET consumed_at = v_now WHERE id = v_token.id;
  UPDATE public.password_reset_tokens SET revoked_at = v_now
  WHERE user_id = v_user_id AND id <> v_token.id AND consumed_at IS NULL AND revoked_at IS NULL;

  UPDATE public.users
  SET password = p_password_hash,
      email_verified_at = coalesce(email_verified_at, v_now)
  WHERE id = v_user_id;

  UPDATE public.auth_sessions SET revoked_at = v_now
  WHERE user_id = v_user_id AND revoked_at IS NULL;

  RETURN QUERY SELECT true, 'RESET'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_password_reset_token(integer, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_password_reset_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_password_reset_token(integer, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_password_reset_token(text, text) TO service_role;

INSERT INTO public.app_schema_migrations (id) VALUES ('025') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
