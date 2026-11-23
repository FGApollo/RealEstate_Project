import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Mail, Phone, ShieldCheck, Shield, Camera, Lock,
  CheckCircle2, AlertCircle, Eye, EyeOff, Calendar,
  Heart, MessageSquare, Loader2, Sparkles, Check,
  LogOut, Save, ChevronDown, Clock, ArrowRight, Gem,
  Crown, SlidersHorizontal
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import { fetchPlusStatus } from '../features/plus/plusApi';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import heroVillaArt from '../assets/profile-hero-villa.jpg';
import './UserProfile.css';

export default function UserProfile() {
  const navigate = useNavigate();
  const { user: authUser, updateUser, logout, expireSession } = useAuth();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'security'
  const [profile, setProfile] = useState(null);
  const [plusStatus, setPlusStatus] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Form states - Profile Info
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });

  // Form states - Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');

  const isRegularUser = String(profile?.role || authUser?.role || '').toUpperCase() === 'USER';

  // Fetch full profile & Plus status from API on mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        setLoadingProfile(true);
        const res = await apiFetch(`${API_BASE_URL}/api/users/profile`);
        if (!res.ok) {
          throw new Error('Không thể tải thông tin tài khoản');
        }
        const data = await res.json();
        if (isMounted && data.user) {
          setProfile(data.user);
          setName(data.user.name || '');
          setPhone(data.user.phone || '');
        }
      } catch (err) {
        console.error('Fetch profile error:', err);
        if (isMounted && authUser) {
          setProfile(authUser);
          setName(authUser.name || '');
          setPhone(authUser.phone || '');
        }
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };

    const loadPlusStatus = async () => {
      if (String(authUser?.role || '').toUpperCase() !== 'USER') return;
      try {
        const data = await fetchPlusStatus({ signal: controller.signal });
        if (isMounted && data?.plus) {
          setPlusStatus(data.plus);
        }
      } catch {
        // Plus status is supplementary; profile renders standard tier cleanly if unavailable
      }
    };

    loadProfile();
    loadPlusStatus();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [authUser]);

  // Handle avatar file selection
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarError('');
    setAvatarSuccess('');

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setAvatarError('Chỉ hỗ trợ file ảnh định dạng JPG, PNG hoặc WEBP');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Kích thước ảnh đại diện không được vượt quá 5MB');
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await apiFetch(`${API_BASE_URL}/api/users/avatar`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Tải ảnh đại diện thất bại');
      }

      setProfile((prev) => ({ ...prev, avatar: data.avatar }));
      updateUser({ avatar: data.avatar });
      setAvatarSuccess('Cập nhật ảnh đại diện thành công!');

      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setAvatarError(err.message || 'Lỗi khi tải ảnh lên, vui lòng thử lại');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle Profile Info Submit
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileMessage({ type: '', text: '' });

    const trimmedName = name.trim();
    if (!trimmedName) {
      setProfileMessage({ type: 'error', text: 'Họ và tên không được để trống' });
      return;
    }

    if (trimmedName.length > 120) {
      setProfileMessage({ type: 'error', text: 'Họ và tên tối đa 120 ký tự' });
      return;
    }

    const trimmedPhone = phone.trim();
    if (trimmedPhone) {
      const vnPhoneRegex = /^0[35789]\d{8}$/;
      const cleaned = trimmedPhone.replace(/[\s().-]/g, '').replace(/^\+84/, '0');
      if (!vnPhoneRegex.test(cleaned)) {
        setProfileMessage({
          type: 'error',
          text: 'Số điện thoại không hợp lệ (cần 10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09)'
        });
        return;
      }
    }

    try {
      setIsSavingProfile(true);
      const res = await apiFetch(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          phone: trimmedPhone || null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Cập nhật thất bại');
      }

      setProfile((prev) => ({ ...prev, ...data.user }));
      updateUser({ name: data.user.name, phone: data.user.phone });
      setProfileMessage({ type: 'success', text: 'Cập nhật thông tin thành công!' });
    } catch (err) {
      setProfileMessage({ type: 'error', text: err.message || 'Lỗi khi cập nhật thông tin' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Handle Change Password Submit
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    if (profile?.has_password && !currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Vui lòng nhập mật khẩu hiện tại' });
      return;
    }

    if (newPassword.length < 10) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 10 ký tự' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Mật khẩu xác nhận không khớp' });
      return;
    }

    try {
      setIsChangingPw(true);
      const res = await apiFetch(`${API_BASE_URL}/api/users/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Đổi mật khẩu thất bại');
      }

      if (data.requiresLogin) {
        expireSession();
        navigate('/login', {
          replace: true,
          state: { message: 'Đã đổi mật khẩu và đăng xuất các phiên cũ. Vui lòng đăng nhập lại.' }
        });
        return;
      }

      setPasswordMessage({ type: 'success', text: 'Đổi mật khẩu thành công! Hãy ghi nhớ mật khẩu mới của bạn.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
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

  const formatDate = (isoString) => {
    if (!isoString) return 'Mới tham gia';
    try {
      return new Date(isoString).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return 'Mới tham gia';
    }
  };

  const currentAvatar = profile?.avatar || authUser?.avatar;
  const trustScore = profile?.trust_score ?? authUser?.trust_score ?? 80;
  const roleName =
    profile?.role === 'AGENT'
      ? 'Môi giới'
      : profile?.role === 'ADMIN'
        ? 'Quản trị viên'
        : 'Người tìm nhà';

  const isPlusActive = Boolean(plusStatus?.active);
  const accountTierLabel = isPlusActive
    ? 'Thành viên Plus'
    : profile?.verification_status === 'VERIFIED'
      ? 'Đã xác thực danh tính'
      : 'Tài khoản tiêu chuẩn';

  return (
    <div className="uprofile-page-wrapper">
      {/* Subtle decorative background waves */}
      <div className="uprofile-bg-decor" aria-hidden="true">
        <svg
          className="uprofile-bg-waves"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M0 192C220 132 420 260 720 218C1020 176 1220 92 1440 146V320H0V192Z"
            fill="url(#uprofileWaveA)"
          />
          <path
            d="M0 248C280 198 540 296 860 250C1120 212 1300 172 1440 202V320H0V248Z"
            fill="url(#uprofileWaveB)"
          />
          <defs>
            <linearGradient id="uprofileWaveA" x1="0" y1="0" x2="1440" y2="320" gradientUnits="userSpaceOnUse">
              <stop stopColor="#dbeafe" stopOpacity="0.65" />
              <stop offset="1" stopColor="#bfdbfe" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id="uprofileWaveB" x1="0" y1="180" x2="1440" y2="320" gradientUnits="userSpaceOnUse">
              <stop stopColor="#e0ecff" stopOpacity="0.8" />
              <stop offset="1" stopColor="#c7ddff" stopOpacity="0.55" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Unified Top Navbar */}
      <Header activeTab="profile" />

      {/* Main Container */}
      <main className="uprofile-main-container">
        {/* Profile Hero Banner Card */}
        <section className="uprofile-hero-card">
          <div className="uprofile-hero-visual" aria-hidden="true">
            <img
              src={heroVillaArt}
              alt=""
              className="uprofile-hero-villa-img"
              decoding="async"
            />
            <div className="uprofile-hero-scrim" />
          </div>

          <div className="uprofile-hero-content">
            {/* Avatar with Camera Button & Accent Rays */}
            <div className="uprofile-avatar-box">
              <svg
                className="uprofile-avatar-rays"
                viewBox="0 0 36 36"
                fill="none"
                aria-hidden="true"
              >
                <path d="M8 14L12 4" stroke="#60a5fa" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M16 19L27 11" stroke="#3b82f6" strokeWidth="3.2" strokeLinecap="round" />
                <path d="M19 26L30 24" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" />
              </svg>

              <div className="uprofile-avatar-circle">
                <Avatar
                  src={currentAvatar}
                  name={profile?.name || authUser?.name}
                  className="uprofile-avatar-img"
                />
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

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="uprofile-file-input"
                onChange={handleAvatarChange}
              />
            </div>

            {/* User Meta Information */}
            <div className="uprofile-user-meta">
              <div className="uprofile-name-row">
                <h1 className="uprofile-name-heading">
                  {profile?.name || authUser?.name || 'Người dùng Swipe Nest'}
                </h1>
                <span className={`uprofile-role-tag role-${profile?.role?.toLowerCase() || 'user'}`}>
                  {roleName}
                </span>
              </div>

              <p className="uprofile-email-subtext">
                <Mail size={15} />
                <span>{profile?.email || authUser?.email || 'Chưa cập nhật email'}</span>
              </p>

              {/* Status & Info Pills */}
              <div className="uprofile-pills-row">
                <div className="uprofile-pill uprofile-pill-trust" title="Điểm tín nhiệm tài khoản">
                  <ShieldCheck size={15} />
                  <span>Điểm tín nhiệm:</span>
                  <strong>{trustScore} / 100</strong>
                </div>

                <div className={`uprofile-pill ${isPlusActive ? 'uprofile-pill-plus' : 'uprofile-pill-status'}`}>
                  {isPlusActive ? (
                    <Crown size={15} />
                  ) : profile?.verification_status === 'VERIFIED' ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <Clock size={15} />
                  )}
                  <span>{accountTierLabel}</span>
                </div>

                <div className="uprofile-pill uprofile-pill-date">
                  <Calendar size={15} />
                  <span>Tham gia: {formatDate(profile?.created_at)}</span>
                </div>
              </div>

              {/* Avatar Notification Banners */}
              {avatarSuccess && (
                <div className="uprofile-toast-message success" role="status">
                  <Check size={15} /> {avatarSuccess}
                </div>
              )}
              {avatarError && (
                <div className="uprofile-toast-message error" role="alert">
                  <AlertCircle size={15} /> {avatarError}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Main 2-Column Content Layout */}
        <div className="uprofile-body-grid">
          {/* Left Column: Unified Sidebar Card */}
          <aside className="uprofile-sidebar">
            <div className="uprofile-sidebar-card">
              {/* Primary Navigation Tabs */}
              <nav className="uprofile-tab-list" aria-label="Danh mục hồ sơ">
                <button
                  type="button"
                  className={`uprofile-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
                  onClick={() => setActiveTab('info')}
                  aria-current={activeTab === 'info' ? 'page' : undefined}
                >
                  <span className="uprofile-tab-icon">
                    <User size={18} />
                  </span>
                  <span>Thông tin cá nhân</span>
                </button>

                <button
                  type="button"
                  className={`uprofile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
                  onClick={() => setActiveTab('security')}
                  aria-current={activeTab === 'security' ? 'page' : undefined}
                >
                  <span className="uprofile-tab-icon">
                    <Lock size={18} />
                  </span>
                  <span>Bảo mật &amp; Mật khẩu</span>
                </button>
              </nav>

              <div className="uprofile-sidebar-divider" />

              {/* Quick Utilities */}
              <div className="uprofile-quicklinks-section">
                <h2 className="uprofile-box-title">Tiện ích nhanh</h2>

                <Link
                  to="/swipe/Tất cả"
                  state={{ activeView: 'saved' }}
                  className="uprofile-quicklink-item"
                >
                  <span className="uprofile-quicklink-icon icon-red">
                    <Heart size={17} />
                  </span>
                  <span>BĐS Đã lưu ({authUser ? 'Yêu thích' : 0})</span>
                </Link>

                <Link to="/chat" className="uprofile-quicklink-item">
                  <span className="uprofile-quicklink-icon icon-blue">
                    <MessageSquare size={17} />
                  </span>
                  <span>Tin nhắn tư vấn</span>
                </Link>

                {isRegularUser && (
                  <Link
                    to="/onboarding?edit=1"
                    state={{ from: '/profile' }}
                    className="uprofile-quicklink-item"
                  >
                    <span className="uprofile-quicklink-icon icon-indigo">
                      <SlidersHorizontal size={17} />
                    </span>
                    <span>Tùy chọn gợi ý</span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="uprofile-quicklink-item logout-link"
                >
                  <span className="uprofile-quicklink-icon icon-logout">
                    <LogOut size={17} />
                  </span>
                  <span>Đăng xuất tài khoản</span>
                </button>
              </div>

              {/* Plus Upgrade / Status Card */}
              {isRegularUser && (
                <div className={`uprofile-plus-card ${isPlusActive ? 'is-active' : ''}`}>
                  <div className="uprofile-plus-sparkles" aria-hidden="true">
                    <Sparkles size={16} />
                  </div>
                  <div className="uprofile-plus-top">
                    <div className="uprofile-plus-badge-icon">
                      {isPlusActive ? <Crown size={20} /> : <Gem size={20} />}
                    </div>
                    <div className="uprofile-plus-copy">
                      <h3>{isPlusActive ? 'Swipe Nest Plus' : 'Nâng cấp Plus'}</h3>
                      <p>
                        {isPlusActive && plusStatus?.currentEnd
                          ? `Đang hoạt động đến ${formatDate(plusStatus.currentEnd)}`
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

          {/* Right Column: Main Tab Content Card */}
          <div className="uprofile-content-area">
            {/* TAB 1: THÔNG TIN CÁ NHÂN */}
            {activeTab === 'info' && (
              <section className="uprofile-card-panel" aria-labelledby="uprofile-info-heading">
                <div className="uprofile-panel-header">
                  <div className="uprofile-header-icon-wrap">
                    <User size={21} />
                  </div>
                  <div>
                    <h2 id="uprofile-info-heading" className="uprofile-panel-title">
                      Thông tin cá nhân
                    </h2>
                    <p className="uprofile-panel-desc">
                      Cập nhật họ tên và số điện thoại để kết nối với môi giới dễ dàng hơn.
                    </p>
                  </div>
                </div>

                {profileMessage.text && (
                  <div
                    className={`uprofile-alert ${profileMessage.type}`}
                    role={profileMessage.type === 'error' ? 'alert' : 'status'}
                  >
                    {profileMessage.type === 'success' ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertCircle size={18} />
                    )}
                    <span>{profileMessage.text}</span>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="uprofile-form">
                  <div className="uprofile-form-grid">
                    <div className="uprofile-form-group">
                      <label htmlFor="user-name-input">
                        Họ và tên <span className="uprofile-required">*</span>
                      </label>
                      <div className="uprofile-input-container">
                        <div className="uprofile-leading-icon">
                          <User size={18} />
                        </div>
                        <input
                          id="user-name-input"
                          type="text"
                          className="uprofile-input-field"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Nhập họ và tên của bạn"
                          maxLength={120}
                          required
                        />
                      </div>
                      <span className="uprofile-hint-text">
                        Tên hiển thị khi trao đổi với môi giới hoặc quản trị viên.
                      </span>
                    </div>

                    <div className="uprofile-form-group">
                      <label htmlFor="user-phone-input">Số điện thoại</label>
                      <div className="uprofile-input-container">
                        <div className="uprofile-leading-icon">
                          <Phone size={18} />
                        </div>
                        <input
                          id="user-phone-input"
                          type="tel"
                          className="uprofile-input-field"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Ví dụ: 0912345678"
                          maxLength={15}
                        />
                      </div>
                      <span className="uprofile-hint-text">
                        Số di động dùng để xác thực và liên hệ.
                      </span>
                    </div>

                    <div className="uprofile-form-group">
                      <label htmlFor="user-email-input">Địa chỉ Email</label>
                      <div className="uprofile-input-container disabled">
                        <div className="uprofile-leading-icon">
                          <Mail size={18} />
                        </div>
                        <input
                          id="user-email-input"
                          type="email"
                          className="uprofile-input-field"
                          value={profile?.email || authUser?.email || ''}
                          disabled
                          readOnly
                        />
                        <div
                          className="uprofile-trailing-icon"
                          title="Email dùng để đăng nhập, không thể thay đổi"
                        >
                          <Lock size={15} />
                        </div>
                      </div>
                      <span className="uprofile-hint-text">
                        Email dùng để nhận thông báo, thông tin truy cập.
                      </span>
                    </div>

                    <div className="uprofile-form-group">
                      <label htmlFor="user-role-input">Vai trò hệ thống</label>
                      <div className="uprofile-input-container disabled">
                        <div className="uprofile-leading-icon">
                          <Shield size={18} />
                        </div>
                        <input
                          id="user-role-input"
                          type="text"
                          className="uprofile-input-field"
                          value={roleName}
                          disabled
                          readOnly
                        />
                        <div className="uprofile-trailing-icon" aria-hidden="true">
                          <ChevronDown size={16} />
                        </div>
                      </div>
                      <span className="uprofile-hint-text">
                        Vai trò hiện tại của bạn trên hệ thống.
                      </span>
                    </div>
                  </div>

                  <div className="uprofile-submit-row">
                    <button
                      type="submit"
                      className="uprofile-submit-btn"
                      disabled={isSavingProfile || loadingProfile}
                    >
                      {isSavingProfile ? (
                        <>
                          <Loader2 size={17} className="uprofile-spinner" />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <>
                          <Save size={17} />
                          <span>Lưu thay đổi</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* TAB 2: BẢO MẬT & MẬT KHẨU */}
            {activeTab === 'security' && (
              <section className="uprofile-card-panel" aria-labelledby="uprofile-security-heading">
                <div className="uprofile-panel-header">
                  <div className="uprofile-header-icon-wrap">
                    <Lock size={21} />
                  </div>
                  <div>
                    <h2 id="uprofile-security-heading" className="uprofile-panel-title">
                      Bảo mật &amp; Mật khẩu
                    </h2>
                    <p className="uprofile-panel-desc">
                      Bảo vệ tài khoản bằng mật khẩu an toàn tối thiểu 10 ký tự.
                    </p>
                  </div>
                </div>

                {passwordMessage.text && (
                  <div
                    className={`uprofile-alert ${passwordMessage.type}`}
                    role={passwordMessage.type === 'error' ? 'alert' : 'status'}
                  >
                    {passwordMessage.type === 'success' ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <AlertCircle size={18} />
                    )}
                    <span>{passwordMessage.text}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="uprofile-form">
                  <div className="uprofile-form-grid">
                    {profile?.has_password && (
                      <div className="uprofile-form-group uprofile-field-full">
                        <label htmlFor="current-pw-input">
                          Mật khẩu hiện tại <span className="uprofile-required">*</span>
                        </label>
                        <div className="uprofile-input-container">
                          <div className="uprofile-leading-icon">
                            <Lock size={18} />
                          </div>
                          <input
                            id="current-pw-input"
                            type={showCurrentPw ? 'text' : 'password'}
                            className="uprofile-input-field"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Nhập mật khẩu đang dùng"
                            required
                          />
                          <button
                            type="button"
                            className="uprofile-eye-btn"
                            onClick={() => setShowCurrentPw(!showCurrentPw)}
                            aria-label={showCurrentPw ? 'Ẩn mật khẩu hiện tại' : 'Hiện mật khẩu hiện tại'}
                          >
                            {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="uprofile-form-group">
                      <label htmlFor="new-pw-input">
                        Mật khẩu mới <span className="uprofile-required">*</span>
                      </label>
                      <div className="uprofile-input-container">
                        <div className="uprofile-leading-icon">
                          <Lock size={18} />
                        </div>
                        <input
                          id="new-pw-input"
                          type={showNewPw ? 'text' : 'password'}
                          className="uprofile-input-field"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Ít nhất 10 ký tự"
                          required
                          minLength={10}
                        />
                        <button
                          type="button"
                          className="uprofile-eye-btn"
                          onClick={() => setShowNewPw(!showNewPw)}
                          aria-label={showNewPw ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
                        >
                          {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <span className="uprofile-hint-text">
                        Tối thiểu 10 ký tự, tránh các chuỗi dễ đoán như 123456.
                      </span>
                    </div>

                    <div className="uprofile-form-group">
                      <label htmlFor="confirm-pw-input">
                        Xác nhận mật khẩu mới <span className="uprofile-required">*</span>
                      </label>
                      <div className="uprofile-input-container">
                        <div className="uprofile-leading-icon">
                          <Lock size={18} />
                        </div>
                        <input
                          id="confirm-pw-input"
                          type={showConfirmPw ? 'text' : 'password'}
                          className="uprofile-input-field"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Nhập lại mật khẩu mới"
                          required
                        />
                        <button
                          type="button"
                          className="uprofile-eye-btn"
                          onClick={() => setShowConfirmPw(!showConfirmPw)}
                          aria-label={showConfirmPw ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'}
                        >
                          {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <span className="uprofile-hint-text">
                        Nhập lại chính xác mật khẩu mới để xác nhận.
                      </span>
                    </div>
                  </div>

                  <div className="uprofile-security-note">
                    <ShieldCheck size={16} />
                    <span>Sau khi đổi mật khẩu thành công, các phiên đăng nhập cũ sẽ được đăng xuất để đảm bảo an toàn.</span>
                  </div>

                  <div className="uprofile-submit-row">
                    <button
                      type="submit"
                      className="uprofile-submit-btn"
                      disabled={isChangingPw}
                    >
                      {isChangingPw ? (
                        <>
                          <Loader2 size={17} className="uprofile-spinner" />
                          <span>Đang cập nhật...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={17} />
                          <span>Cập nhật mật khẩu</span>
                        </>
                      )}
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
