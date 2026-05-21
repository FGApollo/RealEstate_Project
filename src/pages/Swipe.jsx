import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Search, Heart, Map, User, X, Info, MapPin, 
  Bed, Bath, Maximize, SlidersHorizontal, RefreshCw, ChevronLeft
} from 'lucide-react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import './Swipe.css';

// Mock Properties for categories
const mockProperties = {
  'Đất Nền': [
    {
      id: 'datnen-1',
      title: 'Đất Nền Ven Biển Mỹ Khê',
      description: 'Lô đất nền ven biển vị trí đắc địa, ngay sát bãi tắm Mỹ Khê. Thích hợp xây dựng khách sạn, nhà hàng, căn hộ dịch vụ cao cấp.',
      price: 18500000000,
      area: 150,
      bedrooms: 0,
      bathrooms: 0,
      address: 'Võ Nguyên Giáp, Ngũ Hành Sơn, Đà Nẵng',
      city: 'Đà Nẵng',
      property_type: 'Đất Nền',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
      matchScore: 98,
      contact: '0901 234 567'
    },
    {
      id: 'datnen-2',
      title: 'Đất Dự Án Hòa Xuân Nam',
      description: 'Đất nền đảo vip Hòa Xuân, 2 mặt tiền hướng sông mát mẻ. Hạ tầng đồng bộ, sổ đỏ chính chủ công chứng ngay.',
      price: 4900000000,
      area: 125,
      bedrooms: 0,
      bathrooms: 0,
      address: 'Đảo VIP Hòa Xuân, Cẩm Lệ, Đà Nẵng',
      city: 'Đà Nẵng',
      property_type: 'Đất Nền',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80',
      matchScore: 92,
      contact: '0905 111 222'
    },
    {
      id: 'datnen-3',
      title: 'Đất Thổ Cư Trảng Bom',
      description: 'Đất thổ cư giá rẻ gần khu công nghiệp Trảng Bom, đường nhựa 8m xe tải tránh nhau thoải mái. Phù hợp mua xây trọ.',
      price: 1200000000,
      area: 100,
      bedrooms: 0,
      bathrooms: 0,
      address: 'Trảng Bom, Đồng Nai',
      city: 'Đồng Nai',
      property_type: 'Đất Nền',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1504609773096-104ff2c73ba4?auto=format&fit=crop&w=800&q=80',
      matchScore: 85,
      contact: '0912 345 678'
    }
  ],
  'Biệt Thự': [
    {
      id: 'biethu-1',
      title: 'The Glass Horizon Villa',
      description: 'Biệt thự kính phong cách Địa Trung Hải tối giản, view đồi Beverly Hills lộng lẫy về đêm. Tích hợp bể bơi tràn bờ nước mặn và rạp chiếu phim gia đình.',
      price: 195000000000, // 8.5M USD approx
      area: 740, // 8k sqft approx
      bedrooms: 5,
      bathrooms: 6.5,
      address: 'Beverly Hills, Los Angeles, CA',
      city: 'California',
      property_type: 'Biệt Thự',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=80',
      matchScore: 99,
      contact: '0988 777 999'
    },
    {
      id: 'biethu-2',
      title: 'Ocean Edge Cliffside Mansion',
      description: 'Biệt thự triệu đô tọa lạc đỉnh vách đá Sơn Trà, view biển rộng mở 270 độ. Thiết kế nội thất nhập khẩu trực tiếp từ Ý.',
      price: 85000000000,
      area: 550,
      bedrooms: 4,
      bathrooms: 5,
      address: 'Bán đảo Sơn Trà, Thọ Quang, Đà Nẵng',
      city: 'Đà Nẵng',
      property_type: 'Biệt Thự',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
      matchScore: 95,
      contact: '0909 000 111'
    },
    {
      id: 'biethu-3',
      title: 'Vinhomes Riverside Lake Villa',
      description: 'Biệt thự đơn lập ven hồ sinh thái khu Bằng Lăng. Sân vườn rộng lớn, an ninh 3 lớp bảo vệ 24/7 khép kín hoàn toàn.',
      price: 52000000000,
      area: 380,
      bedrooms: 4,
      bathrooms: 4,
      address: 'Vinhomes Riverside, Long Biên, Hà Nội',
      city: 'Hà Nội',
      property_type: 'Biệt Thự',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
      matchScore: 90,
      contact: '0903 888 777'
    }
  ],
  'Nhà Ở': [
    {
      id: 'nhao-1',
      title: 'Nhà Phố Cổ Điển Trần Hưng Đạo',
      description: 'Nhà phố trung tâm Quận 1 mặt tiền rộng 6m. Thiết kế phong cách Đông Dương (Indochine) thanh lịch, thích hợp mở showroom thời trang hoặc spa cao cấp.',
      price: 29500000000,
      area: 95,
      bedrooms: 3,
      bathrooms: 3,
      address: 'Trần Hưng Đạo, Cô Giang, Quận 1, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Nhà Ở',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80',
      matchScore: 96,
      contact: '0918 222 333'
    },
    {
      id: 'nhao-2',
      title: 'Nhà Phố Sân Vườn Melosa Garden',
      description: 'Nhà phố liền kề Khang Điền, đã hoàn thiện nội thất hiện đại. Có khoảng sân nhỏ trồng hoa hồng cổ tuyệt đẹp.',
      price: 11800000000,
      area: 120,
      bedrooms: 3,
      bathrooms: 4,
      address: 'Võ Chí Công, Phú Hữu, Quận 9, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Nhà Ở',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=800&q=80',
      matchScore: 91,
      contact: '0934 555 666'
    },
    {
      id: 'nhao-3',
      title: 'Nhà Riêng Hẻm Nhựa Phú Nhuận',
      description: 'Nhà riêng kết cấu 1 trệt 2 lầu đúc bê tông cốt thép kiên cố. Hẻm nhựa 6m thông thoáng xe hơi quay đầu.',
      price: 8900000000,
      area: 68,
      bedrooms: 3,
      bathrooms: 3,
      address: 'Phan Xích Long, Phường 2, Phú Nhuận, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Nhà Ở',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      matchScore: 88,
      contact: '0979 999 888'
    }
  ],
  'Chung Cư': [
    {
      id: 'chungcu-1',
      title: 'Masteri Thảo Điền Sky View',
      description: 'Căn hộ chung cư cao cấp tầng 32 Masteri Thảo Điền. View trọn vẹn sông Sài Gòn và bán đảo Thanh Đa xanh mát.',
      price: 4600000000,
      area: 72,
      bedrooms: 2,
      bathrooms: 2,
      address: 'Masteri Thảo Điền, Quận 2, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Chung Cư',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80',
      matchScore: 94,
      contact: '0912 888 999'
    },
    {
      id: 'chungcu-2',
      title: 'Sun Grand City Horizon Loft',
      description: 'Căn hộ thiết kế duplex thông tầng Sun Grand City Thụy Khuê. View Hồ Tây tuyệt đẹp, ngắm hoàng hôn lãng mạn.',
      price: 9800000000,
      area: 110,
      bedrooms: 3,
      bathrooms: 2,
      address: 'Sun Grand City, Thụy Khuê, Tây Hồ, Hà Nội',
      city: 'Hà Nội',
      property_type: 'Chung Cư',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
      matchScore: 90,
      contact: '0944 555 777'
    },
    {
      id: 'chungcu-3',
      title: 'Chung Cư Sunview Town Giá Rẻ',
      description: 'Căn hộ chung cư ấm cúng thích hợp cho gia đình trẻ. Nội thất cơ bản bàn giao đẹp đẽ sạch sẽ đón tết.',
      price: 1950000000,
      area: 58,
      bedrooms: 2,
      bathrooms: 1,
      address: 'Sunview Town, Hiệp Bình Phước, Thủ Đức, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Chung Cư',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
      matchScore: 82,
      contact: '0909 333 444'
    }
  ],
  'Căn Hộ': [
    {
      id: 'canho-1',
      title: 'Landmark 81 Grand Penthouse',
      description: 'Căn hộ siêu sang tọa lạc tầng cao nhất Landmark 81. Tận hưởng đặc quyền câu lạc bộ cư dân thượng lưu và hồ bơi vô cực trên không.',
      price: 38000000000,
      area: 165,
      bedrooms: 3,
      bathrooms: 3,
      address: 'Landmark 81, Vinhomes Central Park, Bình Thạnh, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Căn Hộ',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80',
      matchScore: 97,
      contact: '0911 222 333'
    },
    {
      id: 'canho-2',
      title: 'Căn Hộ Studio Minimalist Thảo Điền',
      description: 'Căn hộ studio phong cách Bắc Âu hiện đại, tối giản, đầy đủ ánh sáng tự nhiên. Rất thích hợp cho người độc thân hoặc chuyên gia nước ngoài.',
      price: 2400000000,
      area: 45,
      bedrooms: 1,
      bathrooms: 1,
      address: 'Phường Thảo Điền, Quận 2, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Căn Hộ',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=800&q=80',
      matchScore: 93,
      contact: '0989 555 999'
    },
    {
      id: 'canho-3',
      title: 'Căn Hộ Estella Heights Luxury',
      description: 'Căn hộ Estella Heights Quận 2, dự án resort chuẩn quốc tế. Căn hộ ban công cực rộng, view công viên nội khu rợp bóng cây.',
      price: 7500000000,
      area: 104,
      bedrooms: 2,
      bathrooms: 2,
      address: 'Estella Heights, An Phú, Quận 2, TP.HCM',
      city: 'TP.HCM',
      property_type: 'Căn Hộ',
      status: 'AVAILABLE',
      thumbnail: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
      matchScore: 89,
      contact: '0916 333 777'
    }
  ]
};

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
  const [dbProperties, setDbProperties] = useState([]);
  const [currentProperties, setCurrentProperties] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeHistory, setSwipeHistory] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

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
    // 1. Get properties from DB matching this category type
    const matchingDb = dbProperties.filter(p => getCategoryKey(p.property_type) === activeCategoryKey);
    
    // 2. Get static mock properties matching this category type
    const matchingMock = mockProperties[activeCategoryKey] || [];
    
    // Combine them to make a rich list, removing potential ID duplicates
    const combined = [...matchingDb];
    matchingMock.forEach(mockItem => {
      if (!combined.some(dbItem => dbItem.title.toLowerCase() === mockItem.title.toLowerCase())) {
        combined.push(mockItem);
      }
    });

    setCurrentProperties(combined);
    setCurrentIndex(0);
  }, [activeCategoryKey, dbProperties]);

  const currentProperty = currentProperties[currentIndex];

  const formatPrice = (price) => {
    if (!price || price === 0) return 'Liên hệ';
    if (price < 1000000) {
      return `$${(price / 1000).toFixed(0)}k`;
    }
    const billion = 1000000000;
    if (price >= billion) {
      return `$${(price / billion).toFixed(1).replace('.0', '')}M`;
    }
    return `$${(price / 1000000).toFixed(0)}k`;
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
    await cardController.start({ 
      x: exitX, 
      opacity: 0, 
      rotate: direction === 'right' ? 35 : -35,
      transition: { duration: 0.25 } 
    });

    if (currentProperty) {
      setSwipeHistory(prev => [
        { ...currentProperty, swipeType: direction },
        ...prev
      ]);
    }
    
    setCurrentIndex(prev => prev + 1);
    x.set(0);
    cardController.set({ x: 0, y: 0, rotate: 0, opacity: 1 });
  };

  const resetSwipes = () => {
    setCurrentIndex(0);
    setSwipeHistory([]);
  };

  const applyFilter = (e) => {
    e.preventDefault();
    let filtered = [...(mockProperties[activeCategoryKey] || [])];
    
    // Add DB properties
    const matchingDb = dbProperties.filter(p => getCategoryKey(p.property_type) === activeCategoryKey);
    matchingDb.forEach(dbItem => {
      if (!filtered.some(mockItem => mockItem.title.toLowerCase() === dbItem.title.toLowerCase())) {
        filtered.push(dbItem);
      }
    });

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
          <div className="header-nav-item">
            <Search size={18} />
            <span>Tìm kiếm</span>
          </div>
          <div className="header-nav-item">
            <Heart size={18} />
            <span>Đã lưu</span>
          </div>
          <div className="header-nav-item">
            <Map size={18} />
            <span>Bản đồ</span>
          </div>
          <div className="header-nav-item">
            <User size={18} />
            <span>Hồ sơ</span>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
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
              swipeHistory.map((item, idx) => (
                <div 
                  key={`${item.id}-${idx}`} 
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
                className="swipe-btn like" 
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

      {/* Property Details Modal */}
      {showDetailModal && currentProperty && (
        <div className="modal-backdrop" onClick={() => setShowDetailModal(false)}>
          <div className="detail-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowDetailModal(false)}>
              <X size={24} />
            </button>
            <div className="modal-body">
              <img src={currentProperty.thumbnail} alt={currentProperty.title} className="modal-hero-img" />
              <div className="modal-details-container">
                <span className="modal-match-badge">★ {currentProperty.matchScore}% MATCH SCORE</span>
                <h2>{currentProperty.title}</h2>
                <div className="modal-location">
                  <MapPin size={16} />
                  <span>{currentProperty.address}</span>
                </div>
                <div className="modal-price">Giá: {currentProperty.price.toLocaleString('vi-VN')} VNĐ</div>
                
                <div className="modal-specs">
                  {currentProperty.bedrooms > 0 && (
                    <div className="modal-spec-item">
                      <Bed size={18} />
                      <span>{currentProperty.bedrooms} Phòng ngủ</span>
                    </div>
                  )}
                  {currentProperty.bathrooms > 0 && (
                    <div className="modal-spec-item">
                      <Bath size={18} />
                      <span>{currentProperty.bathrooms} Phòng tắm</span>
                    </div>
                  )}
                  <div className="modal-spec-item">
                    <Maximize size={18} />
                    <span>{currentProperty.area} m²</span>
                  </div>
                </div>

                <div className="modal-description">
                  <h3>Mô tả chi tiết</h3>
                  <p>{currentProperty.description}</p>
                </div>

                <div className="modal-contact">
                  <h3>Liên hệ chính chủ</h3>
                  <div className="contact-tel">{currentProperty.contact || '0901 234 567'}</div>
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
