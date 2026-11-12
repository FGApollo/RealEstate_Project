import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, MapPin, ShieldCheck } from 'lucide-react';
import { fetchOfficialListings } from './plusApi';
import { SwipeNestBadges } from './SwipeNestBadges';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80';

// Mục "Nguồn hàng Swipe Nest" ở trang chủ (chỉ hiện cho tài khoản người dùng).
// Có Plus: các tin do đội Swipe Nest đăng. Chưa có Plus: lời mời nâng cấp.
const CheckedListingsSection = ({ onOpen, formatPrice }) => {
  const [state, setState] = useState({ status: 'loading', properties: [] });

  useEffect(() => {
    const controller = new AbortController();
    fetchOfficialListings({ signal: controller.signal })
      .then((data) => setState({ status: 'ready', properties: data.properties || [] }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: error.code === 'PLUS_REQUIRED' ? 'locked' : 'error', properties: [] });
      });
    return () => controller.abort();
  }, []);

  if (state.status === 'loading' || state.status === 'error') return null;

  return (
    <section className="recommended-section checked-section" aria-labelledby="checked-section-title">
      <div className="section-heading-row listings-heading">
        <div>
          <h2 id="checked-section-title">Nguồn hàng Swipe Nest <ShieldCheck size={16} /></h2>
          <p>Những căn do đội Swipe Nest đăng, dành cho thành viên Plus</p>
        </div>
      </div>

      {state.status === 'locked' ? (
        <div className="checked-section-locked">
          <Crown size={22} />
          <div>
            <strong>Mở khóa với Swipe Nest Plus</strong>
            <p>20.000đ/tháng: xem nguồn hàng Swipe Nest và nhắn tin trực tiếp với đội Swipe Nest.</p>
          </div>
          <Link to="/plus">Xem gói Plus</Link>
        </div>
      ) : state.properties.length === 0 ? (
        <p className="checked-section-empty">Đội Swipe Nest chưa đăng căn nào. Nguồn hàng sẽ được cập nhật sớm.</p>
      ) : (
        <div className="featured-properties-grid">
          {state.properties.map((property) => (
            <article className="listing-card" key={property.id} onClick={() => onOpen(property)}>
              <div className="listing-image-wrap">
                <img
                  src={property.thumbnail || property.images?.[0] || FALLBACK_IMAGE}
                  alt={property.title}
                  onError={(event) => { event.target.onerror = null; event.target.src = FALLBACK_IMAGE; }}
                />
              </div>
              <div className="listing-card-body">
                <SwipeNestBadges property={property} />
                <h3>{property.title}</h3>
                <p className="listing-address"><MapPin size={12} /> {property.address}</p>
                <p className="listing-price">
                  <strong>{formatPrice(property.price).toLowerCase()}</strong>
                  {property.listing_type === 'RENT' && <span>/tháng</span>}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default CheckedListingsSection;
