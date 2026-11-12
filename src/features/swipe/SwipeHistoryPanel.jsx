import { ArrowRight, History, Heart, Home, MapPin, X } from 'lucide-react';

const SwipeHistoryPanel = ({ history, favorites, onSelect, onExplore, onViewAll }) => (
  <aside className="swipe-experience-panel swipe-history-panel">
    <div className="swipe-panel-heading">
      <span className="swipe-panel-icon history-icon"><History size={21} /></span>
      <h2>Lịch sử vuốt</h2>
      {history.length > 0 && onViewAll && (
        <button type="button" className="swipe-history-view-all" onClick={onViewAll}>Xem tất cả <ArrowRight size={14} /></button>
      )}
    </div>

    {history.length === 0 ? (
      <div className="swipe-history-empty">
        <div className="swipe-history-mascot-scene">
          <span className="mascot-cloud cloud-left" aria-hidden="true" />
          <span className="mascot-cloud cloud-right" aria-hidden="true" />
          <span className="mascot-home-bubble" aria-hidden="true"><Home size={25} strokeWidth={1.8} /></span>
          <span className="mascot-skyline" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <img className="swipe-history-mascot" src="/mascots/otter-builder-paper.png" alt="Rái cá Swipe Nest đang cầm tờ giấy" draggable="false" />
        </div>
        <h3>Chưa có bài đăng nào<br />được vuốt qua</h3>
        <p>Hãy bắt đầu khám phá để lưu lại lịch sử những bất động sản bạn đã xem nhé!</p>
        <button type="button" className="swipe-history-cta" onClick={onExplore}>Khám phá ngay <ArrowRight size={17} /></button>
      </div>
    ) : (
      <div className="swipe-history-list">
        {history.map((item) => {
          // Biểu tượng theo đúng lượt vuốt (phải = thích, trái = bỏ qua); tin cũ chưa có thông tin vuốt thì dựa vào Yêu thích.
          const isFavorite = item.swipeType ? item.swipeType === 'right' : favorites.some((favorite) => favorite.id === item.id);
          return (
            <button type="button" className="swipe-history-item" key={item.id} onClick={() => onSelect(item)}
              disabled={item.available === false} title={item.available === false ? 'Tin không còn hiển thị' : undefined}>
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
