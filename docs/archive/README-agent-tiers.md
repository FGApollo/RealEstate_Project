# Lite / Plus / Pro

| Gói | Giá / 1 tháng | Tin đang công khai | Điểm ưu tiên | Cấp hỗ trợ |
| --- | ---: | ---: | ---: | --- |
| Lite | 349.000đ | 10 | 100 | Support Lite |
| Plus | 499.000đ | 20 | 200 | Support Plus |
| Pro | 999.000đ | 50 | 300 | Support Pro |

Giá và quyền lợi được đọc từ DB. Không thêm khóa payOS mới; tiếp tục sử dụng
cấu hình cổng thanh toán hiện tại. Cấp hỗ trợ được lưu theo quyền lợi đã mua,
dùng kênh hỗ trợ hiện có; chưa có SLA hay thời gian phản hồi riêng được cam kết.

## Triển khai

1. Chạy `db-migration/018-agent-lite-plus-pro.sql`, rồi
   `db-migration/019-restore-unsubscribed-listing-visibility.sql` trong Supabase SQL
   Editor sau các migration đến 017. Nếu 018 đã chạy, chỉ chạy 019; không chạy
   lại 018 sau 019 vì view cũ sẽ ghi đè bản sửa hiển thị. Các file chạy trong transaction; nếu có lỗi,
   transaction phải rollback, không chạy tiếp riêng các đoạn bên dưới.
2. Deploy backend và frontend cùng bản code này. Không deploy code mới khi DB
   chưa có 018: bảng giá, quyền đăng tin và tìm kiếm cần các chức năng SQL mới.
3. Kiểm tra `/api/payments/catalog` bằng tài khoản Agent: phải có đúng ba gói,
   giá 349000/499000/999000 và hạn mức 10/20/50.
4. Kiểm tra Agent → Gói dịch vụ; Admin → Gói dịch vụ & Giá bán. Thử lọc loại
   phòng trọ và khu vực có tin của các Agent đang sử dụng gói khác nhau.

Migration không xóa lịch sử thanh toán hoặc tin đăng. Chạy lại không reset giá
Lite/Plus/Pro đã được Admin chỉnh. Các lịch giá Premium cũ được hủy vì gói đó
không còn bán mới. File SQL cần quyền quản trị; backend không tự thực thi DDL.

## Thanh toán và thời hạn

- Tạo đơn chỉ nhận mã gói, mã yêu cầu và phiên bản giá. Server/DB quyết định
  số tiền, chu kỳ, hạn mức, điểm và cấp hỗ trợ; client không tự cấp quyền.
- Mỗi đơn chốt giá và quyền lợi tại lúc tạo. Chỉ xác minh thanh toán từ payOS
  mới cấp kỳ sử dụng. URL quay về hay một webhook lặp không cấp thêm kỳ.
- Nếu còn kỳ đã thanh toán, kỳ mới xếp sau tất cả các kỳ còn hạn. Lite mua sau
  Pro không kéo dài quyền Pro; quyền lợi của từng kỳ chuyển theo giờ DB.
- Trang Agent hiển thị kỳ hiện tại và các kỳ đã mua đang chờ. Kết quả thanh toán
  hiển thị cả ngày bắt đầu và kết thúc, tránh nhầm gói đang chờ với gói hoạt động.
- Các gói PAID/Premium, dùng thử và doanh nghiệp cũ không còn bán. Đơn Premium
  đã tạo vẫn thanh toán/đối soát theo giá đã chốt. Subscription PAID cũ giữ hạn,
  có hạn mức 50 tin, 300 điểm, Support Pro. Dùng thử/loại cũ khác còn hiệu lực
  có mức chuyển tiếp 10 tin, 0 điểm, Support Lite.

## Tin đăng và xếp hạng

- Tin chiếm chỗ khi `status=AVAILABLE`, `is_public=true`, không bị Admin ẩn.
  Tin riêng tư, đã thuê/bán hoặc bị ẩn không chiếm chỗ.
