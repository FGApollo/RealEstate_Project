import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Search, Heart, Map, User, X, Info, MapPin, 
  Bed, Bath, Maximize, SlidersHorizontal, RefreshCw, ChevronLeft,
  Compass, MessageSquare
} from 'lucide-react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import './Swipe.css';

// Mock Properties for categories
const mockProperties = {};


// Map original names to normalized standard keys
const getCategoryKey = (name) => {
  if (!name) return 'Căn Hộ';
  const lower = name.toLowerCase();
  if (lower.includes('đất') || lower.includes('land')) return 'Đất Nền';
  if (lower.includes('biệt') || lower.includes('villa')) return 'Biệt Thự';
  if (lower.includes('nhà') || lower.includes('house') || lower.includes('townhouse')) return 'Nhà Ở';
  if (lower.includes('chung') || lower.includes('condo')) return 'Chung Cư';
  if (lower.includes('căn') || lower.includes('apartment') || lower.includes('studio')) return 'Căn Hộ';
  return 'Căn Hộ';
};

const categorySuggestionDetails = {
  'Đất Nền': {
    title: 'Đất Nền Dự Án',
    location: 'Đà Nẵng & TP.HCM',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80'
  },
  'Biệt Thự': {
    title: 'Biệt Thự Nghỉ Dưỡng',
    location: 'Beverly Hills & Thảo Điền',
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=400&q=80'
  },
  'Nhà Ở': {
    title: 'Nhà Ở Mặt Phố',
    location: 'Hà Nội & TP.HCM',
    image: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=80'
  },
  'Chung Cư': {
    title: 'Chung Cư Hiện Đại',
    location: 'Masteri & Vinhomes',
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=400&q=80'
  },
  'Căn Hộ': {
    title: 'Căn Hộ Cao Cấp',
    location: 'District 1 & Landmark 81',
    image: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=400&q=80'
  }
};

