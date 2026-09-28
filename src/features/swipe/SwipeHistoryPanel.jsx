import { ArrowRight, History, Heart, Home, MapPin, X } from 'lucide-react';

const SwipeHistoryPanel = ({ history, favorites, onSelect, onExplore }) => (
  <aside className="swipe-experience-panel swipe-history-panel">
    <div className="swipe-panel-heading">
      <span className="swipe-panel-icon history-icon"><History size={21} /></span>
      <h2>Lịch sử vuốt</h2>
    </div>

    {history.length === 0 ? (
      <div className="swipe-history-empty">
        <div className="swipe-history-mascot-scene">
          <span className="mascot-cloud cloud-left" aria-hidden="true" />
          <span className="mascot-cloud cloud-right" aria-hidden="true" />
          <span className="mascot-home-bubble" aria-hidden="true"><Home size={25} strokeWidth={1.8} /></span>
          <span className="mascot-skyline" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span className="swipe-history-mascot" role="img" aria-label="Rái cá xây nhà Swipe Nest" />
        </div>
        <h3>Chưa có bài đăng nào<br />được vuốt qua</h3>
        <p>Hãy bắt đầu khám phá để lưu lại lịch sử những bất động sản bạn đã xem nhé!</p>
        <button type="button" className="swipe-history-cta" onClick={onExplore}>Khám phá ngay <ArrowRight size={17} /></button>
      </div>
    ) : (
      <div className="swipe-history-list">
        {history.map((item) => {
          const isFavorite = favorites.some((favorite) => favorite.id === item.id);
          return (
            <button type="button" className="swipe-history-item" key={item.id} onClick={() => onSelect(item)}>
              <img src={item.thumbnail} alt="" loading="lazy" />
              <span className="swipe-history-item-copy">
                <strong>{item.title}</strong>
                <small><MapPin size={12} />{item.address || item.ward || 'Bất động sản'}</small>
              </span>
              <span className={`swipe-history-result ${isFavorite ? 'liked' : ''}`}>{isFavorite ? <Heart size={14} fill="currentColor" /> : <X size={14} />}</span>
            </button>
          );
        })}
      </div>
    )}
  </aside>
);

export default SwipeHistoryPanel;
