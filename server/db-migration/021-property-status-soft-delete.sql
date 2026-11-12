-- 021: cho phép trạng thái DELETED (xóa mềm tin đăng) và bỏ INACTIVE không dùng.
-- Production trước đây thiếu DELETED nên agent bấm xóa tin bị lỗi.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.properties WHERE status = 'INACTIVE') THEN
    RAISE EXCEPTION 'Có tin đăng đang ở trạng thái INACTIVE; hãy chuyển sang trạng thái hợp lệ trước khi chạy 021';
  END IF;
END $$;

ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_status_check
  CHECK (status::text = ANY (ARRAY['AVAILABLE'::text, 'SOLD'::text, 'RENTED'::text, 'PENDING'::text, 'DELETED'::text]));

INSERT INTO public.app_schema_migrations (id) VALUES ('021') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
