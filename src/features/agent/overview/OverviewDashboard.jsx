import { useState } from 'react';
import { 
  Home, Eye, Heart, ChevronRight, Plus, SlidersHorizontal, 
  MapPin, Bed, Bath, Maximize, ShieldAlert, ShieldCheck, Search,
  Edit3, Trash2, ExternalLink
} from 'lucide-react';
import PropertyDetailModal from '../../../components/PropertyDetailModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import './OverviewDashboard.css';

// ponytail: extract overview and listings tab components into a single dashboard component
const OverviewDashboard = ({ 
  activeTab, 
  setActiveTab, 
  data, 
  loading,
  searchQuery = '',
  setSearchQuery = () => {},
  currentUser = {},
  onEditProperty,
  onDeleteProperty
}) => {
  const [filterRegion, setFilterRegion] = useState('ALL');
  const [filterPrice, setFilterPrice] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewProperty, setPreviewProperty] = useState(null);
  const [deletingProperty, setDeletingProperty] = useState(null);
  const itemsPerPage = 5;

  const regionsList = ['Đà Nẵng', 'Hồ Chí Minh', 'Hà Nội'];
  const propertyTypesList = ['Căn Hộ', 'Chung Cư', 'Nhà Ở', 'Mặt Bằng', 'Văn Phòng', 'Phòng Trọ'];

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

  const formatPrice = (price) => {
    if (!price || price === 0) return 'Liên hệ';
    const billion = 1000000000;
    const million = 1000000;
    
    if (price >= billion) {
      return `${(price / billion).toFixed(1).replace('.0', '')} Tỷ VND`;
    }
    if (price >= million) {
      return `${(price / million).toFixed(1).replace('.0', '')} Triệu VND`;
    }
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  };

  return (
    <div className="overview-dashboard-feature">
      {/* VIEW 1: OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          <div className="dashboard-header-container">
            <div>
              <h1>Xin chào, {currentUser?.name || 'Zăn Cao'}</h1>
              <p className="subtitle">Theo dõi hiệu suất các tin đăng của bạn trong hôm nay.</p>
            </div>

            <div className="unverified-status-container">
              {currentUser?.verification_status === 'VERIFIED' ? (
                <>
                  <div className="verified-broker-placeholder">
                    <div className="verified-badge-icon" style={{ backgroundColor: '#065f46' }}>
                      <ShieldCheck size={20} color="#ffffff" strokeWidth={2.5} />
                    </div>
                    <div className="verified-badge-text">
                      <div className="verified-status-title" style={{ color: '#064e3b' }}>Đã Verified</div>
                      <div className="verified-score-subtitle" style={{ color: '#047857' }}>Verified Seller</div>
                    </div>
                  </div>
                  <div className="notification-tooltip dashboard-tooltip">
                    <div className="tooltip-content">
                      <span className="tooltip-text">Tài khoản của bạn đã được xác minh thành công.</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
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
                        {formatPrice(listing.price)}
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
          {/* Page header */}
          <div className="tab-header-container">
            <div>
              <h1>Danh sách tin đăng hoạt động</h1>
              <p className="subtitle">Quản lý danh mục {filteredListings.length} bất động sản đang hoạt động.</p>
            </div>
          </div>

          {/* Search + Filter toggle row */}
          <div className="search-filter-row">
            <div className="listings-search-bar">
              <Search size={16} className="listings-search-icon" />
              <input 
                type="text" 
                placeholder="Tìm kiếm địa chỉ..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              className={`filter-green-btn ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={16} />
              Bộ lọc
            </button>
          </div>

          {/* Collapsible filter panel */}
          {showFilters && (
            <div className="filter-dropdown-panel">
              <div className="filter-field">
                <label>Khu vực</label>
                <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
                  <option value="ALL">Tất cả quận</option>
                  {regionsList.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="filter-field">
                <label>Khoảng giá</label>
                <select value={filterPrice} onChange={(e) => setFilterPrice(e.target.value)}>
                  <option value="ALL">Tất cả mức giá</option>
                  <option value="under-1b">Dưới 1 tỷ</option>
                  <option value="1b-3b">1 – 3 tỷ</option>
                  <option value="3b-5b">3 – 5 tỷ</option>
                  <option value="above-5b">Trên 5 tỷ</option>
                </select>
              </div>
              <div className="filter-field">
                <label>Loại phòng</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="ALL">Tất cả loại hình</option>
                  {propertyTypesList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="filter-field filter-actions">
                <button
                  className="filter-apply-btn"
                  onClick={() => setShowFilters(false)}
                >
                  <SlidersHorizontal size={14} /> Áp dụng lọc
                </button>
                <button
                  className="filter-reset-btn"
                  onClick={() => { setFilterRegion('ALL'); setFilterPrice('ALL'); setFilterType('ALL'); setSearchQuery(''); }}
                  title="Xoá bộ lọc"
                >
                  ↺
                </button>
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
                {/* Full-image background */}
                <img 
                  src={listing.thumbnail || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80'} 
                  alt={listing.title} 
                  className="property-card-img"
                />

                {/* Verification badge */}
                <div className={`property-verified-badge ${listing.verification_status === 'VERIFIED' ? 'verified' : 'unverified'}`}>
                  {listing.verification_status === 'VERIFIED' ? (
                    <><ShieldCheck size={11} /> Đã xác thực</>
                  ) : (
                    <><ShieldAlert size={11} /> Chưa xác thực</>
                  )}
                </div>

                {/* Hover overlay with agent actions */}
                <div className="property-card-actions-overlay">
                  <button 
                    className="card-action-icon" 
                    title="Xem chi tiết"
                    onClick={() => setPreviewProperty(listing)}
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button 
                    className="card-action-icon" 
                    title="Chỉnh sửa"
                    onClick={() => onEditProperty && onEditProperty(listing.id)}
                  >
                    <Edit3 size={16} />
                  </button>
                  <button 
                    className="card-action-icon danger" 
                    title="Xoá tin đăng"
                    onClick={() => setDeletingProperty(listing)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Bottom gradient info overlay */}
                <div className="property-card-overlay">
                  <h3 className="property-card-title">{listing.title}</h3>
                  <p className="property-card-address">
                    <MapPin size={12} />
                    <span>{listing.district ? `${listing.district}, ${listing.city}` : (listing.address || 'Địa chỉ bất động sản')}</span>
                  </p>
                  <div className="property-card-bottom">
                    <div className="property-card-price">
                      <span className="price-amount">{formatPrice(listing.price)}</span>
                      <span className="price-unit">/tháng</span>
                    </div>
                    <div className="property-card-specs">
                      <span><Bed size={13} /> {listing.bedrooms || 0}</span>
                      <span><Bath size={13} /> {listing.bathrooms || 0}</span>
                      <span><Maximize size={13} /> {listing.area || 0}m²</span>
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

      {/* Property Details Modal */}
      {previewProperty && (
        <PropertyDetailModal 
          property={previewProperty} 
          onClose={() => setPreviewProperty(null)} 
          showFavoriteActions={false}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingProperty && (
        <DeleteConfirmModal 
          property={deletingProperty} 
          onConfirm={(id) => {
            onDeleteProperty && onDeleteProperty(id);
            setDeletingProperty(null);
          }}
          onCancel={() => setDeletingProperty(null)}
        />
      )}
    </div>
  );
};

export default OverviewDashboard;
