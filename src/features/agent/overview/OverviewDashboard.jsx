import { useState, useMemo } from 'react';
import {
  Home, Eye, Heart, ChevronRight, Plus, SlidersHorizontal,
  MapPin, Bed, Bath, Maximize, ShieldAlert, ShieldCheck, Search,
  Edit3, Trash2, ExternalLink, Lock, EyeOff, CheckCircle2
} from 'lucide-react';
import PropertyDetailModal from '../../../components/PropertyDetailModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import PropertyStatusModal from './PropertyStatusModal';
import './OverviewDashboard.css';

import AreaSelect from '../../location/AreaSelect';
import { sameProvince, sameWard } from '../../location/adminAreas';

// ponytail: extract overview and listings tab components into a single dashboard component
// Nhãn trạng thái cho từng tin (tin bị admin ẩn thì báo "Đang bị ẩn" dù trạng thái vẫn là đang bán).
const listingBadge = (listing) => {
  if (listing.is_hidden && listing.status === 'AVAILABLE') return { label: 'Đang bị ẩn', tone: 'is-hidden' };
  switch (listing.status) {
    case 'AVAILABLE': return { label: 'Đang hiển thị', tone: '' };
    case 'RENTED': return { label: 'Đã cho thuê', tone: 'is-rented' };
    case 'SOLD': return { label: 'Đã bán', tone: 'is-sold' };
    case 'DELETED': return { label: 'Đã gỡ', tone: 'is-deleted' };
    default: return { label: listing.status || 'Không rõ', tone: 'is-deleted' };
  }
};

