# Migration database

Mỗi thành viên có database dev riêng; production chỉ do chủ dự án cập nhật. Thư mục này là nguồn duy nhất cho thay đổi schema: không sửa schema bằng tay mà không có file ở đây.

## Đồng bộ một database (dành cho người hoặc coding agent)

1. Đọc bảng `public.app_schema_migrations`. Nếu bảng chưa tồn tại, chạy `020-schema-migration-ledger.sql` trước. File này giả định database đã có đủ schema của các migration `001`–`019`; nếu database còn thiếu (ví dụ thiếu view `ranked_properties`), chạy các file `001`–`019` theo thứ tự trước.
2. Liệt kê các file `.sql` có số lớn hơn số cuối cùng trong sổ cái và chạy lần lượt theo thứ tự tên file. Chạy nguyên file, không chạy từng phần.
3. Nếu một file báo lỗi: dừng lại và báo lỗi. Không sửa schema bằng tay để "cho qua".
4. Kiểm tra lại bằng `npm --prefix server test` và script kiểm tra luồng `node server/scripts/qa-flows.cjs` (chỉ chạy trên database dev).

Production: chỉ chủ dự án chạy. Coding agent không được ghi vào production.

## Quy ước cho migration mới (từ 021)

- Tên file `NNN-mo-ta-ngan.sql`, số tăng dần, không trùng số.
- Bọc trong `BEGIN; … COMMIT;`.
- Chạy lại nhiều lần vẫn an toàn: `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` rồi `ADD`, hoặc khối `DO $$ … $$` có kiểm tra trước.
- Không `DROP TABLE`, `TRUNCATE` hay xóa dữ liệu hàng loạt. Trường hợp bắt buộc phải có comment `-- DESTRUCTIVE:` ở đầu file giải thích lý do.
- Bảng, hàm, sequence mới: thu quyền của `PUBLIC, anon, authenticated` và chỉ cấp cho `service_role` (trình duyệt không truy cập trực tiếp database).
- Dòng gần cuối: `INSERT INTO public.app_schema_migrations (id) VALUES ('NNN') ON CONFLICT (id) DO NOTHING;`
- Kết thúc bằng `NOTIFY pgrst, 'reload schema';` trước `COMMIT;`.

## Ghi chú lịch sử

- `005b-…` và `010b-…` trước đây trùng số với `005-…` và `010-…`.
- [docs/archive/011-DEPLOYMENT.md](../../docs/archive/011-DEPLOYMENT.md) mô tả cách triển khai nhóm migration bảo mật 011–013 (lịch sử).
