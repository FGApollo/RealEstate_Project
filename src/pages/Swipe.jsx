import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Search, Heart, Map, User, X, Info, MapPin, 
  Bed, Bath, Maximize, SlidersHorizontal, RefreshCw, ChevronLeft, ChevronRight,
  Compass, MessageSquare, Calendar, Eye, ShieldCheck, Phone, Shield, Share2, Sparkles, Home as HomeIcon
} from 'lucide-react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import './Swipe.css';
import { API_BASE_URL } from '../config';

const WARDS_BY_REGION = {
  'TP.HCM': [
    'Phường mới', 'Phường Sài Gòn', 'Phường Tân Định', 'Phường Bến Thành', 'Phường Cầu Ông Lãnh', 
    'Phường Bàn Cờ', 'Phường Xuân Hòa', 'Phường Nhiêu Lộc', 'Phường Xóm Chiếu', 'Phường Khánh Hội', 
    'Phường Vĩnh Hội', 'Phường Chợ Quán', 'Phường An Đông', 'Phường Chợ Lớn', 'Phường Bình Tây', 
    'Phường Bình Tiên', 'Phường Bình Phú', 'Phường Phú Lâm', 'Phường Tân Thuận', 'Phường Phú Thuận', 
    'Phường Tân Mỹ', 'Phường Tân Hưng', 'Phường Chánh Hưng', 'Phường Phú Định', 'Phường Bình Đông', 
    'Phường Diên Hồng', 'Phường Vườn Lài', 'Phường Hòa Hưng', 'Phường Minh Phụng', 'Phường Bình Thới', 
    'Phường Hòa Bình', 'Phường Phú Thọ', 'Phường Đông Hưng Thuận', 'Phường Trung Mỹ Tây', 
    'Phường Tân Thới Hiệp', 'Phường Thới An', 'Phường An Phú Đông', 'Phường An Lạc', 'Phường Bình Tân', 
    'Phường Tân Tạo', 'Phường Bình Trị Đông', 'Phường Bình Hưng Hòa', 'Phường Gia Định', 
    'Phường Bình Thạnh', 'Phường Bình Lợi Trung', 'Phường Thạnh Mỹ Tây', 'Phường Bình Quới', 
    'Phường Hạnh Thông', 'Phường An Nhơn', 'Phường Gò Vấp', 'Phường An Hội Đông', 'Phường Thông Tây Hội', 
    'Phường An Hội Tây', 'Phường Đức Nhuận', 'Phường Cầu Kiệu', 'Phường Phú Nhuận', 'Phường Tân Sơn Hòa', 
    'Phường Tân Sơn Nhất', 'Phường Tân Hòa', 'Phường Bảy Hiền', 'Phường Tân Bình', 'Phường Tân Sơn', 
    'Phường Tây Thạnh', 'Phường Tân Sơn Nhì', 'Phường Phú Thọ Hòa', 'Phường Tân Phú', 'Phường Phú Thạnh', 
    'Phường Hiệp Bình', 'Phường Thủ Đức', 'Phường Tam Bình', 'Phường Linh Xuân', 'Phường Tăng Nhơn Phú', 
    'Phường Long Bình', 'Phường Long Phước', 'Phường Long Trường', 'Phường Cát Lái', 'Phường Bình Trưng', 
    'Phường Phước Long', 'Phường An Khánh'
  ],
  'Bình Dương': [
    'Phường Đông Hòa', 'Phường Dĩ An', 'Phường Tân Đông Hiệp', 'Phường An Phú', 'Phường Bình Hòa', 
    'Phường Lái Thiêu', 'Phường Thuận An', 'Phường Thuận Giao', 'Phường Thủ Dầu Một', 'Phường Phú Lợi', 
    'Phường Chánh Hiệp', 'Phường Bình Dương', 'Phường Hòa Lợi', 'Phường Phú An', 'Phường Tây Nam', 
    'Phường Long Nguyên', 'Phường Bến Cát', 'Phường Chánh Phú Hòa', 'Phường Vĩnh Tân', 'Phường Bình Cơ', 
    'Phường Tân Uyên', 'Phường Tân Hiệp', 'Phường Tân Khánh'
  ],
  'Bà Rịa - Vũng Tàu': [
    'Phường Vũng Tàu', 'Phường Tam Thắng', 'Phường Rạch Dừa', 'Phường Phước Thắng', 'Phường Long Hương', 
    'Phường Bà Rịa', 'Phường Tam Long', 'Phường Tân Hải', 'Phường Tân Phước', 'Phường Phú Mỹ', 
    'Phường Tân Thành'
  ]
};

