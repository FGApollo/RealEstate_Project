import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Lock, EyeOff, Eye, Mail, Phone } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import GoogleAuthButton from '../components/GoogleAuthButton';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';
import { validateRegistration, normalizeVietnamPhone } from '../auth/registrationValidation';

const RegisterAgent = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
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
    const validationErrors = validateRegistration({ ...formData, intent: 'AGENT_SIGNUP' });
    if (Object.keys(validationErrors).length) {
      setError(Object.values(validationErrors)[0]);
      return;
    }
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email.trim().toLowerCase(),
          phone: normalizeVietnamPhone(formData.phone),
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          intent: 'AGENT_SIGNUP'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register');
      }

      navigate('/login/agent', { state: { message: data.message, email: formData.email } });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout 
      theme="agent"
      title="Đăng Ký Thành Viên Môi Giới" 
      subtitle="Tham gia cộng đồng môi giới chuyên nghiệp để quản lý và đăng tin nhà đất chất lượng cao."
    >
      <form onSubmit={handleSubmit}>
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.875rem', textAlign: 'center', fontWeight: 600 }}>{error}</div>}
        
        <Input 
          label="HỌ VÀ TÊN"
          icon={User}
          name="name"
          placeholder="Nhập họ và tên của bạn"
          type="text"
          value={formData.name}
          onChange={handleChange}
          autoComplete="name"
          required
        />

        <Input 
          label="EMAIL CÁ NHÂN / CÔNG VIỆC"
          icon={Mail}
          name="email"
          placeholder="email@example.com"
          type="email"
          value={formData.email}
          onChange={handleChange}
          autoComplete="email"
          required
        />

        <Input 
          label="SỐ ĐIỆN THOẠI CHÍNH CHỦ"
          icon={Phone}
          name="phone"
          placeholder="Nhập số điện thoại liên hệ"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          autoComplete="tel"
          required
        />
        
        <Input 
          label="MẬT KHẨU"
          icon={Lock}
          name="password"
          rightIcon={showPassword ? Eye : EyeOff}
          onRightIconClick={togglePasswordVisibility}
          placeholder="Tạo mật khẩu đăng nhập"
          type={showPassword ? "text" : "password"}
          value={formData.password}
          onChange={handleChange}
          autoComplete="new-password"
          required
        />

        <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0.35rem 0 1rem' }}>
          Mật khẩu tối thiểu 15 ký tự; không cần quy tắc ký tự hoa/số/ký hiệu.
        </p>

        <Input
          label="XÁC NHẬN MẬT KHẨU"
          icon={Lock}
          name="confirmPassword"
          placeholder="Nhập lại mật khẩu"
          type="password"
          value={formData.confirmPassword}
          onChange={handleChange}
          autoComplete="new-password"
          required
        />

        <div style={{ marginTop: '2.5rem' }}>
          <Button type="submit" fullWidth variant="primary" disabled={isLoading}>
            {isLoading ? 'Đang xử lý...' : 'Đăng ký tài khoản Agent'}
          </Button>
        </div>
      </form>

      <div className="divider">HOẶC ĐĂNG KÝ VỚI</div>
      <p style={{ textAlign: 'center', fontSize: '0.85rem' }}>
        Đăng ký bằng Google chỉ cần nhập số điện thoại; tên và email lấy từ tài khoản Google đã xác minh.
      </p>
      <GoogleAuthButton intent="AGENT_SIGNUP" phone={formData.phone} onError={setError} />

      <div className="auth-footer">
        <div>Đã có tài khoản Môi giới? <Link to="/login/agent">Đăng nhập</Link></div>
        <div style={{ marginTop: '1rem', fontSize: '0.85rem' }}>
          Bạn là Khách hàng? <Link to="/register" style={{ color: '#a5b4fc' }}>Vào trang đăng ký cho Khách hàng</Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default RegisterAgent;
