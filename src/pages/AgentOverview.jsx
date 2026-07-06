import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Search, LayoutDashboard, Settings, LogOut, BarChart2, HelpCircle, MessageSquare, Shield
} from 'lucide-react';
import OverviewDashboard from '../features/agent/overview/OverviewDashboard';
import CreateListingWizard from '../features/agent/create-listing/CreateListingWizard';
import EditListingWizard from '../features/agent/edit-listing/EditListingWizard';
import AgentChat from '../features/agent/chat/AgentChat';
import AgentProfile from '../features/agent/profile/AgentProfile';
import './AgentOverview.css';
import { API_BASE_URL } from '../config';

const AgentOverview = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : { id: 12, name: 'Zăn Cao', role: 'AGENT', verification_status: 'UNVERIFIED' };
    } catch {
      return { id: 12, name: 'Zăn Cao', role: 'AGENT', verification_status: 'UNVERIFIED' };
    }
  });

  useEffect(() => {
    const sessionUser = localStorage.getItem('user');
    if (!sessionUser) {
      navigate('/login/agent');
    } else {
      const parsedUser = JSON.parse(sessionUser);
      if (parsedUser.role !== 'AGENT') {
        navigate('/');
      } else {
        setCurrentUser(parsedUser);
      }
    }
  }, [navigate]);

  const handleLogout = (e) => {
    e.preventDefault();
    localStorage.removeItem('user');
    navigate('/login/agent');
  };

  const [data, setData] = useState({
    totalProperties: 0,
    totalViews: 0,
    totalFavorites: 0,
    activeListings: []
  });
  const [loading, setLoading] = useState(true);

  // Navigation tabs: 'overview', 'listings', 'create-listing', 'profile'
  const [activeTab, setActiveTab] = useState('overview');

  // Filter query state (passed down to sync topbar with the listing panel)
  const [searchQuery, setSearchQuery] = useState('');
  
  const [editingPropertyId, setEditingPropertyId] = useState(null);

  const [funnelStats, setFunnelStats] = useState({
    AWARENESS: 0,
    CONSIDERATION: 0,
    INTENT: 0,
    ACTION: 0
  });

  const fetchFunnelStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/funnel/stats?agentId=${currentUser.id}`);
      if (res.ok) {
        const result = await res.json();
        setFunnelStats(result.stats || { AWARENESS: 0, CONSIDERATION: 0, INTENT: 0, ACTION: 0 });
      }
    } catch (err) {
      console.error('Error fetching funnel stats:', err);
    }
  };

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setEditingPropertyId(null);
    if (tabName === 'analytics') {
      fetchFunnelStats();
    }
  };

  const handleEditProperty = (id) => {
    setEditingPropertyId(id);
    setActiveTab('edit-listing');
  };

  const handleDeleteProperty = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/properties/${id}?userId=${currentUser.id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setData(prev => ({
          ...prev,
          totalProperties: Math.max(0, prev.totalProperties - 1),
          activeListings: (prev.activeListings || []).filter(listing => listing.id !== id)
        }));
      } else {
        alert('Xoá tin đăng thất bại.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối server.');
    }
  };

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/agent/overview?userId=${currentUser.id}`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
          if (result.agent) {
            setCurrentUser(prev => ({
              ...prev,
              ...result.agent
            }));
            localStorage.setItem('user', JSON.stringify({
              ...currentUser,
              ...result.agent
            }));
          }
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
  }, [currentUser.id]);

  return (
    <div className="agent-dashboard">
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">SWIPE NEST</div>

        {/* Nav section */}
        <div className="sidebar-section-label">Điều hướng</div>
        <nav className="sidebar-nav">
          <button
            className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabChange('overview')}
          >
            <LayoutDashboard size={18} /> Tổng quan
          </button>
          <button
            className={`nav-btn ${activeTab === 'listings' || activeTab === 'create-listing' || activeTab === 'edit-listing' ? 'active' : ''}`}
            onClick={() => handleTabChange('listings')}
          >
            <Home size={18} /> Bất động sản
          </button>
          <button
            className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => handleTabChange('chat')}
          >
            <MessageSquare size={18} /> Tin nhắn
          </button>
          <button
            className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => handleTabChange('analytics')}
          >
            <BarChart2 size={18} /> Phân tích
          </button>
          <button
            className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => handleTabChange('overview')}
          >
            <Settings size={18} /> Cài đặt
          </button>
        </nav>

        {/* Bottom: Help Center + logout */}
        <div className="sidebar-bottom">
          <a href="#" className="nav-item"><HelpCircle size={16} /> Help Center</a>
          <a href="#" className="nav-item" onClick={handleLogout}><LogOut size={16} /> Log Out</a>
        </div>
      </aside>

      <main className="main-content">
        {/* Topbar shown on overview and profile page */}
        {(activeTab === 'overview' || activeTab === 'profile') && (
          <header className="topbar">
            <div className="search-bar">
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Tìm kiếm bất động sản, địa chỉ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="topbar-right">
              {currentUser.verification_status === 'VERIFIED' && (
                <button className="topbar-icon-btn" title="Đã xác thực">
                  <Shield size={20} color="#10b981" />
                </button>
              )}
              <div 
                className="topbar-avatar-wrapper"
                onClick={() => handleTabChange('profile')}
                title="Hồ sơ cá nhân"
              >
                <img 
                  src={currentUser.avatar || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&q=80"} 
                  alt={currentUser.name} 
                  className="topbar-avatar-img"
                />
              </div>
            </div>
          </header>
        )}

        <div className="dashboard-content">
          {/* TAB 1 & 2: OVERVIEW / LISTINGS */}
          {(activeTab === 'overview' || activeTab === 'listings') && (
            <OverviewDashboard
              activeTab={activeTab}
              setActiveTab={handleTabChange}
              data={data}
              loading={loading}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              currentUser={currentUser}
              onEditProperty={handleEditProperty}
              onDeleteProperty={handleDeleteProperty}
            />
          )}

          {/* TAB 3: CREATE LISTING FLOW */}
          {activeTab === 'create-listing' && (
            <CreateListingWizard
              setActiveTab={handleTabChange}
              setData={setData}
              currentUser={currentUser}
            />
          )}

          {/* TAB 4: EDIT LISTING FLOW */}
          {activeTab === 'edit-listing' && (
            <EditListingWizard
              propertyId={editingPropertyId}
              setActiveTab={handleTabChange}
              setData={setData}
              currentUser={currentUser}
            />
          )}

          {/* TAB 5: CHAT PANEL */}
          {activeTab === 'chat' && (
            <AgentChat
              currentUser={currentUser}
            />
          )}

          {/* TAB 6: ANALYTICS PANEL */}
          {activeTab === 'analytics' && (() => {
            const total = funnelStats.AWARENESS + funnelStats.CONSIDERATION + funnelStats.INTENT + funnelStats.ACTION;
            const maxVal = Math.max(1, funnelStats.AWARENESS, funnelStats.CONSIDERATION, funnelStats.INTENT, funnelStats.ACTION);
            
            const stages = [
              { key: 'AWARENESS', label: 'Nhận biết & Quan tâm', desc: 'Khách hàng mới nhắn tin, tìm hiểu thông tin', color: '#6366f1' },
              { key: 'CONSIDERATION', label: 'Cân nhắc', desc: 'Khách hàng so sánh, cân nhắc kỹ lưỡng', color: '#f59e0b' },
              { key: 'INTENT', label: 'Ý định / Thương lượng', desc: 'Khách hàng thương lượng giá, đàm phán hợp đồng', color: '#2563eb' },
              { key: 'ACTION', label: 'Hành động / Chốt', desc: 'Khách hàng đã ký hợp đồng chốt giao dịch', color: '#10b981' }
            ];

            return (
              <div className="analytics-panel">
                <h2 className="analytics-title">Phễu phân loại khách hàng (CRM Funnel)</h2>
                <p className="analytics-subtitle">
                  Theo dõi tiến độ chuyển đổi của khách hàng từ khi tiếp cận đến khi chốt giao dịch thành công.
                </p>

                <div className="funnel-container">
                  {stages.map((stage, idx) => {
                    const count = funnelStats[stage.key] || 0;
                    const pctWidth = maxVal > 0 ? Math.max(25, (count / maxVal) * 100) : 25;
                    
                    return (
                      <div key={stage.key} className="funnel-row">
                        <div className="funnel-stage-label">
                          <span className="funnel-stage-name">{stage.label}</span>
                          <span className="funnel-stage-desc">{stage.desc}</span>
                        </div>
                        <div className="funnel-bar-outer">
                          <div 
                            className="funnel-bar-inner"
                            style={{ 
                              width: `${pctWidth}%`,
                              backgroundColor: stage.color
                            }}
                          >
                            <span className="funnel-count">{count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="funnel-summary">
                  <div className="summary-card">
                    <span>Tổng khách hàng</span>
                    <h4>{total}</h4>
                  </div>
                  <div className="summary-card">
                    <span>Tỷ lệ chốt (Action)</span>
                    <h4>{total > 0 ? ((funnelStats.ACTION / total) * 100).toFixed(1) : '0.0'}%</h4>
                  </div>
                  <div className="summary-card">
                    <span>Mức độ tiềm năng (Intent)</span>
                    <h4>{total > 0 ? (((funnelStats.INTENT + funnelStats.ACTION) / total) * 100).toFixed(1) : '0.0'}%</h4>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 7: PROFILE PANEL */}
          {activeTab === 'profile' && (
            <AgentProfile
              currentUser={currentUser}
              data={data}
              onEditProperty={handleEditProperty}
              onDeleteProperty={handleDeleteProperty}
              setActiveTab={handleTabChange}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default AgentOverview;
