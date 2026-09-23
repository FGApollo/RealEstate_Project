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

const Login = () => {
  const navigate = useNavigate();
  const { completeLogin } = useAuth();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const successMessage = location.state?.message;

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Standard Login
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
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
      title="Chào mừng trở lại" 
      subtitle="Đăng nhập để khám phá những không gian sống đẳng cấp."
    >
      <form onSubmit={handleSubmit}>
        {successMessage && <div style={{ color: 'green', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{successMessage}</div>}
        {error && <div style={{ color: 'red', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

        <Input 
          label="EMAIL"
          icon={User}
          name="email"
          placeholder="Nhập địa chỉ email"
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

        <div style={{ marginTop: '2rem' }}>
          <Button type="submit" fullWidth variant="primary" disabled={isLoading}>
            {isLoading ? 'Đang xử lý...' : 'Đăng nhập'}
          </Button>
        </div>
      </form>

      <div className="divider">HOẶC TIẾP TỤC VỚI</div>

      <GoogleAuthButton intent="LOGIN" onError={setError} />

      <div className="auth-footer">
        <div>Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link></div>
        <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          Bạn là Môi giới? <Link to="/login/agent">Đăng nhập cổng Môi giới</Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;

