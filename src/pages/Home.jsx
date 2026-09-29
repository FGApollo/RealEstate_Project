import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mascot } from 'page-mascot';
import SwipeNestMark from '../components/SwipeNestMark';
import { 
  Menu, Search, MapPin, Home as HomeIcon, 
  Bed, Bath, Maximize, LogOut,
  ChevronDown, ArrowRight, Heart, X, SlidersHorizontal,
  ChevronLeft, ChevronRight, MessageSquare, Calendar, Eye, ShieldCheck, Phone, Shield, Share2, Sparkles,
  Ruler, Star, Bell, Zap
} from 'lucide-react';
import './Home.css';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import PropertyDetailModal from '../components/PropertyDetailModal';
import { 
  WARDS_BY_REGION, 
  ALL_WARDS, 
  CUSTOM_LOCATION_SUGGESTIONS 
} from '../services/administrativeService';

const getCategoryIllustration = (name = '') => {
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (/van phong|office/.test(normalized)) return '/icons/categories/office.webp';
  if (/mat bang|kinh doanh|shop|retail|store/.test(normalized)) return '/icons/categories/shop.webp';
  if (/dat nen|land/.test(normalized)) return '/icons/categories/land.webp';
  if (/phong tro|studio|room/.test(normalized)) return '/icons/categories/room.webp';
  if (/chung cu|can ho|apartment|condo/.test(normalized)) return '/icons/categories/apartment.webp';

  return '/icons/categories/house.webp';
};

