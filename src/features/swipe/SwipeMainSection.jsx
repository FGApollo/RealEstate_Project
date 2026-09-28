import { motion } from 'framer-motion';
import {
  BadgeCheck, Bed, Bath, ChevronLeft, ChevronRight, Compass, Heart, Info, MapPin,
  Maximize, RefreshCw, SlidersHorizontal, X
} from 'lucide-react';

const SwipeMainSection = ({
  currentProperty, isAlreadyFavorite, formatPrice, onOpenFilters, activeFiltersCount,
  onPrevious, onNext, onToggleFavorite, onShowDetails, onRestart, isLoading, hasError,
  cardMotion, cardController, handleDragEnd, currentIndex, propertyCount
}) => {
  const location = currentProperty?.address || [currentProperty?.ward, currentProperty?.district, currentProperty?.city].filter(Boolean).join(', ');
  const verified = currentProperty?.owner?.verification_status === 'VERIFIED';
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
              <h1>Khám phá tất cả</h1>
              <p>Tìm ngôi nhà mơ ước phù hợp với phong cách sống của bạn</p>
            </div>
          </div>
          <button type="button" className={`swipe-filter-pill ${activeFiltersCount ? 'has-filters' : ''}`} onClick={onOpenFilters}>
            <SlidersHorizontal size={18} /><span>Lọc</span>
            {activeFiltersCount > 0 && <b>{activeFiltersCount}</b>}
          </button>
        </header>

        <div className="swipe-experience-deck">
          {currentProperty && (
            <>
              <button type="button" className="swipe-deck-arrow previous" onClick={onPrevious} aria-label="Bỏ qua bất động sản"><ChevronLeft size={23} /></button>
              <button type="button" className="swipe-deck-arrow next" onClick={onNext} aria-label="Thích bất động sản"><ChevronRight size={23} /></button>
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
              {verified && <span className="swipe-verified-badge"><BadgeCheck size={17} fill="currentColor" />ĐÃ XÁC THỰC</span>}
              <button type="button" className={`swipe-property-favorite ${isAlreadyFavorite ? 'active' : ''}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggleFavorite(); }} aria-label={isAlreadyFavorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'}>
                <Heart size={24} fill={isAlreadyFavorite ? 'currentColor' : 'none'} />
              </button>

              <div className="swipe-property-overlay">
                <div className="swipe-property-heading">
                  <h2>{currentProperty.title}</h2>
                  {location && <p><MapPin size={16} /><span>{location}</span></p>}
                </div>
                <div className="swipe-property-facts-row">
                  <div className="swipe-property-price">{formatPrice(currentProperty.price)}<span>/tháng</span></div>
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
              <h2>{isLoading ? 'Đang tìm bất động sản' : hasError ? 'Chưa thể tải dữ liệu' : 'Không còn bài đăng nào'}</h2>
              <p>{isLoading ? 'Swipe Nest đang tìm những lựa chọn phù hợp cho bạn.' : hasError ? 'Đã có lỗi khi kết nối. Hãy thử tải lại danh sách.' : 'Bạn đã vuốt qua tất cả bài đăng trong danh mục này.'}</p>
              {!isLoading && <button type="button" className="swipe-restart-button" onClick={onRestart}>{hasError ? 'Thử lại' : 'Vuốt lại từ đầu'}</button>}
            </div>
          )}
        </div>

        {currentProperty && (
          <>
            <div className="swipe-experience-actions">
              <button type="button" className="swipe-action-button dislike" onClick={onPrevious} aria-label="Bỏ qua"><X size={30} /></button>
              <button type="button" className="swipe-action-button details" onClick={onShowDetails} aria-label="Xem thông tin chi tiết"><Info size={24} /></button>
              <button type="button" className={`swipe-action-button like ${isAlreadyFavorite ? 'active' : ''}`} onClick={onToggleFavorite} aria-label="Thêm yêu thích"><Heart size={29} fill={isAlreadyFavorite ? 'currentColor' : 'none'} /></button>
            </div>
            <div className="swipe-discover-hint"><ChevronLeft size={15} /><span>Vuốt để khám phá thêm</span><ChevronRight size={15} /></div>
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
