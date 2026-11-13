# Danh sách Agent đang sử dụng gói dịch vụ

Trong Admin → Thống kê & Báo cáo → Gói dịch vụ, bảng mới hiển thị tên/email, gói đang dùng, ngày bắt đầu/hết hạn và trạng thái tài khoản. Bảng có 10 Agent mỗi trang và sắp xếp theo hạn dùng gần nhất.

## Database

Chạy toàn bộ `db-migration/016-admin-active-subscription-agents.sql` trong Supabase SQL Editor sau migration 010. Hàm mới chỉ đọc bảng hiện có, không sửa Agent, gói hay thanh toán. Không cần chạy lại các migration cũ.

Kiểm tra quyền sau khi chạy:

```sql
select has_function_privilege('anon',
  'public.admin_analytics_active_agents(timestamp with time zone,integer,integer)', 'execute');
-- false
select has_function_privilege('service_role',
  'public.admin_analytics_active_agents(timestamp with time zone,integer,integer)', 'execute');
-- true
```

## Quy tắc dữ liệu

- Cùng mốc chốt và điều kiện với `activeAgents` trong Analytics: role AGENT, gói ACTIVE, đã bắt đầu và chưa hết hạn; tài khoản và bản ghi đăng ký đã tồn tại tại mốc chốt.
- Mỗi Agent một dòng; chọn gói có ngày bắt đầu mới nhất, sau đó ngày tạo và ID mới nhất. Dùng thử/trả phí được tính theo cùng điều kiện.
- Gói hết hạn, đã hủy, chưa bắt đầu hoặc thiếu ngày không xuất hiện. Agent bị vô hiệu hóa vẫn có thể có gói còn hạn; cột trạng thái tài khoản thể hiện riêng, giống quy tắc KPI hiện có.
- Timestamp cũ được đọc là UTC, hiển thị giờ Việt Nam. Bộ lọc thời gian đổi mốc chốt của cả KPI và danh sách; bảng không giới hạn vào những Agent mới đăng ký trong kỳ.
- Thay đổi role/status xảy ra sau khi tải KPI có thể làm danh sách thay đổi. Giao diện báo lệch tổng và có nút cập nhật thống kê để đồng bộ lại.

## API

`GET /api/admin/analytics/subscriptions/agents?at=<snapshotAt>&page=1&limit=10`

Backend xác thực session hiện tại và bắt buộc ADMIN. `at` lấy từ `snapshotAt` của dashboard (mặc định giờ server); giới hạn 1–50 dòng/trang, trang 1–10000. Không nhận user ID/role để xác định người gọi.

SQL khử trùng, đếm và phân trang trước khi trả dữ liệu. Response chỉ gồm `agentId`, `name`, `email`, `planName`, `startDate`, `endDate`, `accountActive` cùng tổng/phân trang/mốc chốt. Không trả thông tin ngân hàng, token, mật khẩu hay số điện thoại. Response không được cache.

Khi chưa chạy migration 016, riêng danh sách trả lỗi 503 với mã `ACTIVE_AGENTS_NOT_CONFIGURED`; KPI và biểu đồ hiện có tiếp tục hoạt động. Không thay lỗi thành danh sách rỗng giả.

## Kiểm tra

`node --test server/tests/analytics.test.js` kiểm tra SQL thật bằng PostgreSQL riêng, quyền, phân trang, thời gian, khử trùng, dữ liệu rỗng và tổng khớp KPI. `node server/tests/analytics.browser.cjs` kiểm tra giao diện, phân trang, lỗi/thử lại và desktop/mobile; cần Playwright/Chrome. Không dùng dữ liệu thử trong production.
