import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Heart, X, MapPin,
  Bed, Bath, Maximize,
  MessageSquare, Loader2
} from 'lucide-react';
import { useMotionValue, useTransform, useAnimation } from 'framer-motion';
import PropertyDetailModal from '../components/PropertyDetailModal';
import './Swipe.css';
import '../features/swipe/SwipeExperience.css';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import { openPropertyChat } from '../auth/openPropertyChat';
import Header from '../components/Header';
import SwipeHistoryPanel from '../features/swipe/SwipeHistoryPanel';
import { fetchSwipeHistory, SWIPE_HISTORY_PREVIEW } from '../features/swipe/swipeHistoryApi';
import SwipeMainSection from '../features/swipe/SwipeMainSection';
import SwipeChatPrompt from '../features/swipe/SwipeChatPrompt';
import { getCategoryKey } from '../services/propertyCategory.js';



const SwipeNestMark = () => (
  <svg className="brand-mark-art" viewBox="0 0 150 150" aria-hidden="true" focusable="false" style={{ width: '28px', height: '28px' }}>
    <path d="M75 7 139 53v61a25 25 0 0 1-25 25H36a25 25 0 0 1-25-25V53L75 7Z" fill="#25499b" />
    <path d="M75 7 24 55v57a27 27 0 0 0 27 27h24V7Z" fill="#fff" opacity=".055" />
    <path d="M29 72c27-14 65-15 92-1" fill="none" stroke="#f3c52f" strokeWidth="8" strokeLinecap="round" />
    <path d="M57 49v54m0-54 39 54V49" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Swipe = () => {
  const { user } = useAuth();
  const { categoryName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const requireAuth = useRequireAuth();

  const [dbProperties, setDbProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [propertiesError, setPropertiesError] = useState(false);
  const [propertiesReloadKey, setPropertiesReloadKey] = useState(0);
  const recommendationPagingRef = useRef({ offset: 0, hasMore: false, loading: false, feedToken: null });
  const recommendationFeedIdRef = useRef(0);
  const filterSignatureRef = useRef(null);
  const [currentProperties, setCurrentProperties] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isSwipingRef = useRef(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [openingChatPropertyId, setOpeningChatPropertyId] = useState(null);
  const [swipeHistory, setSwipeHistory] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  // Lịch sử vuốt: ẩn mặc định, mở dạng ngăn kéo khi bấm nút "Lịch sử".
  const [showHistory, setShowHistory] = useState(false);
  const [activeView, setActiveView] = useState(() => location.state?.activeView || 'swipe'); // 'swipe' or 'saved'

  useEffect(() => {
    if (location.state?.activeView) {
      setActiveView(location.state.activeView);
    }
  }, [location.state]);
  const [selectedSavedCategory, setSelectedSavedCategory] = useState('Tất cả');
  const [sortBy, setSortBy] = useState('recent');
  const [selectedSavedProperty, setSelectedSavedProperty] = useState(null);

  const [dbFavorites, setDbFavorites] = useState([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  const fetchFavorites = async () => {
    if (!user) return;
    setIsLoadingSaved(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/favorites`);
      if (response.ok) {
        const data = await response.json();
        setDbFavorites(data.favorites || []);
      }
    } catch (err) {
      console.error('Error fetching database favorites:', err);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user, activeView]);

  // Lịch sử vuốt lấy từ server (không mất khi tải lại trang): panel hiện 10 lượt gần nhất.
  useEffect(() => {
    if (!user?.id) return undefined;
    const controller = new AbortController();
    fetchSwipeHistory({ limit: SWIPE_HISTORY_PREVIEW, signal: controller.signal })
      .then((page) => setSwipeHistory((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))].slice(0, SWIPE_HISTORY_PREVIEW);
      }), () => {});
    return () => controller.abort();
  }, [user?.id]);

  const targetSelectIdRef = useRef(location.state?.selectPropertyId ? Number(location.state.selectPropertyId) : null);

  useEffect(() => {
    if (location.state?.selectPropertyId) {
      targetSelectIdRef.current = Number(location.state.selectPropertyId);
    }
  }, [location.state?.selectPropertyId]);

  // Framer Motion controllers
  const cardController = useAnimation();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-150, 0, 150], [0.6, 1, 0.6]);

  const activeCategoryKey = getCategoryKey(categoryName);

  // Personalized feed pages are ranked by the backend before they reach the swipe UI.
  useEffect(() => {
    let isCurrentRequest = true;
    recommendationFeedIdRef.current += 1;
    const fetchRecommendations = async () => {
      setIsLoadingProperties(true);
      setIsLoadingMore(false);
      setPropertiesError(false);
      setDbProperties([]);
      setCurrentProperties([]);
      setCurrentIndex(0);
      recommendationPagingRef.current = { offset: 0, hasMore: false, loading: false, feedToken: null };
      try {
        const query = new URLSearchParams({
          category: activeCategoryKey === 'Tất cả' ? 'ALL' : activeCategoryKey,
          limit: '24',
          offset: '0'
        });
        const response = await apiFetch(`${API_BASE_URL}/api/recommendations?${query}`);
        if (!response.ok) throw new Error(`Recommendations request failed (${response.status})`);
        const data = await response.json();
        if (isCurrentRequest) {
          setDbProperties((data.properties || []).filter(p => !p.is_hidden));
          recommendationPagingRef.current = {
            offset: data.pagination?.nextOffset || 0,
            hasMore: Boolean(data.pagination?.hasMore),
            loading: false,
            feedToken: data.pagination?.feedToken || null
          };
        }
      } catch (err) {
        console.warn('Could not load recommendations:', err);
        if (isCurrentRequest) setPropertiesError(true);
      } finally {
        if (isCurrentRequest) setIsLoadingProperties(false);
      }
    };
    fetchRecommendations();
    return () => { isCurrentRequest = false; };
  }, [propertiesReloadKey, activeCategoryKey, user?.id]);

  const loadMoreRecommendations = useCallback(async () => {
    const paging = recommendationPagingRef.current;
    if (paging.loading || !paging.hasMore || !user?.id) return;
    const feedId = recommendationFeedIdRef.current;
    paging.loading = true;
    setIsLoadingMore(true);
    try {
      const query = new URLSearchParams({
        category: activeCategoryKey === 'Tất cả' ? 'ALL' : activeCategoryKey,
        limit: '24',
        offset: String(paging.offset)
      });
      if (paging.feedToken) query.set('feedToken', paging.feedToken);
      const response = await apiFetch(`${API_BASE_URL}/api/recommendations?${query}`);
      if (!response.ok) throw new Error(`Recommendations request failed (${response.status})`);
      const data = await response.json();
      if (feedId !== recommendationFeedIdRef.current) return;
      setDbProperties((previous) => {
        const currentIds = new Set(previous.map((property) => Number(property.id)));
        return [...previous, ...(data.properties || []).filter((property) => !currentIds.has(Number(property.id)) && !property.is_hidden)];
      });
      paging.offset = data.pagination?.nextOffset || paging.offset;
      paging.hasMore = Boolean(data.pagination?.hasMore);
    } catch (error) {
      if (feedId !== recommendationFeedIdRef.current) return;
      console.warn('Could not load more recommendations:', error);
      setPropertiesError(true);
      paging.hasMore = false;
    } finally {
      if (feedId === recommendationFeedIdRef.current) {
        paging.loading = false;
        setIsLoadingMore(false);
      }
    }
  }, [activeCategoryKey, user?.id]);

  // Bộ thẻ = tin của danh mục đang xem, đã được server xếp theo gu người dùng. Trang Khám phá không còn bộ lọc riêng
  // (lọc chi tiết dùng thanh tìm kiếm / trang kết quả); server đã lọc theo danh mục, đây chỉ là chốt chặn.
  useEffect(() => {
    let combined = activeCategoryKey === 'Tất cả'
      ? (dbProperties || [])
      : (dbProperties || []).filter(p => getCategoryKey(p.property_type) === activeCategoryKey);

    // Check if there is a pre-selected property from navigation state
    let targetIndex = 0;
    const targetSelectId = targetSelectIdRef.current || (location.state?.selectPropertyId ? Number(location.state.selectPropertyId) : null);
    if (targetSelectId && combined.length > 0) {
      let idx = combined.findIndex(p => Number(p.id) === targetSelectId);
      
      if (idx === -1) {
        // Bypassed by filters. Find it in unfiltered properties and add it
        const targetProp = (dbProperties || []).find(p => Number(p.id) === targetSelectId);
        
        if (targetProp) {
          combined = [targetProp, ...combined];
          idx = 0;
        }
      }
      
      if (idx !== -1) {
        targetIndex = idx;
        setShowDetailModal(true);
        targetSelectIdRef.current = null;
        if (location.state?.selectPropertyId) {
          navigate(location.pathname, {
            replace: true,
            state: { ...location.state, selectPropertyId: undefined }
          });
        }
      }
    }

    const signature = activeCategoryKey;
    const shouldResetIndex = filterSignatureRef.current !== signature || Boolean(targetSelectId);
    filterSignatureRef.current = signature;
    setCurrentProperties(combined);
    setCurrentIndex((previousIndex) => shouldResetIndex
      ? targetIndex
      : Math.min(previousIndex, Math.max(0, combined.length - 1)));
  }, [activeCategoryKey, dbProperties, location.state?.selectPropertyId]);

  useEffect(() => {
    if (!isLoadingProperties && currentIndex >= currentProperties.length - 4) loadMoreRecommendations();
  }, [currentIndex, currentProperties.length, isLoadingProperties, loadMoreRecommendations]);

  // Preload upcoming property images (next 2-3 cards) for buttery-smooth transition
  useEffect(() => {
    const preloadCount = 3;
    for (let i = 1; i <= preloadCount; i++) {
      if (currentIndex + i < currentProperties.length) {
        const nextProp = currentProperties[currentIndex + i];
        if (nextProp && nextProp.thumbnail) {
          const img = new Image();
          img.src = nextProp.thumbnail;
        }
      }
    }
  }, [currentIndex, currentProperties]);

  const currentProperty = currentProperties[currentIndex];

  const recordPropertyAction = useCallback((propertyId, action) => {
    apiFetch(`${API_BASE_URL}/api/me/property-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId, action })
    }).then((response) => {
      if (!response.ok) console.warn(`Could not record ${action.toLowerCase()} event (${response.status}).`);
    }).catch((error) => console.warn(`Could not record ${action.toLowerCase()} event:`, error));
  }, []);

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
    if (isSwipingRef.current) return;
    isSwipingRef.current = true;
    setIsSwiping(true);

    try {
      const exitX = direction === 'right' ? 500 : -500;
      
      // Animate current card flying out
      await cardController.start({ 
        x: exitX, 
        opacity: 0, 
        rotate: direction === 'right' ? 35 : -35,
        transition: { duration: 0.25 } 
      });

      if (currentProperty) {
        recordPropertyAction(currentProperty.id, direction === 'right' ? 'LIKE' : 'DISLIKE');
        setSwipeHistory(prev => {
          const filtered = prev.filter(item => item.id !== currentProperty.id);
          return [
            { ...currentProperty, swipeType: direction, available: true },
            ...filtered
          ].slice(0, SWIPE_HISTORY_PREVIEW);
        });

        // Synchronize with database favorites if swiped right (like)
        if (direction === 'right' && user?.id) {
          setDbFavorites(prev => {
            if (prev.some(f => f.id === currentProperty.id)) return prev;
            return [...prev, currentProperty];
          });
          apiFetch(`${API_BASE_URL}/api/favorites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ propertyId: currentProperty.id })
          }).catch(err => console.error('Error adding favorite to DB:', err));
        }
      }
      
      // Reset values silently at center with opacity 0
      x.set(0);
      cardController.set({ x: 0, y: 0, rotate: 0, opacity: 0 });
      
      // Switch to next card
      setCurrentIndex(prev => prev + 1);
      
      // Smoothly fade in the new card
      await cardController.start({ opacity: 1, transition: { duration: 0.2 } });
    } finally {
      isSwipingRef.current = false;
      setIsSwiping(false);
    }
  };

  // Tải lại feed; lịch sử vuốt giữ nguyên (đã lưu trên server).
  const resetSwipes = () => {
    setPropertiesReloadKey((key) => key + 1);
  };

  const handleHistoryCardClick = (item) => {
    const idx = currentProperties.findIndex(p => p.id === item.id);
    if (idx !== -1) {
      setCurrentIndex(idx);
    } else {
      const targetCategory = getCategoryKey(item.property_type);
      navigate(`/swipe/${targetCategory}`, {
        state: { selectPropertyId: item.id }
      });
    }
  };

  const handleUnsave = async (propertyId) => {
    setDbFavorites(prev => prev.filter(item => item.id !== propertyId));
    if (user?.id) {
      try {
        await apiFetch(`${API_BASE_URL}/api/favorites/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId })
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

  useEffect(() => {
    if (showDetailModal && activePropertyForModal?.id && user?.id) {
      recordPropertyAction(activePropertyForModal.id, 'VIEW');
    }
  }, [showDetailModal, activePropertyForModal?.id, user?.id, recordPropertyAction]);

  return (
    <div className="swipe-page-container">
      <Header
        user={user}
        activeTab={activeView === 'saved' ? 'saved' : 'swipe'}
        onTabChange={(tab) => {
          if (tab === 'swipe') {
            setActiveView('swipe');
            return true;
          }
          if (tab === 'saved') {
            setActiveView('saved');
            return true;
          }
          return false;
        }}
        showSearch={true}
        onSearchClick={() => navigate('/search')}
      />

      {/* Main Content Layout */}
      {activeView === 'swipe' && (
        <div className="swipe-main-layout">
          {showHistory && (
            <div className="swipe-history-drawer" role="dialog" aria-modal="true" aria-label="Lịch sử vuốt"
              onKeyDown={(event) => { if (event.key === 'Escape') setShowHistory(false); }}>
              <button type="button" className="swipe-history-drawer-backdrop" aria-label="Đóng lịch sử vuốt" onClick={() => setShowHistory(false)} />
              <div className="swipe-history-drawer-sheet">
                <button type="button" className="swipe-history-drawer-close" aria-label="Đóng" onClick={() => setShowHistory(false)} autoFocus><X size={20} /></button>
                <SwipeHistoryPanel
                  history={swipeHistory}
                  favorites={dbFavorites}
                  onSelect={(item) => { setShowHistory(false); handleHistoryCardClick(item); }}
                  onExplore={() => { setShowHistory(false); setCurrentIndex(0); }}
                  onViewAll={() => navigate('/history')}
                />
              </div>
            </div>
          )}
          <SwipeMainSection
            discoveryTitle={activeCategoryKey === 'Tất cả' ? 'Khám phá tất cả' : 'Khám phá ' + activeCategoryKey}
            currentProperty={currentProperty}
            formatPrice={formatPrice}
            onOpenHistory={() => setShowHistory(true)}
            onPrevious={() => swipeCard('left')}
            onNext={() => swipeCard('right')}
            onShowDetails={() => setShowDetailModal(true)}
            onRestart={() => propertiesError ? setPropertiesReloadKey((key) => key + 1) : resetSwipes()}
            onAdjustPreferences={() => navigate('/onboarding?edit=1', { state: { from: location.pathname } })}
            isLoading={isLoadingProperties || isLoadingMore}
            hasError={propertiesError}
            cardMotion={{ x, rotate, opacity }}
            cardController={cardController}
            handleDragEnd={handleDragEnd}
            currentIndex={currentIndex}
            propertyCount={currentProperties.length}
            isSwiping={isSwiping}
          />
          <SwipeChatPrompt onClick={() => navigate('/chat')} />
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
                {['Tất cả', 'Căn Hộ', 'Văn Phòng', 'Chung Cư', 'Nhà Ở', 'Mặt Bằng', 'Phòng Trọ'].map((cat) => (
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
                    className={`saved-property-card ${['SOLD', 'RENTED'].includes(property.status) ? 'is-closed' : ''}`}
                    onClick={() => {
                      setSelectedSavedProperty(property);
                      setShowDetailModal(true);
                    }}
                  >
                    <div className="saved-card-img-wrapper">
                      <img src={property.thumbnail} alt={property.title} className="saved-card-img" loading="lazy" decoding="async" />
                      
                      {['SOLD', 'RENTED'].includes(property.status) && (
                        <span className="saved-card-badge closed">
                          {property.status === 'SOLD' ? 'Đã bán' : 'Đã cho thuê'}
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
                        {property.listing_type === 'RENT' && ' /tháng'}
                        {property.listing_type === 'SALE' && ' · mua bán'}
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
                        {user && Number(user.id) === Number(property.owner_id) ? (
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Tin của bạn</span>
                        ) : (
                          <button 
                            className="saved-card-chat-btn"
                            disabled={openingChatPropertyId === property.id}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (openingChatPropertyId) return;
                              try {
                                setOpeningChatPropertyId(property.id);
                                await openPropertyChat({ propertyId: property.id, requireAuth, navigate });
                              } catch (error) {
                                alert(error.message || 'Không thể mở cuộc trò chuyện lúc này.');
                              } finally {
                                setOpeningChatPropertyId(null);
                              }
                            }}
                            title="Nhắn tin với môi giới"
                            style={{ 
                              opacity: openingChatPropertyId === property.id ? 0.7 : 1, 
                              cursor: openingChatPropertyId === property.id ? 'not-allowed' : 'pointer' 
                            }}
                          >
                            {openingChatPropertyId === property.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <MessageSquare size={16} />
                            )}
                          </button>
                        )}
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
        <PropertyDetailModal
          property={activePropertyForModal}
          onClose={() => { setShowDetailModal(false); setSelectedSavedProperty(null); }}
          onSelectProperty={(simProp) => {
            if (selectedSavedProperty) {
              setSelectedSavedProperty(simProp);
            } else {
              const idx = currentProperties.findIndex(p => p.id === simProp.id);
              if (idx !== -1) {
                setCurrentIndex(idx);
              } else {
                setCurrentProperties(prev => {
                  const copy = [...prev];
                  copy.splice(currentIndex, 0, simProp);
                  return copy;
                });
              }
            }
          }}
          showFavoriteActions={true}
          isFavorite={dbFavorites.some(fav => fav.id === activePropertyForModal.id)}
          onToggleFavorite={async () => {
            if (!user?.id) return;
            const isFav = dbFavorites.some(fav => fav.id === activePropertyForModal.id);
            if (isFav) {
              setDbFavorites(prev => prev.filter(fav => fav.id !== activePropertyForModal.id));
              apiFetch(`${API_BASE_URL}/api/favorites/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: activePropertyForModal.id })
              }).catch(err => console.error(err));
            } else {
              setDbFavorites(prev => [...prev, activePropertyForModal]);
              apiFetch(`${API_BASE_URL}/api/favorites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId: activePropertyForModal.id })
              }).catch(err => console.error(err));
            }
          }}
        />
      )}

    </div>
  );
};

export default Swipe;
