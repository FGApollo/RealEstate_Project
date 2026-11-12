import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';
import { validateRegistration } from '../auth/registrationValidation';

// Thông báo kiểm tra mật khẩu của backend/validator dùng tiếng Anh; hiển thị bằng tiếng Việt.
const PASSWORD_MESSAGES = [
  [/at least 10/i, 'Mật khẩu cần tối thiểu 10 ký tự.'],
  [/less common/i, 'Mật khẩu quá phổ biến, hãy chọn mật khẩu khác.'],
  [/72/, 'Mật khẩu quá dài (tối đa 72 byte).'],
  [/only spaces/i, 'Mật khẩu không được chỉ gồm khoảng trắng.'],
  [/do not match/i, 'Mật khẩu nhập lại không khớp.']
];
const toVietnamese = (message) => PASSWORD_MESSAGES.find(([pattern]) => pattern.test(message || ''))?.[1] || message;

const ResetPassword = () => {
  // Token nằm sau dấu # nên không bị gửi lên server khi tải trang; xóa khỏi thanh địa chỉ sau khi đọc.
  const token = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '', []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(token ? 'ready' : 'invalid');
  const [message, setMessage] = useState(token ? '' : 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === 'loading') return;
    // Dùng chung quy tắc mật khẩu với form đăng ký (chỉ lấy lỗi của 2 trường mật khẩu).
    const errors = validateRegistration({ name: 'x', email: 'a@b.co', password, confirmPassword, intent: 'USER_SIGNUP' });
    const localError = errors.password || errors.confirmPassword;
    if (localError) {
      setStatus('ready');
      setMessage(toVietnamese(localError));
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
        signal: AbortSignal.timeout(20_000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === 'RESET_TOKEN_INVALID') {
          window.history.replaceState(null, '', window.location.pathname);
          setStatus('invalid');
          setMessage(data.error);
          return;
        }
        const fieldError = data.errors?.password || data.errors?.confirmPassword;
        throw new Error(fieldError ? toVietnamese(fieldError) : data.error || 'Chưa thể đặt lại mật khẩu. Vui lòng thử lại.');
      }
      window.history.replaceState(null, '', window.location.pathname);
      setStatus('success');
      setMessage(data.message);
    } catch (error) {
      setStatus('ready');
      setMessage(error instanceof TypeError || error.name === 'TimeoutError'
        ? 'Không thể kết nối tới máy chủ. Vui lòng thử lại.'
        : error.message);
    }
  };

  if (status === 'success' || status === 'invalid') {
    const ok = status === 'success';
    return (
      <AuthLayout title="Đặt lại mật khẩu" subtitle={ok ? 'Hoàn tất.' : 'Liên kết không dùng được.'}>
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          {ok && (
            <div style={{ display: 'inline-flex', padding: '12px', background: '#ecfdf5', borderRadius: '50%', color: '#10b981', marginBottom: '1rem' }}>
              <CheckCircle2 size={36} />
            </div>
          )}
          <p role={ok ? 'status' : 'alert'} style={{ color: ok ? '#166534' : 'crimson', lineHeight: 1.5 }}>{message}</p>
          <p style={{ marginTop: '1.25rem' }}>
            {ok ? <Link to="/login">Đăng nhập</Link> : <Link to="/forgot-password">Gửi lại liên kết đặt lại mật khẩu</Link>}
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản Swipe Nest của bạn.">
      <form onSubmit={handleSubmit}>
        {message && <p role="alert" style={{ color: 'crimson', textAlign: 'center' }}>{message}</p>}
        <Input
          label="MẬT KHẨU MỚI"
          icon={Lock}
          name="password"
          rightIcon={showPassword ? Eye : EyeOff}
          onRightIconClick={() => setShowPassword((value) => !value)}
          rightIconLabel={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          placeholder="Tạo mật khẩu mới"
          type={showPassword ? 'text' : 'password'}
          minLength={10}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
        <p className="auth-password-hint">Tối thiểu 10 ký tự. Bạn có thể dùng một cụm từ dễ nhớ.</p>
        <Input
          label="NHẬP LẠI MẬT KHẨU MỚI"
          icon={Lock}
          name="confirmPassword"
          placeholder="Nhập lại mật khẩu mới"
          type="password"
          minLength={10}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
        <div className="auth-submit-row">
          <Button type="submit" fullWidth variant="primary" disabled={status === 'loading'}>
            {status === 'loading' ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
          </Button>
        </div>
      </form>
      <p className="auth-footer"><Link to="/login">Quay lại đăng nhập</Link></p>
    </AuthLayout>
  );
};

export default ResetPassword;
