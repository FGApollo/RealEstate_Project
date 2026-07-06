import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, ChevronLeft, ChevronRight, Sparkles, MapPin, 
  Heart, Share2, Maximize, Bath, Calendar, Eye, Shield, 
  ShieldCheck, MessageSquare, Phone, Bed, Star
} from 'lucide-react';
import './PropertyDetailModal.css';
import { API_BASE_URL } from '../config';

const PropertyDetailModal = ({ property: prop, onClose, showFavoriteActions = false, isFavorite = false, onToggleFavorite, onSelectProperty }) => {
  const [fetchedProperty, setFetchedProperty] = useState(null);
  const property = fetchedProperty || prop;

  const [activeSliderIdx, setActiveSliderIdx] = useState(0);
  const [similarProperties, setSimilarProperties] = useState([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [ratingVal, setRatingVal] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviews, setReviews] = useState([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all' or 'mine'
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest', 'oldest', 'highest', 'lowest'
  const [ratingFilter, setRatingFilter] = useState('all'); // 'all', '5', '4', '3', '2', '1'

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const [localRating, setLocalRating] = useState(property?.average_rating || 0);
  const [localReviewCount, setLocalReviewCount] = useState(property?.review_count || 0);

  const navigate = useNavigate();

  useEffect(() => {
    setActiveSliderIdx(0);
  }, [property?.id]);

  useEffect(() => {
    setLocalRating(property?.average_rating || 0);
    setLocalReviewCount(property?.review_count || 0);
  }, [property?.id, property?.average_rating, property?.review_count]);

  useEffect(() => {
    if (prop?.id) {
      // If property does not have owner information or full description/specs, fetch details by ID
      if (!prop.owner || !prop.description) {
        fetch(`${API_BASE_URL}/api/properties/${prop.id}`)
          .then(res => res.json())
          .then(data => {
            if (data.property) {
              setFetchedProperty(data.property);
            }
          })
          .catch(err => console.error('Error fetching full property details:', err));
      } else {
        setFetchedProperty(null);
      }

      setIsLoadingReviews(true);
      fetch(`${API_BASE_URL}/api/properties/${prop.id}/reviews`)
        .then(res => res.json())
        .then(data => {
          setReviews(data.reviews || []);
          setIsLoadingReviews(false);
        })
        .catch(err => {
          console.error('Error fetching reviews:', err);
          setIsLoadingReviews(false);
        });

      setIsLoadingSimilar(true);
      fetch(`${API_BASE_URL}/api/properties/${prop.id}/similar`)
        .then(res => res.json())
        .then(data => {
          setSimilarProperties(data.properties || []);
          setIsLoadingSimilar(false);
        })
        .catch(err => {
          console.error('Error fetching similar properties:', err);
          setIsLoadingSimilar(false);
        });
    } else {
      setReviews([]);
      setSimilarProperties([]);
    }
  }, [property?.id]);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    if (selectedImages.length + files.length > 5) {
      alert('Chỉ được chọn tối đa 5 ảnh!');
      return;
    }
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImages(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeSelectedImage = (idx) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== idx));
  };

  const avgScore = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  }, [reviews]);

  const ratingLabel = useMemo(() => {
    if (avgScore >= 4.5) return 'Tuyệt vời!';
    if (avgScore >= 4.0) return 'Rất tốt!';
    if (avgScore >= 3.0) return 'Khá tốt!';
    if (avgScore > 0) return 'Trung bình';
    return 'Chưa có đánh giá';
  }, [avgScore]);

  const filteredReviewsList = useMemo(() => {
    let list = [...reviews];
    
    // Tab filter
    if (activeTab === 'mine' && user?.id) {
      list = list.filter(r => r.user_id === user.id);
    }
    
    // Star filter
    if (ratingFilter !== 'all') {
      const stars = parseInt(ratingFilter);
      list = list.filter(r => r.rating === stars);
    }
    
    // Sorting
    list.sort((a, b) => {
      if (sortOrder === 'newest') {
        return new Date(b.created_at) - new Date(a.created_at);
      } else if (sortOrder === 'oldest') {
        return new Date(a.created_at) - new Date(b.created_at);
      } else if (sortOrder === 'highest') {
        return b.rating - a.rating;
      } else if (sortOrder === 'lowest') {
        return a.rating - b.rating;
      }
      return 0;
    });
    
    return list;
  }, [reviews, activeTab, sortOrder, ratingFilter, user?.id]);

  const handleRatingSubmit = async (e) => {
    e.preventDefault();
    if (!property) return;
    if (!user) {
      alert('Vui lòng đăng nhập để gửi đánh giá!');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/properties/${property.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          rating: ratingVal,
          comment: reviewText,
          isVerifiedReview: true,
          images: selectedImages
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || 'Gửi đánh giá không thành công';
        if (errMsg.includes('property_reviews_user_property_unique') || errMsg.includes('already exists')) {
          throw new Error('Bạn đã đánh giá bất động sản này rồi! Mỗi tài khoản chỉ được đánh giá một lần.');
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (data.success && data.review) {
        const newReview = {
          ...data.review,
          user: { name: user.name, avatar: user.avatar, role: user.role },
          images: selectedImages
        };

        const newReviewsList = [newReview, ...reviews];
        setReviews(newReviewsList);

        const newCount = newReviewsList.length;
        const newRating = newReviewsList.reduce((sum, r) => sum + r.rating, 0) / newCount;

        setLocalRating(newRating);
        setLocalReviewCount(newCount);

        property.average_rating = newRating;
        property.review_count = newCount;

        alert(`Cảm ơn bạn đã đánh giá ${ratingVal} sao cho tin đăng này!`);
        setReviewText('');
        setSelectedImages([]);
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi khi gửi đánh giá: ' + err.message);
    }
  };

  if (!property) return null;

  const sliderImages = (property.property_images && property.property_images.length > 0)
    ? property.property_images.map(img => img.image_url)
    : [property.thumbnail];

  const lifestyleChips = property.lifestyle_tags?.map(t => t.tag_name) || property.lifestyle_tags || [];
  const amenityChips = property.property_features?.map(f => f.feature_name) || property.features || [];

  const ownerDetails = property.owner;

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
                <span className="rating-num">{localRating ? localRating.toFixed(1) : '0'}</span>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span key={star} className={star <= Math.round(localRating || 0) ? 'star-filled' : 'star-empty'}>★</span>
                  ))}
                </div>
                <span className="rating-count">({localReviewCount || 0} đánh giá)</span>
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

                <button className="action-btn rate-btn" onClick={() => setShowRatingForm(true)}>
                  <Star size={16} />
                  <span>Đánh giá</span>
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

            {/* 6.5. Similar Properties from other agents */}
            {!isLoadingSimilar && similarProperties.length > 0 && (
              <div className="detail-similar-properties-section" style={{ padding: '20px', marginTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="#2563eb" /> Các căn hộ tương tự từ các môi giới khác
                </h3>
                <div className="similar-properties-grid" style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                  {similarProperties.map(sim => (
                    <div 
                      key={sim.id} 
                      className="similar-property-card-small" 
                      onClick={() => {
                        if (onSelectProperty) {
                          onSelectProperty(sim);
                        }
                      }}
                      style={{ 
                        minWidth: '220px', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '12px', 
                        overflow: 'hidden', 
                        cursor: 'pointer', 
                        backgroundColor: '#f8fafc',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'transform 0.2s, box-shadow 0.2s' 
                      }}
                    >
                      <img src={sim.thumbnail} alt={sim.title} style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                      <div style={{ padding: '12px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sim.title}</h4>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <MapPin size={10} style={{ marginRight: '2px', verticalAlign: 'middle' }} /> {sim.district}, {sim.city}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '700', color: '#2563eb' }}>
                            {sim.price ? (sim.price / 1000000).toFixed(1).replace('.0', '') + ' Triệu/tháng' : 'Liên hệ'}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{sim.area} m²</span>
                        </div>
                        <div style={{ marginTop: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '11px', color: '#475569', fontWeight: '500' }}>Sale: {sim.owner?.name || 'Môi giới'}</span>
                          <span style={{ fontSize: '10px', color: '#d97706', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>★ {sim.owner?.trust_score || 90}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. Poster info */}
            <div className="detail-poster-block">
              <h3>Thông tin người đăng</h3>
              {ownerDetails ? (
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
                    {(() => {
                      const score = ownerDetails.trust_score !== undefined ? Number(ownerDetails.trust_score) : 92;
                      let text = 'Rất uy tín';
                      let color = '#d97706'; // gold
                      if (score <= 39) {
                        text = 'Rủi ro cao';
                        color = '#dc2626'; // red
                      } else if (score <= 59) {
                        text = 'Bình thường';
                        color = '#6b7280'; // grey
                      } else if (score <= 79) {
                        text = 'Đáng tin';
                        color = '#10b981'; // green
                      }
                      return (
                        <div className="trust-score-wrapper" style={{ borderColor: color }}>
                          <span style={{ color: '#94a3b8' }}>Trust Score</span>
                          <p style={{ color }}>{score}</p>
                          <small style={{ color }}>{text}</small>
                        </div>
                      );
                    })()}
                    
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
                      {property.contact_phone ? (
                        <a href={`tel:${property.contact_phone}`} className="contact-btn call-btn">
                          <Phone size={16} /> Gọi ngay
                        </a>
                      ) : (
                        <button className="contact-btn call-btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                          <Phone size={16} /> Chưa có SĐT
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="poster-card" style={{ display: 'flex', justifyContent: 'center', padding: '20px', color: '#94a3b8' }}>
                  Đang tải thông tin người đăng...
                </div>
              )}
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

            {showRatingForm && (
              <div className="rating-modal-backdrop" onClick={(e) => { e.stopPropagation(); setShowRatingForm(false); }}>
                <div className="rating-modal-content premium-rating-modal" onClick={(e) => e.stopPropagation()}>
                  <button className="rating-modal-close-btn" onClick={() => setShowRatingForm(false)}>
                    <X size={20} />
                  </button>
                  
                  <h3 className="rating-modal-title">Đánh giá bất động sản</h3>
                  
                  {/* Rating summary row */}
                  <div className="rating-summary-container">
                    {reviews.length === 0 ? (
                      <div className="no-reviews-box-summary">
                        <p>Chưa có đánh giá cho tin đăng này</p>
                      </div>
                    ) : (
                      <>
                        <div className="summary-left">
                          <span className="score-num">{avgScore.toFixed(1)}</span>
                          <div className="rating-stars">
                            {[1, 2, 3, 4, 5].map(star => (
                              <span key={star} className={star <= Math.round(avgScore) ? 'star-filled' : 'star-empty'}>★</span>
                            ))}
                          </div>
                          <span className="rating-desc">{ratingLabel}</span>
                          <span className="total-ratings-count">Dựa trên {reviews.length} đánh giá</span>
                        </div>
                        
                        <div className="summary-right">
                          {[5, 4, 3, 2, 1].map((stars) => {
                            const count = reviews.filter(r => r.rating === stars).length;
                            const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                            return (
                              <div key={stars} className="star-row">
                                <span className="star-label">{stars} ★</span>
                                <div className="bar-outer">
                                  <div className="bar-inner" style={{ width: `${pct}%` }}></div>
                                </div>
                                <span className="star-count">{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Tabs */}
                  <div className="rating-tabs">
                    <button 
                      className={`rating-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                      onClick={() => setActiveTab('all')}
                    >
                      Tất cả đánh giá ({reviews.length})
                    </button>
                    <button 
                      className={`rating-tab-btn ${activeTab === 'mine' ? 'active' : ''}`}
                      onClick={() => setActiveTab('mine')}
                    >
                      Đánh giá của tôi
                    </button>
                  </div>
                  
                  {/* Rating form box */}
                  <div className="rating-form-card">
                    <h4>Chia sẻ trải nghiệm của bạn</h4>
                    <p className="form-subtext">Đánh giá của bạn giúp người khác dễ dàng quyết định hơn.</p>
                    
                    <form onSubmit={handleRatingSubmit} className="rating-main-form">
                      <div className="stars-selector-row">
                        <span>Chọn số sao</span>
                        <div className="stars-selector">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              className={`star-select-btn ${star <= ratingVal ? 'active' : ''}`}
                              onClick={() => setRatingVal(star)}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="rating-textarea-wrapper">
                        <textarea
                          placeholder="Viết bình luận của bạn..."
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
                          maxLength={500}
                          rows={4}
                        />
                        <span className="char-counter">{reviewText.length}/500</span>
                      </div>
                      
                      {/* Image Upload Input */}
                      <div className="image-upload-row">
                        <label className="upload-btn">
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple 
                            style={{ display: 'none' }} 
                            onChange={handleImageSelect}
                          />
                          <div className="camera-icon-box">📷</div>
                          <div className="upload-text-block">
                            <span>Thêm ảnh (tùy chọn)</span>
                            <small>Tối đa 5 ảnh</small>
                          </div>
                        </label>
                        
                        {selectedImages.length > 0 && (
                          <div className="selected-images-preview">
                            {selectedImages.map((img, idx) => (
                              <div key={idx} className="preview-img-wrapper">
                                <img src={img} alt={`uploaded-${idx}`} />
                                <button type="button" className="remove-img-btn" onClick={() => removeSelectedImage(idx)}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={() => setShowRatingForm(false)}>Hủy</button>
                        <button type="submit" className="btn-submit">Gửi đánh giá</button>
                      </div>
                    </form>
                  </div>
                  
                  {/* Reviews List filters */}
                  <div className="reviews-filter-row">
                    <div className="select-wrapper">
                      <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                        <option value="newest">Sắp xếp: Mới nhất</option>
                        <option value="oldest">Sắp xếp: Cũ nhất</option>
                        <option value="highest">Sắp xếp: Đánh giá cao nhất</option>
                        <option value="lowest">Sắp xếp: Đánh giá thấp nhất</option>
                      </select>
                    </div>
                    
                    <div className="select-wrapper">
                      <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
                        <option value="all">Tất cả sao</option>
                        <option value="5">5 sao</option>
                        <option value="4">4 sao</option>
                        <option value="3">3 sao</option>
                        <option value="2">2 sao</option>
                        <option value="1">1 sao</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Reviews list */}
                  <div className="reviews-list-box">
                    {isLoadingReviews ? (
                      <p className="loading-reviews-text">Đang tải đánh giá...</p>
                    ) : filteredReviewsList.length === 0 ? (
                      <p className="no-reviews-text">Chưa có đánh giá nào phù hợp với bộ lọc.</p>
                    ) : (
                      filteredReviewsList.map((rev) => {
                        const avatarInitial = rev.user?.name ? rev.user.name.charAt(0).toUpperCase() : 'U';
                        const reviewDate = new Date(rev.created_at).toLocaleDateString('vi-VN');
                        const isVerified = rev.is_verified_review || rev.user_id === property.owner_id;
                        
                        return (
                          <div key={rev.id} className="review-item-card">
                            <div className="review-header">
                              <div className="reviewer-info">
                                <div className="reviewer-avatar">
                                  {rev.user?.avatar ? (
                                    <img src={rev.user.avatar} alt={rev.user.name} />
                                  ) : (
                                    <span className="avatar-letter">{avatarInitial}</span>
                                  )}
                                </div>
                                <div className="reviewer-name-date">
                                  <div className="reviewer-name-row">
                                    <span className="reviewer-name">{rev.user?.name || 'Người dùng'}</span>
                                  </div>
                                  <span className="review-date">{reviewDate}</span>
                                </div>
                              </div>
                              <button className="dots-menu-btn">•••</button>
                            </div>
                            
                            <div className="review-rating-stars">
                              {[1, 2, 3, 4, 5].map(star => (
                                <span key={star} className={star <= rev.rating ? 'star-filled' : 'star-empty'}>★</span>
                              ))}
                            </div>
                            
                            <p className="review-comment-text">{rev.comment}</p>
                            
                            {rev.images && rev.images.length > 0 && (
                              <div className="review-comment-images">
                                {rev.images.map((img, idx) => {
                                  const imgUrl = typeof img === 'string' ? img : img.image_url;
                                  return (
                                    <img key={idx} src={imgUrl} alt="review-comment" onClick={() => window.open(imgUrl)} />
                                  );
                                })}
                              </div>
                            )}
                            
                            <div className="review-actions-footer">
                              <button className="helpful-btn">
                                <span>👍 Hữu ích ({rev.helpful_count || 0})</span>
                              </button>
                              <button className="reply-btn">
                                <span>💬 Trả lời</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyDetailModal;
