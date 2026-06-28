import React, { useState, useEffect } from 'react';
import { Home, Eye, Heart, Search, LayoutDashboard, Settings, LogOut, ChevronRight, ShieldCheck } from 'lucide-react';
import './AgentOverview.css';
import { API_BASE_URL } from '../config';

const AgentOverview = () => {
  const [data, setData] = useState({
    totalProperties: 0,
    totalViews: 0,
    totalFavorites: 0,
    activeListings: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/agent/overview?userId=12`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        } else {
          console.error('Failed to fetch overview');
        }
      } catch (err) {
        console.error('Error fetching overview:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, []);

  return (
    <div className="agent-dashboard">
      <aside className="sidebar">
        <div className="sidebar-logo">
          SWIPE NEST
        </div>
        <nav className="sidebar-nav">
          <a href="#" className="nav-item active"><LayoutDashboard size={20}/> Tổng quan</a>
          <a href="#" className="nav-item"><Home size={20}/> Quản lý tin</a>
          <a href="#" className="nav-item"><Settings size={20}/> Cài đặt</a>
        </nav>
        <div className="sidebar-bottom">
          <a href="#" className="nav-item"><LogOut size={20}/> Đăng xuất</a>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="search-bar">
            <Search size={20} color="#888" />
            <input type="text" placeholder="Tìm kiếm tin đăng..." />
          </div>
          
          <div className="unverified-banner-placeholder">
            Tài khoản của bạn chưa được xác minh. <a href="#" onClick={(e) => e.preventDefault()}>Xác minh ngay</a>
          </div>

          <div className="profile-badge">
            <div className="profile-avatar">ZC</div>
            <span>Zăn Cao</span>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="dashboard-header-container">
            <div>
              <h1>Xin chào, Zăn Cao</h1>
              <p className="subtitle">Theo dõi hiệu suất các tin đăng của bạn trong hôm nay.</p>
            </div>
            
            <div className="verified-broker-placeholder">
              <div className="verified-badge-icon">
                <ShieldCheck size={20} color="#ffffff" strokeWidth={2.5} />
              </div>
              <div className="verified-badge-text">
                <div className="verified-status-title">Status: Verified Broker</div>
                <div className="verified-score-subtitle">Trust Score: 98/100</div>
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
              <h2>Danh sách tin đang hoạt động</h2>
              <a href="#" className="view-all">Xem tất cả</a>
            </div>
            
            <div className="listings-list">
              {loading ? (
                <p>Đang tải dữ liệu...</p>
              ) : data.activeListings.length === 0 ? (
                <p>Chưa có tin đăng nào hoạt động.</p>
              ) : (
                data.activeListings.map(listing => (
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
        </div>
      </main>
    </div>
  );
};

export default AgentOverview;
