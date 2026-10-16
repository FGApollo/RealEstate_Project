# Swipe Nest — Admin Analytics & Revenue Dashboard

Ngày audit và xác minh: **16/10/2026**. Migration đã được người dùng áp dụng qua Supabase SQL Editor; hàm thống kê đã được kiểm tra read-only trên database đang cấu hình. Việc deploy frontend/backend production chưa được thực hiện trong công việc này.

## CURRENT ADMIN ARCHITECTURE

- Frontend: React 19, React Router, `AdminPage.jsx` quản lý tab bằng state. Các tab cũ gồm KYC, báo cáo tin, đánh giá, khiếu nại và nhật ký điểm uy tín. Không có ứng dụng Admin thứ hai.
- `AdminRoute` dùng `ProtectedRoute` với role ADMIN. Session thật do `AuthProvider` khôi phục; `apiFetch` gửi Bearer access token giữ trong memory, có cơ chế refresh session.
- Backend: Express → route → controller → service → Supabase. `adminRoutes` đã có `authenticate` và `requireRole('ADMIN')`. Middleware xác minh chữ ký/issuer/audience/expiry của JWT, kiểm tra session chưa hết hạn/thu hồi, đọc lại user và role hiện tại từ DB, yêu cầu xác minh email.
- Style hiện tại: nền sáng, sidebar trắng, xanh dương, navy, card bo góc. Tab mới tái sử dụng shell này. Bundle biểu đồ chỉ tải khi mở analytics.
- Admin hiện tập trung kiểm duyệt, chưa có giao diện quản lý danh mục gói hay sổ thanh toán.

## USER & AGENT DATA MODEL

Schema đã được đối chiếu read-only với database cấu hình trong project, không chỉ suy luận từ source:

| Dữ liệu | Nguồn / ý nghĩa |
|---|---|
| Tài khoản | `public.users`, khóa `id` integer |
| Role | Một cột `role` varchar(20); app dùng USER, AGENT, ADMIN. Không có quan hệ nhiều role |
| Ngày tạo | `created_at` timestamp **without time zone**, có thể null |
| Trạng thái | `is_active` boolean, có thể null; không suy ra lý do khóa từ giá trị false |
| Xác minh | `email_verified_at`, `verification_status`; không đồng nghĩa trạng thái hoạt động |
| Xóa mềm | Không thấy `deleted_at`; tài khoản bị xóa vật lý không thể thống kê lại |

Theo xác nhận của người dùng, timestamp cũ được diễn giải là **UTC**, nhóm và hiển thị theo **Asia/Ho_Chi_Minh**.

## SUBSCRIPTION DATA MODEL

- Bảng thực tế: `seller_subscriptions`: `id`, `user_id → users.id`, `plan_name`, `price_vnd` numeric, `status`, `start_date`, `end_date`, `created_at`, `updated_at`. Các timestamp cũ không mang timezone.
- Không có bảng danh mục gói. Tên gói analytics lấy bằng GROUP BY từ `plan_name` trong DB, không dùng tên/giá hardcode của trang pricing. Gói chưa từng có bản ghi sẽ chưa xuất hiện.
- Frontend pricing có dùng thử, Premium và gói liên hệ; đây không phải danh mục giá authoritative trong DB. Backend hiện chỉ cho tạo `FREE_TRIAL`, giá 0, kỳ một tháng; yêu cầu kích hoạt gói trả phí trả 409 vì chưa có thanh toán xác thực.
- Audit thấy bản ghi `PAID` giá 1.000.000 VND trong DB. Đây là dữ liệu đăng ký, **không phải bằng chứng thu tiền**.
- Luồng hiện tại: Agent chọn dùng thử → POST `/api/subscriptions` → xác thực AGENT → `startFreeTrial` → insert bản ghi ACTIVE. `getSubscription().maybeSingle()` giả định mỗi tài khoản tối đa một bản ghi trong luồng hiện hành. Chưa có payment callback, luồng gia hạn/hủy hay bảng lịch sử riêng.
- Analytics vẫn xử lý được nhiều bản ghi/Agent: đếm DISTINCT Agent và chọn tối đa một bản ghi hiệu lực. Quá hạn được tính từ `end_date`, kể cả status trong DB còn ACTIVE.

## PAYMENT & REVENUE DATA MODEL

