import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';

const GENERIC_MESSAGE = 'Nếu tài khoản cần xác minh, hướng dẫn sẽ được gửi đến email đó.';

const ResendVerification = () => {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not process the request.');
      setMessage(data.message || GENERIC_MESSAGE);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="Gửi lại email xác minh" subtitle="Nhập email bạn đã dùng để đăng ký.">
      <form onSubmit={handleSubmit}>
        {message && <p role="status" style={{ color: 'green', textAlign: 'center' }}>{message}</p>}
        {error && <p role="alert" style={{ color: 'crimson', textAlign: 'center' }}>{error}</p>}
        <Input
          label="EMAIL"
          icon={Mail}
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Button type="submit" fullWidth variant="primary" disabled={isLoading}>
          {isLoading ? 'Đang gửi...' : 'Gửi lại hướng dẫn'}
        </Button>
      </form>
      <p className="auth-footer"><Link to="/login">Quay lại đăng nhập</Link></p>
    </AuthLayout>
  );
};

export default ResendVerification;
