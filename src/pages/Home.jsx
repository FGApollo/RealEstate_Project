import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Menu, Search, MapPin, Home as HomeIcon, 
  Bed, Bath, Maximize, LogOut, User, 
  ChevronDown, ArrowRight, Heart, X
} from 'lucide-react';
import './Home.css';
import heroImage from '../assets/hero.png'; // Fallback or imported hero asset

const fallbackProperties = [
  {
    id: 1,
    title: 'The Azure Signature Villa',
    description: 'Biệt thự sân vườn cao cấp với view hồ bơi tràn bờ cực đẹp tại khu Thảo Điền.',
    price: 24500000000,
    area: 350,
    bedrooms: 4,
    bathrooms: 5,
    address: 'Thảo Điền, Quận 2, TP.HCM',
    property_type: 'Biệt Thự',
    status: 'AVAILABLE',
    thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 2,
    title: 'Skyrise Penthouse',
    description: 'Căn Penthouse sang trọng tầng cao nhất của tháp Landmark với tầm nhìn panorama toàn thành phố.',
    price: 12800000000,
    area: 100,
    bedrooms: 3,
    bathrooms: 2,
    address: 'Vinhomes Central Park, Bình Thạnh, TP.HCM',
    property_type: 'Căn Hộ',
    status: 'AVAILABLE',
    thumbnail: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80',
    is_highlighted: true,
  },
  {
    id: 3,
    title: 'Minimalist Studio',
    description: 'Căn hộ studio phong cách tối giản Nhật Bản, nội thất thông minh tối ưu không gian.',
    price: 4200000000,
    area: 65,
    bedrooms: 1,
    bathrooms: 1,
    address: 'Phường Bến Nghé, Quận 1, TP.HCM',
    property_type: 'Căn Hộ',
    status: 'AVAILABLE',
    thumbnail: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
  }
];

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

