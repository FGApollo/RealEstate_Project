# Email xác thực SwipeNest

`verification.html` là mẫu HTML cho đăng ký và gửi lại email xác thực. Bố cục theo bản thiết kế đã duyệt; hình mascot dùng nguyên phần minh họa trong ảnh mẫu, logo xuất từ `src/components/SwipeNestMark.jsx`.

- Phần chữ, nút xác thực và liên hệ hỗ trợ là HTML thật. Token vẫn nằm trong fragment `#token=…` của liên kết xác thực.
- Các PNG trong `assets/` được gắn vào MIME bằng `Content-ID`, không cần host ảnh hoặc thêm biến môi trường.
- Email có cả `text/plain` và HTML; nút có phương án VML cho Outlook. CSS inline giữ bố cục cơ bản, media query điều chỉnh màn hình nhỏ.
- Email đặt lại mật khẩu tiếp tục dùng nội dung riêng.

Tạo bản xem trước độc lập, không gửi thư:

```bash
node server/scripts/preview-verification-email.cjs
```

Mở `output/email-verification/verification-preview.html` trong trình duyệt. File preview dùng URL mẫu không kích hoạt tài khoản.

Kiểm tra MIME, liên kết và nội dung:

```bash
node --test server/tests/emailService.test.js server/tests/verificationEmail.test.js
```
