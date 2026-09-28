import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, X, Search, Bell, ChevronDown, User, LogOut, 
  Home as HomeIcon, Compass, Heart, MessageSquare 
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import './Header.css';

export const SwipeNestMark = () => (
  <svg className="app-brand-mark" viewBox="0 0 150 150" aria-hidden="true" focusable="false">
    <path d="M75 7 139 53v61a25 25 0 0 1-25 25H36a25 25 0 0 1-25-25V53L75 7Z" fill="#25499b" />
    <path d="M75 7 24 55v57a27 27 0 0 0 27 27h24V7Z" fill="#fff" opacity=".055" />
    <path d="M29 72c27-14 65-15 92-1" fill="none" stroke="#f3c52f" strokeWidth="8" strokeLinecap="round" />
    <path d="M57 49v54m0-54 39 54V49" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Header({
  activeTab, // 'home' | 'swipe' | 'saved' | 'chat' | 'profile'
  onMenuClick,
  onTabChange,
  showSearch = false,
  showNotifications = false,
  onSearchClick
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('click', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showDropdown]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileDrawerOpen]);

  // Determine active item if not explicitly passed
  const currentTab = activeTab || (() => {
    const path = location.pathname;
    if (path === '/') return 'home';
    if (path.startsWith('/swipe')) {
      return location.state?.activeView === 'saved' ? 'saved' : 'swipe';
    }
    if (path.startsWith('/chat')) return 'chat';
    if (path.startsWith('/profile')) return 'profile';
    return '';
  })();

  const handleTabClick = (tab, path, state) => {
    setMobileDrawerOpen(false);
    if (onTabChange) {
      const handled = onTabChange(tab);
      if (handled) return;
    }
    if (state) {
      navigate(path, { state });
    } else {
      navigate(path);
    }
  };

  const handleLogout = async () => {
    try {
      setShowDropdown(false);
      setMobileDrawerOpen(false);
      await logout();
      navigate('/login');
    } catch (err) {
      alert(err.message || 'Đăng xuất thất bại');
    }
  };

  const defaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

  return (
    <>
      <header className="app-header-navbar">
        <div className="app-header-left">
          <button 
            className="app-header-menu-btn" 
            aria-label="Menu" 
            onClick={() => {
              if (onMenuClick) {
                onMenuClick();
              } else {
                setMobileDrawerOpen(true);
              }
            }}
          >
            <Menu size={20} />
          </button>
          <button className="app-header-brand" onClick={() => navigate('/')} aria-label="Về trang chủ">
            <span className="app-header-logo-icon"><SwipeNestMark /></span>
            <span className="app-header-logo-text">Swipe Nest</span>
          </button>
        </div>

        <nav className="app-header-middle">
          <button 
            className={`app-header-nav-link ${currentTab === 'home' ? 'active' : ''}`}
            onClick={() => handleTabClick('home', '/')}
          >
            Trang Chủ
          </button>
          <button 
            className={`app-header-nav-link ${currentTab === 'swipe' ? 'active' : ''}`}
            onClick={() => handleTabClick('swipe', '/swipe/Tất cả')}
          >
            Khám Phá
          </button>
          <button 
            className={`app-header-nav-link ${currentTab === 'saved' ? 'active' : ''}`}
            onClick={() => handleTabClick('saved', '/swipe/Tất cả', { activeView: 'saved' })}
          >
            Yêu thích
          </button>
          <button 
            className={`app-header-nav-link ${currentTab === 'chat' ? 'active' : ''}`}
            onClick={() => handleTabClick('chat', '/chat')}
          >
            Chat
          </button>
        </nav>

        <div className="app-header-right">
          {showSearch && (
            <button className="app-header-icon-btn" aria-label="Tìm kiếm" onClick={onSearchClick}>
              <Search size={18} />
            </button>
          )}

          {showNotifications && (
            <button className="app-header-icon-btn notification" aria-label="Thông báo">
              <Bell size={18} />
              <span className="app-header-badge-dot"></span>
            </button>
          )}

          {user && (
            <div className="app-header-user-wrapper" ref={dropdownRef}>
              <button 
                className={`app-header-user-btn ${currentTab === 'profile' ? 'profile-active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown((prev) => !prev);
                }}
                aria-label="Tài khoản cá nhân"
              >
                <img 
                  src={user.avatar || defaultAvatar} 
                  alt={user.name || 'User Avatar'} 
                  className="app-header-avatar-img" 
                />
                <span className="app-header-user-name">{user.name || 'Người dùng'}</span>
                <ChevronDown size={14} className={`app-header-chevron ${showDropdown ? 'open' : ''}`} />
              </button>

              {showDropdown && (
                <div className="app-header-dropdown-menu">
                  <div className="app-header-dropdown-email">
                    {user.email}
                  </div>
                  <button 
                    className={`app-header-dropdown-item ${currentTab === 'profile' ? 'active' : ''}`}
                    onClick={() => {
                      setShowDropdown(false);
                      navigate('/profile');
                    }}
                  >
                    <User size={15} />
                    <span>Hồ sơ cá nhân</span>
                  </button>
                  <button 
                    className="app-header-dropdown-item logout-btn"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Unified Mobile Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="app-header-drawer-backdrop" onClick={() => setMobileDrawerOpen(false)}>
          <div className="app-header-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="app-header-drawer-top">
              <button 
                className="app-header-brand" 
                onClick={() => { 
                  setMobileDrawerOpen(false); 
                  navigate('/'); 
                }}
              >
                <span className="app-header-logo-icon"><SwipeNestMark /></span>
                <span className="app-header-logo-text">Swipe Nest</span>
              </button>
              <button 
                className="app-header-drawer-close" 
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Đóng menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="app-header-drawer-nav">
              <button 
                className={`app-header-drawer-link ${currentTab === 'home' ? 'active' : ''}`}
                onClick={() => handleTabClick('home', '/')}
              >
                <HomeIcon size={18} />
                <span>Trang Chủ</span>
              </button>
              <button 
                className={`app-header-drawer-link ${currentTab === 'swipe' ? 'active' : ''}`}
                onClick={() => handleTabClick('swipe', '/swipe/Tất cả')}
              >
                <Compass size={18} />
                <span>Khám Phá</span>
              </button>
              <button 
                className={`app-header-drawer-link ${currentTab === 'saved' ? 'active' : ''}`}
                onClick={() => handleTabClick('saved', '/swipe/Tất cả', { activeView: 'saved' })}
              >
                <Heart size={18} />
                <span>Yêu thích</span>
              </button>
              <button 
                className={`app-header-drawer-link ${currentTab === 'chat' ? 'active' : ''}`}
                onClick={() => handleTabClick('chat', '/chat')}
              >
                <MessageSquare size={18} />
                <span>Chat</span>
              </button>
              <button 
                className={`app-header-drawer-link ${currentTab === 'profile' ? 'active' : ''}`}
                onClick={() => handleTabClick('profile', '/profile')}
              >
                <User size={18} />
                <span>Hồ sơ cá nhân</span>
              </button>
            </nav>

            {user ? (
              <div className="app-header-drawer-footer">
                <div className="app-header-drawer-user">
                  <img 
                    src={user.avatar || defaultAvatar} 
                    alt={user.name} 
                    className="app-header-drawer-avatar" 
                  />
                  <div className="app-header-drawer-user-info">
                    <span className="app-header-drawer-user-name">{user.name || 'Người dùng'}</span>
                    <span className="app-header-drawer-user-email">{user.email}</span>
                  </div>
                </div>
                <button className="app-header-drawer-logout" onClick={handleLogout}>
                  <LogOut size={16} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : (
              <div className="app-header-drawer-footer">
                <button 
                  className="app-header-drawer-login-btn" 
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    navigate('/login');
                  }}
                >
                  Đăng nhập
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
