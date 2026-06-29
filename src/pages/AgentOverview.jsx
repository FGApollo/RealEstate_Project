import { useState, useEffect } from 'react';
import { 
  Home, Search, LayoutDashboard, Settings, LogOut
} from 'lucide-react';
import OverviewDashboard from '../features/agent/overview/OverviewDashboard';
import CreateListingWizard from '../features/agent/create-listing/CreateListingWizard';
import './AgentOverview.css';

const AgentOverview = () => {
  const [currentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : { id: 12, name: 'Zăn Cao', role: 'AGENT', verification_status: 'UNVERIFIED' };
    } catch {
      return { id: 12, name: 'Zăn Cao', role: 'AGENT', verification_status: 'UNVERIFIED' };
    }
  });

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
        const response = await fetch(`http://localhost:3000/api/agent/overview?userId=${currentUser.id}`);
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

  return (
    <div className="agent-dashboard">
      <aside className="sidebar">
        <div className="sidebar-logo">
          SWIPE NEST
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={20} /> Tổng quan
          </button>
          <button 
            className={`nav-btn ${activeTab === 'listings' || activeTab === 'create-listing' ? 'active' : ''}`}
            onClick={() => setActiveTab('listings')}
          >
            <Home size={20} /> Quản lý tin
          </button>
          <button 
            className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Settings size={20} /> Cài đặt
          </button>
        </nav>
        <div className="sidebar-bottom">
          <a href="#" className="nav-item"><LogOut size={20} /> Đăng xuất</a>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="search-bar">
            <Search size={20} color="#888" />
            <input 
              type="text" 
              placeholder="Nhập địa chỉ bất động sản" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="profile-badge">
            <div className="profile-avatar">ZC</div>
            <span>Zăn Cao</span>
          </div>
        </header>

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
