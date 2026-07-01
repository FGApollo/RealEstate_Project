import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, ChevronLeft, ChevronRight, Sparkles, MapPin, 
  Heart, Share2, Maximize, Bath, Calendar, Eye, Shield, 
  ShieldCheck, MessageSquare, Phone, Bed
} from 'lucide-react';
import './PropertyDetailModal.css';

const PropertyDetailModal = ({ property, onClose, showFavoriteActions = false, isFavorite = false, onToggleFavorite }) => {
  const [activeSliderIdx, setActiveSliderIdx] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    setActiveSliderIdx(0);
  }, [property?.id]);

  if (!property) return null;

  const sliderImages = (property.property_images && property.property_images.length > 0)
    ? property.property_images.map(img => img.image_url)
    : [property.thumbnail];

  const lifestyleChips = property.lifestyle_tags?.map(t => t.tag_name) || property.lifestyle_tags || [];
  const amenityChips = property.property_features?.map(f => f.feature_name) || property.features || [];

  const ownerDetails = property.owner || {
    name: 'Nguyễn Văn Minh',
    role: 'Chính chủ',
    avatar: 'https://i.pravatar.cc/150?img=67',
    trust_score: 92,
    created_at: property.created_at
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-modal-content premium-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn circular-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        
        <div className="modal-body premium-body">
          {/* 1. Top Media Slider */}
          <div className="detail-media-slider">
            <div className="main-image-container">
              <img src={sliderImages[activeSliderIdx]} alt={property.title} className="slider-main-img" />
              
              {sliderImages.length > 1 && (
                <>
                  <button 
                    className="slider-nav-btn prev" 
                    onClick={() => setActiveSliderIdx(prev => (prev - 1 + sliderImages.length) % sliderImages.length)}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button 
                    className="slider-nav-btn next" 
                    onClick={() => setActiveSliderIdx(prev => (prev + 1) % sliderImages.length)}
                  >
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
            </div>
            
            {sliderImages.length > 1 && (
              <div className="slider-thumbnails">
                {sliderImages.map((img, idx) => (
                  <div 
                    key={idx} 
                    className={`thumb-wrapper ${idx === activeSliderIdx ? 'active' : ''}`}
                    onClick={() => setActiveSliderIdx(idx)}
                  >
                    <img src={img} alt={`thumbnail-${idx}`} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="detail-content-wrapper">
            {/* 2. Rating & Match Score */}
            <div className="detail-meta-row">
              <span className="match-score-tag">
                <Sparkles size={12} /> {property.matchScore || 95}% MATCH SCORE
              </span>
              
              <div className="detail-rating">
                <span className="rating-num">{property.average_rating ? property.average_rating.toFixed(1) : '0'}</span>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span key={star} className={star <= Math.round(property.average_rating || 0) ? 'star-filled' : 'star-empty'}>★</span>
                  ))}
                </div>
                <span className="rating-count">({property.review_count || 0} đánh giá)</span>
              </div>
            </div>

            {/* 3. Header Section */}
            <div className="detail-header-block">
              <div className="title-section">
                <h2>{property.title}</h2>
                <div className="detail-address-row">
                  <MapPin size={16} />
                  <span>{property.address}</span>
                </div>
              </div>
              
              <div className="detail-action-buttons">
                {showFavoriteActions && (
                  <button 
                    className={`action-btn fav-btn ${isFavorite ? 'active' : ''}`}
                    onClick={onToggleFavorite}
                  >
                    <Heart size={16} fill={isFavorite ? "white" : "none"} />
                    <span>{isFavorite ? 'Đã lưu' : 'Lưu'}</span>
                  </button>
                )}
                
                <button className="action-btn share-btn" onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + `/swipe/Tất%20cả?selectPropertyId=${property.id}`);
                  alert('Đã sao chép liên kết bài đăng!');
                }}>
                  <Share2 size={16} />
                  <span>Chia sẻ</span>
                </button>
              </div>
            </div>

            <div className="detail-price-tag">
              {property.price ? property.price.toLocaleString('vi-VN') : 'Liên hệ'} VNĐ
            </div>

            {/* 4. Specs Grid */}
            <div className="detail-specs-grid">
              <div className="spec-card">
                <div className="spec-icon-box"><Maximize size={20} /></div>
                <div className="spec-info">
                  <span>Diện tích</span>
                  <p>{property.area} m²</p>
                </div>
              </div>
              <div className="spec-card">
                <div className="spec-icon-box"><Bed size={20} /></div>
                <div className="spec-info">
                  <span>Phòng ngủ</span>
                  <p>{property.bedrooms || 0} PN</p>
                </div>
              </div>
              <div className="spec-card">
                <div className="spec-icon-box"><Bath size={20} /></div>
                <div className="spec-info">
                  <span>Phòng tắm</span>
                  <p>{property.bathrooms || 0} WC</p>
                </div>
              </div>
            </div>

            {/* 5. Lifestyle & Amenities Columns */}
            <div className="detail-columns-row">
              <div className="detail-column">
                <h3>Lối sống phù hợp</h3>
                <div className="chips-list">
                  {lifestyleChips.length > 0 ? (
                    lifestyleChips.map((chip, idx) => (
                      <span key={idx} className="feature-chip lifestyle-chip-style">{chip}</span>
                    ))
                  ) : (
                    <span className="no-features-text">Đang cập nhật...</span>
                  )}
                </div>
              </div>
              
              <div className="detail-column">
                <h3>Tiện ích</h3>
                <div className="chips-list">
                  {amenityChips.length > 0 ? (
                    amenityChips.map((chip, idx) => (
                      <span key={idx} className="feature-chip amenity-chip-style">{chip}</span>
                    ))
                  ) : (
                    <span className="no-features-text">Đang cập nhật...</span>
                  )}
                </div>
              </div>
            </div>

            {/* 6. Description & Images Grid */}
            <div className="detail-columns-row text-image-row">
              <div className="detail-column description-column">
                <h3>Mô tả chi tiết</h3>
                <p className="description-text">{property.description}</p>
              </div>
              
              <div className="detail-column detail-images-column">
                <h3>Hình ảnh chi tiết</h3>
                <div className="detail-images-grid-box">
                  {sliderImages.slice(0, 4).map((img, idx) => (
                    <div key={idx} className="grid-image-wrapper" onClick={() => setActiveSliderIdx(idx)}>
                      <img src={img} alt={`detail-${idx}`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 7. Poster info */}
            <div className="detail-poster-block">
              <h3>Thông tin người đăng</h3>
              <div className="poster-card">
                <div className="poster-left">
                  <img src={ownerDetails.avatar || 'https://i.pravatar.cc/150?img=67'} alt={ownerDetails.name} className="poster-avatar" />
                  <div className="poster-name-info">
                    <div className="name-row">
                      <h4>{ownerDetails.name}</h4>
                      <span className="role-verified-badge">
                        <ShieldCheck size={12} /> {ownerDetails.role === 'AGENT' ? 'Môi giới' : 'Chính chủ'}
                      </span>
                    </div>
                    <p>Thành viên từ {new Date(ownerDetails.created_at || property.created_at || new Date()).toLocaleDateString('vi-VN')}</p>
                  </div>
                </div>
                
                <div className="poster-right">
                  <div className="trust-score-wrapper">
                    <span>Trust Score</span>
                    <p>{ownerDetails.trust_score || 92}</p>
                    <small>Rất uy tín</small>
                  </div>
                  
                  <div className="poster-contact-buttons">
                    <button 
                      className="contact-btn message-btn"
                      onClick={() => {
                        if (property.owner_id) {
                          navigate(`/chat?agentId=${property.owner_id}&propertyId=${property.id}`);
                        } else {
                          alert('Bất động sản này không có thông tin chủ sở hữu.');
                        }
                      }}
                    >
                      <MessageSquare size={16} /> Nhắn tin
                    </button>
                    <a href={`tel:${property.contact_phone || '0901234567'}`} className="contact-btn call-btn">
                      <Phone size={16} /> Gọi ngay
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* 8. Footer Info */}
            <div className="detail-footer-bar">
              <div className="footer-item">
                <Calendar size={14} /> 
                <span>Đăng tin: {property.created_at ? new Date(property.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}</span>
              </div>
              <div className="footer-item">
                <Eye size={14} /> 
                <span>Lượt xem: {property.views || 0}</span>
              </div>
              <div className="footer-item">
                <Shield size={14} /> 
                <span>Mã tin: {property.property_type === 'Mặt Bằng' ? 'MBKD' : 'CHCH'}-{124000 + (property.id || 0)}</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyDetailModal;