const OverviewDashboard = ({
  activeTab,
  setActiveTab,
  data,
  loading,
  searchQuery = '',
  setSearchQuery = () => { },
  currentUser = {},
  onEditProperty,
  onDeleteProperty,
  onUpdateStatus
}) => {
  const [tempArea, setTempArea] = useState({ province: '', ward: '' });
  const [filterPriceSort, setFilterPriceSort] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [appliedArea, setAppliedArea] = useState({ province: '', ward: '' });
  const [appliedType, setAppliedType] = useState('ALL');
  const [appliedPriceSort, setAppliedPriceSort] = useState('ALL');
  const [appliedStatus, setAppliedStatus] = useState('ALL');

  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewProperty, setPreviewProperty] = useState(null);
  const [deletingProperty, setDeletingProperty] = useState(null);
  const [statusModalProperty, setStatusModalProperty] = useState(null);
  // 11 tin + ô "Tạo tin đăng mới" = 12 ô, chia đều cho lưới 2, 3, 4 hoặc 6 cột.
  const itemsPerPage = 11;

  const handleApplyFilter = () => {
    setAppliedArea(tempArea);
    setAppliedType(filterType);
    setAppliedPriceSort(filterPriceSort);
    setAppliedStatus(filterStatus);
    setShowFilters(false);
  };

  const handleResetFilter = () => {
    setTempArea({ province: '', ward: '' });
    setAppliedArea({ province: '', ward: '' });
    setFilterType('ALL');
    setAppliedType('ALL');
    setFilterPriceSort('ALL');
    setAppliedPriceSort('ALL');
    setFilterStatus('ALL');
    setAppliedStatus('ALL');
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

    // Filter by Status (F30)
    if (appliedStatus !== 'ALL') {
      result = result.filter(p => p.status === appliedStatus);
    }

    // Lọc khu vực theo đơn vị mới. admin_area do server quy đổi (tin cũ ghi quận/phường cũ vẫn ra đúng phường mới).
    if (appliedArea.province) {
      result = result.filter(p => {
        const area = p.admin_area || { province: p.city, ward: p.ward };
        return sameProvince(area.province, appliedArea.province)
          && (!appliedArea.ward || sameWard(area.ward, appliedArea.ward));
      });
    }

    // Sort by Price Sort
    if (appliedPriceSort === 'low-high') {
      result.sort((a, b) => a.price - b.price);
    } else if (appliedPriceSort === 'high-low') {
      result.sort((a, b) => b.price - a.price);
    }

    return result;
  }, [data.activeListings, appliedArea, appliedType, appliedPriceSort, appliedStatus, searchQuery]);

  // Paginated listings
  const totalPages = Math.ceil(filteredListings.length / itemsPerPage) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedListings = filteredListings.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage
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

  // Tổng quan: ưu tiên tin đang hiển thị, sau đó mới tới tin đã bán / cho thuê / gỡ (giữ thứ tự mới nhất trước).
  const recentListings = useMemo(() => {
    const rank = (item) => (item.status === 'AVAILABLE' && !item.is_hidden ? 0 : item.status === 'AVAILABLE' ? 1 : item.status === 'DELETED' ? 3 : 2);
    return [...(data.activeListings || [])].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  }, [data.activeListings]);

  const statusCounts = useMemo(() => {
    const list = data.activeListings || [];
    return {
      ALL: list.length,
      AVAILABLE: list.filter(item => item.status === 'AVAILABLE').length,
      RENTED: list.filter(item => item.status === 'RENTED').length,
      SOLD: list.filter(item => item.status === 'SOLD').length,
      DELETED: list.filter(item => item.status === 'DELETED').length,
    };
  }, [data.activeListings]);

  const handleQuickStatusChange = (status) => {
    setFilterStatus(status);
    setAppliedStatus(status);
    setCurrentPage(1);
  };

  return (
    <div className="overview-dashboard-feature">
      {/* VIEW 1: OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          <div className="dashboard-header-container">
            <div>
              <h1>Xin chào, {currentUser?.name || 'Môi giới'}</h1>
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
                      <a
                        href="#kyc"
                        className="tooltip-action"
                        onClick={(e) => {
                          e.preventDefault();
                          if (typeof setActiveTab === 'function') {
                            setActiveTab('profile');
                          }
                        }}
                      >
                        Xác minh ngay!
                      </a>
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
              <div className="stat-label">Tin đang bán / cho thuê</div>
              <div className="stat-value">{loading ? '-' : statusCounts.AVAILABLE}</div>
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
                <p>Bạn chưa có tin đăng nào.</p>
              ) : (
                recentListings.map(listing => (
                  <div key={listing.id} className="listing-item">
                    <img src={listing.thumbnail || 'https://via.placeholder.com/80'} alt={listing.title} className="listing-image" />
                    <div className="listing-info">
                      <h3>{listing.title}</h3>
                      <p>
                        {formatPrice(listing.price)}
                        {(() => { const badge = listingBadge(listing); return <span className={`agent-status-badge ${badge.tone}`}>{badge.label}</span>; })()}
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
              <h1>Danh sách bất động sản</h1>
              <p className="subtitle">Quản lý danh mục {filteredListings.length} bất động sản.</p>
            </div>
          </div>

          {/* Quick status filter pills */}
          <div className="status-quick-pills">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'AVAILABLE', label: 'Đang hiển thị' },
              { id: 'RENTED', label: 'Đã cho thuê' },
              { id: 'SOLD', label: 'Đã bán' },
              { id: 'DELETED', label: 'Đã gỡ' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                className={`status-pill-btn ${appliedStatus === tab.id ? 'active' : ''}`}
                onClick={() => handleQuickStatusChange(tab.id)}
              >
                <span>{tab.label}</span>
                <span className="status-pill-count">{statusCounts[tab.id] || 0}</span>
              </button>
            ))}
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
              {/* Khu vực: chọn theo đơn vị hành chính mới; tin cũ được server quy đổi sẵn (listing.admin_area). */}
              <div className="filter-field ward-filter-field">
                <label className="filter-label">Khu vực</label>
                <AreaSelect province={tempArea.province} ward={tempArea.ward} onChange={setTempArea} className="overview-area-select" />
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
                  <option value="Văn Phòng">Văn phòng</option>
                </select>
              </div>

              {/* Status / Trạng thái tin (F30) */}
              <div className="filter-field">
                <label className="filter-label">Trạng thái tin</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="AVAILABLE">Đang hiển thị</option>
                  <option value="RENTED">Đã cho thuê</option>
                  <option value="SOLD">Đã bán</option>
                  <option value="DELETED">Đã gỡ</option>
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
            {Number(currentUser?.trust_score ?? 50) <= 30 ? (
              <div
                className="listing-card dashed-create-card disabled-locked"
                onClick={() => alert(`Quyền đăng tin của bạn đang bị khóa do điểm uy tín hiện tại là ${currentUser?.trust_score ?? 0} (từ 30 điểm trở xuống).\nBạn cần đạt tối thiểu từ 31 điểm trở lên để mở lại quyền đăng bài.\nVui lòng giải quyết khiếu nại hoặc thực hiện nhiệm vụ phục hồi điểm uy tín.`)}
                title="Quyền đăng tin bị khóa do điểm uy tín <= 30"
                style={{ cursor: 'not-allowed', borderColor: '#fca5a5', backgroundColor: '#fef2f2' }}
              >
                <div className="dashed-create-content">
                  <div className="dashed-plus-icon locked" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                    <Lock size={32} />
                  </div>
                  <h3 style={{ color: '#dc2626' }}>Đăng tin mới (Đã khóa)</h3>
                  <p style={{ color: '#991b1b' }}>Điểm uy tín hiện tại &le; 30. Cần đạt từ 31 điểm để mở lại.</p>
                </div>
              </div>
            ) : (
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
            )}

            {paginatedListings.map(listing => (
              <div key={listing.id} className="listing-card property-card">
                {/* Status Badges */}
                {listing.is_hidden && (
                  <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 3 }}>
                    <span style={{
                      backgroundColor: 'rgba(220, 38, 38, 0.92)',
                      backdropFilter: 'blur(4px)',
                      color: '#ffffff',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                    }} title="Tin đăng đang bị ẩn khỏi sàn do chế tài điểm uy tín hoặc vi phạm">
                      <EyeOff size={12} /> Đang bị ẩn
                    </span>
                  </div>
                )}

                {/* Full-image background */}
                <img
                  src={listing.thumbnail || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80'}
                  alt={listing.title}
                  className="property-card-img"
                />

                {/* Status Badge (Positioned at Top-Right to prevent collision with is_hidden at Top-Left) */}
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  zIndex: 2,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#ffffff',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  backgroundColor:
                    listing.status === 'RENTED' ? '#3b82f6' :
                      listing.status === 'SOLD' ? '#ef4444' :
                        listing.status === 'DELETED' ? '#64748b' : '#10b981'
                }}>
                  {listing.status === 'RENTED' ? 'ĐÃ CHO THUÊ' :
                    listing.status === 'SOLD' ? 'ĐÃ BÁN' :
                      listing.status === 'DELETED' ? 'ĐÃ GỠ' : 'ĐANG HIỂN THỊ'}
                </div>

                {/* Hover overlay with agent actions */}
                <div className="property-card-actions-overlay">
                  <button
                    className="card-action-icon success"
                    title="Cập nhật trạng thái giao dịch (Đã thuê / Đã bán / Đang hiển thị)"
                    onClick={() => setStatusModalProperty(listing)}
                  >
                    <CheckCircle2 size={16} />
                  </button>
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
                    title="Gỡ tin đăng"
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
                disabled={safePage === 1}
                onClick={() => setCurrentPage(Math.max(safePage - 1, 1))}
              >
                Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  className={safePage === page ? 'active' : ''}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage(Math.min(safePage + 1, totalPages))}
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

      {/* Property Status Modal */}
      {statusModalProperty && (
        <PropertyStatusModal
          property={statusModalProperty}
          onClose={() => setStatusModalProperty(null)}
          onConfirm={(propertyId, newStatus) => {
            if (onUpdateStatus) {
              onUpdateStatus(propertyId, newStatus);
            }
            setStatusModalProperty(null);
          }}
        />
      )}

    </div>
  );
};

export default OverviewDashboard;
