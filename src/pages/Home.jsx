import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, Search, MapPin, Home as HomeIcon, 
  Bed, Bath, Maximize, LogOut, User, 
  ChevronDown, ArrowRight, Heart, X, SlidersHorizontal,
  ChevronLeft, ChevronRight, MessageSquare, Calendar, Eye, ShieldCheck, Phone, Shield, Share2, Sparkles
} from 'lucide-react';
import './Home.css';
import { API_BASE_URL } from '../config';

const categoryImages = {
  'Apartment': 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=400&q=80',
  'Căn Hộ': 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=400&q=80',
  'Studio': 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=400&q=80',
  'Villa': 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=400&q=80',
  'Biệt Thự': 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=400&q=80',
  'Townhouse': 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=80',
  'Nhà Phố': 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=80',
  'Condo': 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=400&q=80',
  'Đất Nền': 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80',
  'Land': 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=400&q=80'
};

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

const CUSTOM_LOCATION_SUGGESTIONS = [
  {
    name: 'Phường Sài Gòn',
    subtext: 'Gồm: Bến Nghé, một phần Đa Kao, Nguyễn Thái Bình',
    keywords: ['sai gon', 'sài gòn', 'ben nghe', 'bến nghé', 'da kao', 'đa kao', 'nguyen thai binh', 'nguyễn thái bình'],
    ward: 'Phường Sài Gòn',
    region: 'TP.HCM'
  },
  {
    name: 'Phường Tân Bình',
    subtext: 'Gồm: phường 13, 14, một phần phường 15 cũ',
    keywords: ['tan binh', 'tân bình', 'phường 13', 'phuong 13', 'phường 14', 'phuong 14', 'phường 15', 'phuong 15'],
    ward: 'Phường Tân Bình',
    region: 'TP.HCM'
  },
  {
    name: 'Phường Dĩ An',
    subtext: 'Thành phố Dĩ An, Bình Dương',
    keywords: ['di an', 'dĩ an', 'binh duong', 'bình dương'],
    ward: 'Phường Dĩ An',
    region: 'Bình Dương'
  },
  {
    name: 'Phường Vũng Tàu',
    subtext: 'Thành phố Vũng Tàu, Bà Rịa - Vũng Tàu',
    keywords: ['vung tau', 'vũng tàu', 'ba ria', 'bà rịa'],
    ward: 'Phường Vũng Tàu',
    region: 'Bà Rịa - Vũng Tàu'
  },
  {
    name: 'Phường Bến Nghé',
    subtext: 'Gồm: Bến Nghé, một phần Đa Kao, Nguyễn Thái Bình',
    keywords: ['ben nghe', 'bến nghé', 'quan 1', 'quận 1'],
    ward: 'Phường Sài Gòn',
    region: 'TP.HCM'
  }
];

