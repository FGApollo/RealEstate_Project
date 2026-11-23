import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Bath, Bed, Check, Heart, Lock, Mail,
  MapPin, Maximize2, ShieldCheck
} from 'lucide-react';
import { fetchOfficialListings, fetchOfficialPreview, fetchPlusCatalog } from './plusApi';
import { SwipeNestBadges } from './SwipeNestBadges';
import './CheckedListingsSection.css';

const PLACEHOLDER_IMAGE = '/listing-placeholder.svg';

const UnlockCrownIcon = () => (
  <svg width="56" height="56" viewBox="0 0 64 64" fill="none" className="checked-crown-svg" aria-hidden="true">
    <defs>
      <linearGradient id="checkedCrownBody" x1="12" y1="14" x2="52" y2="52" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffec99" />
        <stop offset="48%" stopColor="#ffc133" />
        <stop offset="100%" stopColor="#e58a08" />
      </linearGradient>
      <linearGradient id="checkedCrownRim" x1="14" y1="45" x2="50" y2="54" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#ffd75e" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <filter id="checkedCrownGlow" x="4" y="8" width="56" height="52" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#f59e0b" floodOpacity="0.3" />
      </filter>
    </defs>
    <g filter="url(#checkedCrownGlow)">
      <path
        d="M12 25.5C11.6 23.6 13.8 22.3 15.3 23.5L23.5 30.2L30.2 17.6C31 16.1 33 16.1 33.8 17.6L40.5 30.2L48.7 23.5C50.2 22.3 52.4 23.6 52 25.5L47.8 45.2C47.4 47 45.8 48.2 44 48.2H20C18.2 48.2 16.6 47 16.2 45.2L12 25.5Z"
        fill="url(#checkedCrownBody)"
      />
      <rect x="16" y="45" width="32" height="6.2" rx="3.1" fill="url(#checkedCrownRim)" />
      <circle cx="12.5" cy="21" r="3.5" fill="#ffd966" />
      <circle cx="32" cy="14" r="4.3" fill="#ffd966" />
      <circle cx="51.5" cy="21" r="3.5" fill="#ffd966" />
      <path
        d="M32 28.4L33.8 32L37.8 32.6L34.9 35.4L35.6 39.4L32 37.5L28.4 39.4L29.1 35.4L26.2 32.6L30.2 32L32 28.4Z"
        fill="#ffffff"
        fillOpacity="0.96"
      />
    </g>
  </svg>
);

const formatCompactVnd = (amount) => {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) return '20.000đ';
  return `${new Intl.NumberFormat('vi-VN').format(num)}đ`;
};

