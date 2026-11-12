import { motion } from 'framer-motion';
import {
  Bed, Bath, ChevronLeft, ChevronRight, Compass, Heart, History, Info, MapPin,
  Maximize, RefreshCw, X
} from 'lucide-react';
import { SwipeNestBadges } from '../plus/SwipeNestBadges';

const SwipeMainSection = ({
  discoveryTitle, currentProperty, formatPrice, onOpenHistory,
  onPrevious, onNext, onShowDetails, onRestart, onAdjustPreferences, isLoading, hasError,
  cardMotion, cardController, handleDragEnd, currentIndex, propertyCount, isSwiping
}) => {
  const location = currentProperty?.address || [currentProperty?.ward, currentProperty?.district, currentProperty?.city].filter(Boolean).join(', ');
  const pageCount = Math.max(1, Math.min(propertyCount || 1, 5));
  const activeDot = propertyCount ? currentIndex % pageCount : 0;

  return (
    <main className="swipe-experience-main">
      <div className="swipe-main-backdrop" />
      <div className="swipe-main-content">
        <header className="swipe-discovery-heading">
          <div className="swipe-discovery-copy">
            <span className="swipe-discovery-icon"><Compass size={23} /></span>
            <div>
              <h1>{discoveryTitle}</h1>
              <p>Khám phá tin đăng và vuốt để Swipe Nest dần hiểu lựa chọn của bạn</p>
            </div>
          </div>
          <div className="swipe-heading-actions">
            {/* Lịch sử vuốt ẩn mặc định, bấm mới mở ngăn kéo bên trái. */}
            <button type="button" className="swipe-filter-pill" onClick={onOpenHistory} aria-haspopup="dialog" aria-label="Lịch sử vuốt">
              <History size={18} /><span>Lịch sử</span>
            </button>
          </div>
        </header>

        <div className="swipe-experience-deck">
          {currentProperty && (
            <>
              <button type="button" className="swipe-deck-arrow previous" onClick={onPrevious} disabled={isSwiping} aria-label="Bỏ qua bất động sản"><ChevronLeft size={23} /></button>
              <button type="button" className="swipe-deck-arrow next" onClick={onNext} disabled={isSwiping} aria-label="Thích bất động sản"><ChevronRight size={23} /></button>
            </>
          )}

          {currentProperty ? (
            <motion.article
              className="swipe-property-card"
              drag="x"
              dragConstraints={{ left: -1000, right: 1000 }}
              dragElastic={1}
              dragTransition={{ bounceStiffness: 600, bounceDamping: 30 }}
              style={cardMotion}
              onDragEnd={handleDragEnd}
              animate={cardController}
              whileDrag={{ scale: 1.02 }}
            >
              {currentProperty.thumbnail ? <img className="swipe-property-image" src={currentProperty.thumbnail} alt={currentProperty.title} draggable="false" /> : <div className="swipe-property-image-placeholder" />}
              <div className="swipe-property-image-shade" />
              {/* Chỉ còn nhãn Swipe Nest; chủ tin đã KYC thì xem ở chi tiết tin và trong chat. */}
              <SwipeNestBadges property={currentProperty} className="swipe-sn-badges" />

              <div className="swipe-property-overlay">
                <div className="swipe-property-heading">
                  <h2>{currentProperty.title}</h2>
                  {location && <p><MapPin size={16} /><span>{location}</span></p>}
                </div>
                <div className="swipe-property-facts-row">
                  <div className="swipe-property-price">
                    {formatPrice(currentProperty.price)}
                    {currentProperty.listing_type === 'RENT' && <span>/tháng</span>}
                    {currentProperty.listing_type === 'SALE' && <span>mua bán</span>}
                  </div>
                  <div className="swipe-property-facts">
                    <span><Bed size={18} /><b>{currentProperty.bedrooms || 0}</b><small>Phòng ngủ</small></span>
                    <span><Bath size={18} /><b>{currentProperty.bathrooms || 0}</b><small>Phòng tắm</small></span>
                    <span><Maximize size={18} /><b>{currentProperty.area || '—'}{currentProperty.area ? 'm²' : ''}</b><small>Diện tích</small></span>
                  </div>
                </div>
              </div>
            </motion.article>
          ) : (
            <div className="swipe-card-empty">
              {isLoading ? <span className="swipe-loading-spinner" /> : hasError ? <Info size={42} /> : <RefreshCw size={42} />}
              <h2>{isLoading ? 'Đang tìm bất động sản' : hasError ? 'Chưa thể tải dữ liệu' : propertyCount === 0 ? 'Chưa có tin phù hợp' : 'Bạn đã xem hết lượt này'}</h2>
              <p>{isLoading ? 'Swipe Nest đang tìm những lựa chọn phù hợp cho bạn.' : hasError ? 'Đã có lỗi khi kết nối. Hãy thử tải lại danh sách.' : propertyCount === 0 ? 'Thử đổi bộ lọc hoặc thêm tùy chọn gợi ý trong hồ sơ nhé.' : 'Swipe Nest sẽ xếp hạng lại các lựa chọn mới nhất cho bạn.'}</p>
              {!isLoading && <button type="button" className="swipe-restart-button" onClick={propertyCount === 0 && !hasError ? onAdjustPreferences : onRestart}>{hasError ? 'Thử lại' : propertyCount === 0 ? 'Tùy chỉnh gợi ý' : 'Tải gợi ý mới'}</button>}
            </div>
          )}
        </div>

        {currentProperty && (
          <>
            <div className="swipe-experience-actions">
              <button type="button" className="swipe-action-button dislike" onClick={onPrevious} disabled={isSwiping} aria-label="Bỏ qua"><X size={30} /></button>
              <button type="button" className="swipe-action-button details" onClick={onShowDetails} aria-label="Xem thông tin chi tiết"><Info size={24} /></button>
              {/* Nút tim = quẹt phải: cùng một cơ chế (ghi lượt thích, lưu Yêu thích, chuyển sang thẻ kế tiếp). */}
              <button type="button" className="swipe-action-button like" onClick={onNext} disabled={isSwiping} aria-label="Thích (quẹt phải)"><Heart size={29} /></button>
            </div>
            <div className="swipe-discover-hint"><span>Vuốt để khám phá thêm</span></div>
            <div className="swipe-pagination" aria-label={`Bất động sản ${currentIndex + 1} trên ${propertyCount}`}>
              {Array.from({ length: pageCount }, (_, index) => <span key={index} className={index === activeDot ? 'active' : ''} />)}
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default SwipeMainSection;
