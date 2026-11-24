import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mascot } from 'page-mascot';
import SwipeHeader from '../features/swipe/SwipeHeader';
import HomeFooter from '../features/home/HomeFooter';
import AuthLoading from '../components/AuthLoading';
import { 
  Search, MapPin, Home as HomeIcon, 
  Bed, Bath,
  ChevronDown, ArrowRight, Heart, X, Scan,
  ChevronRight, Sparkles,
  Ruler, Zap, SlidersHorizontal, Building2, BriefcaseBusiness, Store, BedDouble
} from 'lucide-react';
import './Home.css';
import '../features/home/HomeHero.css';
import '../features/home/HomeMobile.css';
import { API_BASE_URL } from '../config';
import { apiFetch, publicApiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import { useRequireAuth } from '../auth/useRequireAuth';
import PropertyDetailModal from '../components/PropertyDetailModal';
import PageWaveBackground from '../components/PageWaveBackground';
import CheckedListingsSection from '../features/plus/CheckedListingsSection';
import PlusLockedCard from '../features/plus/PlusLockedCard';
import { SwipeNestBadges } from '../features/plus/SwipeNestBadges';
import { priceRangeOf, writeSearch } from '../features/search/searchParams';
import AreaSelect from '../features/location/AreaSelect';
import { HomeAreaDropdown, HomePropertyTypeDropdown, HomePriceDropdown } from '../features/home/HomeSearchDropdowns';

const getCategoryIllustration = (name = '') => {
  const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  if (/van phong|office/.test(normalized)) return '/icons/categories/office.webp';
  if (/mat bang|kinh doanh|shop|retail|store/.test(normalized)) return '/icons/categories/shop.webp';
  if (/phong tro|studio|room/.test(normalized)) return '/icons/categories/room.webp';
  if (/chung cu|can ho|apartment|condo/.test(normalized)) return '/icons/categories/apartment.webp';

  return '/icons/categories/house.webp';
};

const PROPERTY_CATEGORY_CATALOG = [
  'Nhà Ở',
  'Văn Phòng',
  'Căn Hộ',
  'Chung Cư',
  'Mặt Bằng',
  'Phòng Trọ'
];

const normalizePropertyType = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('vi')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const EXCLUDED_PROPERTY_CATEGORY_KEYS = new Set(['dat nen', 'dat', 'land']);
const CATEGORY_ICONS = {
  'Nhà Ở': HomeIcon, 'Chung Cư': Building2, 'Căn Hộ': Building2,
  'Văn Phòng': BriefcaseBusiness, 'Mặt Bằng': Store, 'Phòng Trọ': BedDouble
};

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sharedPropertyId = searchParams.get('propertyId');
  const { user, authStatus } = useAuth();
  const normalizedRole = String(user?.role || '').toUpperCase();
  const requireAuth = useRequireAuth();
  const [properties, setProperties] = useState([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [propertiesError, setPropertiesError] = useState('');
  const [propertiesReloadKey, setPropertiesReloadKey] = useState(0);
  const actionNotice = location.state?.authActionNotice || '';
  
  // Search parameters
  // Khu vực chọn từ dropdown (đơn vị hành chính mới).
  const [searchArea, setSearchArea] = useState({ province: '', ward: '' });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Advanced Filter state
  const [showAdvModal, setShowAdvModal] = useState(false);
  const advancedFilterDialog = useRef(null);
  useEffect(() => {
    if (!showAdvModal) return undefined;
    const dialog = advancedFilterDialog.current;
    dialog.showModal();
    return () => dialog.close();
  }, [showAdvModal]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minArea, setMinArea] = useState('');
  const [maxArea, setMaxArea] = useState('');
  const [selectedBedrooms, setSelectedBedrooms] = useState([]);
  const [selectedLifestyles, setSelectedLifestyles] = useState([]);

  const searchType = selectedCategories.length > 1 ? 'CUSTOM' : (selectedCategories[0] || 'ALL');
  const priceRange = priceRangeOf({
    minPrice: minPrice === '' ? '' : String(parseFloat(minPrice)),
    maxPrice: maxPrice === '' ? '' : String(parseFloat(maxPrice))
  });


  // Suggestions state

  const [filteredProperties, setFilteredProperties] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [dbFavorites, setDbFavorites] = useState([]);
  const pendingFavoritesRef = useRef(new Set());
  const hasFetchedInitialRef = useRef(false);

  const categories = useMemo(() => {
    const counts = {};
    properties.forEach(p => {
      const type = p.property_type || 'Khác';
      const key = normalizePropertyType(type);
      if (EXCLUDED_PROPERTY_CATEGORY_KEYS.has(key) || key.startsWith('land ')) return;
      counts[key] = { name: type, count: (counts[key]?.count || 0) + 1 };
    });

    const catalogKeys = new Set(PROPERTY_CATEGORY_CATALOG.map(normalizePropertyType));
    const knownCategories = PROPERTY_CATEGORY_CATALOG.map((name) => ({
      name,
      count: counts[normalizePropertyType(name)]?.count || 0
    }));
    const additionalCategories = Object.entries(counts)
      .filter(([key]) => !catalogKeys.has(key))
      .map(([, category]) => category);

    return [...knownCategories, ...additionalCategories];
  }, [properties]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const controller = new AbortController();
    const fetchFavorites = async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/favorites`, { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted) setDbFavorites(data.favorites || []);
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Error fetching database favorites:', err);
      }
    };
    fetchFavorites();
    return () => controller.abort();
  }, [user?.id]);

  useEffect(() => {
    if (!showDetailModal || !selectedProperty?.id || !user?.id) return;
    apiFetch(`${API_BASE_URL}/api/me/property-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: selectedProperty.id, action: 'VIEW' })
    }).catch((error) => console.warn('Could not record property view:', error));
  }, [showDetailModal, selectedProperty?.id, user?.id]);

  const publicSearchFilters = useMemo(() => JSON.stringify({
    ...(searchArea.province ? { province: searchArea.province } : {}),
    ...(searchArea.province && searchArea.ward ? { ward: searchArea.ward } : {}),
    categories: selectedCategories.filter(item => item !== 'Tất cả'),
    minPrice, maxPrice, minArea, maxArea, bedrooms: selectedBedrooms.map(String), features: selectedLifestyles
  }), [searchArea, selectedCategories, minPrice, maxPrice, minArea, maxArea, selectedBedrooms, selectedLifestyles]);
  // "Dành cho bạn": người dùng đã đăng nhập thấy 4 tin từ chính bộ máy gợi ý của trang Khám phá (khảo sát +
  // lịch sử thích / bỏ qua), có áp bộ lọc trên thanh tìm kiếm. Khách hoặc khi chưa có gợi ý thì dùng "Nổi bật".
  const [personalPicks, setPersonalPicks] = useState({ key: null, items: [] });
  useEffect(() => {
    if (normalizedRole !== 'USER') return undefined;
    const controller = new AbortController();
    const key = `${user?.id}|${publicSearchFilters}`;
    const query = new URLSearchParams({ category: 'ALL', limit: '4', offset: '0', filters: publicSearchFilters });
    apiFetch(`${API_BASE_URL}/api/recommendations?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { properties: [] }))
      .then((data) => setPersonalPicks({ key, items: (data.properties || []).filter((property) => !property.is_hidden).slice(0, 4) }),
        () => {});
    return () => controller.abort();
  }, [normalizedRole, user?.id, publicSearchFilters]);

  // The server filters and orders before limiting the featured results.
  useEffect(() => {
    if (authStatus === 'authenticating') return undefined;
    const controller = new AbortController();
    let active = true;
    const fetchProperties = async () => {
      try {
        const query = new URLSearchParams({ limit: '12', filters: publicSearchFilters });
        const response = await publicApiFetch(`${API_BASE_URL}/api/properties?${query}`, {
          signal: controller.signal
        });
        if (!response.ok) throw new Error('Failed to fetch properties');
        const data = await response.json();
        if (!Array.isArray(data.properties)) throw new Error('Invalid properties response');
        if (!active) return;
        setPropertiesError('');
        
        if (data.properties) {
          const visibleProperties = data.properties.filter(p => !p.is_hidden);
          setProperties(visibleProperties);
          setFilteredProperties(visibleProperties);

          if (sharedPropertyId) {
            // Liên kết chia sẻ / quay lại sau đăng nhập (/?propertyId=…) phải mở được cả tin không nằm trong
            // 12 tin nổi bật đang tải: khi không có sẵn thì tải riêng tin đó theo id.
            let found = visibleProperties.find(p => String(p.id) === String(sharedPropertyId));
            if (!found && /^[1-9]\d{0,15}$/.test(sharedPropertyId)) {
              const single = await publicApiFetch(`${API_BASE_URL}/api/properties/${sharedPropertyId}`, { signal: controller.signal });
              if (single.ok) found = (await single.json()).property || null;
            }
            if (found && !found.plus_locked && active) {
              setSelectedProperty(found);
              setShowDetailModal(true);
            }
          }
        }
      } catch (error) {
        if (!active || error.name === 'AbortError') return;
        console.error('Error fetching properties from DB:', error);
        setPropertiesError('Chưa thể tải tin đăng. Vui lòng thử lại sau giây lát.');
      } finally {
        if (active) setIsLoadingProperties(false);
      }
    };

    // Tải lần đầu chạy ngay lập tức (không trễ 180ms); các lần đổi bộ lọc sau mới debounce nhẹ.
    let timer = null;
    if (!hasFetchedInitialRef.current) {
      hasFetchedInitialRef.current = true;
      fetchProperties();
    } else {
      timer = setTimeout(fetchProperties, 180);
    }
    return () => {
      if (timer) clearTimeout(timer);
      active = false;
      controller.abort();
    };
  }, [authStatus, user?.id, sharedPropertyId, propertiesReloadKey, publicSearchFilters]);

  const selectCategoryPreview = async (category) => {
    const returnTo = `/swipe/${encodeURIComponent(category.name)}`;
    // Danh mục nằm sẵn trên đường dẫn (/swipe/<loại>); không gửi kèm bộ lọc để tránh nút "Lọc" hiện số khó hiểu.
    const authorizedUser = await requireAuth({ type: 'NAVIGATE', returnTo });
    if (authorizedUser) navigate(returnTo);
  };

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

    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.localeCompare(b, 'vi'));
    });

    return groups;
  }, [properties]);

  // Tìm kiếm mở trang kết quả (/search), không chuyển thẳng sang chế độ quẹt. Trang kết quả xem được cả khi chưa đăng nhập.
  const executeSearch = (e) => {
    if (e) e.preventDefault();
    const query = writeSearch({
      q: searchQuery,
      province: searchArea.province,
      ward: searchArea.ward,
      types: selectedCategories,
      listing: '',
      minPrice, maxPrice, minArea, maxArea,
      beds: selectedBedrooms,
      tags: selectedLifestyles
    });
    navigate(`/search${query ? `?${query}` : ''}`);
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

  const handleClearFilters = () => {
    setSearchArea({ province: '', ward: '' });
    setSelectedCategories([]);
    setMinPrice('');
    setMaxPrice('');
    setMinArea('');
    setMaxArea('');
    setSelectedBedrooms([]);
    setSelectedLifestyles([]);
  };


  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchArea.province) count++;
    if (searchArea.ward) count++;
    if (selectedCategories.length > 0) count += selectedCategories.length;
    if (minPrice || maxPrice) count++;
    if (minArea || maxArea) count++;
    if (selectedBedrooms.length > 0) count += selectedBedrooms.length;
    if (selectedLifestyles.length > 0) count += selectedLifestyles.length;
    return count;
  }, [searchArea, selectedCategories, minPrice, maxPrice, minArea, maxArea, selectedBedrooms, selectedLifestyles]);


  const formatPrice = (price) => {
    if (!price || price === 0) return 'Liên hệ';
    const billion = 1000000000;
    const million = 1000000;
    if (price >= billion) {
      return `${(price / billion).toFixed(1).replace('.0', '')} Tỷ`;
    }
    if (price >= million) {
      return `${(price / million).toFixed(0)} Triệu`;
    }
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  };

  const toggleFavorite = async (property) => {
    const propertyId = Number(property.id);
    if (!propertyId || pendingFavoritesRef.current.has(propertyId)) return;
    pendingFavoritesRef.current.add(propertyId);

    try {
      const returnTo = location.pathname === '/'
        ? `/?propertyId=${encodeURIComponent(propertyId)}`
        : `${location.pathname}${location.search}`;
      const routeState = location.pathname.startsWith('/swipe/') ? { selectPropertyId: propertyId } : undefined;
      const authorizedUser = await requireAuth({
        type: 'FAVORITE_PROPERTY', propertyId, returnTo, routeState
      });
      if (!authorizedUser) return;
      const isFavorite = dbFavorites.some(fav => fav.id === property.id);

      if (isFavorite) {
        setDbFavorites(prev => prev.filter(fav => fav.id !== property.id));
        await apiFetch(`${API_BASE_URL}/api/favorites/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: property.id })
        });
      } else {
        setDbFavorites(prev => [...prev, property]);
        await apiFetch(`${API_BASE_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId: property.id })
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      pendingFavoritesRef.current.delete(propertyId);
    }
  };

  const featuredProperties = useMemo(() => {
    let candidates = filteredProperties;
    const categoriesToShow = selectedCategories.length > 0
      ? selectedCategories
      : (searchType !== 'ALL' && searchType !== 'CUSTOM' ? [searchType] : []);
    if (categoriesToShow.length) {
      const categoryKeys = new Set(categoriesToShow.map(normalizePropertyType));
      candidates = candidates.filter((property) => categoryKeys.has(normalizePropertyType(property.property_type)));
    }
    if (minPrice !== '') candidates = candidates.filter((property) => Number(property.price) >= Number(minPrice));
    if (maxPrice !== '') candidates = candidates.filter((property) => Number(property.price) <= Number(maxPrice));
    if (minArea !== '') candidates = candidates.filter((property) => Number(property.area) >= Number(minArea));
    if (maxArea !== '') candidates = candidates.filter((property) => Number(property.area) <= Number(maxArea));
    if (selectedBedrooms.length) candidates = candidates.filter((property) => (
      selectedBedrooms.some((bedroom) => Number(bedroom) === Number(property.bedrooms))
    ));
    if (selectedLifestyles.length) {
      candidates = candidates.filter((property) => {
        const available = [
          ...(property.property_features || []).map((feature) => feature.feature_name),
          ...(property.lifestyle_tags || []).map((tag) => tag.tag_name)
        ];
        return selectedLifestyles.every((selected) => available.includes(selected));
      });
    }
    return candidates.slice(0, 4);
  }, [filteredProperties, selectedCategories, searchType, minPrice, maxPrice, minArea, maxArea, selectedBedrooms, selectedLifestyles]);

  // Người dùng có gợi ý cá nhân (khớp đúng bộ lọc hiện tại) thì hiện "Dành cho bạn", nếu không thì "Nổi bật".
  const showPersonal = normalizedRole === 'USER' && personalPicks.key === `${user?.id}|${publicSearchFilters}`
    && personalPicks.items.length > 0;
  const showcaseProperties = showPersonal ? personalPicks.items : featuredProperties;

  if (authStatus === 'authenticating') {
    return (
      <AuthLoading
        description="Vui lòng đợi trong giây lát, Swipe Nest đang chuẩn bị những không gian phù hợp cho bạn."
        progressLabel="Đang chuẩn bị Trang chủ"
      />
    );
  }

  return (
    <div className="home-container">
      <PageWaveBackground className="home-bg-decor" waveClassName="home-bg-waves" />
      {/* Header */}
      <SwipeHeader 
        activeView="home" 
        onSearch={() => navigate('/search')} 
      />

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-inner">
          <div className="home-hero-intro">
            <div className="home-hero-copy">
              <p className="home-hero-kicker">Nơi những ước mơ có tổ ấm bắt đầu</p>
              <h1 id="home-hero-title">Tìm Kiếm Ngôi Nhà<br />Mơ Ước <span>Của Bạn</span></h1>
              <p className="home-hero-description">
                Khám phá hàng ngàn bất động sản phù hợp với phong cách sống của bạn.<br className="home-hero-description-break" />
                <span className="home-hero-description-extra">{' '}Dễ dàng. Nhanh chóng. Cùng <strong>Swipe Nest.</strong></span>
              </p>
            </div>

            <div className="home-hero-mascot">
              <Mascot
                directions="/mascots/otter-builder-directions.webp"
                reactions="/mascots/otter-builder-reactions.webp"
                size={120}
                label="rái cá Swipe Nest"
                className="home-hero-otter"
              />
            </div>
          </div>

          <form className="home-hero-search" aria-label="Tìm kiếm bất động sản" onSubmit={executeSearch}>
            <div className="home-mobile-search">
              <Search size={20} aria-hidden="true" />
              <input aria-label="Tìm theo vị trí, loại bất động sản" placeholder="Tìm theo vị trí, loại BĐS, …"
                value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              <button type="button" className="home-mobile-filter" aria-label="Bộ lọc nâng cao" aria-haspopup="dialog"
                onClick={() => setShowAdvModal(true)}><SlidersHorizontal size={20} /></button>
              <button type="submit" className="home-mobile-submit">Tìm kiếm <ArrowRight size={18} aria-hidden="true" /></button>
            </div>
            <div className="home-hero-filters">
            <button type="button" className="home-mobile-area" onClick={() => setShowAdvModal(true)} aria-haspopup="dialog">
              <MapPin size={16} aria-hidden="true" /><span>{searchArea.ward || searchArea.province || 'Toàn thành phố'}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            <HomeAreaDropdown
              province={searchArea.province}
              ward={searchArea.ward}
              onChange={setSearchArea}
            />

            <HomePropertyTypeDropdown
              selectedCategories={selectedCategories}
              onApplyCategories={setSelectedCategories}
            />

            <HomePriceDropdown
              priceRange={priceRange}
              minPrice={minPrice}
              maxPrice={maxPrice}
              onApplyPrice={({ minPrice: nextMin, maxPrice: nextMax }) => {
                setMinPrice(nextMin);
                setMaxPrice(nextMax);
              }}
            />

            <button type="button" className="home-hero-field home-hero-advanced" onClick={() => setShowAdvModal(true)}
              aria-haspopup="dialog">
              <Scan aria-hidden="true" size={20} />
              <span className="home-hero-field-content">
                <span>Diện tích</span>
                <span className="home-hero-field-value">
                  {(minArea || maxArea) ? `${minArea || '0'} – ${maxArea || '∞'} m²` : 'Tất cả diện tích'}
                </span>
              </span>
              {activeFilterCount > 0 && (
                <span className="home-hero-filter-count">{activeFilterCount}</span>
              )}
              <ChevronDown aria-hidden="true" size={14} />
            </button>

            <button type="submit" className="home-hero-submit">
              <Search aria-hidden="true" size={16} /> Tìm kiếm <ArrowRight aria-hidden="true" size={15} />
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
          <button className="view-all-link" onClick={() => executeSearch()}>Xem tất cả <ArrowRight size={14} /></button>
        </div>
        <div className="categories-grid">
          {categories.map((category) => {
            const CategoryIcon = CATEGORY_ICONS[category.name] || HomeIcon;
            return (
            <div 
              className="category-card" 
              key={category.name}
              role="button"
              tabIndex={0}
              onClick={() => selectCategoryPreview(category)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectCategoryPreview(category);
                }
              }}
            >
              <img
                src={getCategoryIllustration(category.name)}
                alt=""
                aria-hidden="true"
                decoding="async"
                className="category-img" 
              />
              <CategoryIcon className="home-mobile-category-icon" aria-hidden="true" size={28} />
              <div className="category-info">
                <h3>{category.name}</h3>
                <p>{category.count ? `${category.count}+ tin đăng` : 'Khám phá tin đăng'}</p>
              </div>
              <ChevronRight size={15} className="category-arrow" />
            </div>
            );
          })}
        </div>
      </section>

      {/* Nguồn hàng Swipe Nest: danh sách cho thành viên Plus, lời mời nâng cấp cho người chưa có */}
      {normalizedRole === 'USER' && (
        <CheckedListingsSection
          previewProperties={properties}
          formatPrice={formatPrice}
          favorites={dbFavorites}
          onToggleFavorite={toggleFavorite}
          onOpen={(property) => { setSelectedProperty(property); setShowDetailModal(true); }}
        />
      )}

      {/* Dành Cho Bạn (Recommended Properties) */}
      <section className="recommended-section" id="featured-properties">
        <div className="section-heading-row listings-heading">
          <div>
            <h2>{showPersonal ? 'Dành cho bạn' : 'Bất Động Sản Nổi Bật'} <Sparkles size={16} /></h2>
            <p>{showPersonal
              ? 'Gợi ý theo khảo sát của bạn và những căn bạn đã thích hoặc bỏ qua'
              : 'Những lựa chọn được yêu thích nhất từ cộng đồng Swipe Nest'}</p>
          </div>
          <button className="view-all-link" onClick={() => executeSearch()}>
            Xem tất cả <ArrowRight size={14} />
          </button>
        </div>

        <div className="featured-properties-grid" aria-busy={isLoadingProperties}>
          {actionNotice && <p className="home-action-notice" role="status">{actionNotice}</p>}
          {isLoadingProperties && showcaseProperties.length === 0 && (
            [0, 1, 2, 3].map((slot) => (
              <article className="listing-card listing-card--skeleton" key={`skeleton-${slot}`} aria-hidden="true">
                <div className="listing-image-wrap home-skeleton-block" />
                <div className="listing-card-body">
                  <div className="home-skeleton-line home-skeleton-line--title" />
                  <div className="home-skeleton-line home-skeleton-line--address" />
                  <div className="listing-card-bottom">
                    <div className="home-skeleton-line home-skeleton-line--price" />
                    <div className="home-skeleton-line home-skeleton-line--specs" />
                  </div>
                </div>
              </article>
            ))
          )}
          {showcaseProperties.map((property) => {
            if (property.plus_locked) {
              return <PlusLockedCard key={property.id} property={property} formatPrice={formatPrice} />;
            }
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
                  <img 
                    src={property.thumbnail || (property.images && property.images[0]) || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80'} 
                    alt={property.title}
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80';
                    }}
                  />
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
                  <SwipeNestBadges property={property} />
                  <h3>{property.title}</h3>
                  <p className="listing-address"><MapPin size={12} /> {property.address}</p>
                  <div className="listing-card-bottom">
                    <p className="listing-price">
                      <strong>{formatPrice(property.price).toLowerCase()}</strong>
                      {property.listing_type === 'RENT' && <span>/tháng</span>}
                      {property.listing_type === 'SALE' && <span>mua bán</span>}
                    </p>
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

          {propertiesError && (
            <div className="listings-empty-state" role="alert">
              <p>{propertiesError}</p>
              <button
                className="listings-retry-button"
                onClick={() => {
                  setPropertiesError('');
                  setIsLoadingProperties(true);
                  setPropertiesReloadKey((key) => key + 1);
                }}
              >
                Thử lại
              </button>
            </div>
          )}

          {!isLoadingProperties && !propertiesError && showcaseProperties.length === 0 && (
            <div className="listings-empty-state">
              {selectedCategories.length
                ? `Chưa có tin ${selectedCategories[0]} trong phần xem trước.`
                : 'Chưa có bất động sản phù hợp. Hãy thử thay đổi bộ lọc tìm kiếm.'}
            </div>
          )}
        </div>
      </section>

      <HomeFooter />

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
        <dialog className="home-filter-dialog" ref={advancedFilterDialog} aria-labelledby="home-filter-title"
          onCancel={(event) => { event.preventDefault(); setShowAdvModal(false); }}
          onClick={(event) => { if (event.target === event.currentTarget) setShowAdvModal(false); }}>
          <div className="home-filter-modal-content">
            <button type="button" className="modal-close-btn" aria-label="Đóng bộ lọc" onClick={() => setShowAdvModal(false)}>
              <X size={24} />
            </button>
            <h3 id="home-filter-title">Bộ lọc nâng cao</h3>
            
            <div className="filter-modal-body">
              {/* Khu vực: dùng chung dropdown (đơn vị hành chính mới) với thanh tìm kiếm */}
              <div className="filter-group">
                <label className="filter-section-title">Khu vực</label>
                <AreaSelect province={searchArea.province} ward={searchArea.ward} className="home-adv-area-select"
                  onChange={setSearchArea} />
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
        </dialog>
      )}

    </div>
  );
};

export default Home;