Không tìm thấy Payment/Transaction/Refund/revenue-source table trong schema được đọc, hoặc provider/callback/thanh toán xác thực trong backend. Không có dữ liệu để chứng minh doanh thu thực thu, mức giảm giá, hoàn tiền hoặc khử trùng callback.

**Phạm vi được người dùng xác nhận:** hoàn thành thống kê tài khoản/gói; doanh thu hiển thị “Chưa có dữ liệu thanh toán xác thực”, chuẩn bị cấu trúc API/biểu đồ cho tích hợp sau. Không thêm một sổ giao dịch trống rồi coi đó là tích hợp thanh toán.

API trả `revenue.available=false`, mọi chỉ số tiền và số giao dịch là **null**, các chuỗi biểu đồ là mảng rỗng. UI hiển thị dấu “—” và lý do; không biến dữ liệu thiếu thành 0. Cột doanh thu từng gói cũng là null.

Hợp đồng tích hợp sau: VND, số tiền gốc của giao dịch xác thực, ghi nhận theo ngày thanh toán. PENDING/FAILED/CANCELLED không tính; tiền hoàn ghi nhận riêng theo ngày hoàn. Gộp kỳ − hoàn kỳ = sau hoàn kỳ. Cần ledger có transaction ID/provider ID unique, số tiền immutable, paid_at, currency, package/source snapshot; refund events và idempotency phải được xác minh trước khi bật `available`. **Chưa có logic tính doanh thu hoặc xử lý callback thật trong thay đổi này.**

## KPI DEFINITIONS

Mốc chốt là cuối ngày kết thúc đã chọn hoặc thời điểm cập nhật nếu là hôm nay. Khoảng đăng ký mới bao gồm ngày bắt đầu và toàn bộ ngày kết thúc theo giờ Việt Nam. Kỳ hiện tại có thể chưa đủ ngày; kỳ so sánh là khoảng liền trước cùng số ngày.

| KPI | Định nghĩa |
|---|---|
| Tổng tài khoản | Mọi role, gồm cả Admin, role khác và tài khoản vô hiệu hóa; tạo trước mốc chốt. Bản ghi thiếu ngày vẫn nằm trong tổng |
| Khách hàng / môi giới | `role='USER'` / `role='AGENT'`, theo role hiện tại |
| Hoạt động / vô hiệu hóa | `is_active IS TRUE` / `IS FALSE`; null được thống kê riêng |
| Tài khoản mới | COUNT theo `created_at` trong kỳ, gồm mọi role; biểu đồ có tổng, USER và AGENT mới |
| Tăng trưởng tổng/USER/AGENT | `(số tại mốc chốt − số đầu kỳ) / số đầu kỳ × 100`; mô tả trên card là so với đầu kỳ |
| Tăng trưởng đăng ký mới | `(đăng ký kỳ này − kỳ trước cùng số ngày) / kỳ trước × 100`; baseline 0 trả null |
| Tỷ lệ USER/AGENT | Mẫu số `USER+AGENT`, không gồm ADMIN/role khác |
| Agent từng đăng ký | COUNT DISTINCT `user_id` có bản ghi, chỉ tài khoản role AGENT hiện tại |
| Agent có gói hiệu lực | Status ACTIVE, bắt đầu trước mốc chốt, kết thúc sau mốc chốt. Bao gồm Agent vô hiệu hóa vì hiệu lực gói và quyền truy cập tài khoản là hai chỉ số riêng |
| Gói hiện tại của Agent | Trong các bản ghi hiệu lực, ưu tiên `start_date DESC, created_at DESC NULLS LAST, id DESC` |
| Agent chưa từng có gói | Tổng Agent − DISTINCT Agent từng đăng ký |
| Agent không có gói hiệu lực | Tổng Agent − DISTINCT Agent có gói hiệu lực; khác “chưa từng đăng ký” |
| Đăng ký mới trong kỳ | Số **bản ghi** tạo trong kỳ, không phải số Agent |
| Hết hạn / hủy | Số bản ghi EXPIRED hoặc ACTIVE đã quá `end_date`; hủy là CANCELLED/CANCELED hiện tại. Hết hạn trong kỳ đếm riêng theo end_date. Không giả tạo ngày hủy từ updated_at |
| Tỷ trọng gói | Số Agent duy nhất đang dùng gói / tổng Agent có gói hiệu lực |
| Doanh thu | Không có nguồn thanh toán tin cậy → chưa khả dụng, không suy từ `price_vnd` |

