import { useState } from 'react';
import { 
  Home, Eye, Heart, ChevronRight, Plus, SlidersHorizontal, 
  MapPin, Bed, Bath, Maximize, ShieldAlert, Search
} from 'lucide-react';
import './OverviewDashboard.css';

// ponytail: extract overview and listings tab components into a single dashboard component
const OverviewDashboard = ({ 
  activeTab, 
  setActiveTab, 
  data, 
  loading,
  searchQuery = '',
  setSearchQuery = () => {}
}) => {
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [filterPrice, setFilterPrice] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const regionsList = ['Đà Nẵng', 'Hồ Chí Minh', 'Hà Nội'];
  const propertyTypesList = ['Căn Hộ', 'Studio', 'Biệt Thự', 'Nhà Phố', 'Đất Nền'];

  // Filter listings
  const filteredListings = (data.activeListings || []).filter(listing => {
    const matchesSearch = searchQuery === '' || 
      (listing.address && listing.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (listing.title && listing.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRegion = filterRegion === 'ALL' ||
      (listing.city && listing.city.toLowerCase().includes(filterRegion.toLowerCase())) ||
      (listing.district && listing.district.toLowerCase().includes(filterRegion.toLowerCase()));

    const matchesType = filterType === 'ALL' || listing.property_type === filterType;

    let matchesPrice = true;
    if (filterPrice !== 'ALL') {
      const price = listing.price || 0;
      if (filterPrice === 'under-1b') matchesPrice = price < 1000000000;
      else if (filterPrice === '1b-3b') matchesPrice = price >= 1000000000 && price <= 3000000000;
      else if (filterPrice === '3b-5b') matchesPrice = price >= 3000000000 && price <= 5000000000;
      else if (filterPrice === 'above-5b') matchesPrice = price > 5000000000;
    }

    return matchesSearch && matchesRegion && matchesType && matchesPrice;
  });

  // Paginated listings
  const totalPages = Math.ceil(filteredListings.length / itemsPerPage) || 1;
  const paginatedListings = filteredListings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="overview-dashboard-feature">
      {/* VIEW 1: OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          <div className="dashboard-header-container">
            <div>
              <h1>Xin chào, Zăn Cao</h1>
              <p className="subtitle">Theo dõi hiệu suất các tin đăng của bạn trong hôm nay.</p>
            </div>

            <div className="unverified-status-container">
              <div className="verified-broker-placeholder unverified">
                <div className="verified-badge-icon warning">
                  <ShieldAlert size={20} color="#ffffff" strokeWidth={2.5} />
                </div>
                <div className="verified-badge-text">
                  <div className="verified-status-title">Chưa Verified</div>
                  <div className="verified-score-subtitle">Cần xác minh ngay</div>
                </div>
              </div>
              <div className="notification-tooltip dashboard-tooltip">
                <div className="tooltip-content">
                  <span className="tooltip-text">Tài khoản của bạn chưa được xác minh.</span>
                  <a href="#" className="tooltip-action" onClick={(e) => e.preventDefault()}>Xác minh ngay!</a>
                </div>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon properties-icon">
                <Home size={24} />
              </div>
              <div className="stat-label">Tổng số nhà đang bán</div>
              <div className="stat-value">{loading ? '-' : data.totalProperties}</div>
              <div className="stat-trend">Cập nhật lúc {new Date().toLocaleTimeString()}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon views-icon">
                <Eye size={24} />
              </div>
              <div className="stat-label">Tổng số khách đã xem</div>
              <div className="stat-value">{loading ? '-' : data.totalViews}</div>
              <div className="stat-trend">Cập nhật lúc {new Date().toLocaleTimeString()}</div>
            </div>

            <div className="stat-card">
              <div className="stat-icon favorites-icon">
                <Heart size={24} />
              </div>
              <div className="stat-label">Tổng số khách yêu thích</div>
              <div className="stat-value">{loading ? '-' : data.totalFavorites}</div>
              <div className="stat-trend">Cập nhật lúc {new Date().toLocaleTimeString()}</div>
            </div>
          </div>

          <div className="active-listings-section">
            <div className="section-header">
              <h2>Danh sách tin đăng hiện tại</h2>
              <button className="view-all-btn" onClick={() => setActiveTab('listings')}>Xem tất cả</button>
            </div>

            <div className="listings-list">
              {loading ? (
                <p>Đang tải dữ liệu...</p>
              ) : data.activeListings.length === 0 ? (
                <p>Chưa có tin đăng nào hoạt động.</p>
              ) : (
                data.activeListings.slice(0, 3).map(listing => (
                  <div key={listing.id} className="listing-item">
                    <img src={listing.thumbnail || 'https://via.placeholder.com/80'} alt={listing.title} className="listing-image" />
                    <div className="listing-info">
                      <h3>{listing.title}</h3>
                      <p>
                        {listing.price.toLocaleString('vi-VN')} VND
                        {listing.status === 'AVAILABLE' && <span className="agent-status-badge">Đang bán</span>}
                      </p>
                    </div>
                    <div className="listing-stats">
                      <div className="listing-stat">
                        <Heart size={16} color="#db2777" />
                        <span>{listing.favoritesCount}</span>
                      </div>
                      <div className="listing-stat">
                        <Eye size={16} color="#16a34a" />
                        <span>{listing.views || 0}</span>
                      </div>
                    </div>
                    <button className="action-btn">
                      <ChevronRight size={20} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: LISTINGS TAB (TRANG 1) */}
      {activeTab === 'listings' && (
        <div className="listings-tab-container">
          <div className="tab-header-container">
            <div>
              <h1>Danh sách các tin đăng</h1>
              <p className="subtitle">Quản lý danh mục ({filteredListings.length}) bất động sản đang hoạt động</p>
            </div>
            <div className="header-actions">
              <div className="listings-search-wrap">
                <Search size={16} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm địa chỉ, tiêu đề..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal size={18} />
                <span>Bộ lọc</span>
              </button>
            </div>
          </div>

          {/* Filter Panels */}
          {showFilters && (
            <div className="filter-dropdown-panel">
              <div className="filter-field">
                <label>Khu vực</label>
                <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
                  <option value="ALL">Tất cả khu vực</option>
                  {regionsList.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="filter-field">
                <label>Khoảng giá</label>
                <select value={filterPrice} onChange={(e) => setFilterPrice(e.target.value)}>
                  <option value="ALL">Tất cả khoảng giá</option>
                  <option value="under-1b">Dưới 1 tỷ</option>
                  <option value="1b-3b">1 tỷ - 3 tỷ</option>
                  <option value="3b-5b">3 tỷ - 5 tỷ</option>
                  <option value="above-5b">Trên 5 tỷ</option>
                </select>
              </div>
              <div className="filter-field">
                <label>Loại căn hộ</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="ALL">Tất cả loại hình</option>
                  {propertyTypesList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Listings cards grid */}
          <div className="listings-grid-layout">
            <div 
              className="listing-card dashed-create-card"
              onClick={() => setActiveTab('create-listing')}
            >
              <div className="dashed-create-content">
                <div className="dashed-plus-icon">
                  <Plus size={32} />
                </div>
                <h3>Tạo tin đăng mới</h3>
                <p>Đăng tải bất động sản của bạn lên hệ thống</p>
              </div>
            </div>

            {paginatedListings.map(listing => (
              <div key={listing.id} className="listing-card property-card">
                <div className="card-image-wrap">
                  <img src={listing.thumbnail || 'https://via.placeholder.com/400'} alt={listing.title} />
                  <span className={`status-badge ${listing.status.toLowerCase()}`}>
                    {listing.status === 'AVAILABLE' ? 'Đang bán' : listing.status}
                  </span>
                </div>
                <div className="card-details">
                  <h3>{listing.title}</h3>
                  <p className="card-address">
                    <MapPin size={14} />
                    <span>{listing.address || 'Địa chỉ bất động sản'}</span>
                  </p>
                  
                  <div className="card-specs">
                    <div className="spec-badge">
                      <Bed size={14} />
                      <span>{listing.bedrooms || 0} Giường</span>
                    </div>
                    <div className="spec-badge">
                      <Bath size={14} />
                      <span>{listing.bathrooms || 0} Tắm</span>
                    </div>
                    <div className="spec-badge">
                      <Maximize size={14} />
                      <span>{listing.area || 0} m²</span>
                    </div>
                  </div>

                  <div className="card-footer">
                    <span className="card-price">
                      {(listing.price / 1000000000).toFixed(1)} Tỷ VND
                    </span>
                    <div className="card-social-stats">
                      <span><Eye size={14} /> {listing.views || 0}</span>
                      <span><Heart size={14} color="#db2777" /> {listing.favoritesCount || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-container">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              >
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button 
                  key={page}
                  className={currentPage === page ? 'active' : ''}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              >
                Sau
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OverviewDashboard;
