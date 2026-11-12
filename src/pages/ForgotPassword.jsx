import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';

const GENERIC_MESSAGE = 'Nếu email này thuộc một tài khoản Swipe Nest, liên kết đặt lại mật khẩu sẽ được gửi đến hộp thư đó trong ít phút.';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        signal: AbortSignal.timeout(20_000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(response.status === 400
          ? 'Email không hợp lệ.'
          : data.error || 'Chưa thể gửi yêu cầu. Vui lòng thử lại sau.');
      }
      setSentMessage(data.message || GENERIC_MESSAGE);
    } catch (err) {
      setError(err instanceof TypeError || err.name === 'TimeoutError'
        ? 'Không thể kết nối tới máy chủ. Vui lòng thử lại.'
        : err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Khôi phục mật khẩu"
      subtitle="Nhập email tài khoản của bạn để nhận liên kết đặt lại mật khẩu."
    >
      {sentMessage ? (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: '#ecfdf5', borderRadius: '50%', color: '#10b981', marginBottom: '1rem' }}>
            <CheckCircle2 size={36} />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
            Kiểm tra email của bạn
          </h3>
          <p role="status" style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            {sentMessage} Liên kết dùng một lần và hết hạn sau 30 phút. Nhớ xem cả mục thư rác.
          </p>
          <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 500, fontSize: '0.9rem', textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Quay lại trang đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <div role="alert" style={{ color: 'crimson', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

          <Input
            label="EMAIL ĐĂNG KÝ"
            icon={Mail}
            name="email"
            placeholder="name@example.com"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div style={{ marginTop: '2rem' }}>
            <Button type="submit" fullWidth variant="primary" disabled={isLoading}>
              {isLoading ? 'Đang gửi...' : 'Gửi liên kết khôi phục'}
            </Button>
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.875rem', textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Quay lại đăng nhập
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