const Swipe = () => {
  const { categoryName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [dbProperties, setDbProperties] = useState([]);
  const [currentProperties, setCurrentProperties] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeHistory, setSwipeHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('swipeHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const [activeView, setActiveView] = useState(() => location.state?.activeView || 'swipe'); // 'swipe' or 'saved'

  useEffect(() => {
    if (location.state?.activeView) {
      setActiveView(location.state.activeView);
    }
  }, [location.state]);
  const [selectedSavedCategory, setSelectedSavedCategory] = useState('Tất cả');
  const [sortBy, setSortBy] = useState('recent');
  const [selectedSavedProperty, setSelectedSavedProperty] = useState(null);

  const [user, setUser] = useState(null);
  const [dbFavorites, setDbFavorites] = useState([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  // Check login session on mount
  useEffect(() => {
    const sessionUser = localStorage.getItem('user');
    if (sessionUser) {
      setUser(JSON.parse(sessionUser));
    } else {
      navigate('/login');
    }
  }, [navigate]);

  const fetchFavorites = async () => {
    const sessionUser = localStorage.getItem('user');
    if (!sessionUser) return;
    const parsedUser = JSON.parse(sessionUser);
    setIsLoadingSaved(true);
    try {
      const response = await fetch(`http://localhost:3000/api/favorites?userId=${parsedUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setDbFavorites(data.favorites || []);
      }
    } catch (err) {
      console.error('Error fetching database favorites:', err);
    } finally {
      setTimeout(() => {
        setIsLoadingSaved(false);
      }, 600);
    }
  };

  useEffect(() => {
    if (activeView === 'saved') {
      fetchFavorites();
    }
  }, [activeView]);

  useEffect(() => {
    try {
      localStorage.setItem('swipeHistory', JSON.stringify(swipeHistory));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  }, [swipeHistory]);

  // Framer Motion controllers
  const cardController = useAnimation();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-150, 0, 150], [0.6, 1, 0.6]);

  const activeCategoryKey = getCategoryKey(categoryName);
  const allCategories = ['Đất Nền', 'Biệt Thự', 'Nhà Ở', 'Chung Cư', 'Căn Hộ'];
  const suggestedCategories = allCategories.filter(cat => cat !== activeCategoryKey);

  // Fetch properties from DB
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/properties');
        if (response.ok) {
          const data = await response.json();
          if (data.properties && data.properties.length > 0) {
            setDbProperties(data.properties);
          }
        }
      } catch (err) {
        console.warn('API error, using full mock data stack:', err);
      }
    };
    fetchProperties();
  }, []);

  // Filter properties based on current category
  useEffect(() => {
    let combined = [];
    
    if (dbProperties && dbProperties.length > 0) {
      // Get properties from DB matching this category type
      combined = dbProperties.filter(p => getCategoryKey(p.property_type) === activeCategoryKey);
    } else {
      // Get static mock properties matching this category type
      combined = mockProperties[activeCategoryKey] || [];
    }

    setCurrentProperties(combined);
    setCurrentIndex(0);
  }, [activeCategoryKey, dbProperties]);

  const currentProperty = currentProperties[currentIndex];
  const isAlreadyFavorite = currentProperty && dbFavorites.some(fav => fav.id === currentProperty.id);

  const formatPrice = (price) => {
    if (!price || price === 0) return 'Liên hệ';
    const billion = 1000000000;
    const million = 1000000;
    
    if (price >= billion) {
      return `${(price / billion).toFixed(1).replace('.0', '')} Tỷ`;
    }
    if (price >= million) {
      return `${(price / million).toFixed(1).replace('.0', '')} Triệu`;
    }
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  };

  const handleDragEnd = async (event, info) => {
    const threshold = 130;
    if (info.offset.x > threshold) {
      swipeCard('right');
    } else if (info.offset.x < -threshold) {
      swipeCard('left');
    } else {
      cardController.start({ x: 0, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 20 } });
    }
  };

  const swipeCard = async (direction) => {
    const exitX = direction === 'right' ? 500 : -500;
    
    // Animate current card flying out
    await cardController.start({ 
      x: exitX, 
      opacity: 0, 
      rotate: direction === 'right' ? 35 : -35,
      transition: { duration: 0.25 } 
    });

    if (currentProperty) {
      setSwipeHistory(prev => {
        const filtered = prev.filter(item => item.id !== currentProperty.id);
        return [
          { ...currentProperty, swipeType: direction },
          ...filtered
        ].slice(0, 100);
      });

      // Synchronize with database favorites if swiped right (like)
      if (direction === 'right' && user?.id) {
        fetch('http://localhost:3000/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, propertyId: currentProperty.id })
        }).catch(err => console.error('Error adding favorite to DB:', err));
      }
    }
    
    // Reset values silently at center with opacity 0
    x.set(0);
    cardController.set({ x: 0, y: 0, rotate: 0, opacity: 0 });
    
    // Switch to next card
    setCurrentIndex(prev => prev + 1);
    
    // Smoothly fade in the new card
    cardController.start({ opacity: 1, transition: { duration: 0.2 } });
  };

  const resetSwipes = () => {
    setCurrentIndex(0);
    setSwipeHistory([]);
  };

  const applyFilter = (e) => {
    e.preventDefault();
    let filtered = [];
    
    if (dbProperties && dbProperties.length > 0) {
      filtered = dbProperties.filter(p => getCategoryKey(p.property_type) === activeCategoryKey);
    } else {
      filtered = [...(mockProperties[activeCategoryKey] || [])];
    }

    if (minPrice) {
      filtered = filtered.filter(p => p.price >= parseFloat(minPrice));
    }
    if (maxPrice) {
      filtered = filtered.filter(p => p.price <= parseFloat(maxPrice));
    }

    setCurrentProperties(filtered);
    setCurrentIndex(0);
    setShowFilterModal(false);
  };

  const handleUnsave = async (propertyId) => {
    setSwipeHistory(prev => prev.filter(item => item.id !== propertyId));
    setDbFavorites(prev => prev.filter(item => item.id !== propertyId));
    if (user?.id) {
      try {
        await fetch('http://localhost:3000/api/favorites/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, propertyId })
        });
      } catch (err) {
        console.error('Error removing favorite from DB:', err);
      }
    }
  };

  const filteredLikedProperties = useMemo(() => {
    let list = [...dbFavorites];
    
    // Filter by Category
    if (selectedSavedCategory !== 'Tất cả') {
      list = list.filter(p => getCategoryKey(p.property_type) === selectedSavedCategory);
    }

    // Sort by
    if (sortBy === 'price-desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'price-asc') {
      list.sort((a, b) => a.price - b.price);
    }
    
    return list;
  }, [dbFavorites, selectedSavedCategory, sortBy]);

  const getSavedCategoryCount = (category) => {
    if (category === 'Tất cả') return dbFavorites.length;
    return dbFavorites.filter(p => getCategoryKey(p.property_type) === category).length;
  };

  const activePropertyForModal = selectedSavedProperty || currentProperty;

  return (
    <div className="swipe-page-container">
      {/* Premium Header */}
      <header className="swipe-header">
        <div className="swipe-header-left">
          <Link to="/" className="back-home-btn">
            <ChevronLeft size={20} />
          </Link>
          <span className="swipe-logo" onClick={() => navigate('/')}>Estate Horizon</span>
        </div>
        
        <div className="swipe-header-right">
          <div className={`header-nav-item ${activeView === 'swipe' ? 'active' : ''}`} onClick={() => setActiveView('swipe')}>
            <Compass size={18} />
            <span>DISCOVER</span>
          </div>
          <div className={`header-nav-item ${activeView === 'saved' ? 'active' : ''}`} onClick={() => setActiveView('saved')}>
            <Heart size={18} />
            <span>YÊU THÍCH</span>
          </div>
          <div className="header-nav-item">
            <Map size={18} />
            <span>MAP</span>
          </div>
          <div className="header-nav-item">
            <User size={18} />
            <span>PROFILE</span>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      {activeView === 'swipe' && (
        <div className="swipe-main-layout">
          
          {/* Left Sidebar - Lịch sử vuốt */}
          <aside className="swipe-history-sidebar">
            <h3>Lịch sử vuốt</h3>
            <div className="history-list">
              {swipeHistory.length === 0 ? (
                <div className="empty-history">
                  <p>Chưa có bài đăng nào được vuốt qua.</p>
                </div>
              ) : (
                swipeHistory.map((item) => (
                  <div 
                    key={item.id} 
                    className={`history-card-item ${item.swipeType}`}
                    onClick={() => {
                      // Quick review of details
                      setCurrentIndex(currentProperties.findIndex(p => p.id === item.id) !== -1 
                        ? currentProperties.findIndex(p => p.id === item.id) 
                        : currentIndex
                      );
                    }}
                  >
                    <img src={item.thumbnail} alt={item.title} className="history-thumb" />
                    <div className="history-badge">
                      {item.swipeType === 'right' ? <Heart size={10} fill="white" /> : <X size={10} />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* Center Container - Swipe Card area */}
          <main className="swipe-card-center-container">
            
            {/* Blur Background for premium depth effect */}
            {currentProperty && (
              <div 
                className="blurry-bg-image" 
                style={{ backgroundImage: `url(${currentProperty.thumbnail})` }}
              />
            )}

            {/* Filter button */}
            <button 
              className="floating-filter-btn"
              onClick={() => setShowFilterModal(true)}
            >
              <SlidersHorizontal size={16} />
              <span>Lọc</span>
            </button>

            {/* Tinder Card Container */}
            <div className="swipe-deck">
              {currentProperty ? (
                <motion.div
                  className="tinder-card"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  style={{ x, rotate, opacity }}
                  onDragEnd={handleDragEnd}
                  animate={cardController}
                  whileDrag={{ scale: 1.02 }}
                >
                  {/* Property Main Image */}
                  <div className="tinder-img-wrapper">
                    <img 
                      src={currentProperty.thumbnail} 
                      alt={currentProperty.title} 
                      className="tinder-card-img"
                      draggable="false"
                    />
                    
                    {/* High Match Badge */}
                    <span className="high-match-badge">
                      <span className="star-icon">★</span> HIGH MATCH
                    </span>

                    {isAlreadyFavorite && (
                      <span className="already-liked-badge">
                        <Heart size={12} fill="white" /> ĐÃ YÊU THÍCH
                      </span>
                    )}

                    {/* Glassmorphic Info Card Overlay at the bottom */}
                    <div className="tinder-overlay-content">
                      <div className="tinder-main-details">
                        <div className="title-address-wrapper">
                          <h2 className="tinder-prop-title">{currentProperty.title}</h2>
                          <div className="tinder-prop-address">
                            <MapPin size={16} />
                            <span>{currentProperty.address}</span>
                          </div>
                        </div>
                        <div className="tinder-price-tag">
                          {formatPrice(currentProperty.price)}
                        </div>
                      </div>

                      {/* Features list */}
                      <div className="tinder-prop-features">
                        <div className="feature-spec">
                          <span className="spec-label">BEDS</span>
                          <div className="spec-value">
                            <span>{currentProperty.bedrooms}</span>
                            <Bed size={15} />
                          </div>
                        </div>
                        <div className="feature-divider" />
                        <div className="feature-spec">
                          <span className="spec-label">BATHS</span>
                          <div className="spec-value">
                            <span>{currentProperty.bathrooms}</span>
                            <Bath size={15} />
                          </div>
                        </div>
                        <div className="feature-divider" />
                        <div className="feature-spec">
                          <span className="spec-label">AREA</span>
                          <div className="spec-value">
                            <span>{currentProperty.area}m²</span>
                            <Maximize size={15} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="no-more-cards">
                  <RefreshCw size={48} className="spin-on-hover" onClick={resetSwipes} />
                  <h3>Không còn bài đăng nào</h3>
                  <p>Bạn đã vuốt qua tất cả các bài viết trong danh mục này.</p>
                  <button className="restart-btn" onClick={resetSwipes}>Vuốt lại từ đầu</button>
                </div>
              )}
            </div>

            {/* Action Buttons Under the Card */}
            {currentProperty && (
              <div className="swipe-action-buttons">
                <button 
                  className="swipe-btn dislike" 
                  onClick={() => swipeCard('left')}
                  aria-label="Bỏ qua"
                >
                  <X size={26} />
                </button>
                
                <button 
                  className="swipe-btn info" 
                  onClick={() => setShowDetailModal(true)}
                  aria-label="Thông tin chi tiết"
                >
                  <Info size={22} />
                </button>

                <button 
                  className={`swipe-btn like ${isAlreadyFavorite ? 'already-liked' : ''}`}
                  onClick={() => swipeCard('right')}
                  aria-label="Thích"
                >
                  <Heart size={26} fill="white" />
                </button>
              </div>
            )}

          </main>

          {/* Right Sidebar - Gợi ý cho bạn */}
          <aside className="swipe-suggestions-sidebar">
            <h3>Gợi ý cho bạn</h3>
            <div className="suggestions-list">
              {suggestedCategories.map((cat) => {
                const details = categorySuggestionDetails[cat];
                return (
                  <div 
                    key={cat} 
                    className="suggestion-card"
                    onClick={() => navigate(`/swipe/${encodeURIComponent(cat)}`)}
                  >
                    <img src={details.image} alt={details.title} className="suggestion-img" />
                    <div className="suggestion-gradient" />
                    <div className="suggestion-info">
                      <h4>{details.title}</h4>
                      <p className="suggestion-loc">
                        <MapPin size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        {details.location}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

        </div>
      )}

      {/* Saved View Content */}
      {activeView === 'saved' && (
        <div className="saved-main-layout">
          {/* Left Sidebar */}
          <aside className="saved-sidebar">
            <div className="saved-sidebar-section">
              <h3>Danh mục yêu thích</h3>
              <div className="saved-category-list">
                {['Tất cả', 'Biệt Thự', 'Đất Nền', 'Nhà Ở', 'Chung Cư', 'Căn Hộ'].map((cat) => (
                  <button 
                    key={cat}
                    className={`saved-category-item ${selectedSavedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedSavedCategory(cat)}
                  >
                    <span>{cat}</span>
                    <span className="saved-category-badge">{getSavedCategoryCount(cat)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="saved-sidebar-section">
              <h3>Sắp xếp theo</h3>
              <div className="saved-sort-list">
                <label className="saved-sort-item">
                  <input 
                    type="radio" 
                    name="sortBy" 
                    checked={sortBy === 'recent'} 
                    onChange={() => setSortBy('recent')} 
                  />
                  <span className="custom-radio"></span>
                  <span>Thêm gần đây</span>
                </label>
                <label className="saved-sort-item">
                  <input 
                    type="radio" 
                    name="sortBy" 
                    checked={sortBy === 'price-desc'} 
                    onChange={() => setSortBy('price-desc')} 
                  />
                  <span className="custom-radio"></span>
                  <span>Giá: Cao đến Thấp</span>
                </label>
                <label className="saved-sort-item">
                  <input 
                    type="radio" 
                    name="sortBy" 
                    checked={sortBy === 'price-asc'} 
                    onChange={() => setSortBy('price-asc')} 
                  />
                  <span className="custom-radio"></span>
                  <span>Giá: Thấp đến Cao</span>
                </label>
              </div>
            </div>
          </aside>

          {/* Right Main Grid */}
          <main className="saved-content-area">
            <h1 className="saved-title">Bất động sản yêu thích</h1>
            <p className="saved-subtitle">
              Các bất động sản bạn đã thích. Xem xét lại các lựa chọn của bạn và tiến hành các bước tiếp theo khi bạn đã sẵn sàng.
            </p>

            {isLoadingSaved ? (
              <div className="saved-grid">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="saved-skeleton-card">
                    <div className="saved-skeleton-img" />
                    <div className="saved-skeleton-info">
                      <div className="saved-skeleton-title" />
                      <div className="saved-skeleton-address" />
                      <div className="saved-skeleton-features" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredLikedProperties.length === 0 ? (
              <div className="saved-empty-state">
                <Heart size={48} className="heart-pulse-icon" />
                <h3>Chưa có bất động sản nào trong danh sách yêu thích</h3>
                <p>Nhấp vào DISCOVER để lướt và thích các bất động sản phù hợp.</p>
                <button className="back-to-swipe-btn" onClick={() => setActiveView('swipe')}>
                  Bắt đầu tìm kiếm
                </button>
              </div>
            ) : (
              <div className="saved-grid">
                {filteredLikedProperties.map((property) => (
                  <div 
                    key={property.id} 
                    className="saved-property-card"
                    onClick={() => {
                      setSelectedSavedProperty(property);
                      setShowDetailModal(true);
                    }}
                  >
                    <div className="saved-card-img-wrapper">
                      <img src={property.thumbnail} alt={property.title} className="saved-card-img" loading="lazy" decoding="async" />
                      
                      {property.matchScore && (
                        <span className="saved-card-badge match">
                          ★ {property.matchScore}% Match
                        </span>
                      )}

                      {property.property_type === 'Biệt Thự' && property.price > 10000000000 && (
                        <span className="saved-card-badge premium">
                          ↗ Yêu thích nhất
                        </span>
                      )}

                      {(property.address?.toLowerCase().includes('biển') || property.description?.toLowerCase().includes('biển')) && (
                        <span className="saved-card-badge beach">
                          ≈ Gần biển
                        </span>
                      )}

                      <button 
                        className="saved-card-heart-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnsave(property.id);
                        }}
                        title="Bỏ yêu thích"
                      >
                        <Heart size={16} fill="#1a42b8" color="#1a42b8" />
                      </button>

                      <div className="saved-card-price-tag">
                        {formatPrice(property.price)}
                      </div>
                    </div>

                    <div className="saved-card-info">
                      <h3 className="saved-card-title">{property.title}</h3>
                      <div className="saved-card-address">
                        <MapPin size={14} />
                        <span>{property.address}</span>
                      </div>

                      <div className="saved-card-features">
                        <div className="saved-spec">
                          <Bed size={14} />
                          <span>{property.bedrooms || 0} BEDS</span>
                        </div>
                        <div className="saved-spec-divider" />
                        <div className="saved-spec">
                          <Bath size={14} />
                          <span>{property.bathrooms || 0} BATHS</span>
                        </div>
                        <div className="saved-spec-divider" />
                        <div className="saved-spec">
                          <Maximize size={14} />
                          <span>{property.area}m² AREA</span>
                        </div>
                      </div>

                      <div className="saved-card-footer">
                        <button 
                          className="saved-card-chat-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSavedProperty(property);
                            setShowDetailModal(true);
                          }}
                        >
                          <MessageSquare size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Property Details Modal */}
      {showDetailModal && activePropertyForModal && (
        <div className="modal-backdrop" onClick={() => { setShowDetailModal(false); setSelectedSavedProperty(null); }}>
          <div className="detail-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => { setShowDetailModal(false); setSelectedSavedProperty(null); }}>
              <X size={24} />
            </button>
            <div className="modal-body">
              <img src={activePropertyForModal.thumbnail} alt={activePropertyForModal.title} className="modal-hero-img" />
              <div className="modal-details-container">
                <span className="modal-match-badge">★ {activePropertyForModal.matchScore || 95}% MATCH SCORE</span>
                <h2>{activePropertyForModal.title}</h2>
                <div className="modal-location">
                  <MapPin size={16} />
                  <span>{activePropertyForModal.address}</span>
                </div>
                <div className="modal-price">Giá: {activePropertyForModal.price ? activePropertyForModal.price.toLocaleString('vi-VN') : 'Liên hệ'} VNĐ</div>
                
                <div className="modal-specs">
                  {activePropertyForModal.bedrooms > 0 && (
                    <div className="modal-spec-item">
                      <Bed size={18} />
                      <span>{activePropertyForModal.bedrooms} Phòng ngủ</span>
                    </div>
                  )}
                  {activePropertyForModal.bathrooms > 0 && (
                    <div className="modal-spec-item">
                      <Bath size={18} />
                      <span>{activePropertyForModal.bathrooms} Phòng tắm</span>
                    </div>
                  )}
                  <div className="modal-spec-item">
                    <Maximize size={18} />
                    <span>{activePropertyForModal.area} m²</span>
                  </div>
                </div>

                <div className="modal-description">
                  <h3>Mô tả chi tiết</h3>
                  <p>{activePropertyForModal.description}</p>
                </div>

                <div className="modal-contact">
                  <h3>Liên hệ chính chủ</h3>
                  <div className="contact-tel">{activePropertyForModal.contact || activePropertyForModal.contact_phone || '0901 234 567'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="filter-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowFilterModal(false)}>
              <X size={24} />
            </button>
            <h3>Bộ lọc bài đăng</h3>
            <form onSubmit={applyFilter}>
              <div className="filter-group">
                <label>Giá tối thiểu (VNĐ)</label>
                <input 
                  type="number" 
                  placeholder="Ví dụ: 2000000000" 
                  value={minPrice} 
                  onChange={(e) => setMinPrice(e.target.value)} 
                />
              </div>
              <div className="filter-group">
                <label>Giá tối đa (VNĐ)</label>
                <input 
                  type="number" 
                  placeholder="Ví dụ: 10000000000" 
                  value={maxPrice} 
                  onChange={(e) => setMaxPrice(e.target.value)} 
                />
              </div>
              <div className="filter-actions">
                <button type="button" className="btn-secondary" onClick={() => { setMinPrice(''); setMaxPrice(''); }}>Xóa bộ lọc</button>
                <button type="submit" className="btn-primary">Áp dụng</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Swipe;