Đối chiếu: tổng các điểm `userGrowth.total` = `users.newAccounts`; USER/AGENT cũng đối chiếu riêng. Tổng `packages.activeAgents` = `subscriptions.activeAgents`; tổng `packages.newSubscriptions` = `subscriptions.newRecords`.

Role, trạng thái và bản ghi hiện tại **không có lịch sử hiệu lực**. Bộ lọc quá khứ giới hạn ngày tạo/hạn dùng nhưng không thể khôi phục tài khoản đã xóa, role cũ hay trạng thái gói trước khi bị đổi/hủy. UI có giải thích giới hạn này; đây không phải báo cáo lịch sử tài chính đã kiểm toán.

## ANALYTICS API DESIGN

| Endpoint | Kết quả |
|---|---|
| GET `/api/admin/analytics/overview` | Một snapshot thống nhất: filters, generatedAt, snapshotAt, previousPeriod, users, userGrowth, subscriptions, packages, revenue |
| GET `/api/admin/analytics/transactions?page=1&limit=10` | Hợp đồng phân trang đã validate; hiện trả available=false, items=[], total=null vì chưa có transaction model |

Overview nhận `preset=7d|30d|90d|12m` hoặc `preset=custom&start=YYYY-MM-DD&end=YYYY-MM-DD`; `bucket=day|week|month|year`. Có thể gửi start/end không kèm preset để chọn custom. “12 tháng” là 12 tháng lịch gồm tháng hiện tại đến hôm nay.

Validate ngày thực (gồm năm nhuận), thứ tự, ngày tương lai, khoảng từ năm 2000, tối đa 3.660 ngày; day tối đa 366 ngày, week tối đa 2.793 ngày để giữ dưới khoảng 400 điểm. Từ chối query lặp, mảng, key lạ như adminId. Transaction page 1–10.000, limit 1–50.

Mọi endpoint nằm sau xác thực và quyền ADMIN. Tài khoản Admin phải `is_active=true` đọc trực tiếp từ DB. `Cache-Control: private, no-store`. Không trả user records, subscription records, thông tin liên hệ, payment credentials hay session token. Migration chưa có → 503 `ANALYTICS_NOT_CONFIGURED`; lỗi truy vấn → thông báo an toàn, không trả chi tiết DB.

## DATABASE AGGREGATION STRATEGY

Migration `server/db-migration/010-admin-analytics.sql` tạo RPC `admin_analytics_dashboard(date,date,text,timestamptz)` và ba index. Không cập nhật dữ liệu nghiệp vụ hay suy diễn giao dịch từ các gói cũ.

- Một RPC/overview, các CTE trong cùng SQL statement/snapshot: COUNT/FILTER, COUNT DISTINCT, GROUP BY, DISTINCT ON, JSON aggregation. Không N+1 và không tải bảng về Node/React để tính.
- Ranh giới ngày Việt Nam được chuyển thành UTC trước khi so sánh với timestamp cũ; không bọc cột indexed trong hàm timezone ở WHERE.
- `generate_series` điền các kỳ không có đăng ký bằng 0, chỉ trên chuỗi đã tổng hợp. Nhóm tuần bắt đầu thứ Hai; bucket đầu/cuối có thể là kỳ chưa đầy đủ.
- Index: `users(created_at,role)`, `seller_subscriptions(created_at,user_id)`, partial index cho ACTIVE `(user_id,start_date DESC,id DESC) INCLUDE(end_date,plan_name)`.
- Hàm SECURITY INVOKER, search_path cố định, timezone UTC; cấu hình statement_timeout 8s. REVOKE EXECUTE từ PUBLIC/anon/authenticated, chỉ GRANT service_role. Khóa service role nằm ở backend.
- Tổng toàn bộ tài khoản/bản ghi cần đọc toàn bộ tập sự kiện áp dụng; không tuyên bố mọi COUNT toàn lịch sử đều tránh được scan. Các nhánh chọn lọc ngày và gói ACTIVE đã được kiểm tra dùng index.
- Chưa thêm cache dùng chung: tránh stale snapshot và giảm độ phức tạp invalidation. Nếu quy mô vượt phép đo hiện tại, cần đánh giá materialized rollups/TTL trên staging; không có kết luận hiệu năng production từ một fixture.

## DASHBOARD COMPONENT STRUCTURE

