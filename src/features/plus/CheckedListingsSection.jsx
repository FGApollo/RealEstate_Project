import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Bath, Bed, Check, Heart, Lock, Mail,
  MapPin, Maximize2, ShieldCheck
} from 'lucide-react';
import { fetchOfficialListings, fetchOfficialPreview, fetchPlusCatalog } from './plusApi';
import { collectTeaserImages, formatPlanPriceLabel } from './officialPreviewLogic';
import PlusCrownIcon from './PlusCrownIcon';
import { SwipeNestBadges } from './SwipeNestBadges';
import './CheckedListingsSection.css';

const PLACEHOLDER_IMAGE = '/listing-placeholder.svg';
const TEASER_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7];

const LockedShowcase = ({ teaserImages, priceText }) => (
  <div className="checked-locked-showcase">
    <div className="checked-teaser-grid" aria-hidden="true">
      {TEASER_SLOTS.map((idx) => {
        const item = teaserImages[idx] || (teaserImages.length > 0 ? teaserImages[idx % teaserImages.length] : null);
        const isBlurred = idx >= 4;
        const showBadge = idx < 4 || idx === 4 || idx === 7;
        return (
          <div key={item ? `${item.id}-${idx}` : `placeholder-${idx}`} className={`checked-teaser-tile ${isBlurred ? 'is-blurred' : ''}`}>
            {item ? (
              <img
                src={item.image}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER_IMAGE; }}
              />
            ) : (
              <div className="checked-teaser-empty-fill" />
            )}
            {showBadge && (
              <span className="checked-teaser-badge">
                <span>Swipe Nest</span>
                <span className="checked-teaser-badge-check"><Check size={10} strokeWidth={3.4} /></span>
              </span>
            )}
          </div>
        );
      })}
    </div>

    <div className="checked-unlock-overlay">
      <div className="checked-unlock-main">
        <div className="checked-unlock-crown">
          <PlusCrownIcon size={54} svgClassName="checked-crown-svg" />
        </div>
        <div className="checked-unlock-copy">
          <h3>Mở khóa với Swipe Nest Plus</h3>
          <p>Xem toàn bộ nguồn hàng độc quyền, chính chủ của Swipe Nest và nhắn tin trực tiếp với đội ngũ.</p>
          <div className="checked-unlock-perks">
            <span className="checked-perk-pill perk-green"><Check size={12} strokeWidth={3} /><span>Nguồn hàng chính chủ xác thực</span></span>
            <span className="checked-perk-pill perk-blue"><Check size={12} strokeWidth={3} /><span>Chat trực tiếp với Swipe Nest</span></span>
          </div>
        </div>
      </div>

      <div className="checked-unlock-cta-box">
        <div className="checked-unlock-price-wrap">
          <strong className="checked-unlock-price">{priceText}</strong>
          <span className="checked-unlock-icons" aria-hidden="true"><Mail size={13} /><Lock size={13} /></span>
        </div>
        <Link to="/plus" className="checked-unlock-btn">
          <span>Xem gói Plus</span>
          <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  </div>
);

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
        if (!controller.signal.aborted) setState({ status: 'ready', properties: data.properties || [] });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.code !== 'PLUS_REQUIRED') {
          setState({ status: 'error', properties: [] });
          return;
        }
        setState({ status: 'locked', properties: [] });
        const inlinePreviews = error.data?.previews;
        const inlinePlan = error.data?.plan;
        if (Array.isArray(inlinePreviews)) {
          setOfficialPreviews(inlinePreviews);
        } else {
          fetchOfficialPreview({ signal: controller.signal })
            .then((data) => { if (!controller.signal.aborted && Array.isArray(data?.previews)) setOfficialPreviews(data.previews); })
            .catch(() => {});
        }
        if (inlinePlan) {
          setPlanInfo(inlinePlan);
        } else {
          fetchPlusCatalog({ signal: controller.signal })
            .then((data) => { if (!controller.signal.aborted && data?.plans?.[0]) setPlanInfo(data.plans[0]); })
            .catch(() => {});
        }
      });
    return () => controller.abort();
  }, []);

  const teaserImages = useMemo(
    () => collectTeaserImages(officialPreviews, previewProperties, 8),
    [officialPreviews, previewProperties]
  );

  if (state.status === 'loading' || state.status === 'error') return null;

  return (
    <section className="recommended-section checked-section" aria-labelledby="checked-section-title">
      <div className="section-heading-row listings-heading checked-section-heading">
        <div>
          <h2 id="checked-section-title" className="checked-title-row">
            <span>Nguồn hàng Swipe Nest</span>
            <span className="checked-title-shield" aria-hidden="true"><ShieldCheck size={19} /></span>
            <span className="checked-exclusive-badge">Độc quyền Plus</span>
          </h2>
          <p>Những căn do đội Swipe Nest đăng, dành cho thành viên Plus</p>
        </div>
      </div>

      {state.status === 'locked' ? (
        <LockedShowcase teaserImages={teaserImages} priceText={formatPlanPriceLabel(planInfo)} />
      ) : state.properties.length === 0 ? (
        <div className="checked-unlocked-frame">
          <p className="checked-section-empty">Đội Swipe Nest chưa đăng căn nào. Nguồn hàng sẽ được cập nhật sớm.</p>
        </div>
      ) : (
        <div className="checked-unlocked-frame">
          <div className="featured-properties-grid official-listings-track" role="region" aria-label="Bất động sản Swipe Nest" tabIndex={0}>
            {state.properties.map((property) => {
              const isFavorite = favorites.some((item) => item.id === property.id);
              return (
                <article
                  className="listing-card checked-official-card"
                  key={property.id}
                  onClick={() => onOpen(property)}
                  tabIndex={0}
                  aria-label={property.title}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) {
                      e.preventDefault();
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
                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER_IMAGE; }}
                    />
                    <SwipeNestBadges property={property} className="official-image-badge" />
                    {onToggleFavorite && (
                      <button
                        type="button"
                        className={`listing-favorite ${isFavorite ? 'active' : ''}`}
                        aria-label={isFavorite ? 'Bỏ lưu' : 'Lưu bất động sản'}
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(property); }}
                      >
                        <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
                      </button>
                    )}
                  </div>
                  <div className="listing-card-body">
                    <h3>{property.title}</h3>
                    <p className="listing-address"><MapPin size={12} /> {property.address}</p>
                    <div className="checked-card-footer">
                      <p className="listing-price">
                        <strong>{formatPrice(property.price).toLowerCase()}</strong>
                        {property.listing_type === 'RENT' && <span>/tháng</span>}
                      </p>
                      {(property.bedrooms || property.bathrooms || property.area) && (
                        <div className="checked-mini-specs">
                          {property.bedrooms > 0 && <span><Bed size={12} /> {property.bedrooms}</span>}
                          {property.bathrooms > 0 && <span><Bath size={12} /> {property.bathrooms}</span>}
                          {property.area > 0 && <span><Maximize2 size={11} /> {property.area}m²</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="official-listing-open"
                      aria-label={`Xem ${property.title}`}
                      onClick={(e) => { e.stopPropagation(); onOpen(property); }}
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
