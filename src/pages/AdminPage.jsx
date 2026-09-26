import { useState, useEffect } from 'react';
import { useNavigate, Link, useOutletContext } from 'react-router-dom';
import {
  ShieldCheck, AlertTriangle, Search, LogOut, HelpCircle, UserX, CheckCircle,
  XCircle, FileText, Image, ImageIcon, User, Check, X, ShieldAlert, Flag, Home, Mail, Clock, Award,
  Star, EyeOff, Eye, Scale, ExternalLink, Activity, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RotateCcw, History,
  SlidersHorizontal
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

const ACTION_TYPE_LABELS = {
  'KYC_APPROVED': { label: 'Duyệt KYC', color: '#16a34a', bg: '#f0fdf4' },
  'PROFILE_COMPLETED': { label: 'Hoàn thiện hồ sơ', color: '#2563eb', bg: '#eff6ff' },
  'ACCOUNT_30_DAYS_CLEAN': { label: '30 ngày sạch lỗi', color: '#9333ea', bg: '#faf5ff' },
  'REPORT_PENALTY': { label: 'Phạt vi phạm báo cáo', color: '#dc2626', bg: '#fef2f2' },
  'PROPERTY_HIDDEN': { label: 'Ẩn bài đăng vi phạm', color: '#ea580c', bg: '#fff7ed' },
  'APPEAL_PENALTY_REFUND': { label: 'Hoàn trả điểm khiếu nại', color: '#059669', bg: '#ecfdf5' },
  'ADMIN_MANUAL_ADJUSTMENT': { label: 'Admin can thiệp', color: '#0284c7', bg: '#f0f9ff' }
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

  // State for Appeal Moderation
  const [appealsList, setAppealsList] = useState([]);
  const [selectedAppealId, setSelectedAppealId] = useState(null);
  const [loadingAppeals, setLoadingAppeals] = useState(false);
  const [appealStatusFilter, setAppealStatusFilter] = useState('ALL'); // ALL | PENDING | APPROVED | REJECTED
  const [appealActionLoading, setAppealActionLoading] = useState(false);

  // State for Trust Score Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditTypeFilter, setAuditTypeFilter] = useState('ALL'); // ALL | BONUS | PENALTY | REFUND
  const [auditActionFilter, setAuditActionFilter] = useState('ALL'); // ALL | KYC_APPROVED | ...
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [auditStats, setAuditStats] = useState({ totalLogs: 0, totalBonus: 0, totalPenalty: 0, totalRefund: 0 });

  // State for Manual Trust Score Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustTargetUser, setAdjustTargetUser] = useState(null);
  const [adjustTargetEmailInput, setAdjustTargetEmailInput] = useState('');
  const [adjustTargetUserIdInput, setAdjustTargetUserIdInput] = useState('');
  const [adjustPointType, setAdjustPointType] = useState('ADD'); // 'ADD' | 'SUBTRACT'
  const [adjustPointsAmount, setAdjustPointsAmount] = useState(10);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  // State for Approve Appeal Modal (with custom refund points)
  const [showApproveAppealModal, setShowApproveAppealModal] = useState(false);
  const [approvingAppeal, setApprovingAppeal] = useState(null);
  const [approveRefundPoints, setApproveRefundPoints] = useState(5);
  const [approveAdminNote, setApproveAdminNote] = useState('');

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

  // 5. Fetch Appeals (Đơn khiếu nại của Môi giới)
  const fetchAppeals = async () => {
    setLoadingAppeals(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appeals/admin`);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.appeals || []);
        setAppealsList(list);
        if (list.length > 0) {
          setSelectedAppealId(prev => list.some(a => a.id === prev) ? prev : list[0].id);
        } else {
          setSelectedAppealId(null);
        }
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách khiếu nại:', err);
    } finally {
      setLoadingAppeals(false);
    }
  };

  // Handle Approve Appeal Modal & Submission
  const handleOpenApproveAppealModal = (appeal) => {
    if (!appeal) return;
    const defaultPoints = REASON_LABELS[appeal.report?.reason]?.penalty
      ? Math.abs(REASON_LABELS[appeal.report?.reason]?.penalty)
      : 5;
    setApprovingAppeal(appeal);
    setApproveRefundPoints(defaultPoints);
    setApproveAdminNote('Chấp thuận khiếu nại. Đã hoàn điểm phạt và khôi phục hiển thị tin đăng.');
    setShowApproveAppealModal(true);
  };

  const handleConfirmApproveAppeal = async () => {
    if (!approvingAppeal) return;
    const parsedPoints = Number(approveRefundPoints);
    if (!Number.isFinite(parsedPoints) || parsedPoints < 0 || parsedPoints > 100) {
      alert('Vui lòng nhập số điểm hoàn lại hợp lệ (0 - 100 điểm).');
      return;
    }

    setAppealActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appeals/admin/${approvingAppeal.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminNote: approveAdminNote.trim(),
          customRefundPoints: parsedPoints
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Chấp thuận khiếu nại thành công!');
        setShowApproveAppealModal(false);
        setApprovingAppeal(null);
        fetchAppeals();
        fetchReports();
        fetchAuditLogs();
      } else {
        alert(data.error || 'Thao tác thất bại');
      }
    } catch (err) {
      console.error('Lỗi chấp thuận khiếu nại:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setAppealActionLoading(false);
    }
  };

  // Handle Manual Trust Score Adjustment
  const handleOpenAdjustModal = (user = null) => {
    setAdjustTargetUser(user);
    setAdjustTargetEmailInput(user?.email || '');
    setAdjustTargetUserIdInput(user ? String(user.id) : '');
    setAdjustPointType('ADD');
    setAdjustPointsAmount(10);
    setAdjustReason('');
    setShowAdjustModal(true);
  };

  const handleSubmitAdjustTrustScore = async () => {
    const email = adjustTargetEmailInput.trim();
    const rawUserId = adjustTargetUser?.id || adjustTargetUserIdInput.trim();

    if (!email && !rawUserId) {
      alert('Vui lòng nhập Email (hoặc User ID) của tài khoản cần điều chỉnh điểm.');
      return;
    }

    const amount = Number(adjustPointsAmount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100) {
      alert('Vui lòng nhập số điểm điều chỉnh từ 1 đến 100.');
      return;
    }

    if (!adjustReason || adjustReason.trim().length < 5) {
      alert('Vui lòng nhập lý do cụ thể (tối thiểu 5 ký tự) để lưu vào sổ cái kiểm toán.');
      return;
    }

    const delta = adjustPointType === 'ADD' ? amount : -amount;

    setAdjustLoading(true);
    try {
      const payload = {
        pointChange: delta,
        reason: adjustReason.trim()
      };

      if (email) {
        payload.email = email;
      }
      if (rawUserId) {
        payload.userId = Number(rawUserId);
      }

      const res = await apiFetch(`${API_BASE_URL}/api/admin/trust-score/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Điều chỉnh điểm uy tín thành công!');
        setShowAdjustModal(false);
        fetchAuditLogs();
      } else {
        alert(data.error || 'Điều chỉnh điểm thất bại');
      }
    } catch (err) {
      console.error('Lỗi điều chỉnh điểm:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setAdjustLoading(false);
    }
  };

  // Handle Reject Appeal
  const handleRejectAppeal = async (appealId) => {
    const note = window.prompt('Nhập lý do bác bỏ khiếu nại (bắt buộc để phản hồi cho Môi giới):', 'Bằng chứng không đủ thuyết phục hoặc thông tin giải trình không chính xác.');
    if (!note || !note.trim()) return;

    setAppealActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appeals/admin/${appealId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNote: note.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Đã bác bỏ khiếu nại thành công.');
        fetchAppeals();
      } else {
        alert(data.error || 'Thao tác thất bại');
      }
    } catch (err) {
      console.error('Lỗi bác bỏ khiếu nại:', err);
      alert('Lỗi kết nối máy chủ');
    } finally {
      setAppealActionLoading(false);
    }
  };

  // 6. Fetch Trust Score Audit Logs
  const fetchAuditLogs = async (page = 1, type = auditTypeFilter, action = auditActionFilter, search = searchQuery) => {
    setLoadingAuditLogs(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 20,
        type,
        action,
        search: search || ''
      });
      const res = await apiFetch(`${API_BASE_URL}/api/admin/trust-score-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
        if (data.pagination) setAuditPagination(data.pagination);
        if (data.stats) setAuditStats(data.stats);
        setAuditPage(page);
      }
    } catch (err) {
      console.error('Lỗi khi tải nhật ký điểm uy tín:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'account-verification') {
      fetchRejectedKyc();
    } else if (activeTab === 'report-moderation') {
      fetchReports(reportStatusFilter);
    } else if (activeTab === 'review-moderation') {
      fetchAdminReviews();
    } else if (activeTab === 'appeal-moderation') {
      fetchAppeals();
    } else if (activeTab === 'audit-logs') {
      fetchAuditLogs(1, auditTypeFilter, auditActionFilter, searchQuery);
    }
  }, [activeTab, reportStatusFilter]);

  useEffect(() => {
    if (activeTab === 'audit-logs') {
      fetchAuditLogs(1, auditTypeFilter, auditActionFilter, searchQuery);
    }
  }, [auditTypeFilter, auditActionFilter]);

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

  const appealStats = {
    total: (Array.isArray(appealsList) ? appealsList : []).length,
    pending: (Array.isArray(appealsList) ? appealsList : []).filter(a => a.status === 'PENDING').length,
    approved: (Array.isArray(appealsList) ? appealsList : []).filter(a => a.status === 'APPROVED').length,
    rejected: (Array.isArray(appealsList) ? appealsList : []).filter(a => a.status === 'REJECTED').length
  };

  const filteredAppealsList = (Array.isArray(appealsList) ? appealsList : []).filter(item => {
    if (appealStatusFilter !== 'ALL' && item.status !== appealStatusFilter) {
      return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const agentName = item.agent?.name || '';
    const agentEmail = item.agent?.email || '';
    const propTitle = item.report?.property?.title || '';
    const reason = item.reason || '';
    const idStr = `#${item.id}`;
    return (
      agentName.toLowerCase().includes(q) ||
      agentEmail.toLowerCase().includes(q) ||
      propTitle.toLowerCase().includes(q) ||
      reason.toLowerCase().includes(q) ||
      idStr.includes(q)
    );
  });

  const selectedAppeal = (Array.isArray(appealsList) ? appealsList : []).find(a => a.id === selectedAppealId);

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

          <button
            className={`admin-nav-btn ${activeTab === 'appeal-moderation' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('appeal-moderation');
              setSearchQuery('');
            }}
          >
            <Scale size={20} />
            <span>Xử lý khiếu nại</span>
          </button>

          <button
            className={`admin-nav-btn ${activeTab === 'audit-logs' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('audit-logs');
              setSearchQuery('');
            }}
          >
            <Activity size={20} />
            <span>Nhật ký điểm uy tín</span>
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
                  : activeTab === 'review-moderation'
                  ? "Tìm kiếm đánh giá theo người gửi, bất động sản, nội dung..."
                  : activeTab === 'appeal-moderation'
                  ? "Tìm kiếm khiếu nại theo môi giới, bài đăng, lý do..."
                  : "Tìm kiếm nhật ký theo người dùng, lý do, ID..."
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
              <button
                className={`admin-pill-btn ${activeTab === 'appeal-moderation' ? 'active' : ''}`}
                onClick={() => setActiveTab('appeal-moderation')}
              >
                Xử lý khiếu nại
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
                        <span className="admin-info-value">{kycDetail.user?.trust_score ?? 50} điểm</span>
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
                          <span className="admin-info-value" style={{ color: (selectedReport.property?.owner?.trust_score ?? 50) < 50 ? '#dc2626' : '#059669', fontWeight: 800 }}>
                            {selectedReport.property?.owner?.trust_score ?? 50} điểm
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

          {/* TAB 4: XỬ LÝ KHIẾU NẠI (APPEAL MODERATION) */}
          {activeTab === 'appeal-moderation' && (
            <div>
              {/* Filter Pills Bar */}
              <div className="report-filter-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className={`report-filter-btn ${appealStatusFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setAppealStatusFilter('ALL')}
                  >
                    Tất cả ({appealStats.total})
                  </button>
                  <button
                    className={`report-filter-btn ${appealStatusFilter === 'PENDING' ? 'active' : ''}`}
                    onClick={() => setAppealStatusFilter('PENDING')}
                    style={{ color: appealStatusFilter === 'PENDING' ? '#ffffff' : '#d97706' }}
                  >
                    Chờ duyệt ({appealStats.pending})
                  </button>
                  <button
                    className={`report-filter-btn ${appealStatusFilter === 'APPROVED' ? 'active' : ''}`}
                    onClick={() => setAppealStatusFilter('APPROVED')}
                    style={{ color: appealStatusFilter === 'APPROVED' ? '#ffffff' : '#16a34a' }}
                  >
                    Đã chấp thuận ({appealStats.approved})
                  </button>
                  <button
                    className={`report-filter-btn ${appealStatusFilter === 'REJECTED' ? 'active' : ''}`}
                    onClick={() => setAppealStatusFilter('REJECTED')}
                    style={{ color: appealStatusFilter === 'REJECTED' ? '#ffffff' : '#dc2626' }}
                  >
                    Đã bác bỏ ({appealStats.rejected})
                  </button>
                </div>
              </div>

              <div className="admin-grid-container" style={{ marginTop: 20 }}>
                {/* LEFT COLUMN: APPEALS LIST */}
                <div className="admin-list-column">
                  {loadingAppeals ? (
                    <div className="admin-empty-state">Đang tải danh sách khiếu nại...</div>
                  ) : filteredAppealsList.length === 0 ? (
                    <div className="admin-empty-state">
                      <Scale size={40} color="#cbd5e1" />
                      <h4>Không có đơn khiếu nại nào ({appealStatusFilter})</h4>
                      <p>Hệ thống không tìm thấy đơn khiếu nại nào phù hợp với bộ lọc hiện tại.</p>
                    </div>
                  ) : (
                    filteredAppealsList.map((item) => {
                      const agentName = item.agent?.name || 'Môi giới';
                      const propTitle = item.report?.property?.title || `Bất động sản #${item.report?.property_id}`;
                      const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : '';
                      const isSelected = selectedAppealId === item.id;
                      const origReason = item.report?.reason;
                      const origReasonInfo = REASON_LABELS[origReason] || { label: origReason || 'Vi phạm', penalty: 0, color: '#64748b', bg: '#f1f5f9' };

                      return (
                        <div
                          key={item.id}
                          className={`admin-card-item ${isSelected ? 'active' : ''}`}
                          onClick={() => setSelectedAppealId(item.id)}
                        >
                          <div className="admin-card-top">
                            <div className="admin-card-avatar" style={{ backgroundColor: '#eef2ff', color: '#4f46e5' }}>
                              <Scale size={24} />
                            </div>
                            <div className="admin-card-info">
                              <span className="admin-card-name">{agentName}</span>
                              <span className="admin-card-date">{propTitle} ({dateStr})</span>
                              <span className="admin-card-id">Khiếu nại #{item.id} • Report #{item.report_id}</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span
                              className="admin-card-badge"
                              style={{ backgroundColor: origReasonInfo.bg, color: origReasonInfo.color, border: `1px solid ${origReasonInfo.color}40` }}
                            >
                              Lỗi: <strong>{origReasonInfo.label}</strong> ({origReasonInfo.penalty}đ)
                            </span>

                            <span
                              className={`admin-card-badge ${
                                item.status === 'APPROVED' ? 'admin-badge-approved' :
                                item.status === 'REJECTED' ? 'admin-badge-rejected' : 'admin-badge-pending'
                              }`}
                            >
                              {item.status === 'APPROVED' ? '✓ Đã chấp thuận' :
                               item.status === 'REJECTED' ? '✕ Đã bác bỏ' : '⏳ Chờ xem xét'}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 6, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            "{item.reason}"
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* RIGHT COLUMN: APPEAL DETAIL VIEW */}
                <div className="admin-detail-panel">
                  {!selectedAppeal ? (
                    <div className="admin-empty-state">
                      <Scale size={48} />
                      <h4>Chưa chọn đơn khiếu nại nào</h4>
                      <p>Vui lòng chọn một đơn khiếu nại từ danh sách bên trái để đối soát và ra quyết định.</p>
                    </div>
                  ) : (
                    <div>
                      <div className="admin-detail-header">
                        <div>
                          <h3>HỒ SƠ ĐỐI SOÁT KHIẾU NẠI #{selectedAppeal.id}</h3>
                          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            Nộp ngày: {selectedAppeal.created_at ? new Date(selectedAppeal.created_at).toLocaleString('vi-VN') : 'N/A'}
                          </span>
                        </div>
                        <div
                          className={`admin-card-badge ${
                            selectedAppeal.status === 'APPROVED' ? 'admin-badge-approved' :
                            selectedAppeal.status === 'REJECTED' ? 'admin-badge-rejected' : 'admin-badge-pending'
                          }`}
                          style={{ fontSize: '0.9rem', padding: '8px 16px' }}
                        >
                          Trạng thái: <strong>{selectedAppeal.status}</strong>
                        </div>
                      </div>

                      {/* Summary Grid: Agent Info & Property Info */}
                      <div className="admin-info-grid" style={{ marginTop: 16 }}>
                        <div className="admin-info-item">
                          <span className="admin-info-label"><User size={14} style={{ display: 'inline', marginRight: 4 }}/> Môi giới nộp đơn (Agent)</span>
                          <span className="admin-info-value">
                            {selectedAppeal.agent?.name || 'Môi giới'} {selectedAppeal.agent?.email ? `(${selectedAppeal.agent.email})` : ''}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: '#4f46e5', fontWeight: 700, marginTop: 2 }}>
                            Trust Score: {selectedAppeal.agent?.trust_score ?? 50} điểm
                          </span>
                        </div>
                        <div className="admin-info-item">
                          <span className="admin-info-label"><Home size={14} style={{ display: 'inline', marginRight: 4 }}/> Bất động sản liên quan</span>
                          <span className="admin-info-value">{selectedAppeal.report?.property?.title || 'N/A'}</span>
                          <span style={{ fontSize: '0.8rem', color: selectedAppeal.report?.property?.is_hidden ? '#dc2626' : '#16a34a', fontWeight: 600, marginTop: 2 }}>
                            {selectedAppeal.report?.property?.is_hidden ? '⛔ Đang bị ẩn khỏi sàn' : '✓ Đang hiển thị'}
                          </span>
                        </div>
                      </div>

                      {/* Original Report Box */}
                      <div className="admin-reject-alert" style={{ backgroundColor: '#fff7ed', borderColor: '#fdba74', marginTop: 16 }}>
                        <div className="admin-reject-icon" style={{ color: '#ea580c' }}>
                          <AlertTriangle size={24} />
                        </div>
                        <div className="admin-reject-content">
                          <h4 style={{ color: '#c2410c' }}>
                            Báo cáo vi phạm gốc #{selectedAppeal.report_id}
                          </h4>
                          <p style={{ color: '#1e293b', fontWeight: 600, marginTop: 4 }}>
                            Lý do phạt: <span style={{ color: '#ea580c' }}>{REASON_LABELS[selectedAppeal.report?.reason]?.label || selectedAppeal.report?.reason || 'Chưa xác định'}</span> {REASON_LABELS[selectedAppeal.report?.reason]?.penalty !== undefined ? `(${REASON_LABELS[selectedAppeal.report?.reason].penalty} điểm)` : ''}
                          </p>
                          <p style={{ color: '#475569', fontSize: '0.85rem', marginTop: 4 }}>
                            Người báo cáo: <strong>{selectedAppeal.report?.reporter?.name || 'Khách hàng'}</strong> {selectedAppeal.report?.reporter?.email ? `(${selectedAppeal.report.reporter.email})` : ''}
                          </p>
                          <p style={{ color: '#334155', fontSize: '0.85rem', fontStyle: 'italic', marginTop: 4, background: '#ffffff', padding: '8px 12px', borderRadius: 8, border: '1px solid #fed7aa' }}>
                            "{selectedAppeal.report?.description || 'Không có mô tả chi tiết từ người báo cáo'}"
                          </p>
                        </div>
                      </div>

                      {/* Agent's Appeal Explanation & Evidence */}
                      <div className="admin-evidence-box" style={{ marginTop: 16 }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px 0', color: '#1e293b', fontSize: '1rem', fontWeight: 700 }}>
                          <FileText size={18} color="#4f46e5" />
                          Văn bản giải trình của Môi giới
                        </h4>
                        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, fontSize: '0.95rem', color: '#0f172a', lineHeight: 1.5 }}>
                          {selectedAppeal.reason}
                        </div>

                        {(() => {
                          let evImages = [];
                          if (Array.isArray(selectedAppeal.evidence_urls) && selectedAppeal.evidence_urls.length > 0) {
                            evImages = selectedAppeal.evidence_urls.filter(Boolean);
                          } else if (Array.isArray(selectedAppeal.evidence_url)) {
                            evImages = selectedAppeal.evidence_url.filter(Boolean);
                          } else if (typeof selectedAppeal.evidence_url === 'string') {
                            const trimmed = selectedAppeal.evidence_url.trim();
                            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                              try {
                                const parsed = JSON.parse(trimmed);
                                if (Array.isArray(parsed)) evImages = parsed.filter(Boolean);
                              } catch (e) {
                                evImages = [trimmed];
                              }
                            } else if (trimmed) {
                              evImages = [trimmed];
                            }
                          }

                          if (evImages.length === 0) return null;

                          return (
                            <div style={{ marginTop: 16 }}>
                              <span className="admin-info-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                                <ImageIcon size={16} style={{ color: '#4f46e5' }} />
                                Danh sách ảnh bằng chứng đính kèm ({evImages.length} ảnh):
                              </span>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                                {evImages.map((imgUrl, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      border: '1px solid #e2e8f0',
                                      borderRadius: 10,
                                      overflow: 'hidden',
                                      backgroundColor: '#ffffff',
                                      display: 'flex',
                                      flexDirection: 'column'
                                    }}
                                  >
                                    <a href={imgUrl} target="_blank" rel="noreferrer" style={{ display: 'block', overflow: 'hidden', height: 140 }}>
                                      <img
                                        src={imgUrl}
                                        alt={`Bằng chứng ${idx + 1}`}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.2s' }}
                                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                      />
                                    </a>
                                    <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                                        Ảnh #{idx + 1}
                                      </span>
                                      <a
                                        href={imgUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#4f46e5', fontWeight: 600, fontSize: '0.75rem', textDecoration: 'none' }}
                                      >
                                        Xem ảnh <ExternalLink size={12} />
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Admin Decision History Note if already handled */}
                      {selectedAppeal.status !== 'PENDING' && (
                        <div
                          style={{
                            marginTop: 16,
                            padding: 14,
                            borderRadius: 10,
                            backgroundColor: selectedAppeal.status === 'APPROVED' ? '#f0fdf4' : '#fef2f2',
                            border: `1px solid ${selectedAppeal.status === 'APPROVED' ? '#bbf7d0' : '#fecaca'}`,
                            fontSize: '0.85rem'
                          }}
                        >
                          <strong style={{ color: selectedAppeal.status === 'APPROVED' ? '#16a34a' : '#dc2626' }}>
                            {selectedAppeal.status === 'APPROVED' ? '✓ Đã chấp thuận khiếu nại' : '✕ Đã bác bỏ khiếu nại'}
                          </strong>
                          <p style={{ margin: '4px 0 0 0', color: '#334155' }}>
                            Ghi chú Admin: {selectedAppeal.admin_note || 'Không có ghi chú'}
                          </p>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginTop: 4 }}>
                            Xử lý bởi Admin {selectedAppeal.admin?.name || `ID #${selectedAppeal.handled_by}`} vào {selectedAppeal.handled_at ? new Date(selectedAppeal.handled_at).toLocaleString('vi-VN') : 'N/A'}
                          </span>
                        </div>
                      )}

                      {/* Actions for PENDING appeals */}
                      {selectedAppeal.status === 'PENDING' && (
                        <div className="admin-actions-bar" style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                          <button
                            className="admin-btn admin-btn-reject"
                            onClick={() => handleRejectAppeal(selectedAppeal.id)}
                            disabled={appealActionLoading}
                          >
                            <XCircle size={18} />
                            <span>Bác bỏ khiếu nại</span>
                          </button>

                          <button
                            className="admin-btn admin-btn-approve"
                            onClick={() => handleOpenApproveAppealModal(selectedAppeal)}
                            disabled={appealActionLoading}
                          >
                            <CheckCircle size={18} />
                            <span>Chấp thuận & Hoàn lại điểm</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: TRUST SCORE AUDIT LOGS */}
          {activeTab === 'audit-logs' && (
            <div className="admin-audit-section">
              {/* Top Section Header */}
              <div className="admin-audit-header">
                <div>
                  <h2 className="admin-section-title">Nhật ký Biến động Điểm Uy Tín (Audit Logs)</h2>
                  <p className="admin-section-desc">
                    Tra cứu và kiểm toán toàn bộ lịch sử thưởng/phạt/hoàn điểm của các tài khoản trên hệ thống
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    className="admin-btn-adjust-main"
                    onClick={() => handleOpenAdjustModal(null)}
                    title="Điều chỉnh điểm uy tín thủ công cho một tài khoản"
                  >
                    <SlidersHorizontal size={16} />
                    <span>Điều chỉnh điểm thủ công</span>
                  </button>
                  <button
                    className="admin-btn-refresh"
                    onClick={() => fetchAuditLogs(1, auditTypeFilter, auditActionFilter, searchQuery)}
                    disabled={loadingAuditLogs}
                    title="Tải lại dữ liệu"
                  >
                    <RotateCcw size={16} className={loadingAuditLogs ? 'spin-icon' : ''} />
                    <span>Làm mới</span>
                  </button>
                </div>
              </div>

              {/* Stat Summary Cards */}
              <div className="admin-audit-stats-grid">
                <div className="admin-audit-stat-card">
                  <div className="audit-stat-icon-wrap" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
                    <Activity size={22} />
                  </div>
                  <div className="audit-stat-info">
                    <span className="audit-stat-label">Tổng lượt biến động</span>
                    <span className="audit-stat-value">{auditStats.totalLogs}</span>
                    <span className="audit-stat-hint">Lượt ghi nhận trong sổ cái</span>
                  </div>
                </div>

                <div className="admin-audit-stat-card">
                  <div className="audit-stat-icon-wrap" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                    <TrendingUp size={22} />
                  </div>
                  <div className="audit-stat-info">
                    <span className="audit-stat-label">Tổng điểm đã thưởng</span>
                    <span className="audit-stat-value" style={{ color: '#16a34a' }}>+{auditStats.totalBonus}</span>
                    <span className="audit-stat-hint">KYC, hồ sơ, 30 ngày sạch</span>
                  </div>
                </div>

                <div className="admin-audit-stat-card">
                  <div className="audit-stat-icon-wrap" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                    <TrendingDown size={22} />
                  </div>
                  <div className="audit-stat-info">
                    <span className="audit-stat-label">Tổng điểm đã xử phạt</span>
                    <span className="audit-stat-value" style={{ color: '#dc2626' }}>-{auditStats.totalPenalty}</span>
                    <span className="audit-stat-hint">Báo cáo vi phạm, ẩn tin</span>
                  </div>
                </div>

                <div className="admin-audit-stat-card">
                  <div className="audit-stat-icon-wrap" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>
                    <Scale size={22} />
                  </div>
                  <div className="audit-stat-info">
                    <span className="audit-stat-label">Tổng điểm hoàn lại</span>
                    <span className="audit-stat-value" style={{ color: '#059669' }}>+{auditStats.totalRefund}</span>
                    <span className="audit-stat-hint">Kháng cáo thành công</span>
                  </div>
                </div>
              </div>

              {/* Filters Bar */}
              <div className="admin-audit-filters-bar">
                <div className="admin-audit-type-pills">
                  <button
                    className={`audit-pill-btn ${auditTypeFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setAuditTypeFilter('ALL')}
                  >
                    Tất cả ({auditStats.totalLogs})
                  </button>
                  <button
                    className={`audit-pill-btn bonus ${auditTypeFilter === 'BONUS' ? 'active' : ''}`}
                    onClick={() => setAuditTypeFilter('BONUS')}
                  >
                    🟢 Thưởng điểm
                  </button>
                  <button
                    className={`audit-pill-btn penalty ${auditTypeFilter === 'PENALTY' ? 'active' : ''}`}
                    onClick={() => setAuditTypeFilter('PENALTY')}
                  >
                    🔴 Xử phạt
                  </button>
                  <button
                    className={`audit-pill-btn refund ${auditTypeFilter === 'REFUND' ? 'active' : ''}`}
                    onClick={() => setAuditTypeFilter('REFUND')}
                  >
                    🟡 Hoàn lại sau khiếu nại
                  </button>
                </div>

                <div className="admin-audit-action-select-wrapper">
                  <select
                    className="admin-audit-select"
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                  >
                    <option value="ALL">-- Tất cả loại hành động --</option>
                    <option value="KYC_APPROVED">Duyệt KYC (+20đ)</option>
                    <option value="PROFILE_COMPLETED">Hoàn thiện hồ sơ (+5đ)</option>
                    <option value="ACCOUNT_30_DAYS_CLEAN">30 ngày không vi phạm (+5đ)</option>
                    <option value="REPORT_PENALTY">Xử phạt báo cáo vi phạm</option>
                    <option value="PROPERTY_HIDDEN">Ẩn bài đăng vi phạm</option>
                    <option value="APPEAL_PENALTY_REFUND">Hoàn điểm sau kháng cáo</option>
                    <option value="ADMIN_MANUAL_ADJUSTMENT">Admin can thiệp điều chỉnh</option>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              <div className="admin-audit-table-card">
                {loadingAuditLogs ? (
                  <div className="admin-audit-loading">
                    <RotateCcw size={28} className="spin-icon" color="#2563eb" />
                    <span>Đang tải nhật ký kiểm toán...</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="admin-audit-empty">
                    <History size={48} color="#94a3b8" />
                    <h4>Không tìm thấy nhật ký kiểm toán nào</h4>
                    <p>Hãy thử thay đổi điều kiện lọc hoặc từ khóa tìm kiếm.</p>
                  </div>
                ) : (
                  <>
                    <div className="admin-audit-table-responsive">
                      <table className="admin-audit-table">
                        <thead>
                          <tr>
                            <th>Thời gian</th>
                            <th>Người dùng</th>
                            <th>Hành động</th>
                            <th>Biến động</th>
                            <th>Điểm số</th>
                            <th>Lý do & Đối tượng liên quan</th>
                            <th style={{ textAlign: 'center' }}>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.map((log) => {
                            const isPositive = Number(log.point_change) > 0;
                            const actionInfo = ACTION_TYPE_LABELS[log.action] || {
                              label: log.action || 'Biến động',
                              color: isPositive ? '#16a34a' : '#dc2626',
                              bg: isPositive ? '#f0fdf4' : '#fef2f2'
                            };

                            return (
                              <tr key={log.id}>
                                <td className="audit-cell-time">
                                  <div className="audit-time-main">
                                    <Clock size={13} />
                                    <span>{log.created_at ? new Date(log.created_at).toLocaleDateString('vi-VN') : 'N/A'}</span>
                                  </div>
                                  <span className="audit-time-sub">
                                    {log.created_at ? new Date(log.created_at).toLocaleTimeString('vi-VN') : ''}
                                  </span>
                                </td>

                                <td className="audit-cell-user">
                                  <div className="audit-user-row">
                                    {log.user?.avatar ? (
                                      <img src={log.user.avatar} alt="" className="audit-user-avatar" />
                                    ) : (
                                      <div className="audit-user-avatar-placeholder">
                                        {(log.user?.name || 'U').charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="audit-user-details">
                                      <span className="audit-user-name">{log.user?.name || `User #${log.user_id}`}</span>
                                      <span className="audit-user-email">{log.user?.email || 'N/A'}</span>
                                    </div>
                                    <span className={`audit-role-tag ${log.user?.role?.toLowerCase()}`}>
                                      {log.user?.role || 'USER'}
                                    </span>
                                  </div>
                                </td>

                                <td className="audit-cell-action">
                                  <span
                                    className="audit-action-tag"
                                    style={{
                                      backgroundColor: actionInfo.bg,
                                      color: actionInfo.color,
                                      borderColor: `${actionInfo.color}33`
                                    }}
                                  >
                                    {actionInfo.label}
                                  </span>
                                </td>

                                <td className="audit-cell-change">
                                  <span className={`audit-change-badge ${isPositive ? 'positive' : 'negative'}`}>
                                    {isPositive ? `+${log.point_change}` : log.point_change}
                                  </span>
                                </td>

                                <td className="audit-cell-score">
                                  {log.old_score !== null && log.new_score !== null ? (
                                    <div className="audit-score-flow">
                                      <span className="score-old">{log.old_score}</span>
                                      <span className="score-arrow">➔</span>
                                      <span className="score-new" style={{ color: log.new_score < 50 ? '#dc2626' : '#16a34a' }}>
                                        {log.new_score}
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>-</span>
                                  )}
                                </td>

                                <td className="audit-cell-reason">
                                  <p className="audit-reason-text">{log.reason || 'Không có ghi chú'}</p>
                                  <div className="audit-meta-tags">
                                    {log.property && (
                                      <span className="audit-meta-pill" title={log.property.title}>
                                        <Home size={12} /> Bài đăng #{log.related_property_id}: {log.property.title.slice(0, 28)}...
                                      </span>
                                    )}
                                    {log.related_report_id && (
                                      <span className="audit-meta-pill report">
                                        <Flag size={12} /> Báo cáo #{log.related_report_id}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="audit-cell-actions" style={{ textAlign: 'center' }}>
                                  <button
                                    className="audit-adjust-quick-btn"
                                    onClick={() => handleOpenAdjustModal(log.user || { id: log.user_id, name: `User #${log.user_id}` })}
                                    title="Điều chỉnh điểm cho người dùng này"
                                  >
                                    <SlidersHorizontal size={13} />
                                    <span>Chỉnh điểm</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <div className="admin-audit-pagination">
                      <span className="audit-pagination-info">
                        Hiển thị {auditLogs.length} trên tổng số {auditPagination.total} bản ghi (Trang {auditPagination.page}/{auditPagination.totalPages || 1})
                      </span>
                      <div className="audit-pagination-actions">
                        <button
                          className="audit-page-btn"
                          disabled={auditPagination.page <= 1 || loadingAuditLogs}
                          onClick={() => fetchAuditLogs(auditPagination.page - 1, auditTypeFilter, auditActionFilter, searchQuery)}
                        >
                          Trang trước
                        </button>
                        <span className="audit-page-current">{auditPagination.page}</span>
                        <button
                          className="audit-page-btn"
                          disabled={auditPagination.page >= auditPagination.totalPages || loadingAuditLogs}
                          onClick={() => fetchAuditLogs(auditPagination.page + 1, auditTypeFilter, auditActionFilter, searchQuery)}
                        >
                          Trang sau
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* APPROVE APPEAL WITH CUSTOM REFUND POINTS MODAL */}
      {showApproveAppealModal && approvingAppeal && (
        <div className="admin-reject-modal-overlay">
          <div className="admin-adjust-modal">
            <div className="admin-adjust-modal-header">
              <div className="admin-adjust-modal-title">
                <CheckCircle size={22} color="#10b981" />
                <h3>Chấp thuận Khiếu nại #{approvingAppeal.id}</h3>
              </div>
              <button
                className="admin-modal-close-btn"
                onClick={() => { setShowApproveAppealModal(false); setApprovingAppeal(null); }}
              >
                ✕
              </button>
            </div>

            <div className="admin-adjust-modal-body">
              <div className="appeal-approve-summary-box">
                <div className="appeal-approve-info-row">
                  <span className="label">Môi giới / Đương sự:</span>
                  <span className="value font-bold">{approvingAppeal.user?.name || `User #${approvingAppeal.user_id}`}</span>
                </div>
                {approvingAppeal.report && (
                  <div className="appeal-approve-info-row">
                    <span className="label">Lý do phạt ban đầu:</span>
                    <span className="value" style={{ color: '#dc2626' }}>
                      {REASON_LABELS[approvingAppeal.report.reason]?.label || approvingAppeal.report.reason}
                    </span>
                  </div>
                )}
                {approvingAppeal.property && (
                  <div className="appeal-approve-info-row">
                    <span className="label">Bất động sản:</span>
                    <span className="value">{approvingAppeal.property.title}</span>
                  </div>
                )}
              </div>

              <div className="admin-form-group" style={{ marginTop: 16 }}>
                <label className="admin-form-label">
                  Số điểm Trust Score hoàn lại:
                  <span className="text-hint"> (Mặc định tính theo mức đã phạt trước đó)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="admin-number-input"
                    value={approveRefundPoints}
                    onChange={(e) => setApproveRefundPoints(e.target.value)}
                    placeholder="Điểm hoàn lại (0 - 100)"
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#10b981' }}>+ điểm</span>
                </div>
                <p className="admin-field-helper">
                  💡 Hệ thống sẽ cộng số điểm này vào điểm hiện tại của người dùng (tối đa 100 điểm) và mở khóa bài đăng công khai.
                </p>
              </div>

              <div className="admin-form-group" style={{ marginTop: 14 }}>
                <label className="admin-form-label">Ghi chú phản hồi cho Môi giới:</label>
                <textarea
                  className="admin-reject-textarea"
                  style={{ height: 80 }}
                  value={approveAdminNote}
                  onChange={(e) => setApproveAdminNote(e.target.value)}
                  placeholder="Nhập ghi chú phản hồi..."
                />
              </div>
            </div>

            <div className="admin-modal-actions">
              <button
                className="admin-btn-cancel"
                onClick={() => { setShowApproveAppealModal(false); setApprovingAppeal(null); }}
                disabled={appealActionLoading}
              >
                Hủy bỏ
              </button>
              <button
                className="admin-btn admin-btn-approve"
                onClick={handleConfirmApproveAppeal}
                disabled={appealActionLoading}
              >
                <Check size={18} />
                <span>{appealActionLoading ? 'Đang xử lý...' : 'Xác nhận Chấp thuận & Hoàn điểm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL TRUST SCORE ADJUSTMENT MODAL */}
      {showAdjustModal && (
        <div className="admin-reject-modal-overlay">
          <div className="admin-adjust-modal">
            <div className="admin-adjust-modal-header">
              <div className="admin-adjust-modal-title">
                <SlidersHorizontal size={22} color="#0284c7" />
                <h3>Điều chỉnh Điểm Uy Tín Thủ Công</h3>
              </div>
              <button
                className="admin-modal-close-btn"
                onClick={() => { setShowAdjustModal(false); setAdjustTargetUser(null); }}
              >
                ✕
              </button>
            </div>

            <div className="admin-adjust-modal-body">
              {/* Target User */}
              <div className="admin-form-group">
                <label className="admin-form-label">Tài khoản áp dụng:</label>
                {adjustTargetUser ? (
                  <div className="adjust-user-selected-pill">
                    <User size={16} />
                    <span className="font-bold">{adjustTargetUser.name || `User #${adjustTargetUser.id}`}</span>
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>({adjustTargetUser.email || `ID: ${adjustTargetUser.id}`})</span>
                    <button
                      type="button"
                      className="adjust-user-change-btn"
                      onClick={() => {
                        setAdjustTargetUser(null);
                        setAdjustTargetEmailInput('');
                        setAdjustTargetUserIdInput('');
                      }}
                    >
                      Đổi tài khoản khác
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <Mail size={15} color="#0284c7" />
                        <span>Email tài khoản (Chính <span style={{ color: '#dc2626' }}>*</span>)</span>
                      </label>
                      <input
                        type="email"
                        className="admin-number-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                        placeholder="Ví dụ: nguyenvana@gmail.com..."
                        value={adjustTargetEmailInput}
                        onChange={(e) => setAdjustTargetEmailInput(e.target.value)}
                      />
                      <p className="admin-field-helper">
                        Nhập địa chỉ Email tài khoản cần điều chỉnh điểm để hệ thống tìm kiếm tự động.
                      </p>
                    </div>

                    <div style={{ paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <User size={13} color="#94a3b8" />
                        <span>Hoặc nhập User ID (Phụ / Tùy chọn nếu không nhớ Email):</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="admin-number-input"
                        style={{ width: '100%', boxSizing: 'border-box' }}
                        placeholder="Ví dụ: 12"
                        value={adjustTargetUserIdInput}
                        onChange={(e) => setAdjustTargetUserIdInput(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Point Type (ADD / SUBTRACT) */}
              <div className="admin-form-group" style={{ marginTop: 14 }}>
                <label className="admin-form-label">Loại điều chỉnh:</label>
                <div className="adjust-type-toggle-group">
                  <button
                    type="button"
                    className={`adjust-type-toggle-btn add ${adjustPointType === 'ADD' ? 'active' : ''}`}
                    onClick={() => setAdjustPointType('ADD')}
                  >
                    <TrendingUp size={16} />
                    <span>Cộng thưởng điểm (+)</span>
                  </button>
                  <button
                    type="button"
                    className={`adjust-type-toggle-btn subtract ${adjustPointType === 'SUBTRACT' ? 'active' : ''}`}
                    onClick={() => setAdjustPointType('SUBTRACT')}
                  >
                    <TrendingDown size={16} />
                    <span>Trừ phạt điểm (-)</span>
                  </button>
                </div>
              </div>

              {/* Point Amount */}
              <div className="admin-form-group" style={{ marginTop: 14 }}>
                <label className="admin-form-label">Số điểm biến động (1 - 100):</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className="admin-number-input"
                    value={adjustPointsAmount}
                    onChange={(e) => setAdjustPointsAmount(e.target.value)}
                  />
                  <div className="adjust-preset-badges">
                    {[5, 10, 15, 20].map((pts) => (
                      <button
                        key={pts}
                        type="button"
                        className="adjust-preset-pill"
                        onClick={() => setAdjustPointsAmount(pts)}
                      >
                        {adjustPointType === 'ADD' ? `+${pts}` : `-${pts}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Reason */}
              <div className="admin-form-group" style={{ marginTop: 14 }}>
                <label className="admin-form-label">
                  Lý do can thiệp <span style={{ color: '#dc2626' }}>*</span>:
                  <span className="text-hint"> (Bắt buộc, tối thiểu 5 ký tự)</span>
                </label>
                <textarea
                  className="admin-reject-textarea"
                  style={{ height: 85 }}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ví dụ: Đền bù lỗi gián đoạn hệ thống; Can thiệp bồi hoàn sau khiếu nại qua điện thoại; Xử phạt hành vi spam..."
                />
              </div>
            </div>

            <div className="admin-modal-actions">
              <button
                className="admin-btn-cancel"
                onClick={() => { setShowAdjustModal(false); setAdjustTargetUser(null); }}
                disabled={adjustLoading}
              >
                Hủy bỏ
              </button>
              <button
                className={`admin-btn ${adjustPointType === 'ADD' ? 'admin-btn-approve' : 'admin-btn-reject'}`}
                onClick={handleSubmitAdjustTrustScore}
                disabled={adjustLoading}
              >
                <SlidersHorizontal size={18} />
                <span>
                  {adjustLoading
                    ? 'Đang thực hiện...'
                    : `Xác nhận ${adjustPointType === 'ADD' ? 'Cộng' : 'Trừ'} ${adjustPointsAmount || 0} điểm`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

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
