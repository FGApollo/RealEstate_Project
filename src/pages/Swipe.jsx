import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Heart, X, MapPin,
  Bed, Bath, Maximize,
  MessageSquare
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
import SwipeMainSection from '../features/swipe/SwipeMainSection';
import SwipeSuggestionsPanel from '../features/swipe/SwipeSuggestionsPanel';
import SwipeChatPrompt from '../features/swipe/SwipeChatPrompt';
import { WARDS_BY_REGION, ALL_WARDS, normalizeWard } from '../services/administrativeService';
import { getCategoryKey } from '../services/propertyCategory.js';

// Mock Properties for categories
const mockProperties = {};


const categorySuggestionDetails = {
  'Căn Hộ': {
    title: 'Căn Hộ Cao Cấp',
    location: 'Quận 1 & Landmark 81',
    image: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=400&q=80'
  },
  'Văn Phòng': {
    title: 'Văn Phòng Hiện Đại',
    location: 'Quận 3 & Quận 1',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=400&q=80'
  },
  'Chung Cư': {
    title: 'Chung Cư Tiện Nghi',
    location: 'Masteri & Vinhomes',
    image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=400&q=80'
  },
  'Nhà Ở': {
    title: 'Nhà Ở Mặt Phố',
    location: 'Hà Nội & TP.HCM',
    image: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=80'
  },
  'Mặt Bằng': {
    title: 'Mặt Bằng Kinh Doanh',
    location: 'Mặt Tiền Đường Lớn',
    image: 'https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&w=400&q=80'
  },
  'Phòng Trọ': {
    title: 'Phòng Trọ Sinh Viên',
    location: 'Thủ Đức & Quận 10',
    image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80'
  }
};

