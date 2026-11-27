-- Tạo 2 tài khoản AGENT để test trên PostgreSQL / Supabase (chạy lại nhiều lần an toàn):
--   1. agent.phone@estate.test : Đã xác minh Email + Số điện thoại (chưa xác minh CCCD)
--   2. agent.kyc@estate.test   : Đã xác minh Email + Số điện thoại + CCCD / KYC APPROVED
-- Mật khẩu chung của cả 2 tài khoản: Password123!

BEGIN;

DO $$
DECLARE
  v_password_hash text := '$2b$12$RzJ.ShtVV4WuktVO/hmsmui5lVKnS0LTaOJRlH9XJ/vUcb//4BZeS';
  v_agent_phone_id integer;
  v_agent_kyc_id integer;
BEGIN
  -- 1. Agent đã xác minh số điện thoại (chưa verify CCCD)
  SELECT id INTO v_agent_phone_id
  FROM public.users
  WHERE lower(email) = 'agent.phone@estate.test'
  LIMIT 1;

  IF v_agent_phone_id IS NULL THEN
    INSERT INTO public.users (
      name, email, password, role, phone, phone_verified, phone_verified_at,
      email_verified_at, verification_status, trust_score, is_active, updated_at
    )
    VALUES (
      'Tô Xuân Nam',
      'agent.phone@estate.test',
      v_password_hash,
      'AGENT',
      '0908111222',
      true,
      now(),
      now(),
      'UNVERIFIED',
      60,
      true,
      now()
    )
    RETURNING id INTO v_agent_phone_id;
  ELSE
    UPDATE public.users
    SET name = 'Tô Xuân Nam',
        password = v_password_hash,
        role = 'AGENT',
        phone = '0908111222',
        phone_verified = true,
        phone_verified_at = now(),
        email_verified_at = coalesce(email_verified_at, now()),
        verification_status = 'UNVERIFIED',
        trust_score = 60,
        is_active = true,
        updated_at = now()
    WHERE id = v_agent_phone_id;
  END IF;

  -- Xóa hồ sơ KYC cũ (nếu có) để tài khoản này giữ đúng trạng thái chưa KYC
  DELETE FROM public.identity_verifications WHERE user_id = v_agent_phone_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.trust_score_logs
    WHERE user_id = v_agent_phone_id AND action = 'PHONE_VERIFIED'
  ) THEN
    INSERT INTO public.trust_score_logs (user_id, action, point_change, old_score, new_score, reason)
    VALUES (v_agent_phone_id, 'PHONE_VERIFIED', 10, 50, 60, 'Phone number verified successfully');
  END IF;

  -- 2. Agent đã xác minh SĐT và CCCD (KYC = VERIFIED / APPROVED)
  SELECT id INTO v_agent_kyc_id
  FROM public.users
  WHERE lower(email) = 'agent.kyc@estate.test'
  LIMIT 1;

  IF v_agent_kyc_id IS NULL THEN
    INSERT INTO public.users (
      name, email, password, role, phone, phone_verified, phone_verified_at,
      email_verified_at, verification_status, trust_score, is_active, updated_at
    )
    VALUES (
      'Nguyễn Văn Mẫu KYC',
      'agent.kyc@estate.test',
      v_password_hash,
      'AGENT',
      '0908333444',
      true,
      now(),
      now(),
      'VERIFIED',
      60,
      true,
      now()
    )
    RETURNING id INTO v_agent_kyc_id;
  ELSE
    UPDATE public.users
    SET name = 'Nguyễn Văn Mẫu KYC',
        password = v_password_hash,
        role = 'AGENT',
        phone = '0908333444',
        phone_verified = true,
        phone_verified_at = now(),
        email_verified_at = coalesce(email_verified_at, now()),
        verification_status = 'VERIFIED',
        trust_score = greatest(coalesce(trust_score, 60), 60),
        is_active = true,
        updated_at = now()
    WHERE id = v_agent_kyc_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trust_score_logs
    WHERE user_id = v_agent_kyc_id AND action = 'PHONE_VERIFIED'
  ) THEN
    INSERT INTO public.trust_score_logs (user_id, action, point_change, old_score, new_score, reason)
    VALUES (v_agent_kyc_id, 'PHONE_VERIFIED', 10, 50, 60, 'Phone number verified successfully');
  END IF;

  DELETE FROM public.identity_verifications WHERE user_id = v_agent_kyc_id;

  INSERT INTO public.identity_verifications (
    user_id, full_name, declared_name, name_mismatch, face_check_unavailable,
    phone, id_number, id_card_front_url, id_card_back_url, selfie_url,
    status, ocr_data, selfie_attempts, reviewed_at, updated_at
  )
  VALUES (
    v_agent_kyc_id,
    'Nguyễn Văn Mẫu KYC',
    'Nguyễn Văn Mẫu KYC',
    false,
    false,
    '0908333444',
    '079095001234',
    'kyc/seed/front.jpg',
    'kyc/seed/back.jpg',
    'kyc/seed/selfie.jpg',
    'APPROVED',
    jsonb_build_object(
      'idNumber', '079095001234',
      'fullName', 'NGUYỄN VĂN MẪU KYC',
      'dob', '15/05/1995',
      'sex', 'Nam',
      'placeOfOrigin', 'TP. Hồ Chí Minh',
      'placeOfResidence', 'Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
      'issueDate', '10/01/2022',
      'issuePlace', 'Cục Cảnh sát QLHC về TTXH',
      'ocrPassed', true
    ),
    1,
    now(),
    now()
  );
END $$;

COMMIT;