const ALL_WARDS = Object.values(WARDS_BY_REGION).flat();

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

const getLowResBlurUrl = (url) => {
  if (!url) return '';
  if (url.includes('unsplash.com')) {
    let optimized = url;
    if (optimized.includes('w=')) {
      optimized = optimized.replace(/w=\d+/, 'w=80');
    } else {
      optimized += '&w=80';
    }
    if (optimized.includes('q=')) {
      optimized = optimized.replace(/q=\d+/, 'q=30');
    } else {
      optimized += '&q=30';
    }
    return optimized;
  }
  return url;
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
  const { categoryName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const initialFilters = useMemo(() => location.state?.filters || {}, [location.state]);

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
  const [activeSliderIdx, setActiveSliderIdx] = useState(0);
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
      const response = await fetch(`${API_BASE_URL}/api/favorites?userId=${parsedUser.id}`);
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
    const fetchProperties = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/properties`);
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
        fetch(`${API_BASE_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, propertyId: currentProperty.id })
        }).catch(err => console.error('Error adding favorite to DB:', err));
      }

      // Remove from database favorites if swiped left (dislike)
      if (direction === 'left' && user?.id) {
        setDbFavorites(prev => prev.filter(f => f.id !== currentProperty.id));
        fetch(`${API_BASE_URL}/api/favorites/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, propertyId: currentProperty.id })
        }).catch(err => console.error('Error removing favorite from DB:', err));
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

  const toggleFavorite = async () => {
    if (!currentProperty || !user?.id) return;
    
    const isFav = dbFavorites.some(fav => fav.id === currentProperty.id);
    if (isFav) {
      setDbFavorites(prev => prev.filter(fav => fav.id !== currentProperty.id));
      try {
        await fetch(`${API_BASE_URL}/api/favorites/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, propertyId: currentProperty.id })
        });
      } catch (err) {
        console.error('Error removing favorite:', err);
      }
    } else {
      setDbFavorites(prev => [...prev, currentProperty]);
      try {
        await fetch(`${API_BASE_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, propertyId: currentProperty.id })
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
        await fetch(`${API_BASE_URL}/api/favorites/delete`, {
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

  const headerElement = useMemo(() => {
    return (
      <header className="swipe-header">
        <div className="swipe-header-left">
          <Link to="/" className="back-home-btn">
            <ChevronLeft size={20} />
          </Link>
          <span className="swipe-logo" onClick={() => navigate('/')}>Swipe Nest</span>
        </div>
        
        <div className="swipe-header-right">
          <div className={`header-nav-item ${activeView === 'swipe' ? 'active' : ''}`} onClick={() => setActiveView('swipe')}>
            <Compass size={18} />
            <span>KHÁM PHÁ</span>
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
    );
  }, [activeView, navigate]);

  const suggestionsSidebar = useMemo(() => {
    return (
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
    );
  }, [suggestedCategories, navigate]);

  const activePropertyForModal = selectedSavedProperty || currentProperty;

  useEffect(() => {
    setActiveSliderIdx(0);
  }, [activePropertyForModal?.id]);

  const getLifestyleChips = (property) => {
    if (!property?.lifestyle_tags || property.lifestyle_tags.length === 0) return [];
    return property.lifestyle_tags.map(t => t.tag_name);
  };

  const getAmenityChips = (property) => {
    if (!property?.property_features || property.property_features.length === 0) return [];
    return property.property_features.map(f => f.feature_name);
  };

  return (
    <div className="swipe-page-container">
      {/* Premium Header */}
      {headerElement}

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
                swipeHistory.map((item) => {
                  const isFav = dbFavorites.some(fav => fav.id === item.id);
                  return (
                    <div 
                      key={item.id} 
                      className={`history-card-item ${isFav ? 'right' : 'left'}`}
                      onClick={() => handleHistoryCardClick(item)}
                    >
                      <img src={item.thumbnail} alt={item.title} className="history-thumb" />
                      <div className="history-badge">
                        {isFav ? <Heart size={10} fill="white" /> : <X size={10} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Center Container - Swipe Card area */}
          <main className="swipe-card-center-container">
            
            {/* Blur Background for premium depth effect */}
            {currentProperty && (
              <div 
                className="blurry-bg-image" 
                style={{ backgroundImage: `url(${getLowResBlurUrl(currentProperty.thumbnail)})` }}
              />
            )}

            {/* Filter button */}
            <button 
              className={`floating-filter-btn ${activeFiltersCount > 0 ? 'active' : ''}`}
              onClick={() => {
                setTempMinPrice(minPrice);
                setTempMaxPrice(maxPrice);
                setTempSelectedWards([...selectedWards]);
                setTempSelectedLifestyles([...selectedLifestyles]);
                setShowFilterModal(true);
              }}
            >
              <SlidersHorizontal size={16} />
              <span>Lọc</span>
              {activeFiltersCount > 0 && (
                <span className="filter-active-badge">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Discovery Title */}
            <div className="swipe-discovery-title">
              Khám phá <span className="category-accent">{categoryName || 'Bất Động Sản'}</span>
            </div>

            {/* Tinder Card Container */}
            <div className="swipe-deck">
              {currentProperty && (
                <>
                  <button type="button" className="card-nav-arrow left outside" onClick={() => swipeCard('left')} aria-label="Bỏ qua">
                    <ChevronLeft size={20} />
                  </button>
                  <button type="button" className="card-nav-arrow right outside" onClick={() => swipeCard('right')} aria-label="Thích">
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {currentProperty ? (
                <motion.div
                  className="tinder-card"
                  drag="x"
                  dragConstraints={{ left: -1000, right: 1000 }}
                  dragElastic={1}
                  dragTransition={{ bounceStiffness: 600, bounceDamping: 30 }}
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
                    
                    {/* Verified Top Badge */}
                    <span className="verified-badge">
                      ĐÃ XÁC THỰC
                    </span>

                    {isAlreadyFavorite && (
                      <span className="already-liked-badge">
                        <Heart size={12} fill="white" /> ĐÃ YÊU THÍCH
                      </span>
                    )}

                    {/* Bottom Info Gradient Overlay */}
                    <div className="tinder-card-bottom-overlay">
                      <div className="tinder-card-info-content">
                        <h2 className="tinder-prop-title-new">{currentProperty.title}</h2>
                        <div className="tinder-prop-address-new">
                          <MapPin size={14} />
                          <span>{currentProperty.address}</span>
                        </div>
                      </div>

                      <div className="tinder-card-specs-row">
                        <div className="tinder-price-tag-new">
                          {formatPrice(currentProperty.price)}<span className="price-period">/tháng</span>
                        </div>

                        <div className="tinder-specs-pill">
                          <div className="spec-item-vertical">
                            <Bed size={16} />
                            <span>{currentProperty.bedrooms || 0}</span>
                          </div>
                          <div className="spec-item-vertical">
                            <Bath size={16} />
                            <span>{currentProperty.bathrooms || 0}</span>
                          </div>
                          <div className="spec-item-vertical">
                            <Maximize size={16} />
                            <span>{currentProperty.area}m²</span>
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
                  onClick={toggleFavorite}
                  aria-label="Thích"
                >
                  <Heart size={26} fill={isAlreadyFavorite ? "white" : "none"} />
                </button>
              </div>
            )}

          </main>

          {suggestionsSidebar}

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
      {showDetailModal && activePropertyForModal && (() => {
        const sliderImages = (activePropertyForModal.property_images && activePropertyForModal.property_images.length > 0)
          ? activePropertyForModal.property_images.map(img => img.image_url)
          : [activePropertyForModal.thumbnail];

        const lifestyleChips = getLifestyleChips(activePropertyForModal);
        const amenityChips = getAmenityChips(activePropertyForModal);
        const ownerDetails = activePropertyForModal.owner || {
          name: 'Nguyễn Văn Minh',
          role: 'Chính chủ',
          avatar: 'https://i.pravatar.cc/150?img=67',
          trust_score: 92,
          created_at: activePropertyForModal.created_at
        };

        const isFav = dbFavorites.some(fav => fav.id === activePropertyForModal.id);

        return (
          <div className="modal-backdrop" onClick={() => { setShowDetailModal(false); setSelectedSavedProperty(null); }}>
            <div className="detail-modal-content premium-detail-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close-btn circular-close" onClick={() => { setShowDetailModal(false); setSelectedSavedProperty(null); }}>
                <X size={20} />
              </button>
              
              <div className="modal-body premium-body">
                {/* 1. Top Media Slider */}
                <div className="detail-media-slider">
                  <div className="main-image-container">
                    <img src={sliderImages[activeSliderIdx]} alt={activePropertyForModal.title} className="slider-main-img" />
                    
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
                      <Sparkles size={12} /> {activePropertyForModal.matchScore || 95}% MATCH SCORE
                    </span>
                    
                    <div className="detail-rating">
                      <span className="rating-num">{activePropertyForModal.average_rating ? activePropertyForModal.average_rating.toFixed(1) : '0'}</span>
                      <div className="rating-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                          <span key={star} className={star <= Math.round(activePropertyForModal.average_rating || 0) ? 'star-filled' : 'star-empty'}>★</span>
                        ))}
                      </div>
                      <span className="rating-count">({activePropertyForModal.review_count || 0} đánh giá)</span>
                    </div>
                  </div>

                  {/* 3. Header Section */}
                  <div className="detail-header-block">
                    <div className="title-section">
                      <h2>{activePropertyForModal.title}</h2>
                      <div className="detail-address-row">
                        <MapPin size={16} />
                        <span>{activePropertyForModal.address}</span>
                      </div>
                    </div>
                    
                    <div className="detail-action-buttons">
                      <button 
                        className={`action-btn fav-btn ${isFav ? 'active' : ''}`}
                        onClick={async () => {
                          if (!user?.id) return;
                          if (isFav) {
                            setDbFavorites(prev => prev.filter(fav => fav.id !== activePropertyForModal.id));
                            fetch(`${API_BASE_URL}/api/favorites/delete`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id, propertyId: activePropertyForModal.id })
                            }).catch(err => console.error(err));
                          } else {
                            setDbFavorites(prev => [...prev, activePropertyForModal]);
                            fetch(`${API_BASE_URL}/api/favorites`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id, propertyId: activePropertyForModal.id })
                            }).catch(err => console.error(err));
                          }
                        }}
                      >
                        <Heart size={16} fill={isFav ? "white" : "none"} />
                        <span>{isFav ? 'Đã lưu' : 'Lưu'}</span>
                      </button>
                      
                      <button className="action-btn share-btn" onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        alert('Đã sao chép liên kết bài đăng!');
                      }}>
                        <Share2 size={16} />
                        <span>Chia sẻ</span>
                      </button>
                    </div>
                  </div>

                  <div className="detail-price-tag">
                    {activePropertyForModal.price ? activePropertyForModal.price.toLocaleString('vi-VN') : 'Liên hệ'} VNĐ
                  </div>

                  {/* 4. Specs Grid */}
                  <div className="detail-specs-grid">
                    <div className="spec-card">
                      <div className="spec-icon-box"><Maximize size={20} /></div>
                      <div className="spec-info">
                        <span>Diện tích</span>
                        <p>{activePropertyForModal.area} m²</p>
                      </div>
                    </div>
                    <div className="spec-card">
                      <div className="spec-icon-box"><Bath size={20} /></div>
                      <div className="spec-info">
                        <span>Phòng tắm</span>
                        <p>{activePropertyForModal.bathrooms || 0}</p>
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
                      <p className="description-text">{activePropertyForModal.description}</p>
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
                              <ShieldCheck size={12} /> {ownerDetails.role === 'AGENT' ? 'Chính chủ' : 'Môi giới'}
                            </span>
                          </div>
                          <p>Thành viên từ {new Date(ownerDetails.created_at || activePropertyForModal.created_at).toLocaleDateString('vi-VN')}</p>
                        </div>
                      </div>
                      
                      <div className="poster-right">
                        <div className="trust-score-wrapper">
                          <span>Trust Score</span>
                          <p>{ownerDetails.trust_score || 92}</p>
                          <small>Rất uy tín</small>
                        </div>
                        
                        <div className="poster-contact-buttons">
                          <a href={`sms:${activePropertyForModal.contact_phone || '0901234567'}`} className="contact-btn message-btn">
                            <MessageSquare size={16} /> Nhắn tin
                          </a>
                          <a href={`tel:${activePropertyForModal.contact_phone || '0901234567'}`} className="contact-btn call-btn">
                            <Phone size={16} /> Gọi ngay
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 8. Footer Info */}
                  <div className="detail-footer-bar">
                    <div className="footer-item"><Calendar size={14} /> <span>Đăng tin: {new Date(activePropertyForModal.created_at).toLocaleDateString('vi-VN')}</span></div>
                    <div className="footer-item"><Eye size={14} /> <span>Lượt xem: {activePropertyForModal.views || 0}</span></div>
                    <div className="footer-item"><Shield size={14} /> <span>Mã tin: {activePropertyForModal.property_type === 'Mặt Bằng' ? 'MBKD' : 'CHCH'}-{124000 + activePropertyForModal.id}</span></div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
