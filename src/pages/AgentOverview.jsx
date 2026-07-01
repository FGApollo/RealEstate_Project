import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, Search, LayoutDashboard, Settings, LogOut, BarChart2, HelpCircle
} from 'lucide-react';
import OverviewDashboard from '../features/agent/overview/OverviewDashboard';
import CreateListingWizard from '../features/agent/create-listing/CreateListingWizard';
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

  // Navigation tabs: 'overview', 'listings', 'create-listing'
  const [activeTab, setActiveTab] = useState('overview');

  // Filter query state (passed down to sync topbar with the listing panel)
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/agent/overview?userId=${currentUser.id}`);
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
  }, [currentUser.id]);

  const initials = currentUser.name
    ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ZC';

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
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={18} /> Tổng quan
          </button>
          <button
            className={`nav-btn ${activeTab === 'listings' || activeTab === 'create-listing' ? 'active' : ''}`}
            onClick={() => setActiveTab('listings')}
          >
            <Home size={18} /> Bất động sản
          </button>
          <button
            className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <BarChart2 size={18} /> Phân tích
          </button>
          <button
            className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
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
        {/* Topbar only shown on overview — listings has its own search bar */}
        {activeTab === 'overview' && (
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

            <div className={`profile-badge ${currentUser.verification_status?.toLowerCase() || 'unverified'}`}>
              <div className="profile-avatar">{initials}</div>
              <div className="profile-info-wrapper">
                <span className="profile-name">{currentUser.name || 'Zăn Cao'}</span>
                <span className="verification-status-tag">
                  {currentUser.verification_status === 'VERIFIED' ? 'Đã xác minh' : 'Chưa xác minh'}
                </span>
              </div>
            </div>
          </header>
        )}

        <div className="dashboard-content">
          {/* TAB 1 & 2: OVERVIEW / LISTINGS */}
          {(activeTab === 'overview' || activeTab === 'listings') && (
            <OverviewDashboard
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              data={data}
              loading={loading}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              currentUser={currentUser}
            />
          )}

          {/* TAB 3: CREATE LISTING FLOW */}
          {activeTab === 'create-listing' && (
            <CreateListingWizard
              setActiveTab={setActiveTab}
              setData={setData}
              currentUser={currentUser}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default AgentOverview;
