# 📋 Báo cáo Trạng thái Branch `add/sale-upload-properties`

> **Branch**: `add/sale-upload-properties` → so sánh từ `main`  
> **Cập nhật lần cuối**: 2026-06-30  
> **Mục đích**: Tổng hợp những gì đã làm, những gì còn tạm (temp/mock/todo) để PM và DevOps nắm thông tin.

---

## 📁 Danh sách file thay đổi so với `main`

| File | Loại thay đổi | Ghi chú |
|---|---|---|
| `server/controllers/propertyController.js` | Sửa | Fix quyền tạo listing theo `owner_id` |
| `server/index.js` | Sửa | Thêm route agent overview |
| `server/routes/propertyRoutes.js` | Sửa | Thêm route mới |
| `server/services/agentService.js` | Sửa | Fix filter theo `owner_id` thực thay vì hardcode |
| `server/services/propertyService.js` | Sửa | **⚠️ Chứa mock Unsplash** — xem mục 1 |
| `src/features/agent/create-listing/CreateListingWizard.css` | Mới | Toàn bộ CSS wizard tạo tin |
| `src/features/agent/create-listing/CreateListingWizard.jsx` | Mới | Wizard tạo tin 3 bước + map Leaflet |
| `src/features/agent/overview/OverviewDashboard.css` | Mới | CSS dashboard agent |
| `src/features/agent/overview/OverviewDashboard.jsx` | Mới | Dashboard agent (overview + listings tab) |
| `src/pages/AgentOverview.css` | Sửa | Layout sidebar + topbar redesign |
| `src/pages/AgentOverview.jsx` | Sửa | Layout shell + conditional topbar |
| `temp_solutions_notice.md` | Mới | File này |

---

## ✅ Những gì đã hoàn thành

### 🎨 UI / Frontend
- **Sidebar**: Màu xám nhạt macOS-style, nav item active là pill xanh, Help Center + Log Out ở dưới
- **Topbar (Overview)**: Header gradient xanh nhạt, search bar pill bo tròn, ẩn trên tab Listings
- **Property card**: Full-image immersive card, badge xác thực, gradient overlay, hover action icons (Xem/Sửa/Xoá)
- **Filter bar**: Nút xanh lá "Bộ lọc", bấm mở dropdown panel macOS glass (blur + bo góc lớn + no border)
- **Create Listing Wizard**: 3 bước (Thông tin → Hình ảnh → Xem trước & Đăng)
- **Map tích hợp**: Leaflet + OpenStreetMap, picker center, reverse geocoding Nominatim
- **Địa chỉ cascade**: Tỉnh/Thành → Quận/Huyện → Phường/Xã từ `provinces.open-api.vn`
- **Tự động lấy vị trí**: HTML5 Geolocation + reverse geocoding thực

### 🔧 Backend / Logic
- **Fix FK violation**: `owner_id` lấy từ `currentUser.id` thay vì hardcode
- **Fix role check**: Chỉ user có role `AGENT` mới được tạo listing
- **Fix overview filter**: Agent chỉ thấy properties của mình (lọc theo `owner_id`)
- **LocalStorage sync**: `currentUser` lấy từ `localStorage.getItem('user')` — login đúng user

---

## ⚠️ Những gì còn là TEMP / MOCK / TODO

### 1. Lưu trữ hình ảnh bằng URL Unsplash (Backend Mock)

- **File**: [`server/services/propertyService.js`](file:///c:/Users/tunbi/School/SU26/exe/cp3/RealEstate_Project/server/services/propertyService.js)
- **Vấn đề**: Cột `thumbnail` (varchar 500) không chứa được Base64. Backend đang bỏ Base64 và thay bằng URL Unsplash ngẫu nhiên.
- **TODO cho DevOps**:
  - Tạo **Supabase Storage Bucket** công khai (ví dụ: `property-images`)
  - Cấu hình RLS policy cho phép upload
  - Cập nhật hàm `saveBase64Image` để upload lên Bucket thay vì trả về Unsplash URL

---

### 2. Nút "Tiếp theo" Step 2 bị bỏ qua điều kiện ảnh (Frontend Mock)

- **File**: [`src/features/agent/create-listing/CreateListingWizard.jsx`](file:///c:/Users/tunbi/School/SU26/exe/cp3/RealEstate_Project/src/features/agent/create-listing/CreateListingWizard.jsx)
- **Vấn đề**: Điều kiện `disabled` đang là `false` để dev test nhanh không cần upload ảnh.
- **TODO**: Khi production, khôi phục lại:
  ```jsx
  disabled={currentStep === 2 && newListing.images.length === 0}
  ```

---

### 3. Loại bất động sản bị giới hạn bởi DB constraint (Đã fix, nhưng cần migration nếu mở rộng)

- **Vấn đề**: DB Check Constraint `properties_property_type_check` chỉ nhận 6 giá trị: `Căn Hộ`, `Chung Cư`, `Nhà Ở`, `Mặt Bằng`, `Văn Phòng`, `Phòng Trọ`.
- **Đã fix**: Dropdown UI đã khớp với constraint.
- **TODO nếu mở rộng**: Chạy migration SQL trên Supabase để thêm giá trị mới trước khi cập nhật UI.

---

### 4. Phân cấp hành chính dùng API bên thứ 3 (Dependency ngoài)

- **File**: [`src/features/agent/create-listing/CreateListingWizard.jsx`](file:///c:/Users/tunbi/School\SU26\exe\cp3\RealEstate_Project\src\features\agent\create-listing\CreateListingWizard.jsx)
- **API đang dùng**: `https://provinces.open-api.vn/api/` (miễn phí, cộng đồng)
- **Rủi ro**: API này không có SLA, có thể ngừng hoạt động bất kỳ lúc nào.
- **TODO**: Nếu muốn production-ready, nên:
  - Self-host data hành chính (có file JSON tĩnh trên GitHub)
  - Hoặc dùng API có trả phí / ký hợp đồng

---

### 5. Geocoding dùng Nominatim (OpenStreetMap) — Rate limit

- **File**: [`src/features/agent/create-listing/CreateListingWizard.jsx`](file:///c:/Users/tunbi/School/SU26/exe/cp3/RealEstate_Project/src/features/agent/create-listing/CreateListingWizard.jsx)
- **API đang dùng**: `https://nominatim.openstreetmap.org/` (miễn phí, cộng đồng)
- **Giới hạn**: Max 1 request/giây, không được dùng thương mại nếu traffic cao
- **TODO**: Nếu scale lên, cần chuyển sang:
  - **Google Maps Geocoding API** (trả phí, chính xác hơn)
  - **Mapbox Geocoding** (có free tier hào phóng hơn)
  - Hoặc self-host Nominatim

---

### 6. Chưa có tính năng Phân tích & Cài đặt

- Tab **Phân tích** và **Cài đặt** trong sidebar hiện đang redirect về Overview (chưa implement)
- **TODO**: Implement sau theo roadmap

---

### 7. Action icons trên property card chưa có chức năng

- Nút **Xem chi tiết**, **Chỉnh sửa**, **Xoá tin** khi hover card hiện chưa nối logic
- **TODO**: Kết nối với route edit/delete listing và modal confirm xoá

---

## 🗓️ Commits trên branch này (so với main)

```
1e2c0ba  update sale add UI
18bc175  Merge branch 'main' into add/sale-upload-properties
c73a38e  fix login
0286a70  fix verified banner
```
