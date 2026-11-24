import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, Calendar, Camera, Check, CheckCircle2,
  ChevronDown, Clock, Crown, Eye, EyeOff, Gem, Heart, Loader2, Lock,
  LogOut, Mail, MessageSquare, Phone, Save, Shield, ShieldCheck,
  SlidersHorizontal, Sparkles, User
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import { fetchPlusStatus } from '../features/plus/plusApi';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import PageWaveBackground from '../components/PageWaveBackground';
import heroVillaArt from '../assets/profile-hero-villa.webp';
import {
  formatProfileDate,
  getRoleLabel,
  validateAvatarFile,
  validatePasswordForm,
  validateProfileForm
} from './userProfileValidation';
import './UserProfile.css';

// Reusable form field with leading icon, optional trailing icon / password eye toggle, and hint text.
const ProfileField = ({
  id,
  label,
  required = false,
  icon: Icon,
  trailingIcon: TrailingIcon,
  trailingTitle,
  hint,
  fullWidth = false,
  disabled = false,
  passwordToggle = false,
  showPassword = false,
  onTogglePassword,
  ...inputProps
}) => (
  <div className={`uprofile-form-group ${fullWidth ? 'uprofile-field-full' : ''}`.trim()}>
    <label htmlFor={id}>
      {label} {required && <span className="uprofile-required">*</span>}
    </label>
    <div className={`uprofile-input-container ${disabled ? 'disabled' : ''}`.trim()}>
      <div className="uprofile-leading-icon"><Icon size={18} /></div>
      <input
        id={id}
        className="uprofile-input-field"
        disabled={disabled}
        readOnly={disabled}
        required={required}
        {...inputProps}
      />
      {passwordToggle ? (
        <button
          type="button"
          className="uprofile-eye-btn"
          onClick={onTogglePassword}
          aria-label={showPassword ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      ) : TrailingIcon ? (
        <div className="uprofile-trailing-icon" title={trailingTitle} aria-hidden={!trailingTitle || undefined}>
          <TrailingIcon size={15} />
        </div>
      ) : null}
    </div>
    {hint && <span className="uprofile-hint-text">{hint}</span>}
  </div>
);

const FormAlert = ({ message }) => {
  if (!message?.text) return null;
  return (
    <div className={`uprofile-alert ${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
      {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{message.text}</span>
    </div>
  );
};

export default function UserProfile() {
  const navigate = useNavigate();
  const { user: authUser, updateUser, logout, expireSession } = useAuth();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('info');
  const [profile, setProfile] = useState(null);
  const [plusStatus, setPlusStatus] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState({ type: '', text: '' });

  const isRegularUser = String(profile?.role || authUser?.role || '').toUpperCase() === 'USER';

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        const res = await apiFetch(`${API_BASE_URL}/api/users/profile`);
        if (!res.ok) throw new Error('Không thể tải thông tin tài khoản');
        const data = await res.json();
        if (mounted && data.user) {
          setProfile(data.user);
          setName(data.user.name || '');
          setPhone(data.user.phone || '');
        }
      } catch (err) {
        console.error('Fetch profile error:', err);
        if (mounted && authUser) {
          setProfile(authUser);
          setName(authUser.name || '');
          setPhone(authUser.phone || '');
        }
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };

    const loadPlusStatus = async () => {
      if (String(authUser?.role || '').toUpperCase() !== 'USER') return;
      try {
        const data = await fetchPlusStatus({ signal: controller.signal });
        if (mounted && data?.plus) setPlusStatus(data.plus);
      } catch {
        // Supplementary tier badge; falls back cleanly to standard tier.
      }
    };

    loadProfile();
    loadPlusStatus();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authUser]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarNotice({ type: '', text: '' });

    const validationError = validateAvatarFile(file);
    if (validationError) {
      setAvatarNotice({ type: 'error', text: validationError });
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await apiFetch(`${API_BASE_URL}/api/users/avatar`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tải ảnh đại diện thất bại');

      setProfile((prev) => ({ ...prev, avatar: data.avatar }));
      updateUser({ avatar: data.avatar });
      setAvatarNotice({ type: 'success', text: 'Cập nhật ảnh đại diện thành công!' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setAvatarNotice({ type: 'error', text: err.message || 'Lỗi khi tải ảnh lên, vui lòng thử lại' });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileMessage({ type: '', text: '' });

    const validated = validateProfileForm({ name, phone });
    if (validated.error) {
      setProfileMessage({ type: 'error', text: validated.error });
      return;
    }

    try {
      setIsSavingProfile(true);
      const res = await apiFetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: validated.name, phone: validated.phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cập nhật thất bại');

      setProfile((prev) => ({ ...prev, ...data.user }));
      updateUser({ name: data.user.name, phone: data.user.phone });
      setProfileMessage({ type: 'success', text: 'Cập nhật thông tin thành công!' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err.message || 'Lỗi khi cập nhật thông tin' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    const validationError = validatePasswordForm({
      hasPassword: Boolean(profile?.has_password),
      currentPassword: passwords.current,
      newPassword: passwords.next,
      confirmPassword: passwords.confirm
    });
    if (validationError) {
      setPasswordMessage({ type: 'error', text: validationError });
      return;
    }

    try {
      setIsChangingPw(true);
      const res = await apiFetch(`${API_BASE_URL}/api/users/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.current || undefined,
          newPassword: passwords.next
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Đổi mật khẩu thất bại');

      if (data.requiresLogin) {
        expireSession();
        navigate('/login', {
          replace: true,
          state: { message: 'Đã đổi mật khẩu và đăng xuất các phiên cũ. Vui lòng đăng nhập lại.' }
        });
        return;
      }

      setPasswordMessage({ type: 'success', text: 'Đổi mật khẩu thành công! Hãy ghi nhớ mật khẩu mới của bạn.' });
      setPasswords({ current: '', next: '', confirm: '' });
      setProfile((prev) => ({ ...prev, has_password: true }));
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err.message || 'Lỗi khi đổi mật khẩu' });
    } finally {
      setIsChangingPw(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout(() => navigate('/', { replace: true }));
      navigate('/', { replace: true });
    } catch (err) {
      alert(err.message);
    }
  };

  const currentAvatar = profile?.avatar || authUser?.avatar;
  const trustScore = profile?.trust_score ?? authUser?.trust_score ?? 80;
  const roleName = getRoleLabel(profile?.role || authUser?.role);
  const isPlusActive = Boolean(plusStatus?.active);
  const accountTierLabel = isPlusActive
    ? 'Thành viên Plus'
    : profile?.verification_status === 'VERIFIED'
      ? 'Đã xác thực danh tính'
      : 'Tài khoản tiêu chuẩn';

  return (
    <div className="uprofile-page-wrapper">
      <PageWaveBackground className="uprofile-bg-decor" waveClassName="uprofile-bg-waves" />
      <Header activeTab="profile" />

      <main className="uprofile-main-container">
        {/* Hero Banner Card */}
        <section className="uprofile-hero-card">
          <div className="uprofile-hero-visual" aria-hidden="true">
            <img src={heroVillaArt} alt="" className="uprofile-hero-villa-img" decoding="async" />
            <svg className="uprofile-hero-waves" viewBox="0 0 1180 220" preserveAspectRatio="none" fill="none">
              <path d="M-40 138C125 66 290 202 510 150C700 105 840 36 1040 68L1180 0V220H-40V138Z" fill="url(#uprofileHeroWave1)" />
              <path d="M-40 178C160 124 325 220 560 176C745 142 900 114 1180 146V220H-40V178Z" fill="url(#uprofileHeroWave2)" />
              <path d="M90 -10C215 62 380 76 550 32C665 2 765 -14 880 -10H90Z" fill="url(#uprofileHeroWave3)" />
              <defs>
                <linearGradient id="uprofileHeroWave1" x1="0" y1="20" x2="960" y2="210" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ffffff" stopOpacity="0.46" />
                  <stop offset="0.52" stopColor="#dbe9ff" stopOpacity="0.3" />
                  <stop offset="1" stopColor="#9ec2fb" stopOpacity="0.06" />
                </linearGradient>
                <linearGradient id="uprofileHeroWave2" x1="0" y1="130" x2="920" y2="220" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ffffff" stopOpacity="0.56" />
                  <stop offset="0.48" stopColor="#e2eeff" stopOpacity="0.34" />
                  <stop offset="1" stopColor="#b2d0fd" stopOpacity="0.08" />
                </linearGradient>
                <linearGradient id="uprofileHeroWave3" x1="90" y1="0" x2="880" y2="55" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#94bafa" stopOpacity="0.42" />
                  <stop offset="1" stopColor="#7caef9" stopOpacity="0.16" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="uprofile-hero-content">
            <div className="uprofile-avatar-box">
              <svg className="uprofile-avatar-rays" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <path d="M8 14L12 4" stroke="#60a5fa" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M16 19L27 11" stroke="#3b82f6" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M19 26L30 24" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" />
              </svg>

              <div className="uprofile-avatar-circle">
                <Avatar src={currentAvatar} name={profile?.name || authUser?.name} className="uprofile-avatar-img" />
                {isUploadingAvatar && (
                  <div className="uprofile-avatar-loading">
                    <Loader2 size={24} className="uprofile-spinner" />
                    <span>Đang tải...</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="uprofile-camera-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                title="Thay đổi ảnh đại diện"
                aria-label="Thay đổi ảnh đại diện"
              >
                <Camera size={16} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/png, image/jpeg, image/webp" className="uprofile-file-input" onChange={handleAvatarChange} />
            </div>

            <div className="uprofile-user-meta">
              <div className="uprofile-name-row">
                <h1 className="uprofile-name-heading">{profile?.name || authUser?.name || 'Người dùng Swipe Nest'}</h1>
                <span className={`uprofile-role-tag role-${profile?.role?.toLowerCase() || 'user'}`}>{roleName}</span>
              </div>

              <p className="uprofile-email-subtext">
                <Mail size={15} />
                <span>{profile?.email || authUser?.email || 'Chưa cập nhật email'}</span>
              </p>

              <div className="uprofile-pills-row">
                <div className="uprofile-pill uprofile-pill-trust" title="Điểm tín nhiệm tài khoản">
                  <ShieldCheck size={15} />
                  <span>Điểm tín nhiệm:</span>
                  <strong>{trustScore} / 100</strong>
                </div>
                <div className={`uprofile-pill ${isPlusActive ? 'uprofile-pill-plus' : 'uprofile-pill-status'}`}>
                  {isPlusActive ? <Crown size={15} /> : profile?.verification_status === 'VERIFIED' ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                  <span>{accountTierLabel}</span>
                </div>
                <div className="uprofile-pill uprofile-pill-date">
                  <Calendar size={15} />
                  <span>Tham gia: {formatProfileDate(profile?.created_at)}</span>
                </div>
              </div>

              {avatarNotice.text && (
                <div className={`uprofile-toast-message ${avatarNotice.type}`} role={avatarNotice.type === 'error' ? 'alert' : 'status'}>
                  {avatarNotice.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
                  {avatarNotice.text}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Body 2-Column Layout */}
        <div className="uprofile-body-grid">
          <aside className="uprofile-sidebar">
            <div className="uprofile-sidebar-card">
              <nav className="uprofile-tab-list" aria-label="Danh mục hồ sơ">
                <button type="button" className={`uprofile-tab-btn ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')} aria-current={activeTab === 'info' ? 'page' : undefined}>
                  <span className="uprofile-tab-icon"><User size={18} /></span>
                  <span>Thông tin cá nhân</span>
                </button>
                <button type="button" className={`uprofile-tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')} aria-current={activeTab === 'security' ? 'page' : undefined}>
                  <span className="uprofile-tab-icon"><Lock size={18} /></span>
                  <span>Bảo mật &amp; Mật khẩu</span>
                </button>
              </nav>

              <div className="uprofile-sidebar-divider" />

              <div className="uprofile-quicklinks-section">
                <h2 className="uprofile-box-title">Tiện ích nhanh</h2>
                <Link to="/swipe/Tất cả" state={{ activeView: 'saved' }} className="uprofile-quicklink-item">
                  <span className="uprofile-quicklink-icon icon-red"><Heart size={17} /></span>
                  <span>BĐS Đã lưu ({authUser ? 'Yêu thích' : 0})</span>
                </Link>
                <Link to="/chat" className="uprofile-quicklink-item">
                  <span className="uprofile-quicklink-icon icon-blue"><MessageSquare size={17} /></span>
                  <span>Tin nhắn tư vấn</span>
                </Link>
                {isRegularUser && (
                  <Link to="/onboarding?edit=1" state={{ from: '/profile' }} className="uprofile-quicklink-item">
                    <span className="uprofile-quicklink-icon icon-indigo"><SlidersHorizontal size={17} /></span>
                    <span>Tùy chọn gợi ý</span>
                  </Link>
                )}
                <button type="button" onClick={handleLogout} className="uprofile-quicklink-item logout-link">
                  <span className="uprofile-quicklink-icon icon-logout"><LogOut size={17} /></span>
                  <span>Đăng xuất tài khoản</span>
                </button>
              </div>

              {isRegularUser && (
                <div className={`uprofile-plus-card ${isPlusActive ? 'is-active' : ''}`}>
                  <div className="uprofile-plus-sparkles" aria-hidden="true"><Sparkles size={16} /></div>
                  <div className="uprofile-plus-top">
                    <div className="uprofile-plus-badge-icon">{isPlusActive ? <Crown size={20} /> : <Gem size={20} />}</div>
                    <div className="uprofile-plus-copy">
                      <h3>{isPlusActive ? 'Swipe Nest Plus' : 'Nâng cấp Plus'}</h3>
                      <p>
                        {isPlusActive && plusStatus?.currentEnd
                          ? `Đang hoạt động đến ${formatProfileDate(plusStatus.currentEnd)}`
                          : 'Trải nghiệm nhiều tính năng vượt trội hơn'}
                      </p>
                    </div>
                  </div>
                  <Link to="/plus" className="uprofile-plus-cta">
                    <span>{isPlusActive ? 'Quản lý gói Plus' : 'Khám phá ngay'}</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              )}
            </div>
          </aside>

          <div className="uprofile-content-area">
            {activeTab === 'info' ? (
              <section className="uprofile-card-panel" aria-labelledby="uprofile-info-heading">
                <div className="uprofile-panel-header">
                  <div className="uprofile-header-icon-wrap"><User size={21} /></div>
                  <div>
                    <h2 id="uprofile-info-heading" className="uprofile-panel-title">Thông tin cá nhân</h2>
                    <p className="uprofile-panel-desc">Cập nhật họ tên và số điện thoại để kết nối với môi giới dễ dàng hơn.</p>
                  </div>
                </div>

                <FormAlert message={profileMessage} />

                <form onSubmit={handleSaveProfile} className="uprofile-form">
                  <div className="uprofile-form-grid">
                    <ProfileField
                      id="user-name-input"
                      label="Họ và tên"
                      required
                      icon={User}
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nhập họ và tên của bạn"
                      maxLength={120}
                      hint="Tên hiển thị khi trao đổi với môi giới hoặc quản trị viên."
                    />
                    <ProfileField
                      id="user-phone-input"
                      label="Số điện thoại"
                      icon={Phone}
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ví dụ: 0912345678"
                      maxLength={15}
                      hint="Số di động dùng để xác thực và liên hệ."
                    />
                    <ProfileField
                      id="user-email-input"
                      label="Địa chỉ Email"
                      icon={Mail}
                      trailingIcon={Lock}
                      trailingTitle="Email dùng để đăng nhập, không thể thay đổi"
                      type="email"
                      value={profile?.email || authUser?.email || ''}
                      disabled
                      hint="Email dùng để nhận thông báo, thông tin truy cập."
                    />
                    <ProfileField
                      id="user-role-input"
                      label="Vai trò hệ thống"
                      icon={Shield}
                      trailingIcon={ChevronDown}
                      type="text"
                      value={roleName}
                      disabled
                      hint="Vai trò hiện tại của bạn trên hệ thống."
                    />
                  </div>

                  <div className="uprofile-submit-row">
                    <button type="submit" className="uprofile-submit-btn" disabled={isSavingProfile || loadingProfile}>
                      {isSavingProfile ? <><Loader2 size={17} className="uprofile-spinner" /><span>Đang lưu...</span></> : <><Save size={17} /><span>Lưu thay đổi</span></>}
                    </button>
                  </div>
                </form>
              </section>
            ) : (
              <section className="uprofile-card-panel" aria-labelledby="uprofile-security-heading">
                <div className="uprofile-panel-header">
                  <div className="uprofile-header-icon-wrap"><Lock size={21} /></div>
                  <div>
                    <h2 id="uprofile-security-heading" className="uprofile-panel-title">Bảo mật &amp; Mật khẩu</h2>
                    <p className="uprofile-panel-desc">Bảo vệ tài khoản bằng mật khẩu an toàn tối thiểu 10 ký tự.</p>
                  </div>
                </div>

                <FormAlert message={passwordMessage} />

                <form onSubmit={handleChangePassword} className="uprofile-form">
                  <div className="uprofile-form-grid">
                    {profile?.has_password && (
                      <ProfileField
                        id="current-pw-input"
                        label="Mật khẩu hiện tại"
                        required
                        fullWidth
                        icon={Lock}
                        type={showPw.current ? 'text' : 'password'}
                        value={passwords.current}
                        onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
                        placeholder="Nhập mật khẩu đang dùng"
                        passwordToggle
                        showPassword={showPw.current}
                        onTogglePassword={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                      />
                    )}
                    <ProfileField
                      id="new-pw-input"
                      label="Mật khẩu mới"
                      required
                      icon={Lock}
                      type={showPw.next ? 'text' : 'password'}
                      value={passwords.next}
                      onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
                      placeholder="Ít nhất 10 ký tự"
                      minLength={10}
                      passwordToggle
                      showPassword={showPw.next}
                      onTogglePassword={() => setShowPw((s) => ({ ...s, next: !s.next }))}
                      hint="Tối thiểu 10 ký tự, tránh các chuỗi dễ đoán như 123456."
                    />
                    <ProfileField
                      id="confirm-pw-input"
                      label="Xác nhận mật khẩu mới"
                      required
                      icon={Lock}
                      type={showPw.confirm ? 'text' : 'password'}
                      value={passwords.confirm}
                      onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                      placeholder="Nhập lại mật khẩu mới"
                      passwordToggle
                      showPassword={showPw.confirm}
                      onTogglePassword={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                      hint="Nhập lại chính xác mật khẩu mới để xác nhận."
                    />
                  </div>

                  <div className="uprofile-security-note">
                    <ShieldCheck size={16} />
                    <span>Sau khi đổi mật khẩu thành công, các phiên đăng nhập cũ sẽ được đăng xuất để đảm bảo an toàn.</span>
                  </div>

                  <div className="uprofile-submit-row">
                    <button type="submit" className="uprofile-submit-btn" disabled={isChangingPw}>
                      {isChangingPw ? <><Loader2 size={17} className="uprofile-spinner" /><span>Đang cập nhật...</span></> : <><ShieldCheck size={17} /><span>Cập nhật mật khẩu</span></>}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