const Home = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [properties, setProperties] = useState(fallbackProperties);
  const [searchLoc, setSearchLoc] = useState('');
  const [searchType, setSearchType] = useState('ALL');
  const [filteredProperties, setFilteredProperties] = useState(fallbackProperties);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);

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
      setUser(JSON.parse(sessionUser));
    }
  }, [navigate]);

  // Fetch properties from backend API
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/properties');
        if (!response.ok) throw new Error('Failed to fetch properties');
        const data = await response.json();
        
        if (data.properties && data.properties.length > 0) {
          setProperties(data.properties);
          setFilteredProperties(data.properties);
        } else {
          // Empty DB, load fallback properties
          loadFallbackProperties();
        }
      } catch (error) {
        console.warn('API error, loading fallback properties:', error);
        loadFallbackProperties();
      }
    };

    fetchProperties();
  }, []);

  const loadFallbackProperties = () => {
    const fallback = [
      {
        id: 1,
        title: 'The Azure Signature Villa',
        description: 'Biệt thự sân vườn cao cấp với view hồ bơi tràn bờ cực đẹp tại khu Thảo Điền.',
        price: 24500000000,
        area: 350,
        bedrooms: 4,
        bathrooms: 5,
        address: 'Thảo Điền, Quận 2, TP.HCM',
        property_type: 'Biệt Thự',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
      },
      {
        id: 2,
        title: 'Skyrise Penthouse',
        description: 'Căn Penthouse sang trọng tầng cao nhất của tháp Landmark với tầm nhìn panorama toàn thành phố.',
        price: 12800000000,
        area: 100,
        bedrooms: 3,
        bathrooms: 2,
        address: 'Vinhomes Central Park, Bình Thạnh, TP.HCM',
        property_type: 'Căn Hộ',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80',
        is_highlighted: true,
      },
      {
        id: 3,
        title: 'Minimalist Studio',
        description: 'Căn hộ studio phong cách tối giản Nhật Bản, nội thất thông minh tối ưu không gian.',
        price: 4200000000,
        area: 65,
        bedrooms: 1,
        bathrooms: 1,
        address: 'Phường Bến Nghé, Quận 1, TP.HCM',
        property_type: 'Căn Hộ',
        status: 'AVAILABLE',
        thumbnail: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
      }
    ];
    setProperties(fallback);
    setFilteredProperties(fallback);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    let filtered = properties;

    if (searchLoc.trim()) {
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(searchLoc.toLowerCase()) ||
        p.address.toLowerCase().includes(searchLoc.toLowerCase())
      );
    }

    if (searchType !== 'ALL') {
      filtered = filtered.filter(p => p.property_type === searchType);
    }

    setFilteredProperties(filtered);
  };

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
          <button className="menu-btn" aria-label="Menu">
            <Menu size={20} />
          </button>
          <span className="logo-text">Swipe Nest</span>
        </div>

        <nav className="nav-middle">
          <a href="#" className="nav-link active">Trang Chủ</a>
          <a href="#" className="nav-link">Khám Phá</a>
          <a href="#" className="nav-link">Dịch Vụ</a>
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
                  <button 
                    className="dropdown-item" 
                    onClick={() => navigate('/swipe/Căn Hộ', { state: { activeView: 'saved' } })}
                  >
                    <Heart size={14} style={{ marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
                    Tin đã yêu thích
                  </button>
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
          <form className="search-bar-container" onSubmit={handleSearch}>
            <div className="search-field">
              <MapPin size={20} className="search-icon-gray" />
              <input 
                type="text" 
                placeholder="Nhập địa điểm, quận, huyện..." 
                value={searchLoc}
                onChange={(e) => setSearchLoc(e.target.value)}
              />
            </div>
            
            <div className="search-field-divider"></div>

            <div className="search-field">
              <HomeIcon size={20} className="search-icon-gray" />
              <select 
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="ALL">Loại hình</option>
                <option value="Căn Hộ">Căn Hộ</option>
                <option value="Nhà Phố">Nhà Phố</option>
                <option value="Biệt Thự">Biệt Thự</option>
                <option value="Đất Nền">Đất Nền</option>
              </select>
            </div>

            <button type="submit" className="search-btn">
              Tìm Kiếm <ArrowRight size={16} />
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
      {showDetailModal && selectedProperty && (
        <div className="modal-backdrop" onClick={() => { setShowDetailModal(false); setSelectedProperty(null); }}>
          <div className="detail-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => { setShowDetailModal(false); setSelectedProperty(null); }}>
              <X size={24} />
            </button>
            <div className="modal-body">
              <img src={selectedProperty.thumbnail} alt={selectedProperty.title} className="modal-hero-img" />
              <div className="modal-details-container">
                <span className="modal-match-badge">★ 95% MATCH SCORE</span>
                <h2>{selectedProperty.title}</h2>
                <div className="modal-location">
                  <MapPin size={16} />
                  <span>{selectedProperty.address}</span>
                </div>
                <div className="modal-price">Giá: {selectedProperty.price ? selectedProperty.price.toLocaleString('vi-VN') : 'Liên hệ'} VNĐ</div>
                
                <div className="modal-specs">
                  {selectedProperty.bedrooms > 0 && (
                    <div className="modal-spec-item">
                      <Bed size={18} />
                      <span>{selectedProperty.bedrooms} Phòng ngủ</span>
                    </div>
                  )}
                  {selectedProperty.bathrooms > 0 && (
                    <div className="modal-spec-item">
                      <Bath size={18} />
                      <span>{selectedProperty.bathrooms} Phòng tắm</span>
                    </div>
                  )}
                  <div className="modal-spec-item">
                    <Maximize size={18} />
                    <span>{selectedProperty.area} m²</span>
                  </div>
                </div>

                <div className="modal-description">
                  <h3>Mô tả chi tiết</h3>
                  <p>{selectedProperty.description}</p>
                </div>

                <div className="modal-contact">
                  <h3>Liên hệ chính chủ</h3>
                  <div className="contact-tel">{selectedProperty.contact || selectedProperty.contact_phone || '0901 234 567'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
