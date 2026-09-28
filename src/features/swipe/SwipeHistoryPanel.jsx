import { ArrowRight, History, Heart, MapPin, X } from 'lucide-react';
import { Mascot } from 'page-mascot';

const SwipeHistoryPanel = ({ history, favorites, onSelect, onExplore }) => (
  <aside className="swipe-experience-panel swipe-history-panel">
    <div className="swipe-panel-heading">
      <span className="swipe-panel-icon history-icon"><History size={21} /></span>
      <h2>Lịch sử vuốt</h2>
    </div>

    {history.length === 0 ? (
      <div className="swipe-history-empty">
        <div className="swipe-history-mascot-scene">
          <span className="mascot-home-bubble"><span>⌂</span></span>
          <span className="mascot-skyline" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <Mascot
            directions="/mascots/otter-builder-directions.webp"
            reactions="/mascots/otter-builder-reactions.webp"
            size={154}
            label="Rái cá Swipe Nest"
            className="swipe-history-mascot"
          />
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
