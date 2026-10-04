import { useState } from 'react';
import {
  Bell, ChevronDown, Compass, Heart, Home, LogOut, Menu, MessageCircle, Search, X
} from 'lucide-react';
import SwipeNestMark from '../../components/SwipeNestMark';

const SwipeHeader = ({ user, activeView, onHome, onDiscover, onFavorites, onChat, onSearch, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const displayName = user?.name || user?.email?.split('@')[0] || 'Tài khoản';

  const navigateFromMenu = (action) => {
    action();
    setMenuOpen(false);
  };

  return (
    <>
      <header className="swipe-experience-header">
        <div className="swipe-brand" role="button" tabIndex={0} onClick={onHome} onKeyDown={(event) => event.key === 'Enter' && onHome()}>
          <span className="swipe-brand-mark"><SwipeNestMark /></span>
          <span>Swipe Nest</span>
        </div>

        <button className="swipe-mobile-menu-button" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav className="swipe-primary-nav" aria-label="Điều hướng chính">
          <button type="button" className="swipe-nav-link" onClick={onHome}><span>Trang chủ</span></button>
          <button type="button" className={`swipe-nav-link ${activeView === 'swipe' ? 'active' : ''}`} onClick={onDiscover}>
            <Compass size={17} /><span>Khám phá</span>
          </button>
          <button type="button" className={`swipe-nav-link ${activeView === 'saved' ? 'active' : ''}`} onClick={onFavorites}>
            <Heart size={17} /><span>Yêu thích</span>
          </button>
          <button type="button" className="swipe-nav-link" onClick={onChat}><MessageCircle size={17} /><span>Chat</span></button>
        </nav>

        <div className="swipe-header-tools">
          <button type="button" className="swipe-header-icon" aria-label="Mở bộ lọc tìm kiếm" onClick={onSearch}><Search size={21} /></button>
          <span className="swipe-header-notification" aria-label="Thông báo"><Bell size={20} /><i /></span>
          <div className="swipe-profile-wrap">
            <button type="button" className="swipe-profile-button" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}>
              {user?.avatar ? <img src={user.avatar} alt="" /> : <span className="swipe-profile-initial">{displayName.slice(0, 1).toUpperCase()}</span>}
              <span className="swipe-profile-name">{displayName}</span>
              <ChevronDown size={15} />
            </button>
            {profileOpen && (
              <div className="swipe-profile-menu">
                {user?.email && <span className="swipe-profile-email">{user.email}</span>}
                <button type="button" onClick={onLogout}><LogOut size={15} />Đăng xuất</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <button type="button" className="swipe-mobile-menu-backdrop" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />
          <nav className="swipe-mobile-nav" aria-label="Điều hướng di động">
            <button type="button" onClick={() => navigateFromMenu(onHome)}><Home size={18} />Trang chủ</button>
            <button type="button" onClick={() => navigateFromMenu(onDiscover)}><Compass size={18} />Khám phá</button>
            <button type="button" onClick={() => navigateFromMenu(onFavorites)}><Heart size={18} />Yêu thích</button>
            <button type="button" onClick={() => navigateFromMenu(onChat)}><MessageCircle size={18} />Chat</button>
            <button type="button" onClick={() => navigateFromMenu(onSearch)}><Search size={18} />Lọc bất động sản</button>
          </nav>
        </>
      )}
    </>
  );
};

export default SwipeHeader;
