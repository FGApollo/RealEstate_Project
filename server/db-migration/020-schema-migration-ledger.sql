-- 020: bảng sổ cái ghi lại migration nào đã chạy trên database này.
-- Chạy lại nhiều lần vẫn an toàn. Không sửa hay xóa dữ liệu nghiệp vụ.
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.app_schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_schema_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.app_schema_migrations TO service_role;

-- Các migration trước khi có sổ cái: coi như đã chạy (database đã được đồng bộ theo production).
INSERT INTO public.app_schema_migrations (id, note)
SELECT id, 'baseline: assumed applied'
FROM unnest(ARRAY[
  '001','002','003','004','005','005b','006','007','008','009','010','010b',
  '011','012','013','014','015','016','017','018','019'
]) AS id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.app_schema_migrations (id) VALUES ('020') ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
