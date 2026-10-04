import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, ChevronDown, Compass, Heart, Home, LogOut, Menu, MessageCircle, Search, X
} from 'lucide-react';
import SwipeNestMark from '../../components/SwipeNestMark';
import { useAuth } from '../../auth/useAuth';
import './SwipeExperience.css';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80';

const SwipeHeader = ({ user, activeView, onHome, onDiscover, onFavorites, onChat, onSearch, onLogout }) => {
  const navigate = useNavigate();
  const { user: authUser, logout: authLogout } = useAuth();
  const currentUser = user || authUser;

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const displayName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Tài khoản';
  const handleHome = onHome || (() => navigate('/'));
  const handleDiscover = onDiscover || (() => navigate('/swipe/Tất cả'));
  const handleFavorites = onFavorites || (() => navigate('/swipe/Tất cả', { state: { activeView: 'saved' } }));
  const handleChat = onChat || (() => navigate('/chat'));
  const handleSearch = onSearch || (() => navigate('/swipe/Tất cả'));
  const handleLogout = onLogout || authLogout;

  const navigateFromMenu = (action) => {
    action();
    setMenuOpen(false);
  };

  return (
    <>
      <header className="swipe-experience-header">
        <div className="swipe-header-left">
          <button 
            className="swipe-mobile-menu-button" 
            type="button" 
            aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} 
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <div 
            className="swipe-brand" 
            role="button" 
            tabIndex={0} 
            onClick={handleHome} 
            onKeyDown={(event) => event.key === 'Enter' && handleHome()}
          >
            <span className="swipe-brand-mark"><SwipeNestMark /></span>
            <span>Swipe Nest</span>
          </div>
        </div>

        <nav className="swipe-primary-nav" aria-label="Điều hướng chính">
          <button type="button" className={`swipe-nav-link ${activeView === 'home' ? 'active' : ''}`} onClick={handleHome}>
            <span>Trang chủ</span>
          </button>
          <button type="button" className={`swipe-nav-link ${activeView === 'swipe' ? 'active' : ''}`} onClick={handleDiscover}>
            <Compass size={17} /><span>Khám phá</span>
          </button>
          <button type="button" className={`swipe-nav-link ${activeView === 'saved' ? 'active' : ''}`} onClick={handleFavorites}>
            <Heart size={17} /><span>Yêu thích</span>
          </button>
          <button type="button" className={`swipe-nav-link ${activeView === 'chat' ? 'active' : ''}`} onClick={handleChat}>
            <MessageCircle size={17} /><span>Chat</span>
          </button>
        </nav>

        <div className="swipe-header-tools">
          <button type="button" className="swipe-header-icon" aria-label="Mở bộ lọc tìm kiếm" onClick={handleSearch}>
            <Search size={21} />
          </button>
          <span className="swipe-header-notification" aria-label="Thông báo">
            <Bell size={20} />
            <i />
          </span>
          <div className="swipe-profile-wrap">
            <button 
              type="button" 
              className="swipe-profile-button" 
              onClick={() => setProfileOpen(!profileOpen)} 
              aria-expanded={profileOpen}
            >
              <img 
                src={currentUser?.avatar || DEFAULT_AVATAR} 
                alt={displayName} 
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = DEFAULT_AVATAR;
                }}
              />
              <span className="swipe-profile-name">{displayName}</span>
              <ChevronDown size={15} />
            </button>
            {profileOpen && (
              <div className="swipe-profile-menu">
                {currentUser?.email && <span className="swipe-profile-email">{currentUser.email}</span>}
                <button type="button" onClick={handleLogout}><LogOut size={15} />Đăng xuất</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <button type="button" className="swipe-mobile-menu-backdrop" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />
          <nav className="swipe-mobile-nav" aria-label="Điều hướng di động">
            <button type="button" onClick={() => navigateFromMenu(handleHome)}><Home size={18} />Trang chủ</button>
            <button type="button" onClick={() => navigateFromMenu(handleDiscover)}><Compass size={18} />Khám phá</button>
            <button type="button" onClick={() => navigateFromMenu(handleFavorites)}><Heart size={18} />Yêu thích</button>
            <button type="button" onClick={() => navigateFromMenu(handleChat)}><MessageCircle size={18} />Chat</button>
            <button type="button" onClick={() => navigateFromMenu(handleSearch)}><Search size={18} />Lọc bất động sản</button>
          </nav>
        </>
      )}
    </>
  );
};

export default SwipeHeader;
