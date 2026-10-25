# Kết quả kiểm tra tích hợp payOS

Ngày kiểm tra: 17/10/2026. Phạm vi: mã nguồn cục bộ, PostgreSQL tách biệt và Chrome; chưa có kênh/khóa payOS để chuyển tiền thật.

## Kết quả

- **117/117 kiểm thử backend của bản phát hành sạch** qua, gồm các kiểm thử bảo mật và chức năng cũ. Workspace ban đầu có thêm ba kiểm thử email ngoài phạm vi, tổng 120/120; các thay đổi email không nằm trong bản phát hành payOS.
- **26/26 kiểm thử phiên đăng nhập/điều hướng** qua.
- **27 nhóm kiểm tra trình duyệt** qua: 9 thanh toán, 11 Analytics, 7 phiên/quyền truy cập.
- Build production thành công. Các file frontend thanh toán, điều hướng và Analytics thay đổi đã qua ESLint. Cảnh báo bundle lớn của Vite vẫn còn từ cấu trúc ứng dụng hiện tại.
- Đã kiểm tra ảnh desktop/tablet/mobile. Giao diện gói dịch vụ trên điện thoại được mở đủ chiều rộng, bảng lịch sử có vùng cuộn riêng.

## Bằng chứng chính

1. Giao diện Agent thực → API với JWT/session thực → repository → SQL tạo đơn từ giá trong DB → SDK chính thức xử lý phản hồi có chữ ký → trang checkout mô phỏng tại URL payOS.
2. Giả `status=PAID` trên URL không kích hoạt gói. Agent khác nhận `404` khi đọc/hủy đơn không thuộc mình; khách chưa đăng nhập nhận `401`, USER/ADMIN nhận `403` ở API Agent.
3. SDK từ chối webhook bị sửa số tiền/chữ ký và phản hồi API bị sửa chữ ký. Webhook hợp lệ nhưng không thuộc đơn nào chỉ được nhận/bỏ qua để hỗ trợ xác nhận kênh.
4. Webhook lặp, polling đồng thời và thử lại cùng request không cộng trùng gói/doanh thu. Lỗi mất phản hồi tạo link dùng lại cùng mã đơn.
5. SQL kiểm tra đúng số tiền/liên kết, rollback khi sai; thanh toán xác nhận muộn có thể hoàn tất đơn đã hủy/hết hạn. Không tự mở khóa tài khoản bị vô hiệu hóa.
6. Gia hạn hai lần cộng đúng hai tháng vào hạn đang còn; ngày 31/01/2099 thành 28/02/2099. Dùng thử chỉ cấp một lần.
7. Dữ liệu thử: PAID 100.000 + PAID 200.000 + FAILED 500.000 → doanh thu **300.000 VND**. Biểu đồ ngày/tuần/tháng/năm, tháng và phân bổ gói khớp tổng; thời điểm 18:00 UTC vào ngày Việt Nam kế tiếp. Hoàn tiền/net chưa biết được giữ `null`.
8. Trình duyệt kiểm tra tạo đơn, kết quả chờ/thành công, hủy, gia hạn, phân trang lịch sử, khóa tạo đơn khi chưa sẵn sàng, đăng nhập lại trở về đúng đơn và báo cáo Admin chỉ tính giao dịch đã xác minh.
9. Các bảng và RPC mới từ chối quyền `anon`/`authenticated`; chỉ backend `service_role` được thao tác. Không trả khóa, tài khoản ngân hàng hay nội dung webhook qua các DTO Agent/Admin.

## Thay đổi chính

- `014-agent-payos-payments.sql`: danh mục giá, sổ đơn, khóa đồng thời, kích hoạt/gia hạn và dùng thử nguyên tử.
- `015-payos-revenue-analytics.sql`: tổng hợp doanh thu đã xác minh và danh sách giao dịch phân trang ở DB.
- `paymentRepository`, `payosService`, `paymentService`, controller/routes: tạo, tiếp tục, đồng bộ, hủy, xác minh webhook và bảo vệ quyền sở hữu.
- `subscriptionService`: lấy gói còn hiệu lực, đọc timestamp cũ là UTC, cấp thử qua SQL nguyên tử.
- AgentPricing/AgentPayment: giao diện gói, lịch sử và trang kết quả; App/SessionRoute/luồng pending auth giữ đúng trang đơn sau đăng nhập.
- Analytics: doanh thu thật và bảng giao dịch; không suy ra doanh thu từ số lượng/gía gói.
- `PAYOS_SETUP.md` và `.env.example`: hướng dẫn tạo kênh, hai migration, cấu hình Render và webhook.

## Chưa kiểm tra trực tiếp

Tại thời điểm kiểm thử cục bộ ban đầu, chưa áp dụng hai migration mới vào production và chưa cấu hình kênh/khóa hay xác nhận webhook. Trước khi phát hành ngày 17/10/2026 đã kiểm tra bằng API rằng hai bảng billing và hàm tổng hợp doanh thu có trên Supabase. Backend cũ trả `Cannot POST /api/payments/payos/webhook`, cần triển khai mã mới để payOS xác nhận URL. Chưa chuyển tiền thật. Theo tài liệu payOS, môi trường thử không tách sandbox nên bước kiểm tra ngân hàng cần người dùng có kênh và chủ động thực hiện giao dịch giá nhỏ trên deployment kiểm thử riêng.

Chưa có tự động thu tiền, hoàn tiền/chi hộ, hóa đơn điện tử hay tác vụ quét đối soát định kỳ. Tài liệu thiết lập mô tả cách xử lý đơn cần đối soát và phạm vi doanh thu. Những thay đổi email/VerifyEmail và dữ liệu seed đã có trong workspace trước tác vụ này được giữ nguyên.
