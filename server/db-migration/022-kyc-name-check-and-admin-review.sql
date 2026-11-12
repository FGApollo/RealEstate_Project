-- 022: KYC — so tên CCCD với tên đã khai, danh sách chờ duyệt cho admin, duyệt trong một transaction.
-- Chạy lại nhiều lần vẫn an toàn. Không sửa hay xóa dữ liệu hiện có.
BEGIN;

ALTER TABLE public.identity_verifications
  ADD COLUMN IF NOT EXISTS declared_name varchar(100),
  ADD COLUMN IF NOT EXISTS name_mismatch boolean NOT NULL DEFAULT false;

-- Duyệt hồ sơ: cập nhật hồ sơ và trạng thái tài khoản cùng lúc; lỗi ở bước nào thì cả hai cùng rollback.
CREATE OR REPLACE FUNCTION public.admin_approve_kyc(p_verification_id integer, p_admin_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_ver public.identity_verifications%ROWTYPE;
  v_now timestamp := now() AT TIME ZONE 'UTC';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_admin_id AND role = 'ADMIN' AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ver FROM public.identity_verifications WHERE id = p_verification_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verification not found' USING ERRCODE = 'P0002'; END IF;
  IF v_ver.status = 'APPROVED' THEN
    RETURN jsonb_build_object('applied', false, 'id', v_ver.id, 'status', v_ver.status, 'user_id', v_ver.user_id);
  END IF;
  IF v_ver.status NOT IN ('PENDING', 'REJECTED') THEN
    RAISE EXCEPTION 'Only rejected or pending verifications can be approved' USING ERRCODE = '22023';
  END IF;
  UPDATE public.identity_verifications
    SET status = 'APPROVED', reject_reason = NULL, reviewed_by = p_admin_id, reviewed_at = v_now, updated_at = v_now
    WHERE id = v_ver.id;
  UPDATE public.users SET verification_status = 'VERIFIED', updated_at = v_now WHERE id = v_ver.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('applied', true, 'id', v_ver.id, 'status', 'APPROVED', 'user_id', v_ver.user_id);
END $$;

-- Danh sách hồ sơ mới nhất của mỗi tài khoản theo trạng thái, phân trang ở database. Không trả đường dẫn ảnh.
CREATE OR REPLACE FUNCTION public.admin_kyc_list(p_status text, p_page integer DEFAULT 1, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('PENDING', 'REJECTED')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid KYC list query' USING ERRCODE = '22023';
  END IF;
  WITH latest AS (
    SELECT DISTINCT ON (v.user_id) v.*
    FROM public.identity_verifications v
    ORDER BY v.user_id, coalesce(v.updated_at, v.created_at) DESC NULLS LAST, v.id DESC
  ), filtered AS (
    SELECT * FROM latest WHERE status = p_status
  ), page AS (
    SELECT * FROM filtered
    ORDER BY coalesce(updated_at, created_at) DESC NULLS LAST, id DESC
    LIMIT p_limit OFFSET (p_page - 1) * p_limit
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered), 'page', p_page, 'limit', p_limit,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'user_id', p.user_id, 'full_name', p.full_name, 'declared_name', p.declared_name,
        'name_mismatch', p.name_mismatch, 'phone', p.phone, 'status', p.status, 'reject_reason', p.reject_reason,
        'id_number', p.id_number, 'selfie_attempts', p.selfie_attempts, 'has_selfie', p.selfie_url IS NOT NULL,
        'reviewed_at', p.reviewed_at, 'created_at', p.created_at, 'updated_at', p.updated_at,
        'user', (SELECT jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone,
          'verification_status', u.verification_status, 'trust_score', u.trust_score)
          FROM public.users u WHERE u.id = p.user_id)
      ) ORDER BY coalesce(p.updated_at, p.created_at) DESC NULLS LAST, p.id DESC) FROM page p), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.admin_approve_kyc(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_kyc_list(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_kyc(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_kyc_list(text, integer, integer) TO service_role;

INSERT INTO public.app_schema_migrations (id) VALUES ('022') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
