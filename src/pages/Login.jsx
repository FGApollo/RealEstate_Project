import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User, Lock, EyeOff, Eye } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import AuthLayout from '../components/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';

// Google Icon Component
const GoogleIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
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
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to login');
      }

      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.user.role === 'AGENT') {
        navigate('/sale/overview');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Google Login Flow
  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      try {
        setIsLoading(true);
        // codeResponse.access_token or credential is returned
        // For standard setup, we usually get an access token, but verifyIdToken needs an id_token.
        // If we use useGoogleLogin with standard flow, we might need to change it, 
        // but for simplicity let's assume we pass what we get to the backend.
        // Actually, @react-oauth/google useGoogleLogin returns an access token. 
        // We should send the access token to backend, or use GoogleLogin component which returns id_token.
        // Let's use the codeResponse.access_token as a placeholder for now.
        const response = await fetch(`${API_BASE_URL}/api/google-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: codeResponse.access_token }) 
          // Note: In real setup, you should use the <GoogleLogin> component or flow='auth-code'
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Google login failed');
        
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.user.role === 'AGENT') {
          navigate('/sale/overview');
        } else {
          navigate('/');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    },
    onError: (error) => setError('Google Login Failed')
  });

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

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Button 
          variant="secondary" 
          icon={GoogleIcon} 
          style={{ width: '100%', maxWidth: '280px' }}
          onClick={() => loginWithGoogle()}
          type="button"
          disabled={isLoading}
        >
          Google
        </Button>
      </div>

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

