import { useState, useMemo } from 'react';
import { 
  Home, Eye, Heart, ChevronRight, Plus, SlidersHorizontal, 
  MapPin, Bed, Bath, Maximize, ShieldAlert, ShieldCheck, Search,
  Edit3, Trash2, ExternalLink, X
} from 'lucide-react';
import PropertyDetailModal from '../../../components/PropertyDetailModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import './OverviewDashboard.css';

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
  const [wardSearchQuery, setWardSearchQuery] = useState('');
  const [tempSelectedWards, setTempSelectedWards] = useState([]);
  const [showWardListModal, setShowWardListModal] = useState(false);
  const [listModalSearchQuery, setListModalSearchQuery] = useState('');
  const [activeRegionTab, setActiveRegionTab] = useState('TP.HCM');
  const [subTempSelectedWards, setSubTempSelectedWards] = useState([]);
  const [filterPriceSort, setFilterPriceSort] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [appliedWards, setAppliedWards] = useState([]);
  const [appliedType, setAppliedType] = useState('ALL');
  const [appliedPriceSort, setAppliedPriceSort] = useState('ALL');

  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewProperty, setPreviewProperty] = useState(null);
  const [deletingProperty, setDeletingProperty] = useState(null);
  const itemsPerPage = 5;

  // Ward suggestions logic
  const suggestedWards = useMemo(() => {
    if (!wardSearchQuery.trim()) return [];
    const query = wardSearchQuery.toLowerCase();
    return ALL_WARDS.filter(ward => 
      ward.toLowerCase().includes(query) && 
      !tempSelectedWards.some(selected => normalizeWard(selected) === normalizeWard(ward))
    ).slice(0, 5);
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

  const handleApplyFilter = () => {
    setAppliedWards([...tempSelectedWards]);
    setAppliedType(filterType);
    setAppliedPriceSort(filterPriceSort);
    setShowFilters(false);
  };

  const handleResetFilter = () => {
    setTempSelectedWards([]);
    setAppliedWards([]);
    setFilterType('ALL');
    setAppliedType('ALL');
    setFilterPriceSort('ALL');
    setAppliedPriceSort('ALL');
    setWardSearchQuery('');
  };

  // Filter listings
  const filteredListings = useMemo(() => {
    let result = [...(data.activeListings || [])];

    // Filter by Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(listing => 
        (listing.address && listing.address.toLowerCase().includes(q)) ||
        (listing.title && listing.title.toLowerCase().includes(q))
      );
    }

    // Filter by Type
    if (appliedType !== 'ALL') {
      result = result.filter(p => p.property_type === appliedType);
    }

    // Filter by Wards
    if (appliedWards.length > 0) {
      const normalizedWards = appliedWards.map(w => normalizeWard(w));
      result = result.filter(p => {
        if (!p.ward) return false;
        return normalizedWards.includes(normalizeWard(p.ward));
      });
    }

    // Sort by Price Sort
    if (appliedPriceSort === 'low-high') {
      result.sort((a, b) => a.price - b.price);
    } else if (appliedPriceSort === 'high-low') {
      result.sort((a, b) => b.price - a.price);
    }

    return result;
  }, [data.activeListings, appliedWards, appliedType, appliedPriceSort, searchQuery]);

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
            <div className="filter-dropdown-panel new-profile-filter-style" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', padding: '16px' }}>
              {/* Ward / Khu vực */}
              <div className="filter-field ward-filter-field" style={{ position: 'relative' }}>
                <label className="filter-label">Khu vực</label>
                <div className="ward-search-input-group" style={{ display: 'flex', gap: '8px' }}>
                  <div className="ward-search-input-wrapper" style={{ position: 'relative', flex: 1 }}>
                    <input 
                      type="text" 
                      placeholder="Tìm phường..." 
                      value={wardSearchQuery} 
                      onChange={(e) => setWardSearchQuery(e.target.value)}
                      style={{ width: '100%' }}
                    />
                    {wardSearchQuery && (
                      <button 
                        className="clear-search-btn" 
                        onClick={() => setWardSearchQuery('')}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <button 
                    type="button" 
                    className="btn-select-ward-list" 
                    onClick={handleOpenWardListModal}
                    style={{ padding: '6px 12px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f8fafc', cursor: 'pointer' }}
                  >
                    Chọn từ danh sách
                  </button>
                </div>

                {/* Suggestions List */}
                {suggestedWards.length > 0 && (
                  <ul className="ward-dropdown-suggestions" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', zIndex: 10, padding: '4px 0', margin: '4px 0', listStyle: 'none' }}>
                    {suggestedWards.map((ward) => (
                      <li 
                        key={ward} 
                        onClick={() => handleSelectWard(ward)}
                        style={{ padding: '8px 12px', cursor: 'pointer' }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                      >
                        {ward}
                      </li>
                    ))}
                  </ul>
                 )}

                {/* Selected Ward Badges */}
                {tempSelectedWards.length > 0 && (
                  <div className="filter-ward-badges" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {tempSelectedWards.map((ward) => (
                      <span key={ward} className="ward-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '9999px', fontSize: '11px', color: '#334155' }}>
                        {ward}
                        <button 
                          onClick={() => handleRemoveTempWard(ward)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Price Sort / Khoảng giá */}
              <div className="filter-field">
                <label className="filter-label">Khoảng giá</label>
                <select value={filterPriceSort} onChange={(e) => setFilterPriceSort(e.target.value)}>
                  <option value="ALL">Tất cả mức giá</option>
                  <option value="low-high">Từ thấp đến cao</option>
                  <option value="high-low">Từ cao đến thấp</option>
                </select>
              </div>

              {/* Room Type / Loại phòng */}
              <div className="filter-field">
                <label className="filter-label">Loại phòng</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="ALL">Tất cả loại hình</option>
                  <option value="Phòng Trọ">Phòng trọ</option>
                  <option value="Chung Cư">Chung cư</option>
                  <option value="Căn Hộ">Căn hộ</option>
                  <option value="Nhà Ở">Nhà ở</option>
                  <option value="Mặt Bằng">Mặt bằng</option>
                </select>
              </div>

              {/* Filter Actions */}
              <div className="filter-field filter-actions" style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button className="filter-apply-btn" onClick={handleApplyFilter}>
                  <SlidersHorizontal size={14} /> Áp dụng lọc
                </button>
                <button className="filter-reset-btn" onClick={handleResetFilter} title="Xóa bộ lọc">
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

export default OverviewDashboard;
