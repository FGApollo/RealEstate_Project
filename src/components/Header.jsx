import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, X, Search, Bell, ChevronDown, User, LogOut, 
  Home as HomeIcon, Compass, Heart, MessageCircle, ShieldCheck, BriefcaseBusiness
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { clearPendingAuthAction } from '../auth/pendingAuthAction';
import { normalizeRole, roleDestination } from '../auth/roleDestination.js';
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
  const role = normalizeRole(auth?.user?.role);
  const homePath = role ? roleDestination(role) : '/';
  const profilePath = role === 'ADMIN' || role === 'AGENT' ? homePath : '/profile';
  const profileLabel = role === 'ADMIN' ? 'Trang quản trị' : role === 'AGENT' ? 'Không gian môi giới' : 'Hồ sơ cá nhân';
  const navItems = role === 'ADMIN'
    ? [{ key: 'admin', label: 'Quản trị', path: '/admin', Icon: ShieldCheck }]
    : role === 'AGENT' ? [
      { key: 'agent', label: 'Môi giới', path: '/sale/overview', Icon: BriefcaseBusiness },
      { key: 'chat', label: 'Chat', path: '/chat', Icon: MessageCircle }
    ] : [
      { key: 'home', label: 'Trang chủ', path: '/', Icon: HomeIcon },
      { key: 'swipe', label: 'Khám phá', path: '/swipe/Tất cả', Icon: Compass },
      { key: 'saved', label: 'Yêu thích', path: '/swipe/Tất cả', state: { activeView: 'saved' }, Icon: Heart },
      { key: 'chat', label: 'Chat', path: '/chat', Icon: MessageCircle }
    ];
  const logout = onLogoutProp || auth?.logout;
  const requireAuth = useRequireAuth();

  const [showDropdown, setShowDropdown] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const dropdownRef = useRef(null);
  const drawerRef = useRef(null);

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
    if (!mobileDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const drawer = drawerRef.current;
    drawer?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      drawer?.close();
      document.body.style.overflow = previousOverflow;
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
    if (path === '/admin') return 'admin';
    if (path === '/sale/overview') return 'agent';
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
          onClick={() => handleTabClick('home', homePath)}
          onKeyDown={(e) => e.key === 'Enter' && handleTabClick('home', homePath)}
          aria-label="Về trang chủ Swipe Nest"
        >
          <span className="app-header-brand-mark">
            <SwipeNestMark />
          </span>
          <span className="app-header-brand-title">Swipe Nest</span>
        </div>

        {/* Middle: Primary Navigation (Desktop) */}
        <nav className="app-header-nav" aria-label="Điều hướng chính">
          {navItems.map(({ key, label, path, state, Icon }) => (
            <button type="button" key={key} className={`app-header-nav-link ${currentTab === key ? 'active' : ''}`}
              onClick={() => handleTabClick(key, path, state)}>
              {key !== 'home' && <Icon size={17} />}<span>{label}</span>
            </button>
          ))}
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
            aria-expanded={mobileDrawerOpen}
            aria-controls="app-mobile-navigation"
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
                      handleTabClick('profile', profilePath);
                    }}
                  >
                    <User size={15} />
                    <span>{profileLabel}</span>
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
        <dialog ref={drawerRef} id="app-mobile-navigation" aria-label="Menu điều hướng" className="app-header-mobile-backdrop" onCancel={event => { event.preventDefault(); setMobileDrawerOpen(false); }} onClick={() => setMobileDrawerOpen(false)}>
          <div className="app-header-mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="app-header-drawer-top">
              <div 
                className="app-header-brand" 
                onClick={() => { 
                  setMobileDrawerOpen(false); 
                  handleTabClick('home', homePath);
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
              {navItems.map(({ key, label, path, state, Icon }) => (
                <button type="button" key={key} className={`app-header-drawer-link ${currentTab === key ? 'active' : ''}`}
                  onClick={() => handleTabClick(key, path, state)}>
                  <Icon size={18} /><span>{label}</span>
                </button>
              ))}
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
                  onClick={() => handleTabClick('profile', profilePath)}
                >
                  <User size={18} />
                  <span>{profileLabel}</span>
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
        </dialog>
      )}
    </>
  );
}
