import { useState, useEffect, useMemo } from 'react';
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
import SwipeHeader from '../features/swipe/SwipeHeader';
import SwipeHistoryPanel from '../features/swipe/SwipeHistoryPanel';
import SwipeMainSection from '../features/swipe/SwipeMainSection';
import SwipeSuggestionsPanel from '../features/swipe/SwipeSuggestionsPanel';
import SwipeChatPrompt from '../features/swipe/SwipeChatPrompt';

import { WARDS_BY_REGION, ALL_WARDS } from '../services/administrativeService';

const normalizeWard = (ward) => {
  if (!ward) return '';
  return ward
    .normalize('NFC')
    .toLowerCase()
    .replace(/^(phường|p\.)\s+/i, '')
    .trim();
};

// Mock Properties for categories
const mockProperties = {};


// Map original names to normalized standard keys
const getCategoryKey = (name) => {
  if (!name) return 'Căn Hộ';
  const lower = name.toLowerCase();
  if (lower === 'tất cả' || lower === 'all') return 'Tất cả';
  if (lower.includes('văn phòng') || lower.includes('office')) return 'Văn Phòng';
  if (lower.includes('mặt bằng') || lower.includes('mặt') || lower.includes('retail') || lower.includes('ground') || lower.includes('commercial')) return 'Mặt Bằng';
  if (lower.includes('phòng trọ') || lower.includes('trọ') || lower.includes('room')) return 'Phòng Trọ';
  if (lower.includes('chung') || lower.includes('condo')) return 'Chung Cư';
  if (lower.includes('nhà') || lower.includes('house') || lower.includes('townhouse')) return 'Nhà Ở';
  if (lower.includes('căn') || lower.includes('apartment') || lower.includes('studio')) return 'Căn Hộ';
  if (lower.includes('đất') || lower.includes('land')) return 'Đất Nền';
  if (lower.includes('biệt') || lower.includes('villa')) return 'Biệt Thự';
  return 'Căn Hộ';
};

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

const Swipe = () => {
  const { user, logout } = useAuth();
  const { categoryName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const initialFilters = useMemo(() => location.state?.filters || {}, [location.state]);

  const [dbProperties, setDbProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [propertiesError, setPropertiesError] = useState(false);
  const [propertiesReloadKey, setPropertiesReloadKey] = useState(0);
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

  useEffect(() => {
    if (location.state?.selectPropertyId) {
      navigate(location.pathname, {
        replace: true,
        state: {
          ...location.state,
          selectPropertyId: undefined
        }
      });
    }
  }, [currentIndex, location.state?.selectPropertyId, location.pathname, navigate]);

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
          if (f.feature_name) featuresSet.add(f.feature_name);
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

  // Fetch properties from DB
  useEffect(() => {
    let isCurrentRequest = true;
    const fetchProperties = async () => {
      setIsLoadingProperties(true);
      setPropertiesError(false);
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/properties`);
        if (!response.ok) throw new Error(`Properties request failed (${response.status})`);
        const data = await response.json();
        if (isCurrentRequest) setDbProperties((data.properties || []).filter(p => !p.is_hidden));
      } catch (err) {
        console.warn('Could not load swipe properties:', err);
        if (isCurrentRequest) setPropertiesError(true);
      } finally {
        if (isCurrentRequest) setIsLoadingProperties(false);
      }
    };
    fetchProperties();
    return () => { isCurrentRequest = false; };
  }, [propertiesReloadKey]);

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
        if (!p.property_features) return false;
        const pFeats = p.property_features.map(f => f.feature_name.toLowerCase());
        return selectedLifestyles.every(tag => pFeats.includes(tag.toLowerCase()));
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
    if (location.state?.selectPropertyId) {
      const selectId = location.state.selectPropertyId;
      let idx = combined.findIndex(p => p.id === selectId);
      
      if (idx === -1) {
        // Bypassed by filters. Find it in unfiltered properties and add it
        const targetProp = (dbProperties && dbProperties.length > 0)
          ? dbProperties.find(p => p.id === selectId)
          : Object.values(mockProperties).flat().find(p => p.id === selectId);
        
        if (targetProp) {
          combined = [targetProp, ...combined];
          idx = 0;
        }
      }
      
      if (idx !== -1) {
        targetIndex = idx;
      }
    }

    setCurrentProperties(combined);
    setCurrentIndex(targetIndex);
  }, [activeCategoryKey, dbProperties, minPrice, maxPrice, selectedWards, selectedLifestyles, minArea, maxArea, selectedBedrooms, selectedCategories, location.state?.selectPropertyId]);

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

  // Open detail modal immediately when selectPropertyId is specified in navigation state
  useEffect(() => {
    if (location.state?.selectPropertyId) {
      setShowDetailModal(true);
    }
  }, [location.state?.selectPropertyId]);

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
    setCurrentIndex(0);
    setSwipeHistory([]);
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

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      alert(error.message);
    }
  };

  const activePropertyForModal = selectedSavedProperty || currentProperty;

  return (
    <div className="swipe-page-container">
      <SwipeHeader
        user={user}
        activeView={activeView}
        onHome={() => navigate('/')}
        onDiscover={() => setActiveView('swipe')}
        onFavorites={() => setActiveView('saved')}
        onChat={() => navigate('/chat')}
        onSearch={openFilters}
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
            discoveryTitle={activeCategoryKey === 'Tất cả' ? 'Khám phá tất cả' : `Khám phá ${categoryName}`}
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
            isLoading={isLoadingProperties}
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
                            if (property.owner_id) {
                              navigate(`/chat?agentId=${property.owner_id}&propertyId=${property.id}`);
                            } else {
                              alert('Bất động sản này không có thông tin chủ sở hữu.');
                            }
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
                    {['Căn Hộ', 'Nhà Ở', 'Chung Cư', 'Biệt Thự', 'Đất Nền'].map(cat => {
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
                          {cat === 'Nhà Ở' ? 'Nhà ở' : cat === 'Căn Hộ' ? 'Căn hộ' : cat}
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
