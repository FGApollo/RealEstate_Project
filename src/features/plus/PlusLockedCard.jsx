import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bath, Bed, Crown, Lock, MapPin, Ruler } from 'lucide-react';
import { SwipeNestBadges } from './SwipeNestBadges';
import './PlusLockedCard.css';

const PLACEHOLDER_IMAGE = '/listing-placeholder.svg';

const PlusLockedCard = ({ property, formatPrice, className = '' }) => {
  const navigate = useNavigate();
  const goToPlus = () => navigate('/plus');
  const imageSrc = property?.thumbnail || property?.images?.[0] || PLACEHOLDER_IMAGE;

  return (
    <article
      className={`plus-locked-card ${className}`.trim()}
      onClick={goToPlus}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) {
          e.preventDefault();
          goToPlus();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label="Bất động sản độc quyền Swipe Nest Plus - Nâng cấp Plus để mở khóa"
    >
      <div className="plus-locked-media">
        <img
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = PLACEHOLDER_IMAGE; }}
        />
        <div className="plus-locked-scrim" aria-hidden="true">
          <span className="plus-locked-pill">
            <Crown size={12} />
            <span>Độc quyền Plus</span>
          </span>
          <div className="plus-locked-center">
            <span className="plus-locked-icon-ring">
              <Lock size={19} strokeWidth={2.2} />
            </span>
            <strong>Dành riêng cho thành viên Plus</strong>
          </div>
        </div>
      </div>

      <div className="plus-locked-body">
        <SwipeNestBadges property={property} />
        <h2 className="plus-locked-title">Bất động sản độc quyền Swipe Nest</h2>
        <p className="plus-locked-address">
          <MapPin size={12} aria-hidden="true" />
          <span>{property?.address || 'Nguồn hàng chính chủ xác thực'}</span>
        </p>

        <div className="plus-locked-meta">
          <p className="plus-locked-price">
            <strong>{formatPrice(property?.price)}</strong>
            {property?.listing_type === 'RENT' && <span>/tháng</span>}
          </p>
          <div className="plus-locked-specs">
            <span><Bed size={12} aria-hidden="true" /> {property?.bedrooms || 0}</span>
            <span><Bath size={12} aria-hidden="true" /> {property?.bathrooms || 0}</span>
            <span><Ruler size={12} aria-hidden="true" /> {property?.area || '—'}m²</span>
          </div>
        </div>

        <button
          type="button"
          className="plus-locked-cta"
          onClick={(e) => { e.stopPropagation(); goToPlus(); }}
        >
          <Crown size={14} aria-hidden="true" />
          <span>Mở khóa với Plus</span>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};

export default PlusLockedCard;
