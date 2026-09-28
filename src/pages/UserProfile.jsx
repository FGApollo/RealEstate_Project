import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Mail, Phone, ShieldCheck, Shield, Camera, Lock,
  CheckCircle2, AlertCircle, Eye, EyeOff, ArrowLeft, Calendar,
  Heart, MessageSquare, Loader2, Sparkles, Home as HomeIcon, Check,
  LogOut
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import Header from '../components/Header';
import './UserProfile.css';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=250&q=80';

export default function UserProfile() {
  const navigate = useNavigate();
  const { user: authUser, updateUser, logout } = useAuth();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'security'
  const [profile, setProfile] = useState(null);
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

  // Fetch full profile from API on mount
  useEffect(() => {
    let isMounted = true;
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

    loadProfile();
    return () => { isMounted = false; };
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
        setProfileMessage({ type: 'error', text: 'Số điện thoại không hợp lệ (cần 10 chữ số, bắt đầu bằng 03, 05, 07, 08, 09)' });
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

      setProfile(data.user);
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
      await logout();
      navigate('/login');
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

  const currentAvatar = profile?.avatar || authUser?.avatar || DEFAULT_AVATAR;
  const trustScore = profile?.trust_score ?? authUser?.trust_score ?? 80;
  const roleName = profile?.role === 'AGENT' ? 'Môi giới' : profile?.role === 'ADMIN' ? 'Quản trị viên' : 'Người tìm nhà';

  return (
    <div className="uprofile-page-wrapper">
      {/* Unified Top Navbar */}
      <Header activeTab="profile" />

      {/* Main Container */}
      <main className="uprofile-main-container">
        {/* Profile Hero Header Card */}
        <section className="uprofile-hero-card">
          <div className="uprofile-hero-banner" />

          <div className="uprofile-hero-content">
            {/* Avatar with Camera Button */}
            <div className="uprofile-avatar-box">
              <div className="uprofile-avatar-circle">
                <img
                  src={currentAvatar}
                  alt={profile?.name || 'User Avatar'}
                  className="uprofile-avatar-img"
                />
                {isUploadingAvatar && (
                  <div className="uprofile-avatar-loading">
                    <Loader2 size={26} className="uprofile-spinner" />
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
                <h1 className="uprofile-name-heading">{profile?.name || 'Người dùng Swipe Nest'}</h1>
                <span className={`uprofile-role-tag role-${profile?.role?.toLowerCase() || 'user'}`}>
                  {roleName}
                </span>
              </div>

              <p className="uprofile-email-subtext">
                <Mail size={15} />
                <span>{profile?.email || 'Chưa cập nhật email'}</span>
              </p>

              {/* Clean Badges Row without CSS collisions */}
              <div className="uprofile-pills-row">
                <div className="uprofile-pill uprofile-pill-trust" title="Điểm tín nhiệm tài khoản">
                  <ShieldCheck size={16} />
                  <span>Điểm tín nhiệm:</span>
                  <strong>{trustScore} / 100</strong>
                </div>

                <div className="uprofile-pill uprofile-pill-status">
                  <CheckCircle2 size={15} />
                  <span>{profile?.verification_status === 'VERIFIED' ? 'Đã xác thực danh tính' : 'Tài khoản tiêu chuẩn'}</span>
                </div>

                <div className="uprofile-pill uprofile-pill-date">
                  <Calendar size={15} />
                  <span>Tham gia: {formatDate(profile?.created_at)}</span>
                </div>
              </div>

              {/* Avatar Notification Banners */}
              {avatarSuccess && (
                <div className="uprofile-toast-message success">
                  <Check size={16} /> {avatarSuccess}
                </div>
              )}
              {avatarError && (
                <div className="uprofile-toast-message error">
                  <AlertCircle size={16} /> {avatarError}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Main Content Layout */}
        <div className="uprofile-body-grid">
          {/* Left Column: Navigation Tabs & Quick Links */}
          <aside className="uprofile-sidebar">
            <div className="uprofile-tab-box">
              <button
                className={`uprofile-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
                onClick={() => setActiveTab('info')}
              >
                <User size={18} />
                <span>Thông tin cá nhân</span>
              </button>

              <button
                className={`uprofile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
                onClick={() => setActiveTab('security')}
              >
                <Lock size={18} />
                <span>Bảo mật & Mật khẩu</span>
              </button>
            </div>

            <div className="uprofile-quicklinks-box">
              <h4 className="uprofile-box-title">Tiện ích nhanh</h4>
              <Link to="/swipe/Tất cả" state={{ activeView: 'saved' }} className="uprofile-quicklink-item">
                <Heart size={16} className="text-red" />
                <span>BĐS Đã lưu ({authUser ? 'Yêu thích' : 0})</span>
              </Link>
              <Link to="/chat" className="uprofile-quicklink-item">
                <MessageSquare size={16} className="text-blue" />
                <span>Tin nhắn tư vấn</span>
              </Link>
              <button onClick={handleLogout} className="uprofile-quicklink-item logout-link">
                <LogOut size={16} />
                <span>Đăng xuất tài khoản</span>
              </button>
            </div>
          </aside>

          {/* Right Column: Tab Content */}
          <div className="uprofile-content-area">
            {/* TAB 1: THÔNG TIN CÁ NHÂN */}
            {activeTab === 'info' && (
              <div className="uprofile-card-panel">
                <div className="uprofile-panel-header">
                  <div className="uprofile-header-icon-wrap">
                    <User size={22} />
                  </div>
                  <div>
                    <h2 className="uprofile-panel-title">Thông tin cá nhân</h2>
                    <p className="uprofile-panel-desc">Cập nhật họ tên và số điện thoại để kết nối với môi giới dễ dàng hơn.</p>
                  </div>
                </div>

                {profileMessage.text && (
                  <div className={`uprofile-alert ${profileMessage.type}`}>
                    {profileMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>{profileMessage.text}</span>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="uprofile-form">
                  <div className="uprofile-form-group">
                    <label htmlFor="user-name-input">Họ và tên *</label>
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
                    <span className="uprofile-hint-text">Tên hiển thị khi trao đổi với môi giới hoặc quản trị viên.</span>
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
                    <span className="uprofile-hint-text">Số di động 10 số tại Việt Nam (bắt đầu bằng 03, 05, 07, 08, 09).</span>
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
                        value={profile?.email || ''}
                        disabled
                        readOnly
                      />
                      <div className="uprofile-trailing-icon" title="Email dùng để đăng nhập, không thể thay đổi">
                        <Lock size={16} />
                      </div>
                    </div>
                    <span className="uprofile-hint-text">Email định danh tài khoản, không thể thay đổi trực tiếp.</span>
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
                          <Loader2 size={16} className="uprofile-spinner" />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        'Lưu thay đổi'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: ĐỔI MẬT KHẨU */}
            {activeTab === 'security' && (
              <div className="uprofile-card-panel">
                <div className="uprofile-panel-header">
                  <div className="uprofile-header-icon-wrap">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h2 className="uprofile-panel-title">Bảo mật & Đổi mật khẩu</h2>
                    <p className="uprofile-panel-desc">Bảo vệ tài khoản bằng mật khẩu an toàn tối thiểu 10 ký tự.</p>
                  </div>
                </div>

                {passwordMessage.text && (
                  <div className={`uprofile-alert ${passwordMessage.type}`}>
                    {passwordMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <span>{passwordMessage.text}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="uprofile-form">
                  {profile?.has_password && (
                    <div className="uprofile-form-group">
                      <label htmlFor="current-pw-input">Mật khẩu hiện tại *</label>
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
                          tabIndex={-1}
                        >
                          {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="uprofile-form-group">
                    <label htmlFor="new-pw-input">Mật khẩu mới *</label>
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
                        placeholder="Nhập mật khẩu mới (ít nhất 10 ký tự)"
                        required
                        minLength={10}
                      />
                      <button
                        type="button"
                        className="uprofile-eye-btn"
                        onClick={() => setShowNewPw(!showNewPw)}
                        tabIndex={-1}
                      >
                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <span className="uprofile-hint-text">Mật khẩu tối thiểu 10 ký tự, tránh các chuỗi dễ đoán như 123456.</span>
                  </div>

                  <div className="uprofile-form-group">
                    <label htmlFor="confirm-pw-input">Xác nhận mật khẩu mới *</label>
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
                        tabIndex={-1}
                      >
                        {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="uprofile-submit-row">
                    <button
                      type="submit"
                      className="uprofile-submit-btn"
                      disabled={isChangingPw}
                    >
                      {isChangingPw ? (
                        <>
                          <Loader2 size={16} className="uprofile-spinner" />
                          <span>Đang cập nhật...</span>
                        </>
                      ) : (
                        'Cập nhật mật khẩu'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
