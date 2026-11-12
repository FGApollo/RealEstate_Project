# Swipe Nest

Nền tảng tìm nhà kiểu "quẹt thẻ": người dùng lướt, lọc, lưu bất động sản và nhắn tin với môi giới; môi giới xác minh danh tính (KYC), đăng tin theo gói dịch vụ; admin duyệt hồ sơ, kiểm duyệt bình luận và xem số liệu.

| Thư mục | Nội dung |
|---|---|
| `src/` | Frontend React 19 + Vite |
| `server/` | Backend Express 5 (CommonJS) |
| `server/db-migration/` | Migration database (Supabase Postgres) |
| `server/tests/` | Test backend (`node:test`, PostgreSQL nhúng PGlite) |

Trình duyệt **không** truy cập trực tiếp database: mọi dữ liệu đi qua Express, backend dùng secret key của Supabase. Trình duyệt chỉ dùng publishable key để nghe tín hiệu "có tin nhắn mới" qua Supabase Realtime.

## Cài đặt

Yêu cầu Node.js 22.

```bash
npm ci                    # frontend (thư mục gốc)
npm --prefix server ci    # backend
```

Phải cài ở **cả hai** thư mục; thiếu một bên thì build hoặc test sẽ lỗi do thiếu thư viện.

## Biến môi trường

| File | Dùng cho | Mẫu |
|---|---|---|
| `server/.env` | Backend: secret key Supabase, `JWT_SECRET`, CORS, payOS, KYC… | `server/.env.example` |
| `.env` (thư mục gốc) | Frontend: chỉ các biến `VITE_*` **công khai** | `.env.example` |

- **Secret key** của Supabase (`sb_secret_…`) chỉ đặt trong `server/.env`, tên `SUPABASE_SECRET_KEY` (tên cũ `SUPABASE_SERVICE_ROLE_KEY` vẫn được chấp nhận). Backend từ chối khởi động nếu đây là publishable/anon key.
- Không đặt bất kỳ secret nào dưới tên `VITE_*`: các biến này bị đóng gói vào mã gửi xuống trình duyệt.

## Chạy khi phát triển

```bash
npm --prefix server run dev   # API ở http://localhost:3000
npm run dev                   # giao diện ở http://localhost:5173
```

## Database

Mỗi thành viên dùng một project Supabase dev riêng; production chỉ do chủ dự án cập nhật. Cách đồng bộ một database (đọc bảng sổ cái `app_schema_migrations`, chạy các file còn thiếu theo thứ tự) và quy ước viết migration mới: xem [server/db-migration/README.md](server/db-migration/README.md).

## Kiểm thử

```bash
npm run build                    # build frontend
npm run lint                     # ESLint
npm --prefix server test         # test backend
npm run test:auth-flow           # test luồng đăng nhập phía frontend
```

Kịch bản kiểm tra đầu-cuối gọi API giống frontend (**chỉ chạy với server local + database dev**, tạo các tài khoản `qa.*@qa.test`):

```bash
node server/scripts/qa-flows.cjs setup kyc-reject admin-kyc kyc-dup listing plans user admin
```

Bước KYC cần ảnh CCCD/selfie mẫu trong `test_images/` (không có trong git, xin chủ dự án). Bước `kyc-name-review` cần server chạy ở chế độ demo so khớp khuôn mặt (bên dưới).

## Email xác minh, OTP và đăng nhập Google khi phát triển

Máy dev thường không có Gmail API và eSMS thật. Đặt trong `server/.env`:

```dotenv
NODE_ENV=development
DEV_CONSOLE_DELIVERY=true
```

Khi đó liên kết xác minh email và mã OTP được in ra terminal của server (dòng bắt đầu bằng `[DEV]`) thay vì gửi đi. Production không bao giờ bật được chế độ này. Đăng nhập Google cần `GOOGLE_CLIENT_ID` trong `server/.env` (cùng giá trị với `VITE_GOOGLE_CLIENT_ID`).

## Xác minh danh tính (KYC) khi phát triển

So khớp khuôn mặt dùng Face++. Không cấu hình thì selfie luôn thất bại và hồ sơ phải chờ admin duyệt tay. Trên máy dev có thể bật chế độ demo (không bao giờ bật trên server deploy):

```dotenv
NODE_ENV=development
KYC_ALLOW_DEMO=true
KYC_FACE_MATCH_PROVIDER=demo
# tùy chọn: ép kết quả
KYC_FACE_MATCH_DEMO_RESULT=pass
```

Nếu tên đọc từ CCCD khác tên môi giới khai, hồ sơ luôn chờ admin duyệt dù khuôn mặt khớp.

## Gói dịch vụ và thanh toán

Môi giới cần gói Lite / Plus / Pro còn hiệu lực để đăng tin công khai. Trên dev, admin có thể cấp gói miễn phí trong tab **Gói dịch vụ → Gói của từng môi giới**, hoặc cấu hình payOS sandbox. Chi tiết quy tắc nâng cấp / hạ cấp / hủy và cách cấu hình: [server/PAYOS_SETUP.md](server/PAYOS_SETUP.md).
