import Header from '../../components/Header';

/**
 * SwipeHeader bridge component to ensure full backward compatibility.
 * Delegates to the unified Header component.
 */
const SwipeHeader = ({ user, activeView, onHome, onDiscover, onFavorites, onChat, onSearch, onProfile, onLogout }) => {
  return (
    <Header
      user={user}
      activeTab={activeView}
      onTabChange={(tab) => {
        if (tab === 'home' && onHome) { onHome(); return true; }
        if (tab === 'swipe' && onDiscover) { onDiscover(); return true; }
        if (tab === 'saved' && onFavorites) { onFavorites(); return true; }
        if (tab === 'chat' && onChat) { onChat(); return true; }
        if (tab === 'profile' && onProfile) { onProfile(); return true; }
        return false;
      }}
      showSearch={Boolean(onSearch)}
      onSearchClick={onSearch}
      onLogout={onLogout}
    />
  );
};

export default SwipeHeader;
