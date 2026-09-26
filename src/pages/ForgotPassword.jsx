import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Simulate/trigger password recovery flow
      await new Promise(resolve => setTimeout(resolve, 800));
      setIsSubmitted(true);
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout 
      title="Khôi phục mật khẩu" 
      subtitle="Nhập email tài khoản của bạn để nhận liên kết đặt lại mật khẩu."
    >
      {isSubmitted ? (
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ display: 'inline-flex', padding: '12px', background: '#ecfdf5', borderRadius: '50%', color: '#10b981', marginBottom: '1rem' }}>
            <CheckCircle2 size={36} />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
            Kiểm tra email của bạn
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến địa chỉ <strong>{email}</strong>. Vui lòng kiểm tra hộp thư đến hoặc mục thư rác.
          </p>
          <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 500, fontSize: '0.9rem', textDecoration: 'none' }}>
            <ArrowLeft size={16} /> Quay lại trang đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <div style={{ color: 'red', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

          <Input 
            label="EMAIL ĐĂNG KÝ"
            icon={Mail}
            name="email"
            placeholder="name@example.com"
            type="email"
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