- `is_public` là lựa chọn riêng tư của Agent; `is_hidden` là trạng thái kiểm
  duyệt. Agent đổi sang công khai không thể gỡ khóa kiểm duyệt.
- Backend kiểm tra trước khi xử lý đăng tin; DB kiểm tra lại khi insert/công
  khai/mở khóa, dưới khóa tài khoản. Gửi nhiều yêu cầu đồng thời không vượt quota.
- Khi hạ gói, chỉ N tin công khai mới nhất được hiển thị theo hạn mức mới; các
  tin còn lại được giữ để Agent quản lý, không xóa. Agent cần ẩn/kết thúc bớt tin
  trước khi công khai thêm. Giao diện phân biệt số tin bật công khai và số tin
  thực sự được hiển thị.
- Khi chưa có gói hoặc hết gói, tin đã công khai và đủ điều kiện vẫn hiển thị,
  với 0 điểm cộng từ gói. Điểm phạt của tin vẫn được giữ. Gói hết hạn không tự
  ẩn tin cũ; đăng thêm/công khai thêm tin vẫn cần gói còn hạn và chỗ trống.
  Tài khoản vô hiệu hóa, chưa KYC hoặc uy tín <=30 vẫn bị loại khỏi kết quả.
- Truy vấn áp dụng loại bất động sản, khu vực, giá, diện tích, số phòng và tiện
  ích **trước** xếp hạng và LIMIT. Chuẩn hóa tiền tố phường/quận/thành phố để dữ
  liệu như “Linh Trung” và “Phường Linh Trung” không bị bỏ sót.
- Điểm hiển thị = điểm gói hiện tại + `properties.priority_score` hiện có.
  Điểm phạt tin trùng -50 được giữ. Xếp điểm hiển thị giảm dần; khi bằng điểm,
  luồng gợi ý dùng mức phù hợp cá nhân rồi ID giảm dần, danh sách thường dùng ID.
- Ưu tiên không vượt bộ lọc và không khôi phục tin bị ẩn hay phản hồi “không
  thích”. Phân trang gợi ý dùng snapshot có chữ ký, ràng buộc tài khoản, bộ lọc
  và sở thích; làm mới luồng tạo lại thứ tự theo quyền lợi tại thời điểm đọc.
- Truy vấn SQL dùng chỉ mục theo Agent và lấy tối đa hạn mức tin của từng Agent
  bằng LATERAL; dữ liệu ảnh/tiện ích chỉ tổng hợp cho các kết quả đã giới hạn.
  Không phụ thuộc suy luận khóa ngoại qua view của PostgREST hoặc timer server.

## Kiểm thử

- `npm --prefix server test`: bộ hồi quy backend, gồm kiểm thử giá/quyền lợi,
  quota, bảo mật, thanh toán, tìm kiếm và tương thích dữ liệu cũ.
- `node --test server/tests/agentTiers.test.js`: 12 trường hợp chuyên biệt dùng
  SQL thật trên PGlite tách biệt. Có bài Pro cũ hơn 600 tin Lite vẫn được ưu tiên
  trước khi cắt tập ứng viên 500 tin, và bài lọc phòng trọ tại Thủ Đức.
- Từ `server/`, `node tests/servicePlans.browser.cjs` kiểm tra Admin và preview;
  `node tests/payments.browser.cjs` kiểm tra chọn cả ba gói và thanh toán Pro
  999.000đ, webhook lặp, gia hạn/hủy, quyền sở hữu đơn và doanh thu.
- Cần Playwright; có thể đặt `PLAYWRIGHT_MODULE_PATH` và
  `PLAYWRIGHT_EXECUTABLE_PATH` để dùng runtime đã cài. Kết quả/screenshot ở
  `.local/service-plans-verification/` và `.local/payos-verification/`.
- Kiểm thử trình duyệt dùng DB tách biệt và phản hồi payOS có chữ ký giả lập;
  không thay dữ liệu production và không chuyển tiền thật.
