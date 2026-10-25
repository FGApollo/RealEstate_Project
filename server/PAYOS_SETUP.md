# Thanh toán Agent qua payOS

## Chức năng đã triển khai

- Gói Premium: **1.000.000 VND / một tháng lịch**, giá lấy từ `agent_billing_plans`.
- Agent tạo đơn, chuyển tới trang payOS, xem trạng thái, hủy đơn chưa thanh toán và xem lịch sử phân trang.
- Backend xác thực Agent và quyền sở hữu đơn; frontend không gửi giá, thời hạn hay user ID để quyết định thanh toán.
- SDK chính thức `@payos/node` xác minh chữ ký phản hồi và webhook. Backend còn đọc lại đơn từ payOS trước khi kích hoạt.
- Giao dịch `PAID`, đúng mã đơn, mã liên kết và đủ đúng số tiền mới được ghi sổ và cấp hạn dùng trong cùng một transaction SQL.
- Webhook trùng / polling đồng thời chỉ cấp gói một lần. Mỗi Agent có một đơn mở; lỗi mạng được thử lại với cùng mã đơn.
- Đơn có hạn 30 phút. Trở về từ payOS hoặc thêm `status=PAID` vào URL không kích hoạt gói.
- Nâng cấp có hiệu lực ngay. Nếu gói còn hạn, thêm một tháng vào hạn cũ; nếu hết hạn, tính từ lúc backend xác nhận. Ngày cuối tháng được PostgreSQL chặn về ngày cuối tháng kế tiếp. Không có tự động trừ tiền.
- Giữ một bản ghi gói hiện tại để tương thích hệ thống cũ; từng lần thanh toán và hạn dùng sau thanh toán được giữ trong sổ đơn. Các bản ghi gói cũ bị chồng lấn được kết thúc khi gộp vào gói đã gia hạn.
- Admin có doanh thu gộp, biểu đồ đường, phân bổ theo gói và bảng giao dịch. Chỉ số tiền thanh toán đã xác minh được tính; giá gói cũ không được chuyển thành doanh thu.

## 1. Tạo tài khoản và kênh nhận tiền