```text
AdminPage (sidebar/tab hiện tại)
└─ lazy + Suspense → AdminAnalyticsPage
   ├─ Header / bộ lọc / refresh / thời điểm cập nhật
   ├─ useAnalytics → analyticsApi → apiFetch
   ├─ Kpi / Panel
   ├─ TrendChart (USER/AGENT/tổng đăng ký mới)
   ├─ DistributionChart (USER/AGENT và gói hiệu lực)
   ├─ ComparisonChart (đăng ký mới theo gói)
   ├─ Bảng chi tiết từng gói
   ├─ RevenueAnalytics (contract + trạng thái chưa có nguồn xác thực)
   └─ Giao dịch gần đây (chưa khả dụng vì thiếu model)
```

Một thư viện chart mới: **Recharts**. Data fetching, định dạng và chart presentation tách file. Một lần đổi bộ lọc đã áp dụng gọi một overview; mọi KPI/chart dùng cùng response. Abort request cũ khi đổi filter/unmount, không hiển thị response cũ cho khoảng mới. Refresh không gọi lại dữ liệu các tab khác.

Có skeleton không dùng số 0 giả; empty state, lỗi có retry, giá trị chưa khả dụng. Desktop bốn KPI mỗi hàng, tablet hai, mobile một; chart co theo container, bảng cuộn ngang. CSS cho shell mobile giới hạn trong tab analytics để không thay layout các tab cũ.

## FILES CHANGED

Chỉ các file sau thuộc thay đổi analytics; các thay đổi email/verification và dữ liệu seed đã có trước được giữ nguyên.

| Nhóm | File |
|---|---|
| Dependencies / script | `package.json`, `package-lock.json` |
| Admin integration | `src/pages/AdminPage.jsx`, `src/pages/AdminPage.css` |
| Frontend | `src/features/admin/analytics/AdminAnalyticsPage.jsx`, `AdminAnalyticsPage.css`, `AnalyticsCharts.jsx`, `analyticsApi.js`, `analyticsFormat.js`, `useAnalytics.js` |
| API / xác thực | `server/routes/adminRoutes.js`, `server/services/authSessionService.js` (đọc thêm is_active để áp dụng quyền analytics) |
| Backend | `server/controllers/analyticsController.js`, `server/services/analyticsService.js`, `server/services/analyticsQuery.js`, `server/repositories/analyticsRepository.js` |
| Database | `server/db-migration/010-admin-analytics.sql` |
| Tests | `server/tests/analytics.test.js`, `server/tests/helpers/analyticsDatabase.js`, `server/tests/analytics.browser.cjs`, `server/tests/fixtures/analyticsPreview.jsx` |
| Báo cáo | `ADMIN_ANALYTICS_REPORT.md` |

## SECURITY VERIFICATION

Đã chạy HTTP thật tới router production với JWT có chữ ký thật, users/session nằm trong PostgreSQL thử nghiệm:

- Không token → 401; USER → 403; AGENT → 403; Admin đang hoạt động → 200, cho cả overview và transactions.
- Admin vô hiệu hóa hoặc trạng thái hoạt động null → 403; thay role sau khi phát token → 403; session bị thu hồi hoặc JWT bị sửa → 401.
- adminId giả từ query → 400. Không dùng localStorage.role hay client adminId để xác định caller.
- Quyền DB: anon/authenticated không có EXECUTE RPC, service_role có quyền. Validate phạm vi cả trong API và RPC.
- RPC lỗi/migration thiếu không hiển thị số liệu giả hoặc lỗi DB nhạy cảm.
- Route kiểm duyệt cũ vẫn yêu cầu Admin. Test helper thay kết nối sang DB in-memory; không ghi fixture vào production.

## PERFORMANCE VERIFICATION

Fixture kiểm thử: **30.012 tài khoản + 60.005 bản ghi gói**. Query dashboard đo khoảng **113 ms** trên PGlite cục bộ trong lần xác minh, response **2.025 ký tự JSON**. Đây là phép đo test, không phải SLA production.

EXPLAIN ANALYZE xác nhận growth query dùng `users_analytics_created_role_idx`; query chọn gói hiệu lực dùng `subscriptions_analytics_current_idx`. Chart tối đa khoảng 400 bucket; payload chỉ aggregate. Một lần đổi filter gửi một request đã áp dụng, kiểm tra bằng browser. Tổng toàn lịch sử vẫn có scan cần thiết để tính số liệu chính xác.

