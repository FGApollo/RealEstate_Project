import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Lock, EyeOff, Eye, Mail } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import GoogleAuthButton from '../components/GoogleAuthButton';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';

const Register = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, intent: 'USER_SIGNUP' })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register');
      }

      navigate('/login', { state: { message: 'Đăng ký thành công! Vui lòng đăng nhập.' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout 
      title="Tạo tài khoản mới" 
      subtitle="Gia nhập cộng đồng Swipe Nest ngay hôm nay."
    >
      <form onSubmit={handleSubmit}>
        {error && <div style={{ color: 'red', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}
        
        <Input 
          label="HỌ VÀ TÊN"
          icon={User}
          name="name"
          placeholder="Nhập họ và tên của bạn"
          type="text"
          value={formData.name}
          onChange={handleChange}
          required
        />

        <Input 
          label="EMAIL"
          icon={Mail}
          name="email"
          placeholder="Nhập địa chỉ email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
        />
        
        <Input 
          label="MẬT KHẨU"
          icon={Lock}
          name="password"
          rightIcon={showPassword ? Eye : EyeOff}
          onRightIconClick={togglePasswordVisibility}
          placeholder="Tạo mật khẩu"
          type={showPassword ? "text" : "password"}
          value={formData.password}
          onChange={handleChange}
          required
        />

        <div style={{ marginTop: '2rem' }}>
          <Button type="submit" fullWidth variant="primary" disabled={isLoading}>
            {isLoading ? 'Đang xử lý...' : 'Đăng ký'}
          </Button>
        </div>
      </form>

      <div className="divider">HOẶC ĐĂNG KÝ VỚI</div>

      <GoogleAuthButton intent="USER_SIGNUP" onError={setError} />

      <div className="auth-footer">
        <div>Đã có tài khoản? <Link to="/login">Đăng nhập</Link></div>
        <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          Bạn muốn đăng ký làm Môi giới? <Link to="/register/agent">Đăng ký tại đây</Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Register;