1. Mở [my.payos.vn](https://my.payos.vn), đăng ký tài khoản.
2. Hoàn tất xác thực cá nhân hoặc doanh nghiệp theo hướng dẫn trên tài khoản, liên kết tài khoản ngân hàng nhận tiền.
3. Tạo kênh thanh toán dành cho Swipe Nest. Điền thông tin website và chủ thể nhận tiền mà payOS yêu cầu. Tên/vị trí các mục có thể thay đổi theo giao diện tài khoản.
4. Trong thông tin tích hợp của kênh, lấy **Client ID**, **API Key**, **Checksum Key**. Chỉ nhập vào biến môi trường của backend; không gửi chúng vào chat, commit Git hay cấu hình Vercel frontend.

Các điều kiện tài khoản/kênh và môi trường API: [tài liệu API chính thức](https://payos.vn/docs/api/). Cách dùng ba khóa và SDK: [Node.js SDK](https://payos.vn/docs/sdks/back-end/node/).

## 2. Áp dụng database trước khi phát hành backend

Trong Supabase SQL Editor của đúng project, chạy lần lượt toàn bộ hai file:

1. `server/db-migration/014-agent-payos-payments.sql`
2. `server/db-migration/015-payos-revenue-analytics.sql`

Yêu cầu các migration trước đó, đặc biệt `010-admin-analytics.sql` và `011-backend-only-data-access.sql`, đã có. Hai migration mới không tạo giao dịch giả hay sửa giá gói đang dùng. Chúng thêm danh mục giá, sổ đơn, các hàm SQL nguyên tử và hàm tổng hợp doanh thu; quyền truy cập chỉ dành cho backend `service_role`.

Kiểm tra không chứa dữ liệu riêng tư:

```sql
select code, name, amount_vnd, duration_months, active
from public.agent_billing_plans;
-- PAID | Premium | 1000000 | 1 | true

select has_function_privilege('anon',
  'public.settle_agent_payment(bigint,text,integer,timestamp with time zone,text)', 'execute');
-- false

select has_function_privilege('service_role',
  'public.reserve_agent_payment(integer,text,uuid)', 'execute');
-- true
```

Không chạy lại các migration cũ chỉ để bật payOS. Nếu project có dữ liệu tùy biến, sao lưu trước thay đổi schema như quy trình vận hành hiện tại.

## 3. Cấu hình backend Render và webhook

Backend hiện tại: `https://realestate-project-2u79.onrender.com`.

Trong Environment của dịch vụ backend, cấu hình:

Runtime backend cần Node.js 20 trở lên để chạy SDK payOS v2; nên giữ Node.js 22 đang dùng khi kiểm thử.

```dotenv
PAYOS_ENABLED=false
PAYOS_CLIENT_ID=<Client ID của kênh>
PAYOS_API_KEY=<API Key của kênh>
PAYOS_CHECKSUM_KEY=<Checksum Key của kênh>
FRONTEND_URL=https://real-estate-project-tan-omega.vercel.app
```

Giữ các biến Supabase, JWT và CORS hiện có. `FRONTEND_URL` phải là đúng origin, không có đường dẫn; bản production yêu cầu HTTPS. Với local chỉ dùng `http://localhost:<port>` hoặc `http://127.0.0.1:<port>` và `NODE_ENV` khác `production`.

Triển khai phiên bản backend/frontend có tính năng này. Sau đó đặt URL webhook của **đúng kênh payOS** thành:

```text
https://realestate-project-2u79.onrender.com/api/payments/payos/webhook
```

Để payOS kiểm tra/xác nhận URL theo giao diện quản lý kênh. Endpoint cần truy cập công khai qua HTTPS; nó xác thực bằng chữ ký, không dùng cookie/JWT của người đăng nhập. Mẫu xác nhận có chữ ký hợp lệ nhưng không thuộc đơn nào sẽ được nhận `200` và bỏ qua. Không kiểm tra webhook bằng cách mở URL GET trong trình duyệt.

Sau khi xác nhận thành công, đổi `PAYOS_ENABLED=true` và khởi động lại backend. Ba khóa vẫn được dùng để xử lý các đơn cũ/webhook ngay cả khi tạm tắt tạo đơn mới bằng `PAYOS_ENABLED=false`.

Nếu chưa có khóa, có thể giữ chức năng chưa sẵn sàng: nút thanh toán bị khóa và không có gói nào được kích hoạt giả. Chưa áp dụng migration 014 thì API thanh toán báo chưa được cấu hình; không phát hành thay đổi subscription trước bước database.

## 4. Kiểm tra thật sau khi có kênh

payOS hiện không có sandbox riêng: [tài liệu môi trường kiểm thử](https://payos.vn/docs/moi-truong-test/). Các giao dịch trên cổng thật là chuyển tiền thật. Những kiểm thử trong repository chỉ dùng PostgreSQL riêng và phản hồi có chữ ký từ bộ giả lập; chưa thay thế kiểm tra trực tiếp với ngân hàng.

Thử một giao dịch giá nhỏ trên **deployment/database kiểm thử tách biệt** với kênh bạn quản lý. Có thể sửa giá `PAID` ở database kiểm thử; đơn đã tạo giữ nguyên giá chụp lúc tạo. Không thay giá production để thử nghiệm cho tất cả Agent.

Kiểm tra các bước:

1. Đăng nhập Agent đã xác minh email → Gói dịch vụ → thanh toán. Đối chiếu đúng người nhận, số tiền và nội dung trên trang payOS.
2. Hoàn tất chuyển tiền → quay về trang kết quả. Đóng tab giữa chừng vẫn phải được webhook ghi nhận; mở lại lịch sử phải thấy `Đã thanh toán`.
3. Đối chiếu đơn payOS, `agent_payment_orders`, hạn dùng gói và doanh thu Admin. Gọi webhook lại bằng công cụ của payOS không được cộng thêm hạn hay doanh thu.
4. Thử hủy một đơn mới chưa chuyển tiền; gói cũ không thay đổi. Thử gia hạn một lần nữa và kiểm tra chỉ cộng đúng tháng đã trả.
5. Nếu trình duyệt hết phiên, đăng nhập Agent phải trở về đúng trang đơn. Agent khác không đọc/hủy được đơn này.

## Vận hành và giới hạn

- Doanh thu tính theo `paid_at` của đơn, chỉ khi có `verified_at`; nhóm thời gian Việt Nam. Timestamp ngân hàng không có offset được hiểu là UTC+7. Nếu payOS không cung cấp thời gian giao dịch hợp lệ, dùng thời điểm xác nhận từ backend.
- Chỉ bao gồm sổ payOS kể từ lúc tích hợp. Không nhập doanh thu lịch sử từ giá gói hay trạng thái subscription cũ. Bảng giao dịch lọc theo ngày tạo đơn và hiển thị ngày trả tiền riêng; biểu đồ doanh thu lọc theo ngày trả tiền.
- Chưa tích hợp hoàn tiền/chi hộ/hóa đơn điện tử. `periodRefunds` và `periodNet` để `null`, không giả bằng 0. Hoàn tiền thủ công ngoài hệ thống cần đối soát riêng trước khi dùng báo cáo làm báo cáo tài chính.
- Thiếu/thừa tiền hoặc danh tính liên kết không khớp sẽ không tự kích hoạt. Đối soát với payOS bằng mã đơn; không sửa URL hoặc đổi `status` trong DB để cấp gói.
- Lỗi webhook tạm thời trả lỗi để payOS thử lại. Agent cũng có thể mở đơn và bấm kiểm tra lại để đồng bộ từ cổng. Chưa có tác vụ quét đối soát định kỳ; cần theo dõi các đơn chưa xác nhận nếu webhook bị gián đoạn kéo dài.
- Khi tạo liên kết bị lỗi mạng, bấm thanh toán lại để dùng cùng đơn. Đơn đã `CREATING` chưa có liên kết có thể được thử tạo lại từ trang gói. Khi quá 30 phút, tạo đơn mới; xác nhận thanh toán muộn vẫn được kiểm tra và ghi nhận đúng đơn cũ.
- Tắt tạo đơn mới bằng `PAYOS_ENABLED=false`, giữ khóa/webhook để xử lý đơn đang mở. Tránh đổi sang kênh khác khi còn đơn cần xác nhận.
- Khóa và thông tin ngân hàng không được trả qua API Agent/Admin hoặc ghi vào log lỗi SDK. Chỉ URL checkout trên `https://pay.payos.vn/web/...` được mở.

## API

| Endpoint | Quyền | Chức năng |
| --- | --- | --- |
| `GET /api/payments/catalog` | AGENT | Giá từ DB và trạng thái sẵn sàng |
| `POST /api/payments` | AGENT | Body chỉ có `planCode: "PAID"`, `requestId: UUID` |
| `GET /api/payments?page=1&limit=10` | AGENT | Lịch sử của chính Agent |
| `GET /api/payments/:id` | AGENT sở hữu | Đồng bộ trạng thái đã xác minh |
| `POST /api/payments/:id/cancel` | AGENT sở hữu | Hủy trên cổng, không hoàn tiền |
| `POST /api/payments/payos/webhook` | Chữ ký payOS | Xác minh, ghi sổ và kích hoạt |
| `GET /api/admin/analytics/overview` | ADMIN | Thống kê gồm doanh thu thật |
| `GET /api/admin/analytics/transactions` | ADMIN | Phân trang, cùng bộ lọc thời gian |

Tham số ngày hỗ trợ như Analytics hiện có: `preset`, `start`, `end`, `bucket`; phân trang `page`, `limit` tối đa 50. Không nhận user ID để xác định người gọi.

## Chạy kiểm thử

```powershell
npm --prefix server test
npm run test:auth-flow
npm run build
# Cần Playwright + Chrome; có thể dùng PLAYWRIGHT_MODULE_PATH / PLAYWRIGHT_EXECUTABLE_PATH.
node server/tests/payments.browser.cjs
```

Các kiểm thử dùng database bộ nhớ, không thay dữ liệu Supabase và không chuyển tiền thật. Báo cáo giao diện/screenshot cục bộ được lưu ở `.local/payos-verification/`.
