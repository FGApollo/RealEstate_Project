# Báo cáo các giải pháp tạm thời (Temporary Mocks) trong chức năng Đăng Tin

Báo cáo này liệt kê các giải pháp tạm thời (Mocks) được triển khai trong quá trình chạy thử nghiệm chức năng Đăng tin (Posting Flow) để PM/DevOps nắm thông tin và cấu hình môi trường Production sau này.

---

## 1. Lưu trữ hình ảnh BĐS bằng URL Unsplash (Backend Mock)
* **Vấn đề gốc**: Hệ thống gửi ảnh từ Frontend lên Backend dưới dạng chuỗi Base64 dài (hàng MB) trong JSON. Tuy nhiên, cột `thumbnail` (bảng `properties`) và cột `image_url` (bảng `property_images`) trên cơ sở dữ liệu Supabase được cấu hình kiểu dữ liệu giới hạn **`character varying(500)`** (varchar 500 ký tự). Điều này khiến cơ sở dữ liệu báo lỗi `value too long` khi chèn ảnh Base64.
* **Giải pháp tạm thời**:
  - Tại hàm `saveBase64Image` trong file [propertyService.js](file:///c:/Users/tunbi/School/SU26/exe/cp3/RealEstate_Project/server/services/propertyService.js#L6), chúng tôi đã cấu hình để **loại bỏ chuỗi Base64 nhận được (hoặc link placeholder mặc định) và thay thế bằng một URL ảnh nhà ngẫu nhiên, độ phân giải cao từ Unsplash** (độ dài chỉ khoảng 90 ký tự, vượt qua kiểm tra của DB).
* **Đề xuất cho PM/DevOps**: 
  - Cần tạo một **Supabase Storage Bucket** công khai (ví dụ: `property-images`) và cấu hình chính sách RLS (Row Level Security) cho phép upload.
  - Khi deploy, cập nhật hàm `saveBase64Image` để chuyển sang upload ảnh nhị phân trực tiếp lên Bucket này thay vì trả về ảnh Unsplash ngẫu nhiên.

---

## 2. Bỏ qua điều kiện bắt buộc tải ảnh (Frontend Mock)
* **Vấn đề gốc**: Để tiến sang Step 3 (Hiển thị & Đăng tin), người dùng bắt buộc phải đăng tải ít nhất 1 hình ảnh (nút "Tiếp theo" ở Step 2 bị disabled nếu số lượng ảnh bằng 0).
* **Giải pháp tạm thời**:
  - Tại file [CreateListingWizard.jsx](file:///c:/Users/tunbi/School/SU26/exe/cp3/RealEstate_Project/src/features/agent/create-listing/CreateListingWizard.jsx#L881), chúng tôi đã chỉnh sửa điều kiện nút "Tiếp theo" thành `disabled={false}` để các nhà phát triển/kiểm thử có thể test nhanh luồng điền thông tin mà không cần chuẩn bị sẵn file ảnh.
* **Đề xuất cho PM/DevOps**:
  - Khi hoàn thiện sản phẩm thương mại, khôi phục lại dòng kiểm tra điều kiện ảnh: `disabled={currentStep === 2 && newListing.images.length === 0}` để đảm bảo bài đăng thực tế luôn có đầy đủ hình ảnh đại diện.

---

## 3. Khớp ràng buộc Loại Bất Động Sản (Properties Check Constraint)
* **Vấn đề gốc**: Database của team định cấu hình Check Constraint `properties_property_type_check` chỉ chấp nhận 6 giá trị: `Căn Hộ`, `Chung Cư`, `Nhà Ở`, `Mặt Bằng`, `Văn Phòng`, `Phòng Trọ`. Tuy nhiên dropdown trên giao diện ban đầu chứa các loại không hợp lệ như `Studio`, `Biệt Thự`, `Nhà Phố`, `Đất Nền`.
* **Giải pháp**: 
  - Đã cập nhật dropdown hiển thị trên giao diện của [CreateListingWizard.jsx](file:///c:/Users/tunbi/School/SU26/exe/cp3/RealEstate_Project/src/features/agent/create-listing/CreateListingWizard.jsx#L43) và bộ lọc ở [OverviewDashboard.jsx](file:///c:/Users/tunbi/School/SU26/exe/cp3/RealEstate_Project/src/features/agent/overview/OverviewDashboard.jsx#L26) khớp hoàn toàn với Check Constraint của database.
* **Đề xuất cho PM/DevOps**:
  - Nếu PM muốn bổ sung các loại hình như `Studio`, `Biệt Thự`... vào ứng dụng, cần chạy migration SQL để cập nhật lại Check Constraint trong Postgres Supabase trước.