// Mục "Nguồn hàng Swipe Nest" ở trang chủ (chỉ hiện cho tài khoản người dùng).
// Có Plus: các tin do đội Swipe Nest đăng. Chưa có Plus: khung xem trước bằng ảnh thật từ DB kèm lời mời nâng cấp.
const CheckedListingsSection = ({
  onOpen,
  formatPrice,
  favorites = [],
  onToggleFavorite,
  previewProperties = []
}) => {
  const [state, setState] = useState({ status: 'loading', properties: [] });
  const [officialPreviews, setOfficialPreviews] = useState([]);
  const [planInfo, setPlanInfo] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchOfficialListings({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', properties: data.properties || [] });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.code === 'PLUS_REQUIRED') {
          setState({ status: 'locked', properties: [] });
          // Tải ảnh xem trước thật từ nguồn hàng chính thức và giá gói Plus từ DB
          fetchOfficialPreview({ signal: controller.signal })
            .then((previewData) => {
              if (!controller.signal.aborted && Array.isArray(previewData?.previews)) {
                setOfficialPreviews(previewData.previews);
              }
            })
            .catch(() => {});

          fetchPlusCatalog({ signal: controller.signal })
            .then((catalogData) => {
              if (!controller.signal.aborted && catalogData?.plans?.[0]) {
                setPlanInfo(catalogData.plans[0]);
              }
            })
            .catch(() => {});
        } else {
          setState({ status: 'error', properties: [] });
        }
      });

    return () => controller.abort();
  }, []);

  // Tổng hợp tối đa 8 ảnh thật từ DB (không hardcode URL ảnh) cho lưới xem trước khi bị khóa
  const teaserImages = useMemo(() => {
    const seen = new Set();
    const collected = [];

    const pushImage = (id, url) => {
      const clean = typeof url === 'string' ? url.trim() : '';
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      collected.push({ id: id || clean, image: clean });
    };

    // 1. Ưu tiên ảnh thật từ endpoint xem trước nguồn hàng chính thức
    officialPreviews.forEach((item) => pushImage(item?.id, item?.image));

    // 2. Bổ sung ảnh từ các tin chính thức đã có trong dữ liệu trang chủ
    previewProperties
      .filter((item) => item?.owner?.is_official === true)
      .forEach((item) => {
        pushImage(item.id, item.thumbnail || item.images?.[0]);
        (item.images || []).forEach((img, idx) => pushImage(`${item.id}-off-${idx}`, img));
      });

    // 3. Nếu nguồn hàng chính thức hiện có ít hơn 8 ảnh, lấp phần còn thiếu bằng ảnh thật từ các tin đăng trên hệ thống
    previewProperties.forEach((item) => {
      if (collected.length >= 8) return;
      pushImage(item.id, item.thumbnail || item.images?.[0]);
    });

    if (collected.length > 0 && collected.length < 8) {
      previewProperties.forEach((item) => {
        (item.images || []).forEach((img, idx) => {
          if (collected.length < 8) pushImage(`${item.id}-gal-${idx}`, img);
        });
      });
    }

    return collected.slice(0, 8);
  }, [officialPreviews, previewProperties]);

  if (state.status === 'loading' || state.status === 'error') return null;

  const durationText = (planInfo?.duration_months || 1) === 1 ? 'tháng' : `${planInfo.duration_months} tháng`;
  const priceText = `${formatCompactVnd(planInfo?.amount_vnd ?? 20000)}/${durationText}`;
  const slotIndexes = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <section className="recommended-section checked-section" aria-labelledby="checked-section-title">
      <div className="section-heading-row listings-heading checked-section-heading">
        <div>
          <h2 id="checked-section-title" className="checked-title-row">
            <span>Nguồn hàng Swipe Nest</span>
            <span className="checked-title-shield" aria-hidden="true">
              <ShieldCheck size={19} />
            </span>
            <span className="checked-exclusive-badge">Độc quyền Plus</span>
          </h2>
          <p>Những căn do đội Swipe Nest đăng, dành cho thành viên Plus</p>
        </div>
      </div>

      {state.status === 'locked' ? (
        <div className="checked-locked-showcase">
          <div className="checked-teaser-grid" aria-hidden="true">
            {slotIndexes.map((idx) => {
              const item = teaserImages[idx] || (teaserImages.length > 0 ? teaserImages[idx % teaserImages.length] : null);
              const isBlurredRow = idx >= 4;
              const showBadge = idx < 4 || idx === 4 || idx === 7;

              return (
                <div
                  key={item ? `${item.id}-${idx}` : `placeholder-${idx}`}
                  className={`checked-teaser-tile ${isBlurredRow ? 'is-blurred' : ''}`}
                >
                  {item ? (
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = PLACEHOLDER_IMAGE;
                      }}
                    />
                  ) : (
                    <div className="checked-teaser-empty-fill" />
                  )}
                  {showBadge && (
                    <span className="checked-teaser-badge">
                      <span>Swipe Nest</span>
                      <span className="checked-teaser-badge-check">
                        <Check size={10} strokeWidth={3.4} />
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="checked-unlock-overlay">
            <div className="checked-unlock-main">
              <div className="checked-unlock-crown">
                <UnlockCrownIcon />
              </div>

              <div className="checked-unlock-copy">
                <h3>Mở khóa với Swipe Nest Plus</h3>
                <p>
                  Xem toàn bộ nguồn hàng độc quyền, chính chủ của Swipe Nest và nhắn tin trực tiếp với đội ngũ.
                </p>
                <div className="checked-unlock-perks">
                  <span className="checked-perk-pill perk-green">
                    <Check size={12} strokeWidth={3} />
                    <span>Nguồn hàng chính chủ xác thực</span>
                  </span>
                  <span className="checked-perk-pill perk-blue">
                    <Check size={12} strokeWidth={3} />
                    <span>Chat trực tiếp với Swipe Nest</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="checked-unlock-cta-box">
              <div className="checked-unlock-price-wrap">
                <strong className="checked-unlock-price">{priceText}</strong>
                <span className="checked-unlock-icons" aria-hidden="true">
                  <Mail size={13} />
                  <Lock size={13} />
                </span>
              </div>
              <Link to="/plus" className="checked-unlock-btn">
                <span>Xem gói Plus</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      ) : state.properties.length === 0 ? (
        <div className="checked-unlocked-frame">
          <p className="checked-section-empty">
            Đội Swipe Nest chưa đăng căn nào. Nguồn hàng sẽ được cập nhật sớm.
          </p>
        </div>
      ) : (
        <div className="checked-unlocked-frame">
          <div
            className="featured-properties-grid official-listings-track"
            role="region"
            aria-label="Bất động sản Swipe Nest"
            tabIndex={0}
          >
            {state.properties.map((property) => {
              const isFavorite = favorites.some((item) => item.id === property.id);
              return (
                <article
                  className="listing-card checked-official-card"
                  key={property.id}
                  onClick={() => onOpen(property)}
                  tabIndex={0}
                  aria-label={property.title}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                      event.preventDefault();
                      onOpen(property);
                    }
                  }}
                >
                  <div className="listing-image-wrap">
                    <img
                      src={property.thumbnail || property.images?.[0] || PLACEHOLDER_IMAGE}
                      alt={property.title}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = PLACEHOLDER_IMAGE;
                      }}
                    />
                    <SwipeNestBadges property={property} className="official-image-badge" />
                    {onToggleFavorite && (
                      <button
                        type="button"
                        className={`listing-favorite ${isFavorite ? 'active' : ''}`}
                        aria-label={isFavorite ? 'Bỏ lưu' : 'Lưu bất động sản'}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleFavorite(property);
                        }}
                      >
                        <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
                      </button>
                    )}
                  </div>
                  <div className="listing-card-body">
                    <h3>{property.title}</h3>
                    <p className="listing-address">
                      <MapPin size={12} /> {property.address}
                    </p>
                    <div className="checked-card-footer">
                      <p className="listing-price">
                        <strong>{formatPrice(property.price).toLowerCase()}</strong>
                        {property.listing_type === 'RENT' && <span>/tháng</span>}
                      </p>
                      {(property.bedrooms || property.bathrooms || property.area) && (
                        <div className="checked-mini-specs">
                          {property.bedrooms > 0 && (
                            <span><Bed size={12} /> {property.bedrooms}</span>
                          )}
                          {property.bathrooms > 0 && (
                            <span><Bath size={12} /> {property.bathrooms}</span>
                          )}
                          {property.area > 0 && (
                            <span><Maximize2 size={11} /> {property.area}m²</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="official-listing-open"
                      aria-label={`Xem ${property.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(property);
                      }}
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default CheckedListingsSection;
