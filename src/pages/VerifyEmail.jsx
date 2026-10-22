import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import Button from '../components/ui/Button';
import { API_BASE_URL } from '../config';

const VerifyEmail = () => {
  const token = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '', []);
  const [status, setStatus] = useState('ready');
  const [message, setMessage] = useState('');

  const handleVerify = async () => {
    if (!token || status === 'loading') return;
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(20_000)
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === 'VERIFICATION_TOKEN_INVALID') {
          setStatus('invalid');
          setMessage(data.error || 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.');
          return;
        }
        throw new Error(data.error || 'Chưa thể xác minh email. Vui lòng thử lại.');
      }
      window.history.replaceState(null, '', window.location.pathname);
      setStatus('success');
      setMessage(data.message);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof TypeError || error.name === 'TimeoutError'
        ? 'Không thể kết nối để xác minh email. Vui lòng thử lại.'
        : error.message);
    }
  };

  return (
    <AuthLayout title="Xác minh email" subtitle="Hoàn tất xác minh để kích hoạt đăng nhập.">
      {!token && <p role="alert">Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại email xác minh.</p>}
      {message && <p role="status" style={{ textAlign: 'center', color: status === 'success' ? 'green' : 'crimson' }}>{message}</p>}
      {token && (status === 'ready' || status === 'error') && (
        <Button type="button" fullWidth variant="primary" onClick={handleVerify}>
          {status === 'error' ? 'Thử lại xác minh' : 'Xác minh email'}
        </Button>
      )}
      {status === 'loading' && <p role="status" style={{ textAlign: 'center' }}>Đang xác minh...</p>}
      {status === 'success' ? (
        <p style={{ textAlign: 'center' }}><Link to="/login">Đăng nhập</Link></p>
      ) : (
        <p style={{ textAlign: 'center' }}><Link to="/resend-verification">Gửi lại email xác minh</Link></p>
      )}
    </AuthLayout>
  );
};

export default VerifyEmail;
