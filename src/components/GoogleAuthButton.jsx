import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { useAuth } from '../auth/useAuth';
import { roleDestination } from '../auth/roleDestination';

const GoogleAuthButton = ({ intent, phone, onError }) => {
  const [busy, setBusy] = useState(false);
  const [pendingCredential, setPendingCredential] = useState(null);
  const [linkPassword, setLinkPassword] = useState('');
  const { completeLogin } = useAuth();
  const navigate = useNavigate();

  const submitCredential = async (credential, password = null) => {
    setBusy(true);
    onError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          credential,
          intent,
          ...(intent === 'AGENT_SIGNUP' ? { phone: phone.trim() } : {}),
          ...(password ? { linkPassword: password } : {})
        })
      });
      const data = await response.json();
      if (response.status === 409 && data.code === 'PASSWORD_LINK_REQUIRED') {
        setPendingCredential(credential);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Google authentication failed');

      setPendingCredential(null);
      setLinkPassword('');
      completeLogin(data);
      navigate(roleDestination(data.user.role));
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSuccess = (googleResponse) => {
    if (!googleResponse.credential) {
      onError('Google không trả về ID token. Vui lòng thử lại.');
      return;
    }
    submitCredential(googleResponse.credential);
  };

  const confirmExistingAccount = (event) => {
    event.preventDefault();
    if (pendingCredential && linkPassword) submitCredential(pendingCredential, linkPassword);
  };

  if (intent === 'AGENT_SIGNUP' && !phone?.trim()) {
    return <p role="note" style={{ textAlign: 'center' }}>Nhập số điện thoại trước khi đăng ký bằng Google.</p>;
  }

  return (
    <div aria-busy={busy} style={{ display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      {pendingCredential ? (
        <form onSubmit={confirmExistingAccount} style={{ display: 'grid', gap: '0.5rem' }}>
          <label htmlFor="google-link-password">Xác nhận mật khẩu tài khoản hiện có để liên kết Google</label>
          <input
            id="google-link-password"
            type="password"
            autoComplete="current-password"
            value={linkPassword}
            onChange={(event) => setLinkPassword(event.target.value)}
            required
          />
          <button type="submit" disabled={busy}>Xác nhận và tiếp tục</button>
          <button type="button" onClick={() => { setPendingCredential(null); setLinkPassword(''); }}>Hủy</button>
        </form>
      ) : busy ? <span>Đang xác thực Google...</span> : (
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => onError('Không thể đăng nhập Google. Vui lòng thử lại.')}
          text={intent === 'LOGIN' ? 'continue_with' : 'signup_with'}
        />
      )}
    </div>
  );
};

export default GoogleAuthButton;
