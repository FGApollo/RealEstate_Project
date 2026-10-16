-- Atomic verification and bounded attempts. Old plaintext-only OTPs are no
-- longer accepted; request a new code after this coordinated security release.
BEGIN;
ALTER TABLE public.phone_otps ADD COLUMN IF NOT EXISTS otp_hash text;
ALTER TABLE public.phone_otps ADD COLUMN IF NOT EXISTS delivered_live boolean NOT NULL DEFAULT false;
UPDATE public.phone_otps SET otp_code='REDACTED',is_used=true WHERE otp_hash IS NULL;

CREATE OR REPLACE FUNCTION public.consume_phone_otp(
  p_user_id bigint, p_phone text, p_code_hash text, p_require_live boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET timezone = 'UTC'
SET statement_timeout = '8s'
AS $$
DECLARE v_otp public.phone_otps%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_user_id < 1 OR p_phone IS NULL OR p_phone !~ '^(03|05|07|08|09)[0-9]{8}$'
    OR p_code_hash IS NULL OR p_code_hash !~ '^[a-f0-9]{64}$' OR p_require_live IS NULL THEN
    RAISE EXCEPTION 'Invalid OTP input' USING ERRCODE = '22023';
  END IF;
  -- Serialize verification and the phone state update for this user.
  PERFORM 1 FROM public.users WHERE id=p_user_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','INACTIVE'); END IF;
  SELECT * INTO v_otp FROM public.phone_otps WHERE user_id=p_user_id AND phone=p_phone
    ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR v_otp.is_used IS NOT FALSE OR v_otp.otp_hash IS NULL
    OR (p_require_live AND v_otp.delivered_live IS NOT TRUE) THEN
    RETURN jsonb_build_object('ok',false,'code','NOT_FOUND');
  END IF;
  IF v_otp.expires_at IS NULL OR v_otp.expires_at::timestamptz <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok',false,'code','EXPIRED');
  END IF;
  IF coalesce(v_otp.attempt_count,0) >= 5 THEN
    RETURN jsonb_build_object('ok',false,'code','ATTEMPT_LIMIT');
  END IF;
  UPDATE public.phone_otps SET attempt_count=coalesce(attempt_count,0)+1 WHERE id=v_otp.id;
  IF v_otp.otp_hash <> p_code_hash THEN
    RETURN jsonb_build_object('ok',false,'code','INVALID');
  END IF;
  UPDATE public.phone_otps SET is_used=true WHERE id=v_otp.id;
  UPDATE public.users SET phone=p_phone,phone_verified=true,phone_verified_at=clock_timestamp()
    WHERE id=p_user_id;
  RETURN jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_phone_otp(bigint,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_phone_otp(bigint,text,text,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
