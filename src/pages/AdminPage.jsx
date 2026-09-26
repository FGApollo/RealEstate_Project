import { useState, useEffect } from 'react';
import { useNavigate, Link, useOutletContext } from 'react-router-dom';
import {
  ShieldCheck, AlertTriangle, Search, LogOut, HelpCircle, UserX, CheckCircle,
  XCircle, FileText, Image, User, Check, X, ShieldAlert, Flag, Home, Mail, Clock, Award,
  Star, EyeOff, Eye
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { apiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import './AdminPage.css';

const REASON_LABELS = {
  'WRONG_PRICE': { label: 'Sai giá', penalty: -5, color: '#f59e0b', bg: '#fef3c7' },
  'WRONG_IMAGE': { label: 'Sai hình ảnh', penalty: -10, color: '#ea580c', bg: '#ffedd5' },
  'WRONG_LOCATION': { label: 'Sai vị trí', penalty: -10, color: '#ea580c', bg: '#ffedd5' },
  'DUPLICATE': { label: 'Tin trùng lặp', penalty: -5, color: '#f59e0b', bg: '#fef3c7' },
  'ALREADY_RENTED': { label: 'Đã bán/thuê chưa cập nhật', penalty: -8, color: '#d97706', bg: '#fef3c7' },
  'SCAM': { label: 'Lừa đảo / Scam', penalty: -30, color: '#dc2626', bg: '#fee2e2' },
  'OTHER': { label: 'Lý do khác', penalty: 0, color: '#64748b', bg: '#f1f5f9' }
};

const AdminPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext();
  const { logout } = useAuth();

  // Exactly 2 navbar items: 'account-verification' (Kiểm duyệt tài khoản) & 'report-moderation' (Kiểm duyệt báo cáo)
  const [activeTab, setActiveTab] = useState('account-verification');
  const [searchQuery, setSearchQuery] = useState('');

  // State for Account Verification (KYC)
  const [rejectedList, setRejectedList] = useState([]);
  const [selectedKycId, setSelectedKycId] = useState(null);
  const [kycDetail, setKycDetail] = useState(null);
  const [loadingKyc, setLoadingKyc] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // State for Reject Modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  // State for Report Moderation
  const [reportList, setReportList] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportStatusFilter, setReportStatusFilter] = useState('PENDING'); // PENDING | RESOLVED | REJECTED | ALL

  // State for Review Moderation
  const [reviewsList, setReviewsList] = useState([]);
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('ALL'); // ALL | APPROVED | PENDING | HIDDEN | REJECTED
  const [reviewActionLoading, setReviewActionLoading] = useState(false);

  // Logout handler
  const handleLogout = async (e) => {
    e.preventDefault();
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      alert(error.message);
    }
  };

  // 1. Fetch Rejected KYC List
  const fetchRejectedKyc = async () => {
    setLoadingKyc(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/admin/kyc/rejected`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.verifications || data.data || []);
        setRejectedList(list);
        if (list.length > 0 && !selectedKycId) {
          setSelectedKycId(list[0].id);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách KYC bị từ chối:', err);
    } finally {
      setLoadingKyc(false);
    }
  };

  // 2. Fetch KYC Detail
  const fetchKycDetail = async (id) => {
    if (!id) return;
    setLoadingDetail(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/admin/kyc/${id}`);
      if (res.ok) {
        const data = await res.json();
        const detail = data.verification || data.data || data;
        setKycDetail(detail);
      } else {
        setKycDetail(null);
      }
    } catch (err) {
      console.error('Lỗi khi tải chi tiết hồ sơ KYC:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // 3. Fetch Reports (Báo cáo bài đăng)
  const fetchReports = async (status = reportStatusFilter) => {
    setLoadingReports(true);
    try {
      const url = status === 'ALL'
        ? `${API_BASE_URL}/api/reports/admin`
        : `${API_BASE_URL}/api/reports/admin?status=${status}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.reports || data.data || []);
        setReportList(list);
        if (list.length > 0) {
          setSelectedReportId(list[0].id);
        } else {
          setSelectedReportId(null);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách báo cáo:', err);
    } finally {
      setLoadingReports(false);
    }
  };

  // 4. Fetch Reviews (Kiểm duyệt đánh giá)
  const fetchAdminReviews = async () => {
    setLoadingReviews(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/admin/reviews`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setReviewsList(list);
        if (list.length > 0) {
          setSelectedReviewId(list[0].id);
        } else {
          setSelectedReviewId(null);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách đánh giá:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  const handleUpdateReviewStatus = async (reviewId, newStatus) => {
    if (!reviewId) return;

    let confirmMsg = `Bạn có chắc chắn muốn chuyển trạng thái đánh giá #${reviewId} sang: ${newStatus}?`;
    if (newStatus === 'HIDDEN') {
      confirmMsg = `Bạn có chắc chắn muốn ẨN đánh giá #${reviewId}? Đánh giá này sẽ bị ẩn khỏi bài đăng và tự động trừ khỏi điểm sao trung bình của bất động sản.`;
    } else if (newStatus === 'APPROVED') {
      confirmMsg = `Bạn muốn DUYỆT CÔNG KHAI đánh giá #${reviewId}? Đánh giá sẽ được tính vào điểm sao của bất động sản.`;
    }

    if (!window.confirm(confirmMsg)) return;

    setReviewActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/admin/reviews/${reviewId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || `Đã cập nhật trạng thái thành ${newStatus}`);
        setReviewsList(prev => prev.map(r => r.id === reviewId ? { ...r, status: newStatus } : r));
      } else {
        alert(data.error || 'Cập nhật trạng thái đánh giá thất bại');
      }
    } catch (err) {
      console.error('Lỗi cập nhật trạng thái review:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setReviewActionLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'account-verification') {
      fetchRejectedKyc();
    } else if (activeTab === 'report-moderation') {
      fetchReports(reportStatusFilter);
    } else if (activeTab === 'review-moderation') {
      fetchAdminReviews();
    }
  }, [activeTab, reportStatusFilter]);

  useEffect(() => {
    if (selectedKycId && activeTab === 'account-verification') {
      fetchKycDetail(selectedKycId);
    }
  }, [selectedKycId]);

  // Handle Approve KYC
  const handleApproveKyc = async () => {
    if (!selectedKycId) return;
    if (!window.confirm('Bạn có chắc chắn muốn duyệt hồ sơ KYC này? Hệ thống sẽ cập nhật trạng thái VERIFIED và cộng +20 trust score (nếu là lần duyệt đầu tiên).')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/admin/kyc/${selectedKycId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (res.ok) {
        alert(result.message || 'Duyệt hồ sơ thành công!');
        setRejectedList(prev => prev.filter(item => item.id !== selectedKycId));
        setKycDetail(null);
        setSelectedKycId(null);
        fetchRejectedKyc();
      } else {
        alert(result.error || 'Duyệt hồ sơ thất bại');
      }
    } catch (err) {
      console.error('Lỗi duyệt KYC:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject KYC Submit
  const handleRejectKycSubmit = async () => {
    if (!selectedKycId) return;
    if (!rejectReasonInput.trim()) {
      alert('Vui lòng nhập lý do từ chối');
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/admin/kyc/${selectedKycId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejectReason: rejectReasonInput.trim()
        })
      });
      const result = await res.json();
      if (res.ok) {
        alert(result.message || 'Từ chối hồ sơ thành công!');
        setShowRejectModal(false);
        setRejectReasonInput('');
        fetchKycDetail(selectedKycId);
        fetchRejectedKyc();
      } else {
        alert(result.error || 'Từ chối hồ sơ thất bại');
      }
    } catch (err) {
      console.error('Lỗi từ chối KYC:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Resolve Report (Xác nhận vi phạm đúng & trừ điểm owner)
  const handleResolveReport = async (reportId) => {
    const rep = reportList.find(r => r.id === reportId);
    if (!rep) return;
    const reasonInfo = REASON_LABELS[rep.reason] || { label: rep.reason, penalty: 0 };

    if (!window.confirm(`XÁC NHẬN VI PHẠM & ẨN BÀI ĐĂNG:\nBạn có chắc chắn báo cáo "${reasonInfo.label}" là ĐÚNG?\nHệ thống sẽ:\n1. Xác nhận báo cáo RESOLVED và phạt ${reasonInfo.penalty} điểm Trust Score theo quy định (${reasonInfo.label}).\n2. Tự động ẨN BÀI ĐĂNG khỏi sàn để bảo vệ người xem tin.`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/reports/admin/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (res.ok) {
        alert(result.message || 'Đã xử lý báo cáo vi phạm thành công!');
        fetchReports();
      } else {
        alert(result.error || 'Xử lý báo cáo thất bại');
      }
    } catch (err) {
      console.error('Lỗi duyệt report:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setActionLoading(false);
    }
  };


  // Handle Direct Unhide Property (Khôi phục hiển thị tin vi phạm)
  const handleDirectUnhideProperty = async (propertyId) => {
    if (!propertyId) return;
    if (!window.confirm('Bạn có chắc chắn muốn KHÔI PHỤC hiển thị bài đăng này? Bài đăng sẽ lại xuất hiện công khai trên sàn.')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/admin/properties/${propertyId}/unhide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Đã mở khóa hiển thị bài đăng thành công!');
        fetchReports();
      } else {
        alert(data.error || 'Mở khóa thất bại');
      }
    } catch (err) {
      console.error('Lỗi khi mở khóa bài đăng:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Report (Từ chối báo cáo sai, không trừ điểm)
  const handleRejectReport = async (reportId) => {
    if (!window.confirm('Bạn muốn từ chối báo cáo này vì sai sự thật hoặc không đủ bằng chứng? Chủ bài đăng sẽ KHÔNG bị trừ điểm.')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/reports/admin/${reportId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const result = await res.json();
      if (res.ok) {
        alert(result.message || 'Đã từ chối báo cáo thành công.');
        fetchReports();
      } else {
        alert(result.error || 'Thao tác thất bại');
      }
    } catch (err) {
      console.error('Lỗi từ chối report:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered lists based on search query
  const filteredRejectedList = (Array.isArray(rejectedList) ? rejectedList : []).filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = item.user?.name || item.full_name || '';
    const email = item.user?.email || '';
    const idStr = `#${item.id}`;
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || idStr.includes(q);
  });

  const filteredReportList = (Array.isArray(reportList) ? reportList : []).filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const propTitle = item.property?.title || '';
    const propAddr = item.property?.address || '';
    const reporterName = item.reporter?.name || '';
    const reasonStr = REASON_LABELS[item.reason]?.label || item.reason;
    return propTitle.toLowerCase().includes(q) || propAddr.toLowerCase().includes(q) || reporterName.toLowerCase().includes(q) || reasonStr.toLowerCase().includes(q);
  });

  const reviewStats = {
    total: (Array.isArray(reviewsList) ? reviewsList : []).length,
    approved: (Array.isArray(reviewsList) ? reviewsList : []).filter(r => r.status === 'APPROVED').length,
    pending: (Array.isArray(reviewsList) ? reviewsList : []).filter(r => r.status === 'PENDING').length,
    hidden: (Array.isArray(reviewsList) ? reviewsList : []).filter(r => r.status === 'HIDDEN').length,
    rejected: (Array.isArray(reviewsList) ? reviewsList : []).filter(r => r.status === 'REJECTED').length
  };

  const filteredReviewsList = (Array.isArray(reviewsList) ? reviewsList : []).filter(item => {
    if (reviewStatusFilter !== 'ALL' && item.status !== reviewStatusFilter) {
      return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const propTitle = item.property?.title || '';
    const propAddr = item.property?.address || '';
    const userName = item.user?.name || '';
    const userEmail = item.user?.email || '';
    const comment = item.comment || '';
    const idStr = `#${item.id}`;
    return (
      propTitle.toLowerCase().includes(q) ||
      propAddr.toLowerCase().includes(q) ||
      userName.toLowerCase().includes(q) ||
      userEmail.toLowerCase().includes(q) ||
      comment.toLowerCase().includes(q) ||
      idStr.includes(q)
    );
  });

  const selectedReview = (Array.isArray(reviewsList) ? reviewsList : []).find(r => r.id === selectedReviewId);

  const initials = currentUser.name
    ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : 'AD';

  const selectedReport = reportList.find(r => r.id === selectedReportId);
  const selectedReasonInfo = selectedReport ? (REASON_LABELS[selectedReport.reason] || { label: selectedReport.reason, penalty: 0, color: '#64748b', bg: '#f1f5f9' }) : null;

  return (
    <div className="admin-dashboard">
      {/* LEFT NAVBAR - Exactly 2 items as requested */}
      <aside className="admin-sidebar">
        <div className="admin-logo-wrapper">
          <div 
            className="admin-logo" 
            onClick={() => navigate('/')} 
            style={{ cursor: 'pointer' }}
          >
            SWIPE NEST
          </div>
        </div>

        <div className="admin-nav-label">Điều hướng Admin</div>
        <nav className="admin-nav-section">
          <button
            className={`admin-nav-btn ${activeTab === 'account-verification' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('account-verification');
              setSearchQuery('');
            }}
          >
            <ShieldCheck size={20} />
            <span>Kiểm duyệt tài khoản</span>
          </button>

          <button
            className={`admin-nav-btn ${activeTab === 'report-moderation' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('report-moderation');
              setSearchQuery('');
            }}
          >
            <AlertTriangle size={20} />
            <span>Kiểm duyệt báo cáo</span>
          </button>

          <button
            className={`admin-nav-btn ${activeTab === 'review-moderation' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('review-moderation');
              setSearchQuery('');
            }}
          >
            <Star size={20} />
            <span>Kiểm duyệt đánh giá</span>
          </button>
        </nav>

        <div className="admin-sidebar-bottom">
          <a href="#" className="admin-bottom-link">
            <HelpCircle size={18} />
            <span>Help Center</span>
          </a>
          <a href="#" className="admin-bottom-link" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Log Out</span>
          </a>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="admin-main">
        {/* TOPBAR */}
        <header className="admin-topbar">
          <div className="admin-search-wrapper">
            <Search size={18} color="#94a3b8" />
            <input
              type="text"
              className="admin-search-input"
              placeholder={
                activeTab === 'account-verification'
                  ? "Tìm kiếm tài khoản theo tên, email, ID..."
                  : activeTab === 'report-moderation'
                  ? "Tìm kiếm báo cáo theo bất động sản, lý do, người gửi..."
                  : "Tìm kiếm đánh giá theo người gửi, bất động sản, nội dung..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="admin-topbar-right">
            <div className="admin-shield-icon">
              <ShieldAlert size={20} />
            </div>
            <div className="admin-profile-pill">
              <div className="admin-avatar">{initials}</div>
              <div className="admin-user-info">
                <span className="admin-user-name">{currentUser.name || 'Admin'}</span>
                <span className="admin-user-role">Quản Trị Viên</span>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="admin-content-area">
          <div className="admin-header-banner">
            <div className="admin-header-title">
              <h1>Admin</h1>
              <p>Xác minh và kiểm duyệt thủ công, đảm bảo sự công bằng và minh bạch</p>
            </div>
            
            {/* Top Navigation Pills (Synced with Left Navbar) */}
            <div className="admin-header-pills">
              <button
                className={`admin-pill-btn ${activeTab === 'account-verification' ? 'active' : ''}`}
                onClick={() => setActiveTab('account-verification')}
              >
                Kiểm duyệt tài khoản
              </button>
              <button
                className={`admin-pill-btn ${activeTab === 'report-moderation' ? 'active' : ''}`}
                onClick={() => setActiveTab('report-moderation')}
              >
                Kiểm duyệt báo cáo
              </button>
              <button
                className={`admin-pill-btn ${activeTab === 'review-moderation' ? 'active' : ''}`}
                onClick={() => setActiveTab('review-moderation')}
              >
                Kiểm duyệt đánh giá
              </button>
            </div>
          </div>

          {/* TAB 1: KIỂM DUYỆT TÀI KHOẢN (KYC) */}
          {activeTab === 'account-verification' && (
            <div className="admin-grid-container">
              {/* LEFT COLUMN: REJECTED KYC LIST */}
              <div className="admin-list-column">
                {loadingKyc ? (
                  <div className="admin-empty-state">Đang tải danh sách hồ sơ...</div>
                ) : filteredRejectedList.length === 0 ? (
                  <div className="admin-empty-state">
                    <CheckCircle size={40} />
                    <h4>Không có hồ sơ KYC nào bị từ chối</h4>
                    <p>Tất cả tài khoản đều đã được xử lý hoặc hợp lệ.</p>
                  </div>
                ) : (
                  filteredRejectedList.map((item) => {
                    const userName = item.user?.name || item.full_name || 'Khách hàng';
                    const userAvatar = item.user?.avatar;
                    const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
                    const isSelected = selectedKycId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`admin-card-item ${isSelected ? 'active' : ''}`}
                        onClick={() => setSelectedKycId(item.id)}
                      >
                        <div className="admin-card-top">
                          {userAvatar ? (
                            <img src={userAvatar} alt="Avatar" className="admin-card-avatar" />
                          ) : (
                            <div className="admin-card-avatar">{userName[0]?.toUpperCase() || 'U'}</div>
                          )}
                          <div className="admin-card-info">
                            <span className="admin-card-name">{userName}</span>
                            <span className="admin-card-date">Thời gian đăng ký: {dateStr}</span>
                            <span className="admin-card-id">ID: #{item.id}</span>
                          </div>
                        </div>

                        <div className="admin-card-badge admin-badge-rejected">
                          <XCircle size={14} />
                          <span>Xác thực thất bại</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* RIGHT COLUMN: KYC DETAIL VIEW */}
              <div className="admin-detail-panel">
                {loadingDetail ? (
                  <div className="admin-empty-state">Đang tải chi tiết hồ sơ...</div>
                ) : !kycDetail ? (
                  <div className="admin-empty-state">
                    <User size={48} />
                    <h4>Chưa chọn hồ sơ nào</h4>
                    <p>Vui lòng chọn một hồ sơ từ danh sách bên trái để xem chi tiết và kiểm duyệt.</p>
                  </div>
                ) : (
                  <>
                    <div className="admin-detail-header">
                      <h3>HỒ SƠ XÁC MINH DANH TÍNH #{kycDetail.id}</h3>
                      <div className={`admin-card-badge ${kycDetail.status === 'APPROVED' ? 'admin-badge-approved' : 'admin-badge-rejected'}`}>
                        {kycDetail.status === 'APPROVED' ? 'Đã xác minh' : 'Xác thực thất bại'}
                      </div>
                    </div>

                    <div className="admin-info-grid">
                      <div className="admin-info-item">
                        <span className="admin-info-label">Họ và tên</span>
                        <span className="admin-info-value">{kycDetail.user?.name || kycDetail.full_name || 'Chưa cập nhật'}</span>
                      </div>
                      <div className="admin-info-item">
                        <span className="admin-info-label">Số CCCD / ID Hồ sơ</span>
                        <span className="admin-info-value">{kycDetail.id_number || kycDetail.ocr_data?.idNumber || `#${kycDetail.id}`}</span>
                      </div>
                      <div className="admin-info-item">
                        <span className="admin-info-label">Email</span>
                        <span className="admin-info-value">{kycDetail.user?.email || 'Chưa cập nhật'}</span>
                      </div>
                      <div className="admin-info-item">
                        <span className="admin-info-label">Số điện thoại</span>
                        <span className="admin-info-value">{kycDetail.user?.phone || kycDetail.phone || 'Chưa cập nhật'}</span>
                      </div>
                      <div className="admin-info-item">
                        <span className="admin-info-label">Thời gian đăng ký</span>
                        <span className="admin-info-value">{kycDetail.created_at ? new Date(kycDetail.created_at).toLocaleString('vi-VN') : 'N/A'}</span>
                      </div>
                      <div className="admin-info-item">
                        <span className="admin-info-label">Trust Score hiện tại</span>
                        <span className="admin-info-value">{kycDetail.user?.trust_score ?? 0} điểm</span>
                      </div>
                    </div>

                    {kycDetail.reject_reason && !kycDetail.reject_reason.startsWith('{') && (
                      <div className="admin-reject-alert">
                        <div className="admin-reject-icon">
                          <AlertTriangle size={24} />
                        </div>
                        <div className="admin-reject-content">
                          <h4>Lý do xác thực thất bại / bị từ chối</h4>
                          <p>{kycDetail.reject_reason}</p>
                          {kycDetail.reviewer && (
                            <p style={{ marginTop: 4, fontSize: '0.8rem', color: '#64748b' }}>
                              Người kiểm duyệt trước: <strong>{kycDetail.reviewer.name}</strong> ({kycDetail.reviewed_at ? new Date(kycDetail.reviewed_at).toLocaleDateString() : ''})
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="admin-docs-section">
                      <h4 className="admin-docs-title">Tài liệu xác minh danh tính</h4>
                      
                      <div className="admin-cards-grid">
                        <div className="admin-doc-card">
                          <div className="admin-doc-label">
                            <span>Mặt trước CCCD</span>
                            <span className="admin-doc-filename">ID_Card_Front.jpg</span>
                          </div>
                          <div className="admin-doc-img-wrapper">
                            {kycDetail.id_card_front_url ? (
                              <img src={kycDetail.id_card_front_url} alt="CCCD Mặt trước" className="admin-doc-img" />
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Chưa có ảnh</span>
                            )}
                          </div>
                        </div>

                        <div className="admin-doc-card">
                          <div className="admin-doc-label">
                            <span>Mặt sau CCCD</span>
                            <span className="admin-doc-filename">ID_Card_Back.jpg</span>
                          </div>
                          <div className="admin-doc-img-wrapper">
                            {kycDetail.id_card_back_url ? (
                              <img src={kycDetail.id_card_back_url} alt="CCCD Mặt sau" className="admin-doc-img" />
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Chưa có ảnh</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="admin-selfie-card">
                        <div className="admin-selfie-header">
                          <span className="admin-selfie-title">Ảnh chụp xác thực gương mặt (Selfie)</span>
                        </div>
                        <div className="admin-selfie-img-wrapper">
                          {kycDetail.selfie_url ? (
                            <img src={kycDetail.selfie_url} alt="Selfie" className="admin-selfie-img" />
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Chưa có ảnh selfie</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="admin-actions-bar">
                      <button
                        className="admin-btn admin-btn-reject"
                        onClick={() => {
                          setRejectReasonInput(kycDetail.reject_reason || '');
                          setShowRejectModal(true);
                        }}
                        disabled={actionLoading}
                      >
                        <X size={18} />
                        <span>Từ chối</span>
                      </button>

                      <button
                        className="admin-btn admin-btn-approve"
                        onClick={handleApproveKyc}
                        disabled={actionLoading}
                      >
                        <Check size={18} />
                        <span>Xác thực (Duyệt)</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: KIỂM DUYỆT BÁO CÁO BÀI ĐĂNG (REPORT MODERATION) */}
          {activeTab === 'report-moderation' && (
            <div className="admin-report-container">
              {/* Filter Pills for Reports */}
              <div className="admin-report-filters">
                <button
                  className={`report-filter-btn ${reportStatusFilter === 'PENDING' ? 'active' : ''}`}
                  onClick={() => setReportStatusFilter('PENDING')}
                >
                  Chờ xử lý (PENDING)
                </button>
                <button
                  className={`report-filter-btn ${reportStatusFilter === 'RESOLVED' ? 'active' : ''}`}
                  onClick={() => setReportStatusFilter('RESOLVED')}
                >
                  Đã xác nhận vi phạm (RESOLVED)
                </button>
                <button
                  className={`report-filter-btn ${reportStatusFilter === 'REJECTED' ? 'active' : ''}`}
                  onClick={() => setReportStatusFilter('REJECTED')}
                >
                  Đã từ chối (REJECTED)
                </button>
                <button
                  className={`report-filter-btn ${reportStatusFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setReportStatusFilter('ALL')}
                >
                  Tất cả báo cáo
                </button>
              </div>

              <div className="admin-grid-container" style={{ marginTop: 20 }}>
                {/* LEFT COLUMN: REPORT LIST */}
                <div className="admin-list-column">
                  {loadingReports ? (
                    <div className="admin-empty-state">Đang tải danh sách báo cáo...</div>
                  ) : filteredReportList.length === 0 ? (
                    <div className="admin-empty-state">
                      <Flag size={40} />
                      <h4>Không có báo cáo nào ({reportStatusFilter})</h4>
                      <p>Hệ thống không ghi nhận báo cáo sai phạm nào trong trạng thái này.</p>
                    </div>
                  ) : (
                    filteredReportList.map((item) => {
                      const propTitle = item.property?.title || `Bất động sản #${item.property_id}`;
                      const reporterName = item.reporter?.name || 'Khách hàng';
                      const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '';
                      const isSelected = selectedReportId === item.id;
                      const reasonInfo = REASON_LABELS[item.reason] || { label: item.reason, penalty: 0, color: '#64748b', bg: '#f1f5f9' };

                      return (
                        <div
                          key={item.id}
                          className={`admin-card-item ${isSelected ? 'active' : ''}`}
                          onClick={() => setSelectedReportId(item.id)}
                        >
                          <div className="admin-card-top">
                            <div className="admin-card-avatar" style={{ backgroundColor: reasonInfo.bg, color: reasonInfo.color }}>
                              <AlertTriangle size={24} />
                            </div>
                            <div className="admin-card-info">
                              <span className="admin-card-name">{propTitle}</span>
                              <span className="admin-card-date">Người báo cáo: <strong>{reporterName}</strong> ({dateStr})</span>
                              <span className="admin-card-id">Report #{item.id}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span
                              className="admin-card-badge"
                              style={{ backgroundColor: reasonInfo.bg, color: reasonInfo.color, border: `1px solid ${reasonInfo.color}40` }}
                            >
                              <strong>{reasonInfo.label}</strong> ({reasonInfo.penalty} điểm)
                            </span>

                            <span
                              className={`admin-card-badge ${
                                item.status === 'RESOLVED' ? 'admin-badge-approved' :
                                item.status === 'REJECTED' ? 'admin-badge-rejected' : 'admin-badge-pending'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* RIGHT COLUMN: REPORT DETAIL VIEW */}
                <div className="admin-detail-panel">
                  {!selectedReport ? (
                    <div className="admin-empty-state">
                      <Flag size={48} />
                      <h4>Chưa chọn báo cáo nào</h4>
                      <p>Vui lòng chọn một thẻ báo cáo từ danh sách bên trái để xem chi tiết và kiểm duyệt.</p>
                    </div>
                  ) : (
                    <>
                      <div className="admin-detail-header">
                        <div>
                          <h3>CHI TIẾT BÁO CÁO VI PHẠM #{selectedReport.id}</h3>
                          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            Gửi ngày: {selectedReport.created_at ? new Date(selectedReport.created_at).toLocaleString('vi-VN') : 'N/A'}
                          </span>
                        </div>
                        <div
                          className={`admin-card-badge ${
                            selectedReport.status === 'RESOLVED' ? 'admin-badge-approved' :
                            selectedReport.status === 'REJECTED' ? 'admin-badge-rejected' : 'admin-badge-pending'
                          }`}
                          style={{ fontSize: '0.9rem', padding: '8px 16px' }}
                        >
                          Trạng thái: <strong>{selectedReport.status}</strong>
                        </div>
                      </div>

                      {/* Penalty Info Box */}
                      <div
                        className="admin-reject-alert"
                        style={{ backgroundColor: selectedReasonInfo?.bg || '#f1f5f9', borderColor: selectedReasonInfo?.color || '#cbd5e1' }}
                      >
                        <div className="admin-reject-icon" style={{ color: selectedReasonInfo?.color || '#334155' }}>
                          <Award size={24} />
                        </div>
                        <div className="admin-reject-content">
                          <h4 style={{ color: selectedReasonInfo?.color || '#1e293b' }}>
                            Lý do vi phạm: {selectedReasonInfo?.label}
                          </h4>
                          <p style={{ color: '#1e293b', fontWeight: 600, marginTop: 4 }}>
                            Quy định phạt Trust Score: <span style={{ color: '#dc2626', fontSize: '1.05rem' }}>{selectedReasonInfo?.penalty} điểm</span>
                          </p>
                          <p style={{ color: '#475569', fontSize: '0.85rem', marginTop: 4 }}>
                            {selectedReport.status === 'PENDING'
                              ? 'Chỉ khi Admin bấm "Xác nhận vi phạm", hệ thống mới tiến hành trừ điểm của chủ bài đăng.'
                              : selectedReport.status === 'RESOLVED'
                              ? 'Báo cáo đã được xác nhận đúng. Hệ thống đã trừ điểm chủ bài đăng và ghi vào trust_score_logs.'
                              : 'Báo cáo đã bị từ chối (sai sự thật hoặc không đủ bằng chứng). Không trừ điểm.'}
                          </p>
                        </div>
                      </div>

                      {/* Reported Property & Owner Info */}
                      <div className="admin-info-grid">
                        <div className="admin-info-item">
                          <span className="admin-info-label"><Home size={14} style={{ display: 'inline', marginRight: 4 }}/> Bài đăng bị phản ánh</span>
                          <span className="admin-info-value">{selectedReport.property?.title || `Bất động sản #${selectedReport.property_id}`}</span>
                        </div>
                        <div className="admin-info-item">
                          <span className="admin-info-label">Mức giá niêm yết</span>
                          <span className="admin-info-value">{selectedReport.property?.price ? `${selectedReport.property.price.toLocaleString()} VNĐ` : 'N/A'}</span>
                        </div>
                        <div className="admin-info-item">
                          <span className="admin-info-label"><User size={14} style={{ display: 'inline', marginRight: 4 }}/> Chủ bài đăng (Owner)</span>
                          <span className="admin-info-value">{selectedReport.property?.owner?.name || `Owner ID: ${selectedReport.property?.owner_id || 'N/A'}`}</span>
                        </div>
                        <div className="admin-info-item">
                          <span className="admin-info-label">Trust Score của Owner</span>
                          <span className="admin-info-value" style={{ color: (selectedReport.property?.owner?.trust_score ?? 100) < 50 ? '#dc2626' : '#059669', fontWeight: 800 }}>
                            {selectedReport.property?.owner?.trust_score ?? 100} điểm
                          </span>
                        </div>
                        <div className="admin-info-item" style={{ gridColumn: '1 / -1' }}>
                          <span className="admin-info-label">Trạng thái bài đăng trên sàn:</span>
                          <span className="admin-info-value" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                            {selectedReport.property?.is_hidden ? (
                              <>
                                <span className="admin-card-badge admin-badge-rejected" style={{ margin: 0 }}>
                                  ⛔ Đã ẩn khỏi sàn (is_hidden = true)
                                </span>
                                <button
                                  style={{
                                    backgroundColor: '#f0fdf4',
                                    border: '1px solid #86efac',
                                    color: '#16a34a',
                                    borderRadius: 8,
                                    padding: '4px 10px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                  onClick={() => handleDirectUnhideProperty(selectedReport.property_id)}
                                  disabled={actionLoading}
                                  title="Khôi phục hiển thị tin đăng trên sàn"
                                >
                                  <Eye size={14} /> Mở lại tin (Khôi phục hiển thị)
                                </button>
                              </>
                            ) : (
                              <span className="admin-card-badge admin-badge-approved" style={{ margin: 0 }}>
                                ✓ Đang hiển thị công khai
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Reporter & Description */}
                      <div className="admin-info-grid" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0' }}>
                        <div className="admin-info-item">
                          <span className="admin-info-label"><Mail size={14} style={{ display: 'inline', marginRight: 4 }}/> Người gửi báo cáo (Reporter)</span>
                          <span className="admin-info-value">{selectedReport.reporter?.name || `User ID: ${selectedReport.reporter_id}`} ({selectedReport.reporter?.email || 'N/A'})</span>
                        </div>
                        <div className="admin-info-item">
                          <span className="admin-info-label">Mã báo cáo</span>
                          <span className="admin-info-value">#{selectedReport.id}</span>
                        </div>
                        <div className="admin-info-item" style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                          <span className="admin-info-label"><FileText size={14} style={{ display: 'inline', marginRight: 4 }}/> Nội dung mô tả chi tiết từ người báo cáo:</span>
                          <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: 10, marginTop: 6, border: '1px solid #f1f5f9', color: '#1e293b', fontStyle: selectedReport.description ? 'normal' : 'italic' }}>
                            {selectedReport.description || 'Không có mô tả chi tiết kèm theo.'}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons - Only when PENDING */}
                      {selectedReport.status === 'PENDING' ? (
                        <div className="admin-actions-bar">
                          <button
                            className="admin-btn admin-btn-reject"
                            style={{ backgroundColor: '#64748b' }}
                            onClick={() => handleRejectReport(selectedReport.id)}
                            disabled={actionLoading}
                          >
                            <X size={18} />
                            <span>Từ chối báo cáo (Sai sự thật)</span>
                          </button>

                          <button
                            className="admin-btn admin-btn-reject"
                            style={{ backgroundColor: '#dc2626' }}
                            onClick={() => handleResolveReport(selectedReport.id)}
                            disabled={actionLoading}
                          >
                            <Check size={18} />
                            <span>Xác nhận vi phạm (Trừ {selectedReasonInfo?.penalty} điểm)</span>
                          </button>
                        </div>
                      ) : (
                        <div className="admin-actions-bar" style={{ justifyContent: 'center', color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>
                          Báo cáo này đã được xử lý bởi Admin (ID: {selectedReport.handled_by || 'N/A'}) vào {selectedReport.handled_at ? new Date(selectedReport.handled_at).toLocaleString('vi-VN') : 'N/A'}.
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: KIỂM DUYỆT ĐÁNH GIÁ (REVIEW MODERATION) */}
          {activeTab === 'review-moderation' && (
            <div>
              {/* Filter Pills Bar */}
              <div className="report-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className={`report-filter-btn ${reviewStatusFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setReviewStatusFilter('ALL')}
                  >
                    Tất cả ({reviewStats.total})
                  </button>
                  <button
                    className={`report-filter-btn ${reviewStatusFilter === 'APPROVED' ? 'active' : ''}`}
                    onClick={() => setReviewStatusFilter('APPROVED')}
                    style={{ color: reviewStatusFilter === 'APPROVED' ? '#ffffff' : '#059669' }}
                  >
                    Đang hiển thị ({reviewStats.approved})
                  </button>
                  <button
                    className={`report-filter-btn ${reviewStatusFilter === 'PENDING' ? 'active' : ''}`}
                    onClick={() => setReviewStatusFilter('PENDING')}
                    style={{ color: reviewStatusFilter === 'PENDING' ? '#ffffff' : '#d97706' }}
                  >
                    Chờ duyệt ({reviewStats.pending})
                  </button>
                  <button
                    className={`report-filter-btn ${reviewStatusFilter === 'HIDDEN' ? 'active' : ''}`}
                    onClick={() => setReviewStatusFilter('HIDDEN')}
                    style={{ color: reviewStatusFilter === 'HIDDEN' ? '#ffffff' : '#dc2626' }}
                  >
                    Đã ẩn vi phạm ({reviewStats.hidden})
                  </button>
                  <button
                    className={`report-filter-btn ${reviewStatusFilter === 'REJECTED' ? 'active' : ''}`}
                    onClick={() => setReviewStatusFilter('REJECTED')}
                    style={{ color: reviewStatusFilter === 'REJECTED' ? '#ffffff' : '#991b1b' }}
                  >
                    Đã từ chối ({reviewStats.rejected})
                  </button>
                </div>
              </div>

              <div className="admin-grid-container" style={{ marginTop: 20 }}>
                {/* LEFT COLUMN: REVIEW LIST */}
                <div className="admin-list-column">
                  {loadingReviews ? (
                    <div className="admin-empty-state">Đang tải danh sách đánh giá...</div>
                  ) : filteredReviewsList.length === 0 ? (
                    <div className="admin-empty-state">
                      <Star size={40} color="#cbd5e1" />
                      <h4>Không có đánh giá nào ({reviewStatusFilter})</h4>
                      <p>Hệ thống không tìm thấy đánh giá nào phù hợp với bộ lọc hiện tại.</p>
                    </div>
                  ) : (
                    filteredReviewsList.map((item) => {
                      const userName = item.user?.name || 'Người dùng';
                      const userAvatar = item.user?.avatar;
                      const propTitle = item.property?.title || `Bất động sản #${item.property_id}`;
                      const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '';
                      const isSelected = selectedReviewId === item.id;
                      const status = (item.status || 'APPROVED').toUpperCase();

                      return (
                        <div
                          key={item.id}
                          className={`admin-card-item ${isSelected ? 'active' : ''}`}
                          onClick={() => setSelectedReviewId(item.id)}
                        >
                          <div className="admin-card-top">
                            {userAvatar ? (
                              <img src={userAvatar} alt="Avatar" className="admin-card-avatar" />
                            ) : (
                              <div className="admin-card-avatar" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
                                {userName[0]?.toUpperCase() || 'U'}
                              </div>
                            )}
                            <div className="admin-card-info">
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span className="admin-card-name">{userName}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  {[1, 2, 3, 4, 5].map((s) => (
                                    <Star
                                      key={s}
                                      size={12}
                                      fill={s <= item.rating ? '#f59e0b' : 'none'}
                                      color={s <= item.rating ? '#f59e0b' : '#cbd5e1'}
                                    />
                                  ))}
                                </div>
                              </div>
                              <span className="admin-card-date" style={{ color: '#0369a1', fontWeight: 600 }}>
                                {propTitle}
                              </span>
                              <span className="admin-card-id">Đánh giá #{item.id} · {dateStr}</span>
                            </div>
                          </div>

                          <p style={{
                            fontSize: '0.85rem',
                            color: '#475569',
                            margin: '6px 0',
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            "{item.comment}"
                          </p>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span
                              className={`admin-card-badge ${
                                status === 'APPROVED' ? 'admin-badge-approved' :
                                status === 'HIDDEN' ? 'admin-badge-hidden' :
                                status === 'REJECTED' ? 'admin-badge-rejected' : 'admin-badge-pending'
                              }`}
                            >
                              {status === 'APPROVED' ? '✓ Đang hiển thị' :
                               status === 'HIDDEN' ? '⛔ Đã ẩn vi phạm' :
                               status === 'REJECTED' ? '✕ Đã từ chối' : '⏳ Chờ duyệt'}
                            </span>

                            {item.images && item.images.length > 0 && (
                              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Image size={12} /> {item.images.length} ảnh
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* RIGHT COLUMN: REVIEW DETAIL VIEW */}
                <div className="admin-detail-panel">
                  {!selectedReview ? (
                    <div className="admin-empty-state">
                      <Star size={48} color="#cbd5e1" />
                      <h4>Chưa chọn đánh giá nào</h4>
                      <p>Vui lòng nhấp vào một đánh giá ở danh sách bên trái để xem chi tiết và thực hiện kiểm duyệt.</p>
                    </div>
                  ) : (
                    <div className="admin-report-detail-content">
                      {/* Review Header Banner */}
                      <div className="admin-detail-header-card">
                        <div className="admin-detail-header-left">
                          <div className="admin-detail-prop-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span>Đánh giá #{selectedReview.id}</span>
                            <span
                              className={`admin-card-badge ${
                                selectedReview.status === 'APPROVED' ? 'admin-badge-approved' :
                                selectedReview.status === 'HIDDEN' ? 'admin-badge-hidden' :
                                selectedReview.status === 'REJECTED' ? 'admin-badge-rejected' : 'admin-badge-pending'
                              }`}
                            >
                              {selectedReview.status === 'APPROVED' ? '✓ Đang hiển thị công khai' :
                               selectedReview.status === 'HIDDEN' ? '⛔ Đã ẩn vi phạm' :
                               selectedReview.status === 'REJECTED' ? '✕ Đã từ chối' : '⏳ Đang chờ duyệt'}
                            </span>
                          </div>
                          <p className="admin-detail-time" style={{ marginTop: 4 }}>
                            Đăng ngày: {new Date(selectedReview.created_at).toLocaleString('vi-VN')}
                          </p>
                        </div>
                      </div>

                      {/* Two Grid Cards: User info & Property Info */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
                        {/* Card: Reviewer */}
                        <div className="admin-evidence-box">
                          <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px 0', fontSize: '0.95rem' }}>
                            <User size={18} color="#2563eb" />
                            Người đánh giá
                          </h4>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {selectedReview.user?.avatar ? (
                              <img src={selectedReview.user.avatar} alt="Avatar" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                                {selectedReview.user?.name ? selectedReview.user.name[0].toUpperCase() : 'U'}
                              </div>
                            )}
                            <div>
                              <div style={{ fontWeight: 700, color: '#1e293b' }}>{selectedReview.user?.name || 'Người dùng'}</div>
                              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Vai trò: {selectedReview.user?.role || 'USER'}</div>
                              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>User ID: #{selectedReview.user_id}</div>
                            </div>
                          </div>
                        </div>

                        {/* Card: Property */}
                        <div className="admin-evidence-box">
                          <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px 0', fontSize: '0.95rem' }}>
                            <Home size={18} color="#059669" />
                            Tin đăng bất động sản
                          </h4>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                              {selectedReview.property?.title || `Bất động sản #${selectedReview.property_id}`}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 2 }}>
                              📍 {selectedReview.property?.address || 'Không rõ địa chỉ'}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#059669', fontWeight: 600 }}>
                              💵 {selectedReview.property?.price ? `${Number(selectedReview.property.price).toLocaleString('vi-VN')} VND` : 'Liên hệ'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Review Rating & Content */}
                      <div className="admin-evidence-box" style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b' }}>{selectedReview.rating}.0</span>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  size={18}
                                  fill={star <= selectedReview.rating ? '#f59e0b' : 'none'}
                                  color={star <= selectedReview.rating ? '#f59e0b' : '#cbd5e1'}
                                />
                              ))}
                            </div>
                          </div>

                          {selectedReview.is_verified_review && (
                            <span className="verified-review-badge">
                              ✓ Đã xác thực giao dịch
                            </span>
                          )}
                        </div>

                        <div style={{
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          padding: '14px 16px',
                          fontSize: '0.95rem',
                          color: '#1e293b',
                          lineHeight: 1.6,
                          fontStyle: 'italic'
                        }}>
                          "{selectedReview.comment}"
                        </div>

                        {/* Review Attached Images */}
                        {selectedReview.images && selectedReview.images.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <h5 style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Image size={15} /> Hình ảnh đính kèm ({selectedReview.images.length}):
                            </h5>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              {selectedReview.images.map((img, i) => (
                                <img
                                  key={i}
                                  src={img.image_url.startsWith('http') ? img.image_url : `${API_BASE_URL}${img.image_url}`}
                                  alt="Review image"
                                  style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid #e2e8f0' }}
                                  onClick={() => window.open(img.image_url.startsWith('http') ? img.image_url : `${API_BASE_URL}${img.image_url}`, '_blank')}
                                  title="Nhấp để xem kích thước đầy đủ"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Admin Action Buttons */}
                      <div className="admin-actions-bar" style={{ marginTop: 24 }}>
                        {selectedReview.status !== 'APPROVED' && (
                          <button
                            className="admin-btn admin-btn-approve"
                            onClick={() => handleUpdateReviewStatus(selectedReview.id, 'APPROVED')}
                            disabled={reviewActionLoading}
                          >
                            <Check size={18} />
                            <span>Duyệt công khai (APPROVED)</span>
                          </button>
                        )}

                        {selectedReview.status !== 'HIDDEN' && (
                          <button
                            className="admin-btn"
                            style={{ backgroundColor: '#ea580c', color: '#ffffff' }}
                            onClick={() => handleUpdateReviewStatus(selectedReview.id, 'HIDDEN')}
                            disabled={reviewActionLoading}
                            title="Ẩn đánh giá vi phạm, không hiển thị trên bài đăng và tự động trừ khỏi điểm sao trung bình"
                          >
                            <EyeOff size={18} />
                            <span>Ẩn vi phạm (HIDDEN)</span>
                          </button>
                        )}

                        {selectedReview.status !== 'REJECTED' && (
                          <button
                            className="admin-btn admin-btn-reject"
                            onClick={() => handleUpdateReviewStatus(selectedReview.id, 'REJECTED')}
                            disabled={reviewActionLoading}
                          >
                            <XCircle size={18} />
                            <span>Từ chối (REJECTED)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* REJECT MODAL FOR KYC */}
      {showRejectModal && (
        <div className="admin-reject-modal-overlay">
          <div className="admin-reject-modal">
            <h3>Từ chối hồ sơ KYC #{selectedKycId}</h3>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.9rem' }}>
              Vui lòng nhập lý do cụ thể để người dùng biết và thực hiện xác minh lại đúng cách:
            </p>
            
            <textarea
              className="admin-reject-textarea"
              placeholder="Ví dụ: Ảnh CCCD mặt trước bị mờ, không đọc được số ID hoặc ảnh chụp bị lóa sáng..."
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
            />

            <div className="admin-modal-actions">
              <button className="admin-btn-cancel" onClick={() => setShowRejectModal(false)}>
                Hủy bỏ
              </button>
              <button
                className="admin-btn admin-btn-reject"
                onClick={handleRejectKycSubmit}
                disabled={actionLoading}
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
