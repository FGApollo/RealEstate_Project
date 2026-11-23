import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Heart, Loader2, MapPin } from 'lucide-react';
import PageWaveBackground from '../../components/PageWaveBackground';
import { getCategoryKey } from '../../services/propertyCategory.js';
import {
  SAVED_CATEGORIES,
  SAVED_SORT_OPTIONS,
  countByCategory,
  filterAndSortSaved,
  formatSavedPrice,
  formatSavedSpecs
} from './savedPropertiesLogic';
import './SavedPropertiesView.css';

const PLACEHOLDER_IMAGE = '/listing-placeholder.svg';

const SavedSortDropdown = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const currentLabel = SAVED_SORT_OPTIONS.find((opt) => opt.value === value)?.label || 'Thêm gần đây';

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="fav-sort-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`fav-sort-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>Sắp xếp: <strong>{currentLabel}</strong></span>
        <ChevronDown size={15} className="fav-sort-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="fav-sort-menu" role="listbox" aria-label="Sắp xếp bất động sản yêu thích">
          {SAVED_SORT_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`fav-sort-option ${active ? 'is-selected' : ''}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span>{opt.label}</span>
                {active && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function SavedPropertiesView({
  user,
  favorites = [],
  isLoading = false,
  selectedCategory,
  onSelectCategory,
  sortBy,
  onChangeSort,
  openingChatPropertyId,
  onOpenDetail,
  onUnsave,
  onOpenChat,
  onStartDiscover
}) {
  const visibleProperties = useMemo(
    () => filterAndSortSaved(favorites, { category: selectedCategory, sortBy }),
    [favorites, selectedCategory, sortBy]
  );

  return (
    <div className="fav-page">
      <PageWaveBackground className="fav-bg-decor" waveClassName="fav-bg-waves" />

      <main className="fav-container">
        {/* Header Row */}
        <header className="fav-header">
          <div>
            <h1 className="fav-title">Bất động sản yêu thích</h1>
            <p className="fav-count">{favorites.length} bất động sản đã lưu</p>
          </div>
          <SavedSortDropdown value={sortBy} onChange={onChangeSort} />
        </header>

        {/* Horizontal Category Tabs */}
        <nav className="fav-tabs" aria-label="Lọc theo loại bất động sản">
          {SAVED_CATEGORIES.map((cat) => {
            const count = countByCategory(favorites, cat);
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                className={`fav-tab ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelectCategory(cat)}
              >
                {count > 0 || cat === 'Tất cả' ? `${cat} (${count})` : cat}
              </button>
            );
          })}
        </nav>

        {/* Content States */}
        {isLoading ? (
          <div className="fav-grid">
            {[1, 2, 3].map((n) => (
              <div key={n} className="fav-skeleton-card" aria-hidden="true">
                <div className="fav-skeleton-img" />
                <div className="fav-skeleton-body">
                  <div className="fav-skeleton-line w-45" />
                  <div className="fav-skeleton-line w-90" />
                  <div className="fav-skeleton-line w-70" />
                  <div className="fav-skeleton-btn" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleProperties.length === 0 ? (
          <section className="fav-empty">
            <span className="fav-empty-icon"><Heart size={36} /></span>
            <h2>
              {favorites.length === 0
                ? 'Chưa có bất động sản nào trong danh sách yêu thích'
                : `Chưa có tin "${selectedCategory}" nào được lưu`}
            </h2>
            <p>Khám phá và nhấn yêu thích những căn phù hợp để dễ dàng so sánh và liên hệ môi giới.</p>
            <button type="button" className="fav-empty-btn" onClick={onStartDiscover}>
              Khám phá bất động sản
            </button>
          </section>
        ) : (
          <div className="fav-grid">
            {visibleProperties.map((property) => {
              const isClosed = ['SOLD', 'RENTED'].includes(property.status);
              const isOwnListing = Boolean(user && Number(user.id) === Number(property.owner_id));
              const isOpeningChat = openingChatPropertyId === property.id;
              const categoryBadge = getCategoryKey(property.property_type);
              const specs = formatSavedSpecs(property);

              return (
                <article
                  key={property.id}
                  className={`fav-card ${isClosed ? 'is-closed' : ''}`}
                  onClick={() => onOpenDetail(property)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) {
                      e.preventDefault();
                      onOpenDetail(property);
                    }
                  }}
                >
                  <div className="fav-card-media">
                    <img
                      src={property.thumbnail || property.images?.[0] || PLACEHOLDER_IMAGE}
                      alt={property.title}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER_IMAGE; }}
                    />
                    <span className="fav-category-pill">{categoryBadge}</span>
                    {isClosed && (
                      <span className="fav-closed-pill">
                        {property.status === 'SOLD' ? 'Đã bán' : 'Đã cho thuê'}
                      </span>
                    )}
                    <button
                      type="button"
                      className="fav-heart-btn"
                      aria-label="Bỏ yêu thích"
                      title="Bỏ yêu thích"
                      onClick={(e) => { e.stopPropagation(); onUnsave(property.id); }}
                    >
                      <Heart size={18} fill="#dc2626" color="#dc2626" />
                    </button>
                  </div>

                  <div className="fav-card-body">
                    <p className="fav-price">
                      <strong>{formatSavedPrice(property.price)}</strong>
                      {property.listing_type === 'RENT' && <span> /tháng</span>}
                      {property.listing_type === 'SALE' && <span> · mua bán</span>}
                    </p>

                    <h2 className="fav-card-title">{property.title}</h2>

                    <p className="fav-address">
                      <MapPin size={14} aria-hidden="true" />
                      <span>{property.address}</span>
                    </p>

                    {specs.length > 0 && (
                      <p className="fav-specs">
                        {specs.map((token, idx) => (
                          <span key={token}>
                            {idx > 0 && <span className="fav-spec-dot">·</span>}
                            {token}
                          </span>
                        ))}
                      </p>
                    )}

                    <div className="fav-card-actions">
                      {isOwnListing ? (
                        <span className="fav-own-badge">Tin của bạn</span>
                      ) : (
                        <button
                          type="button"
                          className="fav-chat-btn"
                          disabled={isOpeningChat}
                          onClick={(e) => { e.stopPropagation(); onOpenChat(property.id); }}
                        >
                          {isOpeningChat ? (
                            <><Loader2 size={16} className="fav-spin" /><span>Đang mở chat...</span></>
                          ) : (
                            'Nhắn tin môi giới'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
