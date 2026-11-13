-- 028: Chuẩn hóa khóa ngoại xóa dây chuyền (ON DELETE CASCADE / SET NULL) và cấu hình hành chính 2025.
--
-- Khắc phục chênh lệch giữa schema cũ và thực tế database:
-- - Chuyển các khóa ngoại từng là NO ACTION / SET NULL gây mồ côi dữ liệu hoặc chặn xóa sang ON DELETE CASCADE:
--   * properties.owner_id -> users(id)
--   * property_images.property_id -> properties(id)
--   * property_reviews.user_id -> users(id)
--   * property_reports.reporter_id -> users(id)
--   * property_leads.user_id -> users(id)
--   * property_view_events.user_id -> users(id)
--   * phone_otps.user_id -> users(id)
--   * trust_score_logs.user_id -> users(id)
-- - Chuyển các khóa ngoại người xử lý / log tham chiếu tùy chọn sang ON DELETE SET NULL để không chặn dọn tài khoản/tin cũ:
--   * trust_score_logs.related_property_id -> properties(id)
--   * trust_score_logs.related_report_id -> property_reports(id)
--   * identity_verifications.reviewed_by -> users(id)
--   * property_reports.handled_by -> users(id)
--   * property_report_appeals.handled_by -> users(id)
-- - Giữ nguyên NO ACTION trên các bảng tài chính và audit nhiều bên (agent_payment_orders, *_audit,
--   agent_plan_schedules, property_admin_checks.checked_by) để bảo toàn lịch sử giao dịch.
-- - Siết NOT NULL có điều kiện cho các cột khóa ngoại bắt buộc (chỉ áp dụng nếu DB không còn dòng NULL).
-- - Đặt mặc định properties.city sang 'Thành phố Hồ Chí Minh' (2025) và cố định search_path cho update_property_rating().
-- Chạy lại nhiều lần hoàn toàn an toàn (idempotent). Yêu cầu 020–027.
BEGIN;

ALTER TABLE public.properties
  ALTER COLUMN city SET DEFAULT 'Thành phố Hồ Chí Minh';

-- 1. Tin đăng & ảnh tin đăng
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_owner_id_fkey;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.property_images DROP CONSTRAINT IF EXISTS property_images_property_id_fkey;
ALTER TABLE public.property_images
  ADD CONSTRAINT property_images_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE CASCADE;

-- 2. Tương tác người dùng (không để NULL khi xóa tài khoản)
ALTER TABLE public.property_reviews DROP CONSTRAINT IF EXISTS property_reviews_user_id_fkey;
ALTER TABLE public.property_reviews
  ADD CONSTRAINT property_reviews_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.property_reports DROP CONSTRAINT IF EXISTS property_reports_reporter_id_fkey;
ALTER TABLE public.property_reports
  ADD CONSTRAINT property_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.property_leads DROP CONSTRAINT IF EXISTS property_leads_user_id_fkey;
ALTER TABLE public.property_leads
  ADD CONSTRAINT property_leads_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.property_view_events DROP CONSTRAINT IF EXISTS property_view_events_user_id_fkey;
ALTER TABLE public.property_view_events
  ADD CONSTRAINT property_view_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF to_regclass('public.phone_otps') IS NOT NULL THEN
    ALTER TABLE public.phone_otps DROP CONSTRAINT IF EXISTS phone_otps_user_id_fkey;
    ALTER TABLE public.phone_otps
      ADD CONSTRAINT phone_otps_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Nhật ký điểm uy tín & tham chiếu người xử lý tùy chọn
DO $$
BEGIN
  IF to_regclass('public.trust_score_logs') IS NOT NULL THEN
    ALTER TABLE public.trust_score_logs DROP CONSTRAINT IF EXISTS trust_score_logs_user_id_fkey;
    ALTER TABLE public.trust_score_logs
      ADD CONSTRAINT trust_score_logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

    ALTER TABLE public.trust_score_logs DROP CONSTRAINT IF EXISTS trust_score_logs_related_property_id_fkey;
    ALTER TABLE public.trust_score_logs
      ADD CONSTRAINT trust_score_logs_related_property_id_fkey
      FOREIGN KEY (related_property_id) REFERENCES public.properties(id) ON DELETE SET NULL;

    ALTER TABLE public.trust_score_logs DROP CONSTRAINT IF EXISTS trust_score_logs_related_report_id_fkey;
    ALTER TABLE public.trust_score_logs
      ADD CONSTRAINT trust_score_logs_related_report_id_fkey
      FOREIGN KEY (related_report_id) REFERENCES public.property_reports(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.identity_verifications DROP CONSTRAINT IF EXISTS identity_verifications_reviewed_by_fkey;
ALTER TABLE public.identity_verifications
  ADD CONSTRAINT identity_verifications_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.property_reports DROP CONSTRAINT IF EXISTS property_reports_handled_by_fkey;
ALTER TABLE public.property_reports
  ADD CONSTRAINT property_reports_handled_by_fkey
  FOREIGN KEY (handled_by) REFERENCES public.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF to_regclass('public.property_report_appeals') IS NOT NULL THEN
    ALTER TABLE public.property_report_appeals DROP CONSTRAINT IF EXISTS property_report_appeals_handled_by_fkey;
    ALTER TABLE public.property_report_appeals
      ADD CONSTRAINT property_report_appeals_handled_by_fkey
      FOREIGN KEY (handled_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Siết NOT NULL có điều kiện: chỉ đặt NOT NULL khi bảng hiện không có dòng NULL nào.
DO $$
DECLARE
  v_pair text[];
  v_targets text[][] := ARRAY[
    ARRAY['public.properties', 'owner_id'],
    ARRAY['public.property_images', 'property_id'],
    ARRAY['public.property_reviews', 'property_id'],
    ARRAY['public.property_reviews', 'user_id'],
    ARRAY['public.property_reports', 'property_id'],
    ARRAY['public.property_reports', 'reporter_id'],
    ARRAY['public.property_leads', 'property_id'],
    ARRAY['public.property_leads', 'user_id'],
    ARRAY['public.favorites', 'property_id'],
    ARRAY['public.favorites', 'user_id'],
    ARRAY['public.swipe_actions', 'property_id'],
    ARRAY['public.swipe_actions', 'user_id'],
    ARRAY['public.property_view_events', 'property_id'],
    ARRAY['public.identity_verifications', 'user_id']
  ];
  v_has_null boolean;
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY v_targets LOOP
    IF to_regclass(v_pair[1]) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I IS NULL)', v_pair[1], v_pair[2]) INTO v_has_null;
      IF NOT v_has_null THEN
        EXECUTE format('ALTER TABLE %s ALTER COLUMN %I SET NOT NULL', v_pair[1], v_pair[2]);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 5. Khắc phục cảnh báo Security Advisor: cố định search_path cho trigger function hiện có.
DO $$
BEGIN
  IF to_regprocedure('public.update_property_rating()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.update_property_rating() SET search_path = pg_catalog, public';
  END IF;
END $$;

INSERT INTO public.app_schema_migrations (id) VALUES ('028') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;

