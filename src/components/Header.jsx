import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, X, Search, Bell, ChevronDown, User, LogOut, 
  Home as HomeIcon, Compass, Heart, MessageCircle 
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { clearPendingAuthAction } from '../auth/pendingAuthAction';
import SwipeNestMark from './SwipeNestMark';
import './Header.css';

export { SwipeNestMark };

export default function Header({
  activeTab, // 'home' | 'swipe' | 'saved' | 'chat' | 'profile'
  onMenuClick,
  onTabChange,
  showSearch = false,
  showNotifications = true,
  onSearchClick,
  onSearch, // alias for onSearchClick
  user: userProp,
  onLogout: onLogoutProp
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const user = userProp !== undefined ? userProp : auth?.user;
  const logout = onLogoutProp || auth?.logout;
  const requireAuth = useRequireAuth();

  const [showDropdown, setShowDropdown] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleSearchAction = onSearchClick || onSearch;
  const shouldShowSearch = showSearch || Boolean(handleSearchAction);

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

  const handleTabClick = async (tab, path, state) => {
    setMobileDrawerOpen(false);
    setShowDropdown(false);
    if (path !== '/') {
      const authorizedUser = await requireAuth({ type: 'NAVIGATE', returnTo: path, routeState: state });
      if (!authorizedUser) return;
    }
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
      if (logout) {
        await logout(() => navigate('/', { replace: true }));
      }
      navigate('/', { replace: true });
    } catch (err) {
      alert(err.message || 'Đăng xuất thất bại');
    }
  };

  const handleAuthEntry = (path) => {
    clearPendingAuthAction();
    setShowDropdown(false);
    setMobileDrawerOpen(false);
    navigate(path);
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'Tài khoản';

  return (
    <>
      <header className="app-header-navbar">
        {/* Left: Brand with unified redesign styling */}
        <div 
          className="app-header-brand" 
          role="button" 
          tabIndex={0} 
          onClick={() => handleTabClick('home', '/')}
          onKeyDown={(e) => e.key === 'Enter' && handleTabClick('home', '/')}
          aria-label="Về trang chủ Swipe Nest"
        >
          <span className="app-header-brand-mark">
            <SwipeNestMark />
          </span>
          <span className="app-header-brand-title">Swipe Nest</span>
        </div>

        {/* Middle: Primary Navigation (Desktop) */}
        <nav className="app-header-nav" aria-label="Điều hướng chính">
          <button 
            type="button"
            className={`app-header-nav-link ${currentTab === 'home' ? 'active' : ''}`}
            onClick={() => handleTabClick('home', '/')}
          >
            <span>Trang chủ</span>
          </button>
          <button 
            type="button"
            className={`app-header-nav-link ${currentTab === 'swipe' ? 'active' : ''}`}
            onClick={() => handleTabClick('swipe', '/swipe/Tất cả')}
          >
            <Compass size={17} />
            <span>Khám phá</span>
          </button>
          <button 
            type="button"
            className={`app-header-nav-link ${currentTab === 'saved' ? 'active' : ''}`}
            onClick={() => handleTabClick('saved', '/swipe/Tất cả', { activeView: 'saved' })}
          >
            <Heart size={17} />
            <span>Yêu thích</span>
          </button>
          <button 
            type="button"
            className={`app-header-nav-link ${currentTab === 'chat' ? 'active' : ''}`}
            onClick={() => handleTabClick('chat', '/chat')}
          >
            <MessageCircle size={17} />
            <span>Chat</span>
          </button>
        </nav>

        {/* Right: Tools & Profile & Mobile Hamburger Menu Button */}
        <div className="app-header-tools">
          {shouldShowSearch && (
            <button 
              type="button" 
              className="app-header-tool-btn" 
              aria-label="Tìm kiếm hoặc bộ lọc" 
              onClick={handleSearchAction}
            >
              <Search size={20} />
            </button>
          )}

          {showNotifications && user && (
            <div className="app-header-notification-wrap">
              <button
                type="button"
                className="app-header-notification-btn"
                aria-label="Thông báo"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={20} />
              </button>
              {notificationsOpen && (
                <div className="app-header-notification-panel" role="status">
                  <strong>Thông báo</strong>
                  <p>Chưa có thông báo mới.</p>
                </div>
              )}
            </div>
          )}

          {/* Mobile Hamburger Button - ĐẶT Ở BÊN PHẢI CẠNH TOOLS VÀ PROFILE */}
          <button 
            className="app-header-mobile-toggle" 
            type="button" 
            aria-label={mobileDrawerOpen ? 'Đóng menu' : 'Mở menu'} 
            onClick={() => {
              if (onMenuClick) {
                onMenuClick();
              } else {
                setMobileDrawerOpen(!mobileDrawerOpen);
              }
            }}
          >
            {mobileDrawerOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          {/* User Profile or Login */}
          {user ? (
            <div className="app-header-profile-wrap" ref={dropdownRef}>
              <button 
                type="button" 
                className="app-header-profile-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown((prev) => !prev);
                }}
                aria-expanded={showDropdown}
                aria-label="Menu tài khoản"
              >
                {user.avatar ? (
                  <img src={user.avatar} alt={displayName} className="app-header-avatar" />
                ) : (
                  <span className="app-header-avatar-initial">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="app-header-profile-name">{displayName}</span>
                <ChevronDown size={15} className={`app-header-chevron ${showDropdown ? 'open' : ''}`} />
              </button>

              {showDropdown && (
                <div className="app-header-dropdown-menu">
                  {user.email && <div className="app-header-dropdown-email">{user.email}</div>}
                  <button 
                    type="button" 
                    className={`app-header-dropdown-item ${currentTab === 'profile' ? 'active' : ''}`}
                    onClick={() => {
                      setShowDropdown(false);
                      handleTabClick('profile', '/profile');
                    }}
                  >
                    <User size={15} />
                    <span>Hồ sơ cá nhân</span>
                  </button>
                  <button 
                    type="button" 
                    className="app-header-dropdown-item logout-btn"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} />
                    <span>Đăng xuất</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="app-header-auth-links">
              <button type="button" className="app-header-login-btn" onClick={() => handleAuthEntry('/login')}>
                Đăng nhập
              </button>
              <button type="button" className="app-header-register-btn" onClick={() => handleAuthEntry('/register')}>
                Đăng ký
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Unified Mobile Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="app-header-mobile-backdrop" onClick={() => setMobileDrawerOpen(false)}>
          <div className="app-header-mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="app-header-drawer-top">
              <div 
                className="app-header-brand" 
                onClick={() => { 
                  setMobileDrawerOpen(false); 
                  handleTabClick('home', '/'); 
                }}
              >
                <span className="app-header-brand-mark">
                  <SwipeNestMark />
                </span>
                <span className="app-header-brand-title">Swipe Nest</span>
              </div>
              <button 
                type="button"
                className="app-header-drawer-close" 
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Đóng menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="app-header-drawer-nav">
              <button 
                type="button"
                className={`app-header-drawer-link ${currentTab === 'home' ? 'active' : ''}`}
                onClick={() => handleTabClick('home', '/')}
              >
                <HomeIcon size={18} />
                <span>Trang chủ</span>
              </button>
              <button 
                type="button"
                className={`app-header-drawer-link ${currentTab === 'swipe' ? 'active' : ''}`}
                onClick={() => handleTabClick('swipe', '/swipe/Tất cả')}
              >
                <Compass size={18} />
                <span>Khám phá</span>
              </button>
              <button 
                type="button"
                className={`app-header-drawer-link ${currentTab === 'saved' ? 'active' : ''}`}
                onClick={() => handleTabClick('saved', '/swipe/Tất cả', { activeView: 'saved' })}
              >
                <Heart size={18} />
                <span>Yêu thích</span>
              </button>
              <button 
                type="button"
                className={`app-header-drawer-link ${currentTab === 'chat' ? 'active' : ''}`}
                onClick={() => handleTabClick('chat', '/chat')}
              >
                <MessageCircle size={18} />
                <span>Chat</span>
              </button>
              {shouldShowSearch && (
                <button 
                  type="button"
                  className="app-header-drawer-link"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    if (handleSearchAction) handleSearchAction();
                  }}
                >
                  <Search size={18} />
                  <span>Bộ lọc tìm kiếm</span>
                </button>
              )}
              {user && (
                <button 
                  type="button"
                  className={`app-header-drawer-link ${currentTab === 'profile' ? 'active' : ''}`}
                  onClick={() => handleTabClick('profile', '/profile')}
                >
                  <User size={18} />
                  <span>Hồ sơ cá nhân</span>
                </button>
              )}
              {user && showNotifications && (
                <button
                  type="button"
                  className="app-header-drawer-link"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    setNotificationsOpen(true);
                  }}
                >
                  <Bell size={18} />
                  <span>Thông báo</span>
                </button>
              )}
            </nav>

            <div className="app-header-drawer-footer">
              {user ? (
                <>
                  <div className="app-header-drawer-user">
                    {user.avatar ? (
                      <img src={user.avatar} alt={displayName} className="app-header-drawer-avatar" />
                    ) : (
                      <span className="app-header-avatar-initial drawer-avatar-initial">
                        {displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="app-header-drawer-user-info">
                      <span className="app-header-drawer-user-name">{displayName}</span>
                      {user.email && <span className="app-header-drawer-user-email">{user.email}</span>}
                    </div>
                  </div>
                  <button type="button" className="app-header-drawer-logout" onClick={handleLogout}>
                    <LogOut size={16} />
                    <span>Đăng xuất</span>
                  </button>
                </>
              ) : (
                <div className="app-header-drawer-auth-links">
                  <button type="button" className="app-header-drawer-login-btn" onClick={() => handleAuthEntry('/login')}>
                    Đăng nhập
                  </button>
                  <button type="button" className="app-header-drawer-register-btn" onClick={() => handleAuthEntry('/register')}>
                    Đăng ký
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