const SwipeNestMark = () => (
  <svg className="brand-mark-art" viewBox="0 0 150 150" aria-hidden="true" focusable="false" style={{ width: '28px', height: '28px' }}>
    <path d="M75 7 139 53v61a25 25 0 0 1-25 25H36a25 25 0 0 1-25-25V53L75 7Z" fill="#25499b" />
    <path d="M75 7 24 55v57a27 27 0 0 0 27 27h24V7Z" fill="#fff" opacity=".055" />
    <path d="M29 72c27-14 65-15 92-1" fill="none" stroke="#f3c52f" strokeWidth="8" strokeLinecap="round" />
    <path d="M57 49v54m0-54 39 54V49" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Swipe = () => {
  const { user, logout } = useAuth();
  const { categoryName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const requireAuth = useRequireAuth();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      alert(err.message);
    }
  };

  const initialFilters = useMemo(() => location.state?.filters || {}, [location.state]);

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
  // Price filters
  const [minPrice, setMinPrice] = useState(initialFilters.minPrice || '');
  const [maxPrice, setMaxPrice] = useState(initialFilters.maxPrice || '');
  const [tempMinPrice, setTempMinPrice] = useState(initialFilters.minPrice || '');
  const [tempMaxPrice, setTempMaxPrice] = useState(initialFilters.maxPrice || '');
  
  // Ward filters
  const [selectedWards, setSelectedWards] = useState(initialFilters.wards || []);
  const [tempSelectedWards, setTempSelectedWards] = useState(initialFilters.wards || []);
  const [wardSearchQuery, setWardSearchQuery] = useState('');
  const [showWardListModal, setShowWardListModal] = useState(false);
  const [listModalSearchQuery, setListModalSearchQuery] = useState('');
  const [activeRegionTab, setActiveRegionTab] = useState('TP.HCM');
  const [subTempSelectedWards, setSubTempSelectedWards] = useState([]);

  // Lifestyle filters
  const [selectedLifestyles, setSelectedLifestyles] = useState(initialFilters.lifestyles || []);
  const [tempSelectedLifestyles, setTempSelectedLifestyles] = useState(initialFilters.lifestyles || []);

  // Area filters
  const [minArea, setMinArea] = useState(initialFilters.minArea || '');
  const [maxArea, setMaxArea] = useState(initialFilters.maxArea || '');
  const [tempMinArea, setTempMinArea] = useState(initialFilters.minArea || '');
  const [tempMaxArea, setTempMaxArea] = useState(initialFilters.maxArea || '');

  // Bedrooms filters
  const [selectedBedrooms, setSelectedBedrooms] = useState(initialFilters.bedrooms || []);
  const [tempSelectedBedrooms, setTempSelectedBedrooms] = useState(initialFilters.bedrooms || []);

  // Categories filters (multiple categories for 'Tất cả' category view)
  const [selectedCategories, setSelectedCategories] = useState(initialFilters.categories || []);
  const [tempSelectedCategories, setTempSelectedCategories] = useState(initialFilters.categories || []);



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
      setTimeout(() => {
        setIsLoadingSaved(false);
      }, 600);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user, activeView]);

  useEffect(() => {
    try {
      localStorage.setItem('swipeHistory', JSON.stringify(swipeHistory));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  }, [swipeHistory]);

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
  const allCategories = ['Căn Hộ', 'Văn Phòng', 'Chung Cư', 'Nhà Ở', 'Mặt Bằng', 'Phòng Trọ'];
  const suggestedCategories = allCategories.filter(cat => cat !== activeCategoryKey);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (minPrice || maxPrice) count++;
    if (selectedWards.length > 0) count += selectedWards.length;
    if (selectedLifestyles.length > 0) count += selectedLifestyles.length;
    if (minArea || maxArea) count++;
    if (selectedBedrooms.length > 0) count += selectedBedrooms.length;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    return count;
  }, [minPrice, maxPrice, selectedWards, selectedLifestyles, minArea, maxArea, selectedBedrooms, selectedCategories]);


  // Extract and categorize features dynamically from DB
  const groupedFeatures = useMemo(() => {
    const groups = {
      'Nhu cầu vị trí': [],
      'Môi trường sống': [],
      'Đối tượng phù hợp': []
    };
    
    const featuresSet = new Set();
    dbProperties.forEach(p => {
      if (p.property_features) {
        p.property_features.forEach(f => {
          const name = typeof f === 'string' ? f : f.feature_name;
          if (name) featuresSet.add(name);
        });
      }
      if (p.lifestyle_tags) {
        p.lifestyle_tags.forEach(t => {
          const name = typeof t === 'string' ? t : t.tag_name;
          if (name) featuresSet.add(name);
        });
      }
    });

    featuresSet.forEach(feat => {
      const lower = feat.toLowerCase();
      if (lower.includes('gần') || lower.includes('cận') || lower.includes('near')) {
        groups['Nhu cầu vị trí'].push(feat);
      } else if (lower.includes('phù hợp') || lower.includes('cho') || lower.includes('thích hợp') || lower.includes('sinh viên') || lower.includes('gia đình') || lower.includes('người đi làm')) {
        groups['Đối tượng phù hợp'].push(feat);
      } else {
        groups['Môi trường sống'].push(feat);
      }
    });

    // Sort alphabetically for clean UI list representation
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.localeCompare(b, 'vi'));
    });

    return groups;
  }, [dbProperties]);

  const handleToggleLifestyle = (feat) => {
    if (tempSelectedLifestyles.includes(feat)) {
      setTempSelectedLifestyles(tempSelectedLifestyles.filter(x => x !== feat));
    } else {
      setTempSelectedLifestyles([...tempSelectedLifestyles, feat]);
    }
  };

  // Suggestions & List Selection Logic
  const suggestedWards = useMemo(() => {
    if (!wardSearchQuery.trim()) return [];
    const query = wardSearchQuery.toLowerCase();
    return ALL_WARDS.filter(ward => 
      ward.toLowerCase().includes(query) && 
      !tempSelectedWards.some(selected => normalizeWard(selected) === normalizeWard(ward))
    ).slice(0, 8);
  }, [wardSearchQuery, tempSelectedWards]);

  const filteredListWards = useMemo(() => {
    const wardsInRegion = WARDS_BY_REGION[activeRegionTab] || [];
    if (!listModalSearchQuery.trim()) return wardsInRegion;
    const query = listModalSearchQuery.toLowerCase();
    return wardsInRegion.filter(ward => ward.toLowerCase().includes(query));
  }, [activeRegionTab, listModalSearchQuery]);

  const handleSelectWard = (ward) => {
    if (!tempSelectedWards.includes(ward)) {
      setTempSelectedWards([...tempSelectedWards, ward]);
    }
    setWardSearchQuery('');
  };

  const handleRemoveTempWard = (ward) => {
    setTempSelectedWards(tempSelectedWards.filter(w => w !== ward));
  };

  const handleOpenWardListModal = () => {
    setSubTempSelectedWards([...tempSelectedWards]);
    setListModalSearchQuery('');
    setShowWardListModal(true);
  };

  const handleSaveWardList = () => {
    setTempSelectedWards(subTempSelectedWards);
    setShowWardListModal(false);
  };

  const handleCancelWardList = () => {
    setShowWardListModal(false);
  };

  const handleToggleSubTempWard = (ward) => {
    if (subTempSelectedWards.includes(ward)) {
      setSubTempSelectedWards(subTempSelectedWards.filter(w => w !== ward));
    } else {
      setSubTempSelectedWards([...subTempSelectedWards, ward]);
    }
  };

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

  // Filter properties based on current category and active applied filters
  useEffect(() => {
    let combined = [];
    
    if (dbProperties && dbProperties.length > 0) {
      if (activeCategoryKey === 'Tất cả') {
        if (selectedCategories.length > 0) {
          combined = dbProperties.filter(p => selectedCategories.includes(getCategoryKey(p.property_type)));
        } else {
          combined = dbProperties;
        }
      } else {
        combined = dbProperties.filter(p => getCategoryKey(p.property_type) === activeCategoryKey);
      }
    } else {
      if (activeCategoryKey === 'Tất cả') {
        if (selectedCategories.length > 0) {
          combined = Object.values(mockProperties).flat().filter(p => selectedCategories.includes(getCategoryKey(p.property_type)));
        } else {
          combined = Object.values(mockProperties).flat();
        }
      } else {
        combined = mockProperties[activeCategoryKey] || [];
      }
    }

    if (minPrice) {
      combined = combined.filter(p => p.price >= parseFloat(minPrice));
    }
    if (maxPrice) {
      combined = combined.filter(p => p.price <= parseFloat(maxPrice));
    }
    if (selectedWards.length > 0) {
      const normalizedSelected = selectedWards.map(w => normalizeWard(w));
      combined = combined.filter(p => {
        if (!p.ward) return false;
        return normalizedSelected.includes(normalizeWard(p.ward));
      });
    }
    if (selectedLifestyles.length > 0) {
      combined = combined.filter(p => {
        const pFeats = (p.property_features || []).map(f => (typeof f === 'string' ? f : f.feature_name || '').toLowerCase());
        const pTags = (p.lifestyle_tags || []).map(t => (typeof t === 'string' ? t : t.tag_name || '').toLowerCase());
        const allTags = [...pFeats, ...pTags];
        return selectedLifestyles.every(tag => allTags.includes(tag.toLowerCase()));
      });
    }
    if (minArea) {
      combined = combined.filter(p => p.area >= parseFloat(minArea));
    }
    if (maxArea) {
      combined = combined.filter(p => p.area <= parseFloat(maxArea));
    }
    if (selectedBedrooms.length > 0) {
      combined = combined.filter(p => {
        return selectedBedrooms.some(b => {
          if (b === '4+') return p.bedrooms >= 4;
          return p.bedrooms === parseInt(b, 10);
        });
      });
    }

    // Check if there is a pre-selected property from navigation state
    let targetIndex = 0;
    const targetSelectId = targetSelectIdRef.current || (location.state?.selectPropertyId ? Number(location.state.selectPropertyId) : null);
    if (targetSelectId && combined.length > 0) {
      let idx = combined.findIndex(p => Number(p.id) === targetSelectId);
      
      if (idx === -1) {
        // Bypassed by filters. Find it in unfiltered properties and add it
        const targetProp = (dbProperties && dbProperties.length > 0)
          ? dbProperties.find(p => Number(p.id) === targetSelectId)
          : Object.values(mockProperties).flat().find(p => Number(p.id) === targetSelectId);
        
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

    const signature = JSON.stringify([
      activeCategoryKey, minPrice, maxPrice, selectedWards, selectedLifestyles,
      minArea, maxArea, selectedBedrooms, selectedCategories
    ]);
    const shouldResetIndex = filterSignatureRef.current !== signature || Boolean(targetSelectId);
    filterSignatureRef.current = signature;
    setCurrentProperties(combined);
    setCurrentIndex((previousIndex) => shouldResetIndex
      ? targetIndex
      : Math.min(previousIndex, Math.max(0, combined.length - 1)));
  }, [activeCategoryKey, dbProperties, minPrice, maxPrice, selectedWards, selectedLifestyles, minArea, maxArea, selectedBedrooms, selectedCategories, location.state?.selectPropertyId]);

  useEffect(() => {
    if (!isLoadingProperties && currentIndex >= currentProperties.length - 4) loadMoreRecommendations();
  }, [currentIndex, currentProperties.length, isLoadingProperties, loadMoreRecommendations]);

  // Preload next property image for buttery-smooth transition
  useEffect(() => {
    if (currentIndex + 1 < currentProperties.length) {
      const nextProp = currentProperties[currentIndex + 1];
      if (nextProp && nextProp.thumbnail) {
        const img = new Image();
        img.src = nextProp.thumbnail;
      }
    }
  }, [currentIndex, currentProperties]);

  const currentProperty = currentProperties[currentIndex];
  const isAlreadyFavorite = currentProperty && dbFavorites.some(fav => fav.id === currentProperty.id);

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
          { ...currentProperty, swipeType: direction },
          ...filtered
        ].slice(0, 15);
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
    cardController.start({ opacity: 1, transition: { duration: 0.2 } });
  };

  const resetSwipes = () => {
    setSwipeHistory([]);
    setPropertiesReloadKey((key) => key + 1);
  };

  const toggleFavorite = async (property = currentProperty) => {
    if (!property || !user?.id) return;
    
    const isFav = dbFavorites.some(fav => fav.id === property.id);
    if (isFav) {
      setDbFavorites(prev => prev.filter(fav => fav.id !== property.id));
      try {
        await apiFetch(`${API_BASE_URL}/api/favorites/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: property.id })
        });
      } catch (err) {
        console.error('Error removing favorite:', err);
      }
    } else {
      setDbFavorites(prev => [...prev, property]);
      try {
        await apiFetch(`${API_BASE_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: property.id })
        });
      } catch (err) {
        console.error('Error adding favorite:', err);
      }
    }
  };

  const handleHistoryCardClick = (item) => {
    const idx = currentProperties.findIndex(p => p.id === item.id);
    if (idx !== -1) {
      setCurrentIndex(idx);
    } else {
      const targetCategory = getCategoryKey(item.property_type);
      navigate(`/swipe/${targetCategory}`, {
        state: {
          selectPropertyId: item.id,
          filters: location.state?.filters
        }
      });
    }
  };

  const applyFilter = (e) => {
    e.preventDefault();
    setMinPrice(tempMinPrice);
    setMaxPrice(tempMaxPrice);
    setSelectedWards(tempSelectedWards);
    setSelectedLifestyles(tempSelectedLifestyles);
    setMinArea(tempMinArea);
    setMaxArea(tempMaxArea);
    setSelectedBedrooms(tempSelectedBedrooms);
    setSelectedCategories(tempSelectedCategories);
    setShowFilterModal(false);
  };

  const handleUnsave = async (propertyId) => {
    setSwipeHistory(prev => prev.filter(item => item.id !== propertyId));
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

  const openFilters = () => {
    setTempMinPrice(minPrice);
    setTempMaxPrice(maxPrice);
    setTempSelectedWards([...selectedWards]);
    setTempSelectedLifestyles([...selectedLifestyles]);
    setTempMinArea(minArea);
    setTempMaxArea(maxArea);
    setTempSelectedBedrooms([...selectedBedrooms]);
    setTempSelectedCategories([...selectedCategories]);
    setShowFilterModal(true);
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
        onSearchClick={openFilters}
        onLogout={handleLogout}
      />

      {/* Main Content Layout */}
      {activeView === 'swipe' && (
        <div className="swipe-main-layout">
          <SwipeHistoryPanel
            history={swipeHistory}
            favorites={dbFavorites}
            onSelect={handleHistoryCardClick}
            onExplore={() => setCurrentIndex(0)}
          />
          <SwipeMainSection
            discoveryTitle={activeCategoryKey === 'Tất cả' ? 'Khám phá tất cả' : 'Khám phá ' + activeCategoryKey}
            currentProperty={currentProperty}
            isAlreadyFavorite={isAlreadyFavorite}
            formatPrice={formatPrice}
            onOpenFilters={openFilters}
            activeFiltersCount={activeFiltersCount}
            onPrevious={() => swipeCard('left')}
            onNext={() => swipeCard('right')}
            onToggleFavorite={toggleFavorite}
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
          />
          <SwipeSuggestionsPanel
            categories={suggestedCategories}
            detailsByCategory={categorySuggestionDetails}
            properties={dbProperties}
            favorites={dbFavorites}
            getCategoryKey={getCategoryKey}
            onSelectCategory={(category) => navigate(`/swipe/${encodeURIComponent(category)}`)}
            onToggleFavorite={toggleFavorite}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              openPropertyChat({ propertyId: property.id, requireAuth, navigate })
                                .catch((error) => alert(error.message || 'Không thể mở cuộc trò chuyện lúc này.'));
                            }}
                            title="Nhắn tin với môi giới"
                          >
                            <MessageSquare size={16} />
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

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="filter-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowFilterModal(false)}>
              <X size={24} />
            </button>
            <h3>Bộ lọc bài đăng</h3>
            <form onSubmit={applyFilter}>
              {/* Category chips for 'Tất cả' view */}
              {activeCategoryKey === 'Tất cả' && (
                <div className="filter-group">
                  <label className="filter-section-title">Loại bất động sản</label>
                  <div className="chips-grid">
                    {['Căn Hộ', 'Chung Cư', 'Nhà Ở', 'Phòng Trọ', 'Mặt Bằng', 'Văn Phòng'].map(cat => {
                      const isSelected = tempSelectedCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          className={`filter-chip ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            if (tempSelectedCategories.includes(cat)) {
                              setTempSelectedCategories(tempSelectedCategories.filter(c => c !== cat));
                            } else {
                              setTempSelectedCategories([...tempSelectedCategories, cat]);
                            }
                          }}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Price Range */}
              <div className="filter-group">
                <label className="filter-section-title">Khoảng giá (VNĐ)</label>
                <div className="range-inputs">
                  <input 
                    type="number" 
                    placeholder="Từ (VNĐ)" 
                    value={tempMinPrice}
                    onChange={(e) => setTempMinPrice(e.target.value)}
                  />
                  <span className="range-divider">-</span>
                  <input 
                    type="number" 
                    placeholder="Đến (VNĐ)" 
                    value={tempMaxPrice}
                    onChange={(e) => setTempMaxPrice(e.target.value)}
                  />
                </div>
              </div>

              {/* Area Range */}
              <div className="filter-group">
                <label className="filter-section-title">Diện tích (m²)</label>
                <div className="range-inputs">
                  <input 
                    type="number" 
                    placeholder="Từ m²" 
                    value={tempMinArea}
                    onChange={(e) => setTempMinArea(e.target.value)}
                  />
                  <span className="range-divider">-</span>
                  <input 
                    type="number" 
                    placeholder="Đến m²" 
                    value={tempMaxArea}
                    onChange={(e) => setTempMaxArea(e.target.value)}
                  />
                </div>
              </div>

              {/* Number of bedrooms */}
              <div className="filter-group">
                <label className="filter-section-title">Số phòng ngủ</label>
                <div className="chips-grid">
                  {['1', '2', '3', '4+'].map(room => {
                    const isSelected = tempSelectedBedrooms.includes(room);
                    return (
                      <button
                        key={room}
                        type="button"
                        className={`filter-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          if (tempSelectedBedrooms.includes(room)) {
                            setTempSelectedBedrooms(tempSelectedBedrooms.filter(r => r !== room));
                          } else {
                            setTempSelectedBedrooms([...tempSelectedBedrooms, room]);
                          }
                        }}
                      >
                        {room === '4+' ? '4+ PN' : `${room} PN`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ward Filtering UI */}
              <div className="filter-group ward-filter-group">
                <label className="filter-section-title">Khu vực phường</label>
                <div className="ward-search-wrapper">
                  <div className="ward-search-input-container">
                    <input 
                      type="text" 
                      placeholder="Nhập tên phường..." 
                      value={wardSearchQuery} 
                      onChange={(e) => setWardSearchQuery(e.target.value)} 
                    />
                    {wardSearchQuery && (
                      <button type="button" className="clear-search-btn" onClick={() => setWardSearchQuery('')}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button type="button" className="btn-select-list" onClick={handleOpenWardListModal}>
                    Chọn từ danh sách
                  </button>
                </div>

                {/* Suggestions List */}
                {suggestedWards.length > 0 && (
                  <ul className="ward-suggestions">
                    {suggestedWards.map((ward) => (
                      <li key={ward} onClick={() => handleSelectWard(ward)}>
                        {ward}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Selected Ward Badges */}
                {tempSelectedWards.length > 0 && (
                  <div className="selected-ward-badges">
                    {tempSelectedWards.map((ward) => (
                      <span key={ward} className="ward-badge">
                        {ward}
                        <button type="button" onClick={() => handleRemoveTempWard(ward)}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Lifestyle Filtering UI */}
              <div className="filter-group lifestyle-filter-group">
                <label className="filter-section-title">Lifestyle</label>
                
                {/* Group 1: Nhu cầu vị trí */}
                {groupedFeatures['Nhu cầu vị trí']?.length > 0 && (
                  <div className="lifestyle-subgroup">
                    <span className="lifestyle-subgroup-title">Bạn muốn sống gần đâu?</span>
                    <div className="lifestyle-chips-grid">
                      {groupedFeatures['Nhu cầu vị trí'].map((feat) => {
                        const isSelected = tempSelectedLifestyles.includes(feat);
                        return (
                          <button
                            key={feat}
                            type="button"
                            className={`lifestyle-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleLifestyle(feat)}
                          >
                            {feat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Group 2: Môi trường sống */}
                {groupedFeatures['Môi trường sống']?.length > 0 && (
                  <div className="lifestyle-subgroup">
                    <span className="lifestyle-subgroup-title">Không gian sống</span>
                    <div className="lifestyle-chips-grid">
                      {groupedFeatures['Môi trường sống'].map((feat) => {
                        const isSelected = tempSelectedLifestyles.includes(feat);
                        return (
                          <button
                            key={feat}
                            type="button"
                            className={`lifestyle-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleLifestyle(feat)}
                          >
                            {feat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Group 3: Đối tượng phù hợp */}
                {groupedFeatures['Đối tượng phù hợp']?.length > 0 && (
                  <div className="lifestyle-subgroup">
                    <span className="lifestyle-subgroup-title">Phù hợp với ai?</span>
                    <div className="lifestyle-chips-grid">
                      {groupedFeatures['Đối tượng phù hợp'].map((feat) => {
                        const isSelected = tempSelectedLifestyles.includes(feat);
                        return (
                          <button
                            key={feat}
                            type="button"
                            className={`lifestyle-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleLifestyle(feat)}
                          >
                            {feat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="filter-actions">
                <button type="button" className="btn-secondary" onClick={() => { setTempMinPrice(''); setTempMaxPrice(''); setTempSelectedWards([]); setTempSelectedLifestyles([]); setTempMinArea(''); setTempMaxArea(''); setTempSelectedBedrooms([]); setTempSelectedCategories([]); }}>Xóa bộ lọc</button>
                <button type="submit" className="btn-primary">Áp dụng</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ward List Selection Sub-Modal */}
      {showWardListModal && (
        <div className="modal-backdrop sub-modal-backdrop" onClick={handleCancelWardList}>
          <div className="ward-list-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={handleCancelWardList}>
              <X size={24} />
            </button>
            <h3>Chọn Phường từ danh sách</h3>
            
            {/* Region Tabs */}
            <div className="region-tabs">
              {Object.keys(WARDS_BY_REGION).map((region) => (
                <button 
                  key={region}
                  type="button"
                  className={`region-tab-btn ${activeRegionTab === region ? 'active' : ''}`}
                  onClick={() => {
                    setActiveRegionTab(region);
                    setListModalSearchQuery('');
                  }}
                >
                  {region}
                </button>
              ))}
            </div>

            {/* Inner Search bar */}
            <div className="list-search-container">
              <input 
                type="text" 
                placeholder="Tìm phường..." 
                value={listModalSearchQuery}
                onChange={(e) => setListModalSearchQuery(e.target.value)}
              />
            </div>

            {/* Checklist */}
            <div className="ward-checklist-container">
              {filteredListWards.length === 0 ? (
                <div className="empty-checklist">Không tìm thấy phường phù hợp.</div>
              ) : (
                <div className="ward-checklist-grid">
                  {filteredListWards.map((ward) => {
                    const isChecked = subTempSelectedWards.includes(ward);
                    return (
                      <label key={ward} className="ward-checkbox-label">
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSubTempWard(ward)}
                        />
                        <span className="custom-checkbox"></span>
                        <span className="ward-name-text">{ward}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="filter-actions">
              <button type="button" className="btn-secondary" onClick={handleCancelWardList}>Hủy</button>
              <button type="button" className="btn-primary" onClick={handleSaveWardList}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Swipe;