Frontend build tách chunk analytics khoảng **426 KB / 121 KB gzip**, chỉ tải khi mở tab. Cảnh báo bundle chính >500 KB của ứng dụng vẫn còn; không phải lỗi build.

## TEST RESULTS

- `npm run test:analytics`: **15/15** — SQL PostgreSQL thật (PGlite), security HTTP, timezone, 7/30 ngày và mọi bucket, expired/null/future, tie-break, gói động, baseline 0, empty, validation và performance.
- `npm test --prefix server`: **50/50** trên bản commit sạch sau khi tích hợp KYC mới nhất từ main. Lần chạy 53/53 trước đó bao gồm ba kiểm thử email đang chỉnh sửa riêng trong workspace; các thay đổi email đó không thuộc commit Analytics.
- `npm run test:auth-flow`: **16/16**.
- ESLint cho toàn bộ frontend mới và browser fixture: đạt; Node syntax check cho backend mới: đạt. Không tuyên bố lint sạch cho toàn bộ legacy codebase.
- `npm run build`: đạt.
- Chrome headless: 9 nhóm kiểm tra đạt, không có page error. Bao gồm Admin shell → API/SQL → KPI/charts; skeleton; 7/30 ngày; ngày/tuần/tháng/năm; custom dates; so sánh số đăng ký; responsive 768/390 px; error/retry; subscription rỗng; điều hướng về KYC rồi analytics.

Browser runner là tùy chọn, cần Playwright có sẵn. Chạy `node server/tests/analytics.browser.cjs`; nếu dùng runtime bundle, đặt `PLAYWRIGHT_MODULE_PATH` tới package Playwright và `PLAYWRIGHT_EXECUTABLE_PATH` tới Chrome/Chromium cài sẵn. Runner tự tạo test server/DB, không dùng session hoặc dữ liệu production.

Ảnh và kết quả browser nằm trong `.local/analytics-verification/`: `desktop.png`, `desktop-overview.png`, `tablet.png`, `mobile.png`, `mobile-overview.png`, `browser-results.json`. Ảnh có nhãn **TEST DATABASE — fixture data only**.

Test doanh thu PAID 100.000 + PAID 200.000 − bỏ FAILED 500.000 chưa thể chạy trên model thật vì model đó chưa tồn tại, đúng phạm vi đã xác nhận. Thay vào đó đã kiểm thử rằng bản ghi `PAID` với giá tùy ý **không thể** tạo doanh thu; mọi số tiền trả null. Refund, payment idempotency và transaction pagination thực tế cần test khi có ledger.

## KNOWN LIMITATIONS

1. **Migration đã áp dụng và được xác minh trên DB đang cấu hình.** Người dùng chạy SQL trong Supabase SQL Editor; sau đó backend service/RPC đã đọc dữ liệu thật thành công. Tác vụ xác minh chỉ đọc dữ liệu, không tạo session hoặc ghi fixture lên DB này.
2. **Doanh thu/giao dịch chưa khả dụng** theo quyết định của người dùng, vì thiếu nguồn thanh toán tin cậy. Các biểu đồ tiền có contract/UI sẵn nhưng không có số liệu hoặc payment adapter đang hoạt động.
3. Không có catalog gói, lịch sử đổi role/status, lịch sử gia hạn/hủy/refund hay tài khoản đã xóa. Giới hạn báo cáo quá khứ được hiển thị trong UI.
4. Chưa xác minh triển khai frontend/backend production, RLS toàn hệ thống hoặc query plan trên dữ liệu production. Quyền gọi RPC đã được kiểm tra trên DB thật bằng service-role và khóa công khai; khóa công khai bị từ chối. Browser test sử dụng source production và DB fixture riêng.

## POST-MIGRATION VERIFICATION

Xác minh lúc **13:46 ngày 16/10/2026, giờ Việt Nam**, sau khi người dùng báo hoàn tất migration. `AnalyticsService → analyticsRepository → Supabase RPC` đã chạy trên DB thật cho các bộ lọc 7/30/90 ngày, 12 tháng và đủ nhóm ngày/tuần/tháng/năm.

| Chỉ số | Kết quả thực tế đã đối chiếu |
|---|---:|
| Tổng tài khoản | 38 |
| Khách hàng USER | 22 |
| Môi giới AGENT | 15 |
| Admin | 1 |
| Đang hoạt động / vô hiệu hóa | 37 / 1 |
| Tài khoản mới trong 7 / 30 / 90 ngày | 0 / 8 / 8 |
| Tài khoản trong bộ lọc 12 tháng | 38 |
| Bản ghi đăng ký gói | 1 |
| Agent từng đăng ký / đang có gói hiệu lực | 1 / 1 |

