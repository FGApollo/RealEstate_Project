import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Lock, EyeOff, Eye } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import GoogleAuthButton from '../components/GoogleAuthButton';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';
import { useAuth } from '../auth/useAuth';
import { roleDestination } from '../auth/roleDestination';

const LoginAgent = () => {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const successMessage = location.state?.message;

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        setNeedsVerification(data.code === 'EMAIL_VERIFICATION_REQUIRED');
        throw new Error(data.error || 'Failed to login');
      }

      completeLogin(data);
      navigate(roleDestination(data.user.role));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const labelWithForgot = (
    <>
      <span>MẬT KHẨU</span>
      <Link to="/forgot-password" className="forgot-password">Quên mật khẩu?</Link>
    </>
  );

  return (
    <AuthLayout 
      theme="agent"
      title="Cổng Môi Giới Chuyên Nghiệp" 
      subtitle="Đăng nhập hệ thống quản lý bất động sản và khách hàng Swipe Nest."
    >
      <form onSubmit={handleSubmit}>
        {successMessage && <div style={{ color: '#10b981', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center', fontWeight: 600 }}>{successMessage}</div>}
        {successMessage && location.state?.email && (
          <p style={{ textAlign: 'center', fontSize: '0.85rem' }}>
            <Link to="/resend-verification" state={{ email: location.state.email }}>Chưa nhận được email? Gửi lại</Link>
          </p>
        )}
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center', fontWeight: 600 }}>{error}</div>}
        {needsVerification && (
          <p style={{ textAlign: 'center', fontSize: '0.85rem' }}>
            <Link to="/resend-verification" state={{ email: formData.email }}>Gửi lại email xác minh</Link>
          </p>
        )}

        <Input 
          label="EMAIL DOANH NGHIỆP / CÁ NHÂN"
          icon={User}
          name="email"
          placeholder="email@example.com"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
        />
        
        <Input 
          label={labelWithForgot}
          icon={Lock}
          name="password"
          rightIcon={showPassword ? Eye : EyeOff}
          onRightIconClick={togglePasswordVisibility}
          placeholder="••••••••"
          type={showPassword ? "text" : "password"}
          value={formData.password}
          onChange={handleChange}
          required
        />

        <div style={{ marginTop: '2.5rem' }}>
          <Button type="submit" fullWidth variant="primary" disabled={isLoading}>
            {isLoading ? 'Đang xác thực...' : 'Đăng nhập Môi giới'}
          </Button>
        </div>
      </form>

      <div className="divider">HOẶC TIẾP TỤC VỚI</div>
      <GoogleAuthButton intent="LOGIN" onError={setError} />

      <div className="auth-footer">
        <div>Chưa có tài khoản Agent? <Link to="/register/agent">Đăng ký tại đây</Link></div>
        <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          Bạn là Khách hàng? <Link to="/login" style={{ color: '#a5b4fc' }}>Vào trang Khách hàng</Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default LoginAgent;