const Home = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sharedPropertyId = searchParams.get('propertyId');
  const { user, logout } = useAuth();
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
  const [dbFavorites, setDbFavorites] = useState([]);

  const categories = useMemo(() => {
    const counts = {};
    properties.forEach(p => {
      const type = p.property_type || 'Khác';
      counts[type] = (counts[type] || 0) + 1;
    });

    return Object.keys(counts).map(type => ({
      name: type,
      count: counts[type]
    }));
  }, [properties]);

  useEffect(() => {
    if (user?.role === 'AGENT') navigate('/sale/overview', { replace: true });
  }, [navigate, user]);

  const fetchFavorites = async () => {
    if (!user) return;
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/favorites`);
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

  // Fetch properties from backend API
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/properties`);
        if (!response.ok) throw new Error('Failed to fetch properties');
        const data = await response.json();
        
        if (data.properties) {
          const visibleProperties = data.properties.filter(p => !p.is_hidden);
          setProperties(visibleProperties);
          setFilteredProperties(visibleProperties);

          if (sharedPropertyId) {
            const found = visibleProperties.find(p => String(p.id) === String(sharedPropertyId));
            if (found) {
              setSelectedProperty(found);
              setShowDetailModal(true);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching properties from DB:', error);
      }
    };

    fetchProperties();
  }, [sharedPropertyId]);

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

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      alert(error.message);
    }
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

  const toggleFavorite = async (property) => {
    if (!user?.id) return;
    const isFavorite = dbFavorites.some(fav => fav.id === property.id);

    if (isFavorite) {
      setDbFavorites(prev => prev.filter(fav => fav.id !== property.id));
      apiFetch(`${API_BASE_URL}/api/favorites/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: property.id })
      }).catch(err => console.error(err));
    } else {
      setDbFavorites(prev => [...prev, property]);
      apiFetch(`${API_BASE_URL}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: property.id })
      }).catch(err => console.error(err));
    }
  };

  const featuredProperties = filteredProperties.slice(0, 4);

  return (
    <div className="home-container">
      {/* Navbar */}
      <header className="navbar">
        <div className="nav-left">
          <button className="menu-btn" aria-label="Menu" onClick={() => setShowSidebar(true)}>
            <Menu size={20} />
          </button>
          <button className="brand-lockup" onClick={() => navigate('/')} aria-label="Về trang chủ">
            <span className="brand-mark"><SwipeNestMark /></span>
            <span className="logo-text">Swipe Nest</span>
          </button>
        </div>

        <nav className="nav-middle">
          <button className="nav-link active" onClick={() => navigate('/')}>Trang Chủ</button>
          <button className="nav-link" onClick={() => navigate('/swipe/Tất cả')}>Khám Phá</button>
          <button className="nav-link" onClick={() => navigate('/swipe/Tất cả', { state: { activeView: 'saved' } })}>Yêu thích</button>
          <button className="nav-link" onClick={() => navigate('/chat')}>Chat</button>
        </nav>

        <div className="nav-right">
          <button className="search-icon-btn" aria-label="Search button">
            <Search size={18} />
          </button>
          <button className="notification-btn" aria-label="Thông báo">
            <Bell size={18} />
            <span className="notification-dot"></span>
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
              <button className="brand-lockup mobile-sidebar-brand" onClick={() => { navigate('/'); setShowSidebar(false); }} aria-label="Về trang chủ">
                <span className="brand-mark"><SwipeNestMark /></span>
                <span className="logo-text">Swipe Nest</span>
              </button>
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
        <div className="hero-content">
          <div className="hero-top-row">
            <div className="hero-copy">
              <div className="hero-eyebrow"><Sparkles size={12} /> NƠI NHỮNG ƯỚC MƠ CÓ TỔ ẤM BẮT ĐẦU</div>
              <div className="hero-title-container">
                <h1>Tìm Kiếm Ngôi Nhà</h1>
                <h1><span className="highlight-blue">Mơ Ước Của Bạn</span></h1>
              </div>
              <p className="hero-description">
                Khám phá hàng ngàn bất động sản phù hợp với phong cách sống của bạn. Dễ dàng. Nhanh chóng. Cùng <strong>Swipe Nest.</strong>
              </p>
            </div>

            <div className="hero-mascot-container">
              <div className="mascot-speech-bubble">
                Cùng tìm<br/>ngôi nhà lý tưởng<br/>nào!
                <div className="speech-bubble-tail"></div>
              </div>
              <Mascot
                directions="/mascots/otter-builder-directions.webp"
                reactions="/mascots/otter-builder-reactions.webp"
                size={176}
                label="rái cá Swipe Nest"
                className="hero-mascot-img"
              />
            </div>

            <div className="hero-visual">
              <div className="hero-photo-frame">
                <img
                  src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=85"
                  alt="House"
                />
              </div>
              <div className="hero-photo-note" aria-label="Good Homes, Brighter Tomorrows">
                <span>Good Homes</span>
                <span>Brighter Tomorrows</span>
                <svg viewBox="0 0 112 64" aria-hidden="true" focusable="false">
                  <path d="M108 2C91 21 69 40 12 52" />
                  <path d="M12 52L22 43M12 52L24 56" />
                </svg>
              </div>
            </div>
          </div>

          {/* Search Form */}
          <form className="search-bar-container" onSubmit={executeSearch}>
            {/* 1. Ô địa điểm */}
            <div className="search-field location-field-wrapper">
              <div className="search-field-icon-wrapper light-blue-bg"><MapPin size={18} color="#1a42b8" /></div>
              <div className="search-field-content">
                <label>Nhập địa điểm</label>
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
                    aria-label="Địa điểm"
                    placeholder={selectedWards.length === 0 ? "Phường, quận, thành phố..." : ""}
                    value={searchLoc}
                    onChange={(e) => {
                      setSearchLoc(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                </div>
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
              <div className="search-field-icon-wrapper light-blue-bg"><HomeIcon size={18} color="#1a42b8" /></div>
              <div className="search-field-content">
                <label>Loại bất động sản</label>
                <select value={searchType} onChange={handleSearchTypeChange} aria-label="Loại bất động sản">
                  <option value="ALL">Tất cả loại</option>
                  <option value="Căn Hộ">Căn hộ</option>
                  <option value="Chung Cư">Chung cư</option>
                  <option value="Nhà Ở">Nhà ở</option>
                  <option value="Phòng Trọ">Phòng trọ</option>
                  <option value="Mặt Bằng">Mặt bằng</option>
                  <option value="Văn Phòng">Văn phòng</option>
                  <option value="Biệt Thự">Biệt thự</option>
                  <option value="Đất Nền">Đất nền</option>
                  {searchType === 'CUSTOM' && <option value="CUSTOM">Nhiều loại hình</option>}
                </select>
              </div>
              <ChevronDown size={14} className="select-arrow-icon" />
            </div>

            <div className="search-field-divider"></div>

            {/* 3. Khoảng giá select */}
            <div className="search-field select-field">
              <div className="search-field-icon-wrapper solid-blue-bg"><span style={{color: 'white', fontWeight: 'bold', fontSize: '14px'}}>$</span></div>
              <div className="search-field-content">
                <label>Khoảng giá</label>
                <select value={priceRange} onChange={handlePriceRangeChange} aria-label="Khoảng giá">
                  <option value="ALL">Tất cả mức giá</option>
                  <option value="under-5m">Dưới 5 triệu</option>
                  <option value="5m-10m">5 - 10 triệu</option>
                  <option value="10m-20m">10 - 20 triệu</option>
                  <option value="over-20m">Trên 20 triệu</option>
                  {priceRange === 'CUSTOM' && <option value="CUSTOM">Tùy chọn giá</option>}
                </select>
              </div>
              <ChevronDown size={14} className="select-arrow-icon" />
            </div>

            <div className="search-field-divider"></div>

            {/* 4. Diện tích */}
            <div className="search-field select-field" onClick={() => setShowAdvModal(true)} style={{ cursor: 'pointer' }}>
              <div className="search-field-icon-wrapper light-blue-bg">
                <SlidersHorizontal size={18} color="#1a42b8" />
              </div>
              <div className="search-field-content">
                <label>Diện tích</label>
                <div className="pseudo-select-text" style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Tất cả diện tích</div>
              </div>
              <ChevronDown size={14} className="select-arrow-icon" />
              {activeFilterCount > 0 && (
                <span className="home-filter-badge-new">{activeFilterCount}</span>
              )}
            </div>

            {/* 5. Tìm kiếm button */}
            <div className="search-btn-wrapper" style={{ padding: '0 0.5rem 0 1rem' }}>
              <button type="submit" className="search-btn">
                <Search size={18} /> Tìm kiếm <ArrowRight size={16} />
              </button>
            </div>
          </form>

        </div>
      </section>

      {/* Danh Mục Phổ Biến (Popular Categories) */}
      <section className="categories-section">
        <div className="section-heading-row">
          <div>
            <h2>Danh Mục Phổ Biến <Zap size={16} fill="currentColor" /></h2>
            <p>Khám phá các loại bất động sản phù hợp với nhu cầu của bạn</p>
          </div>
          <button className="view-all-link" onClick={() => navigate('/swipe/Tất cả')}>Xem tất cả <ArrowRight size={14} /></button>
        </div>
        <div className="categories-grid">
          {categories.slice(0, 6).map((category) => (
            <div 
              className="category-card" 
              key={category.name}
              onClick={() => navigate(`/swipe/${encodeURIComponent(category.name)}`)}
            >
              <img
                src={getCategoryIllustration(category.name)}
                alt=""
                aria-hidden="true"
                className="category-img" 
              />
              <div className="category-info">
                <h3>{category.name}</h3>
                <p>{category.count}+ tin đăng</p>
              </div>
              <ChevronRight size={15} className="category-arrow" />
            </div>
          ))}
        </div>
      </section>

      {/* Dành Cho Bạn (Recommended Properties) */}
      <section className="recommended-section">
        <div className="section-heading-row listings-heading">
          <div>
            <h2>Bất Động Sản Nổi Bật <Sparkles size={16} /></h2>
            <p>Những lựa chọn được yêu thích nhất từ cộng đồng Swipe Nest</p>
          </div>
          <button className="view-all-link" onClick={() => navigate('/swipe/Tất cả')}>
            Xem tất cả <ArrowRight size={14} />
          </button>
        </div>

        <div className="featured-properties-grid">
          {featuredProperties.map((property) => {
            const isFavorite = dbFavorites.some(fav => fav.id === property.id);
            return (
              <article
                className="listing-card"
                key={property.id}
                onClick={() => {
                  setSelectedProperty(property);
                  setShowDetailModal(true);
                }}
              >
                <div className="listing-image-wrap">
                  <img src={property.thumbnail} alt={property.title} />
                  {property.is_highlighted && <span className="listing-highlight-badge"><Sparkles size={11} /> Nổi bật</span>}
                  <button
                    className={`listing-favorite ${isFavorite ? 'active' : ''}`}
                    aria-label={isFavorite ? 'Bỏ lưu' : 'Lưu bất động sản'}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleFavorite(property);
                    }}
                  >
                    <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
                <div className="listing-card-body">
                  <h3>{property.title}</h3>
                  <p className="listing-address"><MapPin size={12} /> {property.address}</p>
                  <div className="listing-card-bottom">
                    <p className="listing-price"><strong>{formatPrice(property.price).toLowerCase()}</strong><span>/tháng</span></p>
                    <div className="listing-specs">
                      <span><Bed size={12} /> {property.bedrooms}</span>
                      <span><Bath size={12} /> {property.bathrooms}</span>
                      <span><Ruler size={12} /> {property.area}m²</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {featuredProperties.length === 0 && (
            <div className="listings-empty-state">Chưa có bất động sản phù hợp. Hãy thử thay đổi bộ lọc tìm kiếm.</div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-grid">
          <div className="footer-col">
            <button className="footer-brand" onClick={() => navigate('/')}>
              <span className="brand-mark"><SwipeNestMark /></span>
              <span className="footer-logo">Swipe Nest</span>
            </button>
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

          <div className="footer-col footer-social-col">
            <h4>KẾT NỐI VỚI CHÚNG TÔI</h4>
            <div className="footer-socials">
              <span>f</span><span>♪</span><span>▶</span><span>◎</span><span>in</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          © 2024 Swipe Nest. All rights reserved.
        </div>
      </footer>

      {/* Property Details Modal (F18: Reusable Component) */}
      {showDetailModal && selectedProperty && (
        <PropertyDetailModal
          property={selectedProperty}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedProperty(null);
          }}
          showFavoriteActions={true}
          isFavorite={dbFavorites.some(fav => fav.id === selectedProperty.id)}
          onToggleFavorite={() => toggleFavorite(selectedProperty)}
          onSelectProperty={(prop) => setSelectedProperty(prop)}
        />
      )}

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
                  {['Căn Hộ', 'Chung Cư', 'Nhà Ở', 'Phòng Trọ', 'Mặt Bằng', 'Văn Phòng'].map(cat => {
                    const isSelected = selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`filter-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handleToggleCategoryChip(cat)}
                      >
                        {cat}
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