- Tổng tài khoản, từng role và trạng thái được so sánh với COUNT độc lập qua REST HEAD, không tải danh sách người dùng.
- Tổng tài khoản mới của từng bộ lọc khớp COUNT độc lập và tổng các điểm biểu đồ USER/AGENT/tổng.
- Tổng Agent theo gói và tổng lượt đăng ký theo gói khớp KPI. Một bản ghi đăng ký thực tế được đối chiếu qua các trường tối thiểu, không lấy tên/email/điện thoại. Audit độc lập giới hạn tối đa 200 bản ghi; đây không phải cách ứng dụng tính analytics.
- Lời gọi RPC bằng service-role thành công; lời gọi bằng khóa công khai trả **401, PostgreSQL code 42501**, không lộ số liệu.
- Backend cục bộ đã được khởi động tại `http://localhost:3000`. Hai endpoint `/api/admin/analytics/overview` và `/api/admin/analytics/transactions` đều trả **401** khi gọi không đăng nhập. Không tạo session hay giả danh tài khoản Admin thật để kiểm tra.
- Doanh thu vẫn `available=false`, số tiền null, đúng quyết định không suy doanh thu từ bản ghi PAID.
- Thời gian nhận RPC qua mạng ở lần kiểm tra: khoảng 0,89–1,65 giây. Đây là thời gian client bao gồm kết nối/mạng, không phải thời gian thực thi SQL.
- Kết quả kiểm tra không chứa thông tin định danh được lưu tại `.local/analytics-verification/live-verification.json`.

### Áp dụng migration và kiểm tra trên môi trường triển khai

1. Xem và chạy `server/db-migration/010-admin-analytics.sql` bằng SQL editor/kết nối PostgreSQL của **staging** trước. Script chỉ tạo index/RPC/grant, không tạo doanh thu hoặc sửa bản ghi nghiệp vụ. Nếu dữ liệu lớn, bố trí tạo index phù hợp trước khi triển khai vì script hiện chạy trong transaction.
2. Deploy backend/frontend từ source đã cập nhật theo quy trình hiện tại. Không đưa service-role key vào frontend.
3. Đăng nhập Admin thật, mở “Thống kê & Báo cáo”; kiểm tra 200, tổng tài khoản/gói so với aggregate DB, đổi 7/30 ngày và timezone boundary. Kiểm tra trực tiếp 401/403 bằng tài khoản khác.
4. Thử thiếu quyền RPC/lỗi database để xác nhận UI error/retry; xác nhận doanh thu vẫn chưa khả dụng cho đến khi có ledger đã kiểm chứng.

## END-TO-END TRACE

```text
Admin mở tab “Thống kê & Báo cáo” trong AdminPage
→ lazy-load AdminAnalyticsPage và Recharts
→ useAnalytics tạo bộ lọc, analyticsApi gọi apiFetch
→ GET /api/admin/analytics/overview?preset=30d&bucket=day
→ authenticate: verify JWT → auth_sessions → users hiện tại
→ requireRole('ADMIN') → kiểm tra is_active=true → read rate limiter
→ analyticsController → analyticsService → parseAnalyticsQuery
→ analyticsRepository → Supabase RPC admin_analytics_dashboard
→ PostgreSQL COUNT / DISTINCT / GROUP BY / chọn gói hiện tại / zero-fill
→ một JSON snapshot (không có bản ghi cá nhân)
→ service bổ sung trạng thái revenue chưa có nguồn xác thực
→ React render KPI, line/bar/donut và bảng gói từ response
```

Luồng từ browser đến SQL đã được kiểm chứng trên test database riêng. Sau migration, nhánh backend service/repository/RPC đã được kiểm tra thêm trên dữ liệu của DB đang cấu hình, với số liệu đối chiếu như mục POST-MIGRATION VERIFICATION. Chưa tuyên bố đã đăng nhập Admin thật và kiểm tra giao diện production.

Tham chiếu API thư viện: [PostgreSQL date/time](https://www.postgresql.org/docs/current/functions-datetime.html), [Recharts ResponsiveContainer](https://recharts.github.io/api/ResponsiveContainer/), [Recharts accessibility](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility).