const Home = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [properties, setProperties] = useState([]);
  
  // Search parameters
  const [searchLoc, setSearchLoc] = useState('');
  const [searchType, setSearchType] = useState('ALL');
  const [priceRange, setPriceRange] = useState('ALL');
  
  // Advanced Filter state
  const [showAdvModal, setShowAdvModal] = useState(false);
  const [selectedProvince, setSelectedProvince] = useState('');
  const [wardSearchQuery, setWardSearchQuery] = useState('');
  const [selectedWards, setSelectedWards] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [selectedBedrooms, setSelectedBedrooms] = useState([]);
  const [selectedLifestyles, setSelectedLifestyles] = useState([]);

  // Ward checklist modal states
  const [showWardListModal, setShowWardListModal] = useState(false);
  const [listModalSearchQuery, setListModalSearchQuery] = useState('');
  const [activeRegionTab, setActiveRegionTab] = useState('TP.HCM');
  const [subTempSelectedWards, setSubTempSelectedWards] = useState([]);

  // Suggestions state
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [filteredProperties, setFilteredProperties] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [activeSliderIdx, setActiveSliderIdx] = useState(0);
  const [dbFavorites, setDbFavorites] = useState([]);

  const categories = useMemo(() => {
    const counts = {};
    properties.forEach(p => {
      const type = p.property_type || 'Khác';
      counts[type] = (counts[type] || 0) + 1;
    });

    return Object.keys(counts).map(type => ({
      name: type,
      count: counts[type],
      image: categoryImages[type] || 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=80'
    }));
  }, [properties]);

  // Check login session on mount
  useEffect(() => {
    const sessionUser = localStorage.getItem('user');
    if (!sessionUser) {
      navigate('/login');
    } else {
      const parsedUser = JSON.parse(sessionUser);
      if (parsedUser.role === 'AGENT') {
        navigate('/sale/overview');
      } else {
        setUser(parsedUser);
      }
    }
  }, [navigate]);

  const fetchFavorites = async () => {
    const sessionUser = localStorage.getItem('user');
    if (!sessionUser) return;
    const parsedUser = JSON.parse(sessionUser);
    try {
      const response = await fetch(`${API_BASE_URL}/api/favorites?userId=${parsedUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setDbFavorites(data.favorites || []);
      }
    } catch (err) {
      console.error('Error fetching database favorites:', err);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user]);

  useEffect(() => {
    setActiveSliderIdx(0);
  }, [selectedProperty?.id]);

  // Fetch properties from backend API
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/properties`);
        if (!response.ok) throw new Error('Failed to fetch properties');
        const data = await response.json();
        
        if (data.properties) {
          setProperties(data.properties);
          setFilteredProperties(data.properties);
        }
      } catch (error) {
        console.error('Error fetching properties from DB:', error);
      }
    };

    fetchProperties();
  }, []);

  const locationSuggestions = useMemo(() => {
    if (!searchLoc.trim()) return [];
    const query = searchLoc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const rawQuery = searchLoc.toLowerCase();
    
    const customMatches = CUSTOM_LOCATION_SUGGESTIONS.filter(item => {
      return item.keywords.some(kw => kw.includes(rawQuery) || kw.includes(query)) ||
             item.name.toLowerCase().includes(rawQuery) ||
             item.subtext.toLowerCase().includes(rawQuery);
    });

    const standardMatches = [];
    ALL_WARDS.forEach(wardName => {
      const normalizedWard = wardName.toLowerCase();
      if (normalizedWard.includes(rawQuery) || normalizedWard.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(query)) {
        const alreadyCustom = customMatches.some(c => c.ward === wardName);
        if (!alreadyCustom) {
          let region = '';
          for (const [r, wList] of Object.entries(WARDS_BY_REGION)) {
            if (wList.includes(wardName)) {
              region = r;
              break;
            }
          }
          standardMatches.push({
            name: wardName,
            subtext: region ? `Khu vực: ${region}` : 'Khu vực khác',
            ward: wardName,
            region: region
          });
        }
      }
    });

    return [...customMatches, ...standardMatches].slice(0, 10);
  }, [searchLoc]);

  const groupedFeatures = useMemo(() => {
    const groups = {
      'Nhu cầu vị trí': [],
      'Môi trường sống': [],
      'Đối tượng phù hợp': []
    };
    
    const featuresSet = new Set();
    properties.forEach(p => {
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

    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.localeCompare(b, 'vi'));
    });

    return groups;
  }, [properties]);

  const executeSearch = (e) => {
    if (e) e.preventDefault();
    
    let targetCategory = 'Tất cả';
    if (selectedCategories.length === 1) {
      targetCategory = selectedCategories[0];
    }
    
    const filters = {
      minPrice,
      maxPrice,
      wards: selectedWards,
      lifestyles: selectedLifestyles,
      minArea,
      maxArea,
      bedrooms: selectedBedrooms,
      categories: selectedCategories
    };

    navigate(`/swipe/${encodeURIComponent(targetCategory)}`, {
      state: { filters }
    });
  };

  // Handle price range quick select
  const handlePriceRangeChange = (e) => {
    const val = e.target.value;
    setPriceRange(val);
    if (val === 'under-5m') {
      setMinPrice('0');
      setMaxPrice('5000000');
    } else if (val === '5m-10m') {
      setMinPrice('5000000');
      setMaxPrice('10000000');
    } else if (val === '10m-20m') {
      setMinPrice('10000000');
      setMaxPrice('20000000');
    } else if (val === 'over-20m') {
      setMinPrice('20000000');
      setMaxPrice('');
    } else {
      setMinPrice('');
      setMaxPrice('');
    }
  };

  // Sync priceRange select value with minPrice/maxPrice
  useEffect(() => {
    const min = minPrice === '' ? '' : parseFloat(minPrice);
    const max = maxPrice === '' ? '' : parseFloat(maxPrice);

    if (min === 0 && max === 5000000) {
      setPriceRange('under-5m');
    } else if (min === 5000000 && max === 10000000) {
      setPriceRange('5m-10m');
    } else if (min === 10000000 && max === 20000000) {
      setPriceRange('10m-20m');
    } else if (min === 20000000 && max === '') {
      setPriceRange('over-20m');
    } else if (min === '' && max === '') {
      setPriceRange('ALL');
    } else {
      setPriceRange('CUSTOM');
    }
  }, [minPrice, maxPrice]);

  // Sync category select dropdown with advanced filter category chips
  useEffect(() => {
    if (selectedCategories.length === 0) {
      setSearchType('ALL');
    } else if (selectedCategories.length === 1) {
      setSearchType(selectedCategories[0]);
    } else {
      setSearchType('CUSTOM');
    }
  }, [selectedCategories]);

  // Sync select dropdown change to chips
  const handleSearchTypeChange = (e) => {
    const val = e.target.value;
    setSearchType(val);
    if (val === 'ALL') {
      setSelectedCategories([]);
    } else if (val !== 'CUSTOM') {
      setSelectedCategories([val]);
    }
  };

  const handleToggleCategoryChip = (cat) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleToggleBedroomChip = (room) => {
    if (selectedBedrooms.includes(room)) {
      setSelectedBedrooms(selectedBedrooms.filter(r => r !== room));
    } else {
      setSelectedBedrooms([...selectedBedrooms, room]);
    }
  };

  const handleToggleLifestyleChip = (feat) => {
    if (selectedLifestyles.includes(feat)) {
      setSelectedLifestyles(selectedLifestyles.filter(x => x !== feat));
    } else {
      setSelectedLifestyles([...selectedLifestyles, feat]);
    }
  };

  const handleSelectLocationSuggestion = (sug) => {
    setSearchLoc(sug.name);
    if (sug.ward && !selectedWards.includes(sug.ward)) {
      setSelectedWards([...selectedWards, sug.ward]);
    }
    setShowSuggestions(false);
  };

  const handleSelectWardFromAdv = (ward) => {
    if (!selectedWards.includes(ward)) {
      setSelectedWards([...selectedWards, ward]);
    }
    setWardSearchQuery('');
  };

  const handleRemoveWard = (ward) => {
    setSelectedWards(selectedWards.filter(w => w !== ward));
  };

  const handleClearFilters = () => {
    setSelectedWards([]);
    setSelectedCategories([]);
    setMinPrice('');
    setMaxPrice('');
    setMinArea('');
    setMaxArea('');
    setSelectedBedrooms([]);
    setSelectedLifestyles([]);
    setSearchLoc('');
  };

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.location-field-wrapper')) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedWards.length > 0) count += selectedWards.length;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (minPrice || maxPrice) count++;
    if (minArea || maxArea) count++;
    if (selectedBedrooms.length > 0) count += selectedBedrooms.length;
    if (selectedLifestyles.length > 0) count += selectedLifestyles.length;
    return count;
  }, [selectedWards, selectedCategories, minPrice, maxPrice, minArea, maxArea, selectedBedrooms, selectedLifestyles]);

  // Checklist modal handlers
  const handleOpenWardListModal = () => {
    setSubTempSelectedWards([...selectedWards]);
    setListModalSearchQuery('');
    setShowWardListModal(true);
  };

  const handleSaveWardList = () => {
    setSelectedWards(subTempSelectedWards);
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

  const filteredListWards = useMemo(() => {
    const wardsInRegion = WARDS_BY_REGION[activeRegionTab] || [];
    if (!listModalSearchQuery.trim()) return wardsInRegion;
    const query = listModalSearchQuery.toLowerCase();
    return wardsInRegion.filter(ward => ward.toLowerCase().includes(query));
  }, [activeRegionTab, listModalSearchQuery]);

  const suggestedWards = useMemo(() => {
    if (!wardSearchQuery.trim()) return [];
    const query = wardSearchQuery.toLowerCase();
    
    let wardsList = ALL_WARDS;
    if (selectedProvince) {
      wardsList = WARDS_BY_REGION[selectedProvince] || [];
    }
    
    return wardsList.filter(ward => 
      ward.toLowerCase().includes(query) && 
      !selectedWards.some(selected => selected === ward)
    ).slice(0, 8);
  }, [wardSearchQuery, selectedWards, selectedProvince]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const formatPrice = (price) => {
    if (price < 1000000) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
    }
    const billion = 1000000000;
    if (price >= billion) {
      return `${(price / billion).toFixed(1).replace('.0', '')} Tỷ`;
    }
    return `${(price / 1000000).toFixed(0)} Triệu`;
  };

  // Get specific properties dynamically from filtered properties
  const mainVilla = filteredProperties[0];
  const otherProperties = filteredProperties.slice(1, 3);

  return (
    <div className="home-container">
      {/* Navbar */}
      <header className="navbar">
        <div className="nav-left">
          <button className="menu-btn" aria-label="Menu" onClick={() => setShowSidebar(true)}>
            <Menu size={20} />
          </button>
          <span className="logo-text">Swipe Nest</span>
        </div>

        <nav className="nav-middle">
          <button className="nav-link active" onClick={() => navigate('/')}>Trang Chủ</button>
          <button className="nav-link" onClick={() => navigate('/swipe/Tất cả')}>Khám Phá</button>
          <button className="nav-link" onClick={() => navigate('/swipe/Tất cả', { state: { activeView: 'saved' } })}>Yêu thích</button>
          <button className="nav-link" onClick={() => navigate('/chat')}>Chat</button>
        </nav>

        <div className="nav-right">
          <button className="search-icon-btn" aria-label="Search button">
            <Search size={20} />
          </button>
          
          {user && (
            <div className="user-profile">
              <button 
                className="user-avatar-btn" 
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <img 
                  src={user.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&q=80'} 
                  alt={user.name} 
                  className="user-img" 
                />
                <span className="user-name">{user.name}</span>
                <ChevronDown size={14} />
              </button>

              {showDropdown && (
                <div className="dropdown-menu">
                  <div className="dropdown-item" style={{ fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>
                    {user.email}
                  </div>
                  <button className="dropdown-item logout-btn" onClick={handleLogout}>
                    <LogOut size={14} style={{ marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Mobile Sidebar Drawer */}
      {showSidebar && (
        <div className="mobile-sidebar-backdrop" onClick={() => setShowSidebar(false)}>
          <div className="mobile-sidebar-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sidebar-header">
              <span className="logo-text">Swipe Nest</span>
              <button className="close-sidebar-btn" onClick={() => setShowSidebar(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="mobile-sidebar-nav">
              <button className="mobile-nav-link active" onClick={() => { navigate('/'); setShowSidebar(false); }}>Trang Chủ</button>
              <button className="mobile-nav-link" onClick={() => { navigate('/swipe/Tất cả'); setShowSidebar(false); }}>Khám Phá</button>
              <button className="mobile-nav-link" onClick={() => { navigate('/swipe/Tất cả', { state: { activeView: 'saved' } }); setShowSidebar(false); }}>Yêu thích</button>
              <button className="mobile-nav-link" onClick={() => { navigate('/chat'); setShowSidebar(false); }}>Chat</button>
            </nav>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero-section">
        <img 
          src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1920&q=80" 
          alt="Hero Background" 
          className="hero-bg" 
        />
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-title-container">
            <h1>Tìm Kiếm Ngôi Nhà</h1>
            <h1><span style={{ color: '#0f2963', background: 'white', padding: '0 0.5rem', borderRadius: '8px' }}>Mơ Ước</span> Của Bạn</h1>
          </div>

          {/* Search Form */}
          <form className="search-bar-container" onSubmit={executeSearch}>
            {/* 1. Ô địa điểm */}
            <div className="search-field location-field-wrapper">
              <MapPin size={20} className="search-icon-gray" />
              <div className="selected-wards-inline">
                {selectedWards.map(ward => (
                  <span key={ward} className="ward-pill-badge">
                    {ward}
                    <button type="button" className="remove-ward-pill-btn" onClick={() => handleRemoveWard(ward)}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
                <input 
                  type="text" 
                  placeholder={selectedWards.length === 0 ? "Nhập phường, quận, thành phố..." : ""} 
                  value={searchLoc}
                  onChange={(e) => {
                    setSearchLoc(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />
              </div>
              {searchLoc && (
                <button type="button" className="clear-search-btn" onClick={() => setSearchLoc('')}>
                  <X size={16} />
                </button>
              )}

              {/* Suggestions list */}
              {showSuggestions && locationSuggestions.length > 0 && (
                <ul className="location-autocomplete-dropdown">
                  {locationSuggestions.map((sug, idx) => (
                    <li key={idx} onClick={() => handleSelectLocationSuggestion(sug)}>
                      <div className="sug-name">{sug.name}</div>
                      <div className="sug-subtext">{sug.subtext}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <div className="search-field-divider"></div>

            {/* 2. Loại hình */}
            <div className="search-field select-field">
              <HomeIcon size={20} className="search-icon-gray" />
              <select 
                value={searchType}
                onChange={handleSearchTypeChange}
              >
                <option value="ALL">Tất cả loại hình</option>
                <option value="Căn Hộ">Căn hộ</option>
                <option value="Chung Cư">Chung cư</option>
                <option value="Nhà Ở">Nhà ở</option>
                <option value="Biệt Thự">Biệt thự</option>
                <option value="Đất Nền">Đất nền</option>
                {searchType === 'CUSTOM' && <option value="CUSTOM">Nhiều loại hình</option>}
              </select>
            </div>

            <div className="search-field-divider"></div>

            {/* 3. Khoảng giá select */}
            <div className="search-field select-field">
              <span className="price-icon-text">₫</span>
              <select 
                value={priceRange}
                onChange={handlePriceRangeChange}
              >
                <option value="ALL">Khoảng giá</option>
                <option value="under-5m">Dưới 5 triệu</option>
                <option value="5m-10m">5 - 10 triệu</option>
                <option value="10m-20m">10 - 20 triệu</option>
                <option value="over-20m">Trên 20 triệu</option>
                {priceRange === 'CUSTOM' && <option value="CUSTOM">Tùy chọn giá</option>}
              </select>
            </div>

            <div className="search-field-divider"></div>

            {/* 4. Bộ lọc button */}
            <div className="search-field button-field">
              <button 
                type="button" 
                className={`home-adv-filter-btn ${activeFilterCount > 0 ? 'active' : ''}`}
                onClick={() => setShowAdvModal(true)}
              >
                <SlidersHorizontal size={18} />
                <span>Bộ lọc</span>
                {activeFilterCount > 0 && (
                  <span className="home-filter-badge">{activeFilterCount}</span>
                )}
              </button>
            </div>

            {/* 5. Tìm kiếm button */}
            <button type="submit" className="search-btn">
              Tìm kiếm <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </section>

      {/* Danh Mục Phổ Biến (Popular Categories) */}
      <section className="categories-section">
        <h2>Danh Mục Phổ Biến</h2>
        <div className="categories-grid">
          {categories.map((category) => (
            <div 
              className="category-card" 
              key={category.name}
              onClick={() => navigate(`/swipe/${encodeURIComponent(category.name)}`)}
            >
              <img 
                src={category.image} 
                alt={category.name} 
                className="category-img" 
              />
              <div className="category-overlay">
                <h3>{category.name}</h3>
                <p>{category.count}+ tin đăng</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Dành Cho Bạn (Recommended Properties) */}
      <section className="recommended-section">
        <div className="section-header">
          <div className="section-title-wrapper">
            <span>TUYỂN CHỌN</span>
            <h2>Dành Cho Bạn</h2>
          </div>
          <a href="#" className="view-all-link" onClick={() => { setSearchType('ALL'); setSearchLoc(''); }}>
            Xem tất cả <ArrowRight size={14} />
          </a>
        </div>

        <div className="properties-layout">
          {/* Left Column - Large Property Card */}
          {mainVilla && (
            <div 
              className="large-property-card"
              onClick={() => {
                setSelectedProperty(mainVilla);
                setShowDetailModal(true);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="large-card-img-wrapper">
                <img src={mainVilla.thumbnail} alt={mainVilla.title} className="large-card-img" />
                <span className="status-badge">
                  <span className="badge-dot"></span>
                  Đang Mở Bán
                </span>
                <span className="price-tag">{formatPrice(mainVilla.price)}</span>
              </div>
              <div className="large-card-info">
                <h3 className="property-title">{mainVilla.title}</h3>
                <div className="property-address">
                  <MapPin size={16} />
                  <span>{mainVilla.address}</span>
                </div>
                <div className="property-features-list">
                  <div className="feature-item">
                    <Bed size={18} />
                    <span>{mainVilla.bedrooms} Phòng ngủ</span>
                  </div>
                  <div className="feature-item">
                    <Bath size={18} />
                    <span>{mainVilla.bathrooms} Phòng tắm</span>
                  </div>
                  <div className="feature-item">
                    <Maximize size={18} />
                    <span>{mainVilla.area} m²</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Right Column - Small Stacked Cards */}
          <div className="properties-stack">
            {otherProperties.map((property) => (
              <div 
                className="small-property-card" 
                key={property.id}
                onClick={() => {
                  setSelectedProperty(property);
                  setShowDetailModal(true);
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="small-card-img-wrapper">
                  <img src={property.thumbnail} alt={property.title} className="small-card-img" />
                  {property.is_highlighted && (
                    <span className="status-badge highlight" style={{ top: '10px', left: '10px', padding: '0.2rem 0.6rem', fontSize: '0.65rem' }}>
                      Nổi bật
                    </span>
                  )}
                  <span className="price-tag" style={{ bottom: '10px', right: '10px', padding: '0.3rem 0.75rem', fontSize: '0.9rem' }}>
                    {formatPrice(property.price)}
                  </span>
                </div>
                <div className="small-card-info">
                  <h4 className="small-property-title">{property.title}</h4>
                  <div className="small-property-features">
                    <div className="feature-item">
                      <Bed size={14} />
                      <span>{property.bedrooms}</span>
                    </div>
                    <div className="feature-item">
                      <Maximize size={14} />
                      <span>{property.area} m²</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-col">
            <span className="footer-logo">Swipe Nest</span>
            <p className="footer-desc">
              Nâng tầm trải nghiệm bất động sản qua lăng kính của sự tinh tế và chuyên nghiệp.
            </p>
          </div>

          <div className="footer-col">
            <h4>DỊCH VỤ</h4>
            <div className="footer-links">
              <a href="#" className="footer-link">Mua</a>
              <a href="#" className="footer-link">Thuê</a>
              <a href="#" className="footer-link">Bán</a>
            </div>
          </div>

          <div className="footer-col">
            <h4>CÔNG TY</h4>
            <div className="footer-links">
              <a href="#" className="footer-link">Về Chúng Tôi</a>
              <a href="#" className="footer-link">Tuyển Dụng</a>
              <a href="#" className="footer-link">Liên Hệ</a>
            </div>
          </div>

          <div className="footer-col">
            <h4>PHÁP LÝ</h4>
            <div className="footer-links">
              <a href="#" className="footer-link">Chính Sách Bảo Mật</a>
              <a href="#" className="footer-link">Điều Khoản Sử Dụng</a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          © 2024 Swipe Nest. All rights reserved.
        </div>
      </footer>

      {/* Property Details Modal */}
      {showDetailModal && selectedProperty && (() => {
        const sliderImages = (selectedProperty.property_images && selectedProperty.property_images.length > 0)
          ? selectedProperty.property_images.map(img => img.image_url)
          : [selectedProperty.thumbnail];

        const lifestyleChips = selectedProperty.lifestyle_tags && selectedProperty.lifestyle_tags.length > 0
          ? selectedProperty.lifestyle_tags.map(t => t.tag_name)
          : [];
        const amenityChips = selectedProperty.property_features && selectedProperty.property_features.length > 0
          ? selectedProperty.property_features.map(f => f.feature_name)
          : [];
        const ownerDetails = selectedProperty.owner || {
          name: 'Nguyễn Văn Minh',
          role: 'Chính chủ',
          avatar: 'https://i.pravatar.cc/150?img=67',
          trust_score: 92,
          created_at: selectedProperty.created_at
        };

        const isFav = dbFavorites.some(fav => fav.id === selectedProperty.id);

        return (
          <div className="modal-backdrop" onClick={() => { setShowDetailModal(false); setSelectedProperty(null); }}>
            <div className="detail-modal-content premium-detail-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close-btn circular-close" onClick={() => { setShowDetailModal(false); setSelectedProperty(null); }}>
                <X size={20} />
              </button>
              
              <div className="modal-body premium-body">
                {/* 1. Top Media Slider */}
                <div className="detail-media-slider">
                  <div className="main-image-container">
                    <img src={sliderImages[activeSliderIdx]} alt={selectedProperty.title} className="slider-main-img" />
                    
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
                      <Sparkles size={12} /> {selectedProperty.matchScore || 95}% MATCH SCORE
                    </span>
                    
                    <div className="detail-rating">
                      <span className="rating-num">{selectedProperty.average_rating ? selectedProperty.average_rating.toFixed(1) : '0'}</span>
                      <div className="rating-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                          <span key={star} className={star <= Math.round(selectedProperty.average_rating || 0) ? 'star-filled' : 'star-empty'}>★</span>
                        ))}
                      </div>
                      <span className="rating-count">({selectedProperty.review_count || 0} đánh giá)</span>
                    </div>
                  </div>

                  {/* 3. Header Section */}
                  <div className="detail-header-block">
                    <div className="title-section">
                      <h2>{selectedProperty.title}</h2>
                      <div className="detail-address-row">
                        <MapPin size={16} />
                        <span>{selectedProperty.address}</span>
                      </div>
                    </div>
                    
                    <div className="detail-action-buttons">
                      <button 
                        className={`action-btn fav-btn ${isFav ? 'active' : ''}`}
                        onClick={async () => {
                          if (!user?.id) return;
                          if (isFav) {
                            setDbFavorites(prev => prev.filter(fav => fav.id !== selectedProperty.id));
                            fetch(`${API_BASE_URL}/api/favorites/delete`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id, propertyId: selectedProperty.id })
                            }).catch(err => console.error(err));
                          } else {
                            setDbFavorites(prev => [...prev, selectedProperty]);
                            fetch(`${API_BASE_URL}/api/favorites`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userId: user.id, propertyId: selectedProperty.id })
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
                    {selectedProperty.price ? selectedProperty.price.toLocaleString('vi-VN') : 'Liên hệ'} VNĐ
                  </div>

                  {/* 4. Specs Grid */}
                  <div className="detail-specs-grid">
                    <div className="spec-card">
                      <div className="spec-icon-box"><Maximize size={20} /></div>
                      <div className="spec-info">
                        <span>Diện tích</span>
                        <p>{selectedProperty.area} m²</p>
                      </div>
                    </div>
                    <div className="spec-card">
                      <div className="spec-icon-box"><Bath size={20} /></div>
                      <div className="spec-info">
                        <span>Phòng tắm</span>
                        <p>{selectedProperty.bathrooms || 0}</p>
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
                      <p className="description-text">{selectedProperty.description}</p>
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
                          <p>Thành viên từ {new Date(ownerDetails.created_at || selectedProperty.created_at).toLocaleDateString('vi-VN')}</p>
                        </div>
                      </div>
                      
                      <div className="poster-right">
                        <div className="trust-score-wrapper">
                          <span>Trust Score</span>
                          <p>{ownerDetails.trust_score || 92}</p>
                          <small>Rất uy tín</small>
                        </div>
                        
                        <div className="poster-contact-buttons">
                          <a href={`sms:${selectedProperty.contact_phone || '0901234567'}`} className="contact-btn message-btn">
                            <MessageSquare size={16} /> Nhắn tin
                          </a>
                          <a href={`tel:${selectedProperty.contact_phone || '0901234567'}`} className="contact-btn call-btn">
                            <Phone size={16} /> Gọi ngay
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 8. Footer Info */}
                  <div className="detail-footer-bar">
                    <div className="footer-item"><Calendar size={14} /> <span>Đăng tin: {new Date(selectedProperty.created_at).toLocaleDateString('vi-VN')}</span></div>
                    <div className="footer-item"><Eye size={14} /> <span>Lượt xem: {selectedProperty.views || 0}</span></div>
                    <div className="footer-item"><Shield size={14} /> <span>Mã tin: {selectedProperty.property_type === 'Mặt Bằng' ? 'MBKD' : 'CHCH'}-{124000 + selectedProperty.id}</span></div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Advanced Filter Modal */}
      {showAdvModal && (
        <div className="modal-backdrop" onClick={() => setShowAdvModal(false)}>
          <div className="filter-modal-content home-filter-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowAdvModal(false)}>
              <X size={24} />
            </button>
            <h3>Bộ lọc nâng cao</h3>
            
            <div className="filter-modal-body">
              {/* Khu vực */}
              <div className="filter-group">
                <label className="filter-section-title">Khu vực</label>
                <div className="area-filter-inputs">
                  <select 
                    value={selectedProvince}
                    onChange={(e) => {
                      setSelectedProvince(e.target.value);
                      if (e.target.value) {
                        setActiveRegionTab(e.target.value);
                      }
                    }}
                  >
                    <option value="">Tất cả Tỉnh/TP</option>
                    <option value="TP.HCM">TP.HCM</option>
                    <option value="Bình Dương">Bình Dương</option>
                    <option value="Bà Rịa - Vũng Tàu">Bà Rịa - Vũng Tàu</option>
                  </select>

                  <div className="ward-search-wrapper">
                    <div className="ward-search-input-container">
                      <input 
                        type="text" 
                        placeholder="Tìm phường..." 
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
                </div>

                {/* Suggestions List */}
                {suggestedWards.length > 0 && (
                  <ul className="ward-suggestions">
                    {suggestedWards.map((ward) => (
                      <li key={ward} onClick={() => handleSelectWardFromAdv(ward)}>
                        {ward}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Selected Ward Badges */}
                {selectedWards.length > 0 && (
                  <div className="selected-ward-badges">
                    {selectedWards.map((ward) => (
                      <span key={ward} className="ward-badge">
                        {ward}
                        <button type="button" onClick={() => handleRemoveWard(ward)}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Loại bất động sản */}
              <div className="filter-group">
                <label className="filter-section-title">Loại bất động sản</label>
                <div className="chips-grid">
                  {['Căn Hộ', 'Nhà Ở', 'Chung Cư', 'Biệt Thự', 'Đất Nền'].map(cat => {
                    const isSelected = selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`filter-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handleToggleCategoryChip(cat)}
                      >
                        {cat === 'Nhà Ở' ? 'Nhà ở' : cat === 'Căn Hộ' ? 'Căn hộ' : cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Khoảng giá */}
              <div className="filter-group">
                <label className="filter-section-title">Khoảng giá (VNĐ)</label>
                <div className="range-inputs">
                  <input 
                    type="number" 
                    placeholder="Từ (VNĐ)" 
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                  />
                  <span className="range-divider">-</span>
                  <input 
                    type="number" 
                    placeholder="Đến (VNĐ)" 
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                </div>
              </div>

              {/* Diện tích */}
              <div className="filter-group">
                <label className="filter-section-title">Diện tích (m²)</label>
                <div className="range-inputs">
                  <input 
                    type="number" 
                    placeholder="Từ m²" 
                    value={minArea}
                    onChange={(e) => setMinArea(e.target.value)}
                  />
                  <span className="range-divider">-</span>
                  <input 
                    type="number" 
                    placeholder="Đến m²" 
                    value={maxArea}
                    onChange={(e) => setMaxArea(e.target.value)}
                  />
                </div>
              </div>

              {/* Số phòng */}
              <div className="filter-group">
                <label className="filter-section-title">Số phòng ngủ</label>
                <div className="chips-grid">
                  {['1', '2', '3', '4+'].map(room => {
                    const isSelected = selectedBedrooms.includes(room);
                    return (
                      <button
                        key={room}
                        type="button"
                        className={`filter-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handleToggleBedroomChip(room)}
                      >
                        {room === '4+' ? '4+ PN' : `${room} PN`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lifestyle */}
              <div className="filter-group lifestyle-filter-group">
                <label className="filter-section-title">Lifestyle</label>
                
                {/* Group 1: Nhu cầu vị trí */}
                {groupedFeatures['Nhu cầu vị trí']?.length > 0 && (
                  <div className="lifestyle-subgroup">
                    <span className="lifestyle-subgroup-title">Bạn muốn sống gần đâu?</span>
                    <div className="lifestyle-chips-grid">
                      {groupedFeatures['Nhu cầu vị trí'].map((feat) => {
                        const isSelected = selectedLifestyles.includes(feat);
                        return (
                          <button
                            key={feat}
                            type="button"
                            className={`lifestyle-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleLifestyleChip(feat)}
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
                        const isSelected = selectedLifestyles.includes(feat);
                        return (
                          <button
                            key={feat}
                            type="button"
                            className={`lifestyle-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleLifestyleChip(feat)}
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
                        const isSelected = selectedLifestyles.includes(feat);
                        return (
                          <button
                            key={feat}
                            type="button"
                            className={`lifestyle-chip ${isSelected ? 'active' : ''}`}
                            onClick={() => handleToggleLifestyleChip(feat)}
                          >
                            {feat}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="filter-actions">
              <button type="button" className="btn-secondary" onClick={handleClearFilters}>Xóa lọc</button>
              <button type="button" className="btn-primary" onClick={() => setShowAdvModal(false)}>Áp dụng</button>
            </div>
          </div>
        </div>
      )}

      {/* Ward List Checklist Modal (Sub-Modal) */}
      {showWardListModal && (
        <div className="modal-backdrop sub-modal-backdrop" onClick={handleCancelWardList}>
          <div className="ward-list-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={handleCancelWardList}>
              <X size={24} />
            </button>
            <h3>Chọn Phường từ danh sách</h3>
            
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

            <div className="list-search-container">
              <input 
                type="text" 
                placeholder="Tìm phường..." 
                value={listModalSearchQuery}
                onChange={(e) => setListModalSearchQuery(e.target.value)}
              />
            </div>

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

export default Home;
