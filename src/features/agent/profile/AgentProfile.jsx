import { useState, useEffect, useMemo } from 'react';
import { 
  MapPin, Bed, Bath, Maximize, Shield, ShieldCheck, ShieldAlert, 
  Mail, Phone, Plus, SlidersHorizontal, X, Edit3, Trash2, 
  ExternalLink, MessageSquare, Star, Award, Compass, Heart,
  FileText, Lock, TrendingUp, RefreshCw, ThumbsUp, CheckCircle, Upload, AlertCircle,
  Check, ArrowRight, Grid, Info, Sun, Smile, Camera, ArrowLeft, CheckCircle2
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import PropertyDetailModal from '../../../components/PropertyDetailModal';
import DeleteConfirmModal from '../overview/DeleteConfirmModal';
import './AgentProfile.css';

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

const AgentProfile = ({ 
  currentUser, 
  data, 
  onEditProperty, 
  onDeleteProperty, 
  setActiveTab 
}) => {
  const [selectedProfileTab, setSelectedProfileTab] = useState('posts');
  
  // Ward Filtering states (same as buyer page)
  const [selectedWards, setSelectedWards] = useState([]);
  const [tempSelectedWards, setTempSelectedWards] = useState([]);
  const [wardSearchQuery, setWardSearchQuery] = useState('');
  const [showWardListModal, setShowWardListModal] = useState(false);
  const [listModalSearchQuery, setListModalSearchQuery] = useState('');
  const [activeRegionTab, setActiveRegionTab] = useState('TP.HCM');
  const [subTempSelectedWards, setSubTempSelectedWards] = useState([]);

  // Price & Type states
  const [filterPriceSort, setFilterPriceSort] = useState('ALL'); // ALL, low-high, high-low
  const [filterType, setFilterType] = useState('ALL');

  // Preview & Delete states
  const [previewProperty, setPreviewProperty] = useState(null);
  const [deletingProperty, setDeletingProperty] = useState(null);

  // CRM Funnel states
  const [funnelStats, setFunnelStats] = useState({
    AWARENESS: 0,
    CONSIDERATION: 0,
    INTENT: 0,
    ACTION: 0
  });

  // Reviews states
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewRatingFilter, setReviewRatingFilter] = useState('ALL');
  const [reviewMediaFilter, setReviewMediaFilter] = useState('ALL');
  const [appliedReviewRatingFilter, setAppliedReviewRatingFilter] = useState('ALL');
  const [appliedReviewMediaFilter, setAppliedReviewMediaFilter] = useState('ALL');

  // Interactive Reviews states
  const [helpfulCounts, setHelpfulCounts] = useState({});
  const [reviewReplies, setReviewReplies] = useState({});
  const [showReplyInput, setShowReplyInput] = useState({});
  const [replyText, setReplyText] = useState({});

  // KYC States
  const [kycStatus, setKycStatus] = useState(null);
  const [loadingKyc, setLoadingKyc] = useState(false);
  const [kycWizardStep, setKycWizardStep] = useState(0); // 0 = default, 1 = upload card, 2 = selfie, 3 = loading, 4 = success
  const [kycFrontFile, setKycFrontFile] = useState(null);
  const [kycBackFile, setKycBackFile] = useState(null);
  const [kycSelfieFile, setKycSelfieFile] = useState(null);
  const [kycFrontPreview, setKycFrontPreview] = useState(null);
  const [kycBackPreview, setKycBackPreview] = useState(null);
  const [kycSelfiePreview, setKycSelfiePreview] = useState(null);
  const [kycLoadingMsg, setKycLoadingMsg] = useState('');
  const [kycError, setKycError] = useState('');
  const [kycVerificationData, setKycVerificationData] = useState(null);
  const [kycFullName, setKycFullName] = useState(currentUser?.name || 'Nguyễn Văn A');
  const [kycPhone, setKycPhone] = useState(currentUser?.phone || '0982****123');
  const [kycOtp, setKycOtp] = useState('');
  const [kycSubmitting, setKycSubmitting] = useState(false);

  useEffect(() => {
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
    fetchFunnelStats();
  }, [currentUser.id]);

  useEffect(() => {
    if (selectedProfileTab === 'reviews') {
      const fetchReviews = async () => {
        setLoadingReviews(true);
        try {
          const res = await fetch(`${API_BASE_URL}/api/agent/reviews?userId=${currentUser.id}`);
          if (res.ok) {
            const data = await res.json();
            setReviews(data || []);
            
            // Initialize helpful counts
            const counts = {};
            data.forEach((r, idx) => {
              counts[r.id] = idx === 0 ? 12 : idx === 1 ? 5 : 8;
            });
            setHelpfulCounts(counts);
          }
        } catch (err) {
          console.error('Error fetching reviews:', err);
        } finally {
          setLoadingReviews(false);
        }
      };
      fetchReviews();
    }
  }, [selectedProfileTab, currentUser.id]);

  useEffect(() => {
    const fetchKycStatus = async () => {
      setLoadingKyc(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/kyc/status?userId=${currentUser.id}`);
        if (res.ok) {
          const data = await res.json();
          setKycStatus(data);
        }
      } catch (err) {
        console.error('Error fetching KYC status:', err);
      } finally {
        setLoadingKyc(false);
      }
    };
    fetchKycStatus();
  }, [currentUser.id, currentUser.verification_status, kycWizardStep]);

  // Helpers
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        return 'Vừa xong';
      }
      return `${diffHours} giờ trước`;
    }
    if (diffDays < 7) {
      return `${diffDays} ngày trước`;
    }
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) {
      return `${diffWeeks} tuần trước`;
    }
    return date.toLocaleDateString('vi-VN');
  };

  const getReviewerRole = (name) => {
    if (name === 'Courtney Henry') return 'Marketing Coordinator';
    if (name === 'Jerome Bell') return 'Nhà đầu tư cá nhân';
    if (name === 'Albert Flores') return 'Khách thuê căn hộ';
    return 'Người dùng xem tin';
  };

  const handleHelpfulClick = (reviewId) => {
    setHelpfulCounts(prev => ({
      ...prev,
      [reviewId]: (prev[reviewId] || 0) + 1
    }));
  };

  const handleToggleReplyInput = (reviewId) => {
    setShowReplyInput(prev => ({
      ...prev,
      [reviewId]: !prev[reviewId]
    }));
  };

  const handleSendReply = (reviewId) => {
    const text = replyText[reviewId];
    if (!text || !text.trim()) return;

    setReviewReplies(prev => ({
      ...prev,
      [reviewId]: [...(prev[reviewId] || []), {
        id: `reply-${Date.now()}`,
        author: currentUser.name || 'Zân Cao',
        role: 'Broker',
        text: text,
        created_at: new Date().toISOString()
      }]
    }));

    setReplyText(prev => ({
      ...prev,
      [reviewId]: ''
    }));

    setShowReplyInput(prev => ({
      ...prev,
      [reviewId]: false
    }));
  };

  const handleFileChange = (e, side) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (side === 'front') {
        setKycFrontFile(file);
        setKycFrontPreview(reader.result);
      } else if (side === 'back') {
        setKycBackFile(file);
        setKycBackPreview(reader.result);
      } else if (side === 'selfie') {
        setKycSelfieFile(file);
        setKycSelfiePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStartKyc = () => {
    setKycWizardStep(1);
    setKycError('');
  };

  const handleCancelKyc = () => {
    setKycWizardStep(0);
    setKycFrontFile(null);
    setKycBackFile(null);
    setKycSelfieFile(null);
    setKycFrontPreview(null);
    setKycBackPreview(null);
    setKycSelfiePreview(null);
    setKycError('');
  };

  const handleStep1Submit = (e) => {
    if (e) e.preventDefault();
    if (!kycFullName || !kycPhone) {
      setKycError('Vui lòng điền họ tên và số điện thoại');
      return;
    }
    setKycError('');
    setKycWizardStep(2);
  };

  const handleCardSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!kycFrontFile || !kycBackFile) {
      setKycError('Vui lòng chọn cả mặt trước và mặt sau CCCD');
      return;
    }

    setKycSubmitting(true);
    setKycError('');

    try {
      const formData = new FormData();
      formData.append('userId', currentUser.id);
      formData.append('fullName', kycFullName);
      formData.append('phone', kycPhone);
      formData.append('frontImage', kycFrontFile);
      formData.append('backImage', kycBackFile);

      const res = await fetch(`${API_BASE_URL}/api/kyc/upload-card`, {
        method: 'POST',
        body: formData
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Nhận diện CCCD thất bại, vui lòng chụp rõ nét hơn.');
      }

      setKycVerificationData(result.verification || result.data);
      setKycWizardStep(3);
    } catch (err) {
      console.error(err);
      setKycError(err.message);
      setKycWizardStep(2);
    } finally {
      setKycSubmitting(false);
    }
  };

  const handleSelfieSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!kycSelfieFile) {
      setKycError('Vui lòng tải lên ảnh chân dung');
      return;
    }

    setKycSubmitting(true);
    setKycError('');

    try {
      const formData = new FormData();
      formData.append('userId', currentUser.id);
      formData.append('selfieImage', kycSelfieFile);

      const res = await fetch(`${API_BASE_URL}/api/kyc/upload-selfie`, {
        method: 'POST',
        body: formData
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Khuôn mặt không khớp với ảnh CCCD, vui lòng chụp lại.');
      }

      setKycWizardStep(4);
      setKycStatus(prev => ({ ...prev, verificationStatus: 'VERIFIED' }));
      
      if (typeof window !== 'undefined') {
        const localUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        localUser.verification_status = 'VERIFIED';
        localStorage.setItem('currentUser', JSON.stringify(localUser));
      }
    } catch (err) {
      console.error(err);
      setKycError(err.message);
      setKycWizardStep(3);
    } finally {
      setKycSubmitting(false);
    }
  };


  const handleApplyReviewFilters = () => {
    setAppliedReviewRatingFilter(reviewRatingFilter);
    setAppliedReviewMediaFilter(reviewMediaFilter);
  };

  const handleResetReviewFilters = () => {
    setReviewRatingFilter('ALL');
    setReviewMediaFilter('ALL');
    setAppliedReviewRatingFilter('ALL');
    setAppliedReviewMediaFilter('ALL');
  };

  // Filter reviews
  const filteredReviews = useMemo(() => {
    let result = [...reviews];
    
    // Filter by Rating
    if (appliedReviewRatingFilter !== 'ALL') {
      const ratingVal = parseInt(appliedReviewRatingFilter);
      result = result.filter(r => r.rating === ratingVal);
    }
    
    // Filter by Media
    if (appliedReviewMediaFilter !== 'ALL') {
      if (appliedReviewMediaFilter === 'MEDIA') {
        result = result.filter(r => r.images && r.images.length > 0);
      } else {
        result = result.filter(r => !r.images || r.images.length === 0);
      }
    }
    
    return result;
  }, [reviews, appliedReviewRatingFilter, appliedReviewMediaFilter]);

  // Calculate review stats
  const averageRating = useMemo(() => {
    if (reviews.length === 0) return '0.0';
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

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

  // Apply filters
  const [appliedWards, setAppliedWards] = useState([]);
  const [appliedType, setAppliedType] = useState('ALL');
  const [appliedPriceSort, setAppliedPriceSort] = useState('ALL');

  const handleApplyFilter = () => {
    setAppliedWards([...tempSelectedWards]);
    setAppliedType(filterType);
    setAppliedPriceSort(filterPriceSort);
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

  // Filter and sort listings
  const filteredListings = useMemo(() => {
    let result = [...(data.activeListings || [])];

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

    // Sort by Price
    if (appliedPriceSort === 'low-high') {
      result.sort((a, b) => a.price - b.price);
    } else if (appliedPriceSort === 'high-low') {
      result.sort((a, b) => b.price - a.price);
    }

    return result;
  }, [data.activeListings, appliedWards, appliedType, appliedPriceSort]);

  const formatPrice = (price) => {
    if (!price || price === 0) return 'Liên hệ';
    const billion = 1000000000;
    const million = 1000000;
    
    if (price >= billion) {
      return `${(price / billion).toFixed(1).replace('.0', '')} tỷ`;
    }
    if (price >= million) {
      return `${(price / million).toFixed(1).replace('.0', '')} triệu`;
    }
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
  };

  const maskPhone = (phone) => {
    if (!phone) return '0347******';
    if (phone.length <= 4) return phone + '******';
    return phone.slice(0, 4) + '******';
  };

  return (
    <div className="agent-profile-view">
      {/* 1. AGENT INFO HEADER CARD */}
      <div className="agent-profile-header-card">
        <div className="avatar-section">
          <div className="profile-avatar-container">
            <img 
              src={currentUser.avatar || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&q=80"} 
              alt={currentUser.name} 
              className="profile-avatar-img"
            />
            {currentUser.verification_status === 'VERIFIED' && (
              <div className="avatar-verified-badge" title="Verified Broker">
                <ShieldCheck size={20} fill="#10b981" color="#ffffff" strokeWidth={2.5} />
              </div>
            )}
          </div>
          
          <div className="agent-text-details">
            <div className="name-role-row">
              <h2 className="agent-profile-name">{currentUser.name || 'Zân Cao'}</h2>
              <span className="role-chip">Saler</span>
            </div>
            
            <div className="location-row">
              <MapPin size={16} color="#64748b" />
              <span>Hồ Chí Minh City, VN</span>
            </div>

            <div className="contact-details-grid">
              <div className="contact-item">
                <Mail size={16} color="#64748b" />
                <span>{currentUser.email || 'Zancao@gmail.com'}</span>
              </div>
              <div className="contact-item">
                <Phone size={16} color="#64748b" />
                <span>{maskPhone(currentUser.phone)}</span>
              </div>
            </div>
          </div>
        </div>

        {(() => {
          const score = currentUser.trust_score !== undefined ? Number(currentUser.trust_score) : 98;
          let trustText = 'Rất uy tín';
          let trustColor = '#d97706'; // gold
          if (score <= 39) {
            trustText = 'Rủi ro cao';
            trustColor = '#dc2626'; // red
          } else if (score <= 59) {
            trustText = 'Bình thường';
            trustColor = '#6b7280'; // grey
          } else if (score <= 79) {
            trustText = 'Đáng tin';
            trustColor = '#10b981'; // green
          }
          return (
            <div className="verification-score-card" style={{ borderLeft: `4px solid ${trustColor}` }}>
              <div className="score-icon-wrapper">
                <ShieldCheck size={28} color={trustColor} strokeWidth={2} />
              </div>
              <div className="score-texts">
                <div className="status-label">
                  Status: <span className="highlight">{currentUser.verification_status === 'VERIFIED' ? 'Verified Broker' : 'Unverified Broker'}</span>
                </div>
                <div className="score-label">
                  Trust Score: <span style={{ color: trustColor, fontWeight: 'bold' }}>{score}/100</span> <span style={{ fontSize: '12px', color: '#64748b' }}>({trustText})</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 2. SUB NAVIGATION TABS */}
      <div className="profile-tabs-nav">
        <button 
          className={`profile-tab-btn ${selectedProfileTab === 'posts' ? 'active' : ''}`}
          onClick={() => setSelectedProfileTab('posts')}
        >
          Bài đã đăng
        </button>
        <button 
          className={`profile-tab-btn ${selectedProfileTab === 'crm' ? 'active' : ''}`}
          onClick={() => setSelectedProfileTab('crm')}
        >
          CRM
        </button>
        <button 
          className={`profile-tab-btn ${selectedProfileTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setSelectedProfileTab('reviews')}
        >
          Đánh giá
        </button>
        <button 
          className={`profile-tab-btn ${selectedProfileTab === 'kyc' ? 'active' : ''}`}
          onClick={() => setSelectedProfileTab('kyc')}
        >
          Thông tin định danh
        </button>
      </div>

      {/* 3. TABS CONTENT */}
      <div className="profile-tab-content">
        
        {/* TAB 1: BÀI ĐÃ ĐĂNG */}
        {selectedProfileTab === 'posts' && (
          <div className="posts-tab-container">
            {/* Filter Section */}
            <div className="profile-filter-section">
              {/* Khu vực (Ward) */}
              <div className="filter-column ward-column">
                <span className="filter-label">Khu vực</span>
                <div className="ward-search-input-group">
                  <div className="ward-search-input-wrapper">
                    <input 
                      type="text" 
                      placeholder="Tìm phường..." 
                      value={wardSearchQuery} 
                      onChange={(e) => setWardSearchQuery(e.target.value)} 
                    />
                    {wardSearchQuery && (
                      <button className="clear-search-btn" onClick={() => setWardSearchQuery('')}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <button className="btn-select-ward-list" onClick={handleOpenWardListModal}>
                    Chọn từ danh sách
                  </button>
                </div>

                {/* Suggestions List */}
                {suggestedWards.length > 0 && (
                  <ul className="ward-dropdown-suggestions">
                    {suggestedWards.map((ward) => (
                      <li key={ward} onClick={() => handleSelectWard(ward)}>
                        {ward}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Selected Ward Badges */}
                {tempSelectedWards.length > 0 && (
                  <div className="filter-ward-badges">
                    {tempSelectedWards.map((ward) => (
                      <span key={ward} className="ward-badge">
                        {ward}
                        <button onClick={() => handleRemoveTempWard(ward)}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Khoảng giá (Price Sort) */}
              <div className="filter-column">
                <span className="filter-label">Khoảng giá</span>
                <select value={filterPriceSort} onChange={(e) => setFilterPriceSort(e.target.value)}>
                  <option value="ALL">Tất cả mức giá</option>
                  <option value="low-high">Từ thấp đến cao</option>
                  <option value="high-low">Từ cao đến thấp</option>
                </select>
              </div>

              {/* Loại phòng (Type) */}
              <div className="filter-column">
                <span className="filter-label">Loại phòng</span>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="ALL">Tất cả loại hình</option>
                  <option value="Phòng Trọ">Phòng trọ</option>
                  <option value="Chung Cư">Chung cư</option>
                  <option value="Căn Hộ">Căn hộ</option>
                  <option value="Nhà Ở">Nhà ở</option>
                  <option value="Mặt Bằng">Mặt bằng</option>
                </select>
              </div>

              {/* Filter Buttons */}
              <div className="filter-actions-column">
                <button className="btn-apply-filters" onClick={handleApplyFilter}>
                  <SlidersHorizontal size={14} /> Áp dụng lọc
                </button>
                <button className="btn-reset-filters" onClick={handleResetFilter} title="Xóa bộ lọc">
                  ↺
                </button>
              </div>
            </div>

            {/* Properties Grid */}
            <div className="profile-listings-grid">
              {/* Create new listing card */}
              <div 
                className="property-item-card dashed-create-card"
                onClick={() => setActiveTab('create-listing')}
              >
                <div className="dashed-create-content">
                  <div className="dashed-plus-icon">
                    <Plus size={32} />
                  </div>
                  <h3>Đăng tin mới</h3>
                  <p>Bắt đầu thu hút người thuê nhà ngay hôm nay</p>
                </div>
              </div>

              {/* Property cards */}
              {filteredListings.map((listing) => (
                <div key={listing.id} className="property-item-card real-property-card">
                  <img 
                    src={listing.thumbnail || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80'} 
                    alt={listing.title} 
                    className="property-card-img"
                  />

                  {/* Verification Badge */}
                  <div className="property-card-badge-verified">
                    ĐÃ XÁC THỰC
                  </div>

                  {/* Property Actions Overlays */}
                  <div className="card-actions-overlay">
                    <button 
                      className="card-action-btn" 
                      title="Xem chi tiết"
                      onClick={() => setPreviewProperty(listing)}
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button 
                      className="card-action-btn" 
                      title="Chỉnh sửa"
                      onClick={() => onEditProperty && onEditProperty(listing.id)}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      className="card-action-btn danger" 
                      title="Xoá tin đăng"
                      onClick={() => setDeletingProperty(listing)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Bottom Info Gradient */}
                  <div className="property-card-overlay">
                    <h3 className="property-card-title">{listing.title}</h3>
                    
                    <div className="property-card-address-row">
                      <MapPin size={12} />
                      <span>{listing.ward ? `${listing.ward}, ${listing.district || ''}` : (listing.address || 'Hồ Chí Minh City')}</span>
                    </div>

                    <div className="property-card-footer">
                      <div className="property-card-price">
                        <span className="price-amount">{formatPrice(listing.price)}</span>
                        <span className="price-unit">/tháng</span>
                      </div>
                      
                      <div className="property-card-specs">
                        <span className="spec-item"><Bed size={12} /> {listing.bedrooms || 0}</span>
                        <span className="spec-item"><Bath size={12} /> {listing.bathrooms || 0}</span>
                        <span className="spec-item"><Maximize size={12} /> {listing.area || 0}m²</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredListings.length === 0 && (
              <div className="empty-listings-state">
                <p>Không tìm thấy tin đăng nào phù hợp với bộ lọc.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CRM FUNNEL */}
        {selectedProfileTab === 'crm' && (() => {
          const total = funnelStats.AWARENESS + funnelStats.CONSIDERATION + funnelStats.INTENT + funnelStats.ACTION;
          const maxVal = Math.max(1, funnelStats.AWARENESS, funnelStats.CONSIDERATION, funnelStats.INTENT, funnelStats.ACTION);
          
          const stages = [
            { key: 'AWARENESS', label: 'Nhận biết & Quan tâm', desc: 'Khách hàng mới nhắn tin, tìm hiểu thông tin', color: '#6366f1' },
            { key: 'CONSIDERATION', label: 'Cân nhắc', desc: 'Khách hàng so sánh, cân nhắc kỹ lưỡng', color: '#f59e0b' },
            { key: 'INTENT', label: 'Ý định / Thương lượng', desc: 'Khách hàng thương lượng giá, đàm phán hợp đồng', color: '#2563eb' },
            { key: 'ACTION', label: 'Hành động / Chốt', desc: 'Khách hàng đã ký hợp đồng chốt giao dịch', color: '#10b981' }
          ];

          return (
            <div className="crm-tab-container">
              <div className="crm-summary-info">
                <h3>Phễu phân loại khách hàng (CRM Funnel)</h3>
                <p>Theo dõi tiến độ chuyển đổi của khách hàng từ tin nhắn đầu tiên đến giao dịch thành công.</p>
              </div>

              <div className="crm-funnel-stages">
                {stages.map((stage) => {
                  const count = funnelStats[stage.key] || 0;
                  const pctWidth = maxVal > 0 ? Math.max(25, (count / maxVal) * 100) : 25;
                  
                  return (
                    <div key={stage.key} className="crm-funnel-row">
                      <div className="crm-stage-label">
                        <span className="stage-name">{stage.label}</span>
                        <span className="stage-desc">{stage.desc}</span>
                      </div>
                      <div className="crm-bar-outer">
                        <div 
                          className="crm-bar-inner"
                          style={{ 
                            width: `${pctWidth}%`,
                            backgroundColor: stage.color
                          }}
                        >
                          <span className="crm-count">{count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="crm-summary-cards">
                <div className="summary-card">
                  <span>Tổng khách hàng</span>
                  <h4>{total}</h4>
                </div>
                <div className="summary-card">
                  <span>Tỷ lệ chốt</span>
                  <h4>{total > 0 ? ((funnelStats.ACTION / total) * 100).toFixed(1) : '0.0'}%</h4>
                </div>
                <div className="summary-card">
                  <span>Mức độ tiềm năng</span>
                  <h4>{total > 0 ? (((funnelStats.INTENT + funnelStats.ACTION) / total) * 100).toFixed(1) : '0.0'}%</h4>
                </div>
              </div>
            </div>
          );
        })()}

        {/* TAB 3: REVIEWS */}
        {selectedProfileTab === 'reviews' && (
          <div className="reviews-tab-container">
            <h3>Đánh giá từ khách hàng</h3>
            <p className="subtitle">Xem phản hồi từ khách thuê về chất lượng phòng và dịch vụ của bạn.</p>
            
            {loadingReviews ? (
              <p className="loading-text">Đang tải đánh giá...</p>
            ) : reviews.length === 0 ? (
              <div className="empty-reviews-state">
                <Star size={40} color="#cbd5e1" />
                <p>Chưa có đánh giá nào cho bất động sản của bạn.</p>
              </div>
            ) : (
              <div className="reviews-tab-grid">
                {/* Left Card: Summary */}
                <div className="reviews-summary-side-card">
                  <div className="summary-title">Tổng quan đánh giá</div>
                  <div className="rating-huge-row">
                    <span className="rating-huge-val">{averageRating}</span>
                    <div className="rating-huge-stars">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          size={18} 
                          fill={i < Math.round(parseFloat(averageRating)) ? "#f59e0b" : "none"} 
                          color={i < Math.round(parseFloat(averageRating)) ? "#f59e0b" : "#cbd5e1"} 
                        />
                      ))}
                    </div>
                  </div>
                  <div className="summary-desc">Dựa trên {reviews.length} đánh giá</div>
                  {(() => {
                    const score = currentUser.trust_score !== undefined ? Number(currentUser.trust_score) : 98;
                    let text = 'Rất uy tín';
                    let color = '#d97706'; // gold
                    if (score <= 39) {
                      text = 'Rủi ro cao';
                      color = '#dc2626'; // red
                    } else if (score <= 59) {
                      text = 'Bình thường';
                      color = '#6b7280'; // grey
                    } else if (score <= 79) {
                      text = 'Đáng tin';
                      color = '#10b981'; // green
                    }
                    return (
                      <div className="trust-badge-banner" style={{ borderColor: color, backgroundColor: `${color}0b` }}>
                        <ShieldCheck size={16} color={color} />
                        <span style={{ color }}>TRẠNG THÁI: {text}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Right Area: Filters and List */}
                <div className="reviews-list-area">
                  <div className="reviews-filter-bar">
                    <div className="filter-group-item">
                      <label>Đánh giá</label>
                      <select 
                        value={reviewRatingFilter} 
                        onChange={(e) => setReviewRatingFilter(e.target.value)}
                      >
                        <option value="ALL">Tất cả đánh giá</option>
                        <option value="5">5 Sao</option>
                        <option value="4">4 Sao</option>
                        <option value="3">3 Sao</option>
                        <option value="2">2 Sao</option>
                        <option value="1">1 Sao</option>
                      </select>
                    </div>

                    <div className="filter-group-item">
                      <label>Hình Ảnh/ Video</label>
                      <select 
                        value={reviewMediaFilter} 
                        onChange={(e) => setReviewMediaFilter(e.target.value)}
                      >
                        <option value="ALL">Tất cả đánh giá</option>
                        <option value="MEDIA">Đánh giá chứa hình ảnh/ video</option>
                        <option value="NO_MEDIA">Đánh giá không chứa hình ảnh/ video</option>
                      </select>
                    </div>

                    <button className="btn-apply-review-filters" onClick={handleApplyReviewFilters}>
                      Áp dụng lọc
                    </button>
                    <button className="btn-reset-review-filters" onClick={handleResetReviewFilters} title="Thiết lập lại">
                      <RefreshCw size={16} />
                    </button>
                  </div>

                  {filteredReviews.length === 0 ? (
                    <div className="empty-reviews-state">
                      <p>Không tìm thấy đánh giá nào phù hợp với bộ lọc.</p>
                    </div>
                  ) : (
                    <div className="reviews-list">
                      {filteredReviews.map((rev) => {
                        const hasImage = rev.images && rev.images.length > 0;
                        const initialLetter = rev.user?.name ? rev.user.name.charAt(0).toUpperCase() : 'U';
                        
                        return (
                          <div key={rev.id} className="profile-review-card">
                            <div className="review-card-header">
                              <div className="reviewer-info">
                                <div className={`reviewer-avatar initials-${initialLetter}`}>
                                  {initialLetter}
                                </div>
                                <div className="reviewer-meta-text">
                                  <h4>{rev.user?.name || 'Khách hàng'}</h4>
                                  <span className="reviewer-role-time">
                                    {getReviewerRole(rev.user?.name)} · {formatTimeAgo(rev.created_at)}
                                  </span>
                                </div>
                              </div>
                              <div className="review-rating">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star 
                                    key={i} 
                                    size={14} 
                                    fill={i < rev.rating ? "#f59e0b" : "none"} 
                                    color={i < rev.rating ? "#f59e0b" : "#cbd5e1"} 
                                  />
                                ))}
                              </div>
                            </div>
                            
                            <div className="reviewed-property-title">
                              Tin đăng: <strong>{rev.propertyTitle}</strong>
                            </div>

                            <p className="review-comment">{rev.comment}</p>

                            {hasImage && (
                              <div className="review-images-row">
                                {rev.images.map((img, idx) => (
                                  <img 
                                    key={idx} 
                                    src={img.image_url.startsWith('http') ? img.image_url : `${API_BASE_URL}${img.image_url}`} 
                                    alt="Review thumbnail" 
                                    className="review-thumb-img" 
                                  />
                                ))}
                              </div>
                            )}

                            <div className="review-card-footer">
                              <button 
                                className="action-btn helpful-btn" 
                                onClick={() => handleHelpfulClick(rev.id)}
                              >
                                <ThumbsUp size={14} />
                                <span>Hữu ích ({helpfulCounts[rev.id] || 0})</span>
                              </button>
                              <button 
                                className="action-btn reply-btn"
                                onClick={() => handleToggleReplyInput(rev.id)}
                              >
                                <MessageSquare size={14} />
                                <span>Phản hồi</span>
                              </button>
                            </div>

                            {/* Replies List */}
                            {reviewReplies[rev.id] && reviewReplies[rev.id].length > 0 && (
                              <div className="review-replies-list">
                                {reviewReplies[rev.id].map((reply) => (
                                  <div key={reply.id} className="review-reply-item">
                                    <div className="reply-header">
                                      <span className="reply-author">{reply.author}</span>
                                      <span className="reply-badge">Tác giả</span>
                                      <span className="reply-time">· {formatTimeAgo(reply.created_at)}</span>
                                    </div>
                                    <p className="reply-text">{reply.text}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Reply Input Box */}
                            {showReplyInput[rev.id] && (
                              <div className="review-reply-input-box">
                                <textarea
                                  placeholder="Nhập phản hồi của bạn..."
                                  value={replyText[rev.id] || ''}
                                  onChange={(e) => setReplyText(prev => ({ ...prev, [rev.id]: e.target.value }))}
                                />
                                <div className="reply-actions">
                                  <button 
                                    className="btn-cancel-reply" 
                                    onClick={() => handleToggleReplyInput(rev.id)}
                                  >
                                    Hủy
                                  </button>
                                  <button 
                                    className="btn-submit-reply" 
                                    onClick={() => handleSendReply(rev.id)}
                                  >
                                    Gửi
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: THÔNG TIN ĐỊNH DANH */}
        {selectedProfileTab === 'kyc' && (
          <div className="kyc-tab-container">
            {loadingKyc ? (
              <p className="loading-text">Đang tải trạng thái xác minh...</p>
            ) : kycStatus?.verificationStatus === 'VERIFIED' || kycWizardStep === 4 ? (
              /* SCREEN 4: SUCCESS / VERIFIED STATE */
              <div className="kyc-s4-container">
                <div className="kyc-s4-banner">
                  <div className="s4-check-badge">
                    <CheckCircle2 size={52} color="#10b981" />
                  </div>
                  <h2 className="s4-title">Xác minh tài khoản thành công!</h2>
                  <p className="s4-desc">
                    Chúc mừng! Tài khoản của bạn đã được xác minh. Bạn hiện đã sở hữu huy hiệu "Verified" và có thể tận hưởng đầy đủ các đặc quyền và tăng mức độ uy tín.
                  </p>
                </div>

                <div className="kyc-tab-grid">
                  <div className="kyc-main-panel">
                    <div className="kyc-info-card">
                      <div className="kyc-card-header">
                        <FileText size={20} color="#2563eb" />
                        <h4>Thông tin định danh</h4>
                      </div>

                      <div className="kyc-details-grid">
                        <div className="kyc-field">
                          <span className="kyc-field-label">HỌ VÀ TÊN</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.fullName || kycVerificationData?.full_name || kycFullName || 'CAO THANH VÂN'}</span>
                        </div>
                        <div className="kyc-field">
                          <span className="kyc-field-label">SỐ CCCD</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.idNumber || kycVerificationData?.id_number || '012345678910'}</span>
                        </div>
                        <div className="kyc-field">
                          <span className="kyc-field-label">NGÀY SINH</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.dob || '15/05/1985'}</span>
                        </div>
                        <div className="kyc-field">
                          <span className="kyc-field-label">GIỚI TÍNH</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.sex || 'Nữ'}</span>
                        </div>
                        <div className="kyc-field full-width">
                          <span className="kyc-field-label">QUÊ QUÁN</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.placeOfOrigin || 'P. Sài Gòn, TP. Hồ Chí Minh'}</span>
                        </div>
                        <div className="kyc-field full-width">
                          <span className="kyc-field-label">NƠI THƯỜNG TRÚ</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.placeOfResidence || '49 Bùi Thị Xuân, P. Sài Gòn, TP. Hồ Chí Minh'}</span>
                        </div>
                        <div className="kyc-field">
                          <span className="kyc-field-label">NGÀY CẤP</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.issueDate || '20/10/2021'}</span>
                        </div>
                        <div className="kyc-field">
                          <span className="kyc-field-label">NƠI CẤP</span>
                          <span className="kyc-field-value">{kycStatus?.kycDetails?.issuePlace || 'Cục Cảnh sát QLHC về TTXH'}</span>
                        </div>
                      </div>

                      <div className="s4-footer-actions">
                        <button type="button" className="btn-s4-home" onClick={() => window.location.href = '/'}>
                          Về Trang Chủ <ArrowRight size={16} />
                        </button>
                        <button type="button" className="btn-s4-manage" onClick={() => setSelectedProfileTab('properties')}>
                          <Grid size={16} /> Quản lý tin đăng
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="kyc-privileges-panel">
                    <div className="kyc-privileges-card">
                      <h4>Đặc quyền cho tài khoản đã xác minh</h4>
                      <div className="privilege-list">
                        <div className="privilege-item">
                          <div className="priv-icon-box green">
                            <ShieldCheck size={18} color="#10b981" />
                          </div>
                          <div className="priv-text">
                            <h5>Huy hiệu "Verified"</h5>
                            <p>Huy hiệu uy tín xuất hiện trên mọi tin đăng và hồ sơ cá nhân của bạn.</p>
                          </div>
                        </div>
                        <div className="privilege-item">
                          <div className="priv-icon-box blue">
                            <TrendingUp size={18} color="#2563eb" />
                          </div>
                          <div className="priv-text">
                            <h5>Ưu tiên hiển thị</h5>
                            <p>Tin đăng của bạn được ưu tiên hiển thị cao hơn 40% so với tài khoản thường.</p>
                          </div>
                        </div>
                        <div className="privilege-item">
                          <div className="priv-icon-box teal">
                            <Lock size={18} color="#0d9488" />
                          </div>
                          <div className="priv-text">
                            <h5>Tăng độ tin cậy</h5>
                            <p>Khách hàng tin tưởng hơn vào các thông tin đã qua kiểm duyệt định danh.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="s4-security-box">
                      Lưu ý: Mọi thông tin định danh của bạn được bảo mật tuyệt đối theo tiêu chuẩn mã hóa AES-256.
                    </div>
                  </div>
                </div>
              </div>
            ) : kycWizardStep > 0 ? (
              /* SCREENS 1, 2, 3: WARD FLOW WITH STEPPER */
              <div className="kyc-wizard-container">
                <div className="kyc-wizard-header">
                  <h2 className="kyc-wizard-main-title">Xác thực tài khoản</h2>
                  <p className="kyc-wizard-sub-title">Hoàn tất các thông tin bên dưới để xác minh tài khoản, tăng độ uy tín trong giao dịch</p>

                  <div className="kyc-stepper-bar">
                    <div className={`stepper-step ${kycWizardStep >= 1 ? 'active' : ''} ${kycWizardStep > 1 ? 'completed' : ''}`}>
                      <div className="step-circle">{kycWizardStep > 1 ? <Check size={16} strokeWidth={3} /> : '1'}</div>
                      <span className="step-label">THÔNG TIN CƠ BẢN</span>
                    </div>
                    <div className={`step-line ${kycWizardStep > 1 ? 'completed' : ''}`} />
                    <div className={`stepper-step ${kycWizardStep >= 2 ? 'active' : ''} ${kycWizardStep > 2 ? 'completed' : ''}`}>
                      <div className="step-circle">{kycWizardStep > 2 ? <Check size={16} strokeWidth={3} /> : '2'}</div>
                      <span className="step-label">XÁC THỰC CĂN CƯỚC</span>
                    </div>
                    <div className={`step-line ${kycWizardStep > 2 ? 'completed' : ''}`} />
                    <div className={`stepper-step ${kycWizardStep >= 3 ? 'active' : ''} ${kycWizardStep > 3 ? 'completed' : ''}`}>
                      <div className="step-circle">{kycWizardStep > 3 ? <Check size={16} strokeWidth={3} /> : '3'}</div>
                      <span className="step-label">XÁC THỰC KHUÔN MẶT</span>
                    </div>
                  </div>
                </div>

                <div className="kyc-tab-grid">
                  <div className="kyc-main-panel">
                    {kycError && <div className="kyc-error-banner"><AlertCircle size={16} /> {kycError}</div>}

                    {kycWizardStep === 1 && (
                      <form onSubmit={handleStep1Submit} className="kyc-wizard-form-box">
                        <div className="kyc-step-card">
                          <h4 className="step-card-heading">Thông tin cơ bản</h4>
                          <div className="step-input-group">
                            <label>HỌ VÀ TÊN</label>
                            <input 
                              type="text" 
                              placeholder="VD: Nguyễn Văn A" 
                              value={kycFullName} 
                              onChange={(e) => setKycFullName(e.target.value)} 
                            />
                          </div>
                          <div className="step-input-group mt-4">
                            <label>SỐ ĐIỆN THOẠI</label>
                            <input 
                              type="text" 
                              placeholder="VD: 0982****123" 
                              value={kycPhone} 
                              onChange={(e) => setKycPhone(e.target.value)} 
                            />
                          </div>
                        </div>

                        <div className="kyc-step-card mt-5">
                          <h4 className="step-card-heading">Xác minh số điện thoại</h4>
                          <p className="step-phone-hint">
                            Vui lòng nhập mã OTP được gửi qua số điện thoại <strong className="text-blue-600">{kycPhone || '0982****123'}</strong> để được xác minh, nếu chưa nhận được mã: <button type="button" className="btn-link-resend">Gửi lại</button>
                          </p>
                          <div className="step-input-group mt-3">
                            <label>MÃ OTP</label>
                            <input 
                              type="text" 
                              placeholder="Nhập mã OTP..." 
                              value={kycOtp} 
                              onChange={(e) => setKycOtp(e.target.value)} 
                            />
                          </div>
                        </div>

                        <div className="wizard-actions-right">
                          <button type="submit" className="btn-wizard-next">
                            Tiếp theo <ArrowRight size={16} />
                          </button>
                        </div>
                      </form>
                    )}

                    {kycWizardStep === 2 && (
                      <form onSubmit={handleCardSubmit} className="kyc-wizard-form-box">
                        <div className="kyc-step-card">
                          <div className="s2-card-top">
                            <FileText size={20} color="#2563eb" />
                            <h4>Tải lên hình ảnh CCCD</h4>
                          </div>

                          <div className="s2-upload-grid">
                            <div className="s2-upload-item">
                              <span className="s2-upload-title">Mặt trước</span>
                              <label className="s2-upload-zone">
                                <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'front')} style={{ display: 'none' }} />
                                {kycFrontPreview ? (
                                  <img src={kycFrontPreview} alt="Mặt trước CCCD" className="preview-img" />
                                ) : (
                                  <div className="dropzone-content">
                                    <Upload size={32} color="#94a3b8" />
                                    <span>Drag & drop front of ID or <strong className="browse-link">browse</strong></span>
                                  </div>
                                )}
                              </label>
                            </div>

                            <div className="s2-upload-item">
                              <span className="s2-upload-title">Mặt sau</span>
                              <label className="s2-upload-zone">
                                <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'back')} style={{ display: 'none' }} />
                                {kycBackPreview ? (
                                  <img src={kycBackPreview} alt="Mặt sau CCCD" className="preview-img" />
                                ) : (
                                  <div className="dropzone-content">
                                    <Upload size={32} color="#94a3b8" />
                                    <span>Drag & drop back of ID or <strong className="browse-link">browse</strong></span>
                                  </div>
                                )}
                              </label>
                            </div>
                          </div>

                          <div className="s2-tips-box">
                            <div className="s2-tips-header">💡 MẸO ĐỂ ĐĂNG TẢI HÌNH ẢNH DỄ DÀNG</div>
                            <div className="s2-tips-grid">
                              <div className="s2-tip-item"><Sun size={15} color="#059669" /> Đảm bảo ánh sáng tự nhiên tốt</div>
                              <div className="s2-tip-item"><Maximize size={15} color="#059669" /> Đặt tài liệu vào trong khung sao cho nhìn thấy được tất cả các cạnh.</div>
                              <div className="s2-tip-item"><CheckCircle size={15} color="#059669" /> Văn bản phải sắc nét và rõ ràng, không bị chói hay mờ nhòe.</div>
                              <div className="s2-tip-item"><ShieldCheck size={15} color="#059669" /> Tài liệu phải là bản gốc, hợp lệ và còn hiệu lực.</div>
                            </div>
                          </div>
                        </div>

                        <div className="wizard-actions-right">
                          <button type="button" className="btn-wizard-back" onClick={() => setKycWizardStep(1)}>
                            <ArrowLeft size={16} /> Quay lại
                          </button>
                          <button type="submit" className="btn-wizard-next" disabled={!kycFrontFile || !kycBackFile || kycSubmitting}>
                            {kycSubmitting ? 'Đang xử lý...' : 'Tiếp theo'} <ArrowRight size={16} />
                          </button>
                        </div>
                      </form>
                    )}

                    {kycWizardStep === 3 && (
                      <form onSubmit={handleSelfieSubmit} className="kyc-wizard-form-box">
                        <div className="kyc-step-card">
                          <h4 className="step-card-heading">Xác thực khuôn mặt</h4>
                          <p className="step-card-sub">Vui lòng đưa khuôn mặt của bạn vào khung hình và giữ yên để hệ thống tự động nhận diện.</p>

                          <div className="s3-camera-wrapper">
                            <div className="s3-oval-frame">
                              <input type="file" id="selfie-upload-input" accept="image/*" onChange={(e) => handleFileChange(e, 'selfie')} style={{ display: 'none' }} />
                              {kycSelfiePreview ? (
                                <img src={kycSelfiePreview} alt="Selfie preview" className="s3-preview-img" />
                              ) : (
                                <div className="s3-oval-inner"></div>
                              )}
                              <div className="oval-dot top"></div>
                              <div className="oval-dot bottom"></div>
                            </div>

                            <label htmlFor="selfie-upload-input" className="btn-capture-photo">
                              <div className="icon-blue-circle">
                                <Camera size={22} color="#ffffff" />
                              </div>
                              <span>Nhấn để chụp ảnh</span>
                            </label>
                          </div>
                        </div>

                        <div className="wizard-actions-right">
                          <button type="button" className="btn-wizard-back" onClick={() => setKycWizardStep(2)}>
                            <ArrowLeft size={16} /> Quay lại
                          </button>
                          <button type="submit" className="btn-wizard-next" disabled={!kycSelfieFile || kycSubmitting}>
                            {kycSubmitting ? 'Đang đối sánh...' : 'Tiếp theo'} <ArrowRight size={16} />
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                  <div className="kyc-privileges-panel">
                    <div className="kyc-status-side-card">
                      <div className="status-shield-wrapper">
                        <ShieldCheck size={36} color="#059669" />
                      </div>
                      <h4>Tình trạng xác thực</h4>
                      <p>Hãy hoàn tất các bước này để nhận huy hiệu xác thực và tạo dựng lòng tin với khách hàng.</p>
                      
                      <div className="status-progress-container">
                        <div className="status-progress-labels">
                          <span>QUÁ TRÌNH XÁC THỰC</span>
                          <span>{kycWizardStep === 1 ? '0%' : kycWizardStep === 2 ? '33%' : '66%'}</span>
                        </div>
                        <div className="status-progress-track">
                          <div 
                            className="status-progress-bar" 
                            style={{ width: kycWizardStep === 1 ? '0%' : kycWizardStep === 2 ? '33%' : '66%' }}
                          />
                        </div>
                      </div>
                    </div>

                    {kycWizardStep === 3 && (
                      <div className="kyc-photo-tips-card">
                        <div className="photo-tips-header">
                          <Info size={18} color="#2563eb" />
                          <h5>Lưu ý khi chụp ảnh</h5>
                        </div>
                        <div className="photo-tips-list">
                          <div className="photo-tip-item">
                            <div className="tip-icon"><Maximize size={16} color="#2563eb" /></div>
                            <div className="tip-text">
                              <strong>Căn chỉnh khuôn mặt</strong>
                              <span>Giữ khuôn mặt thẳng, khớp với khung hình oval trung tâm.</span>
                            </div>
                          </div>
                          <div className="photo-tip-item">
                            <div className="tip-icon"><Sun size={16} color="#2563eb" /></div>
                            <div className="tip-text">
                              <strong>Ánh sáng đầy đủ</strong>
                              <span>Tránh ngược sáng hoặc quá tối. Ánh sáng tự nhiên là tốt nhất.</span>
                            </div>
                          </div>
                          <div className="photo-tip-item">
                            <div className="tip-icon"><Smile size={16} color="#2563eb" /></div>
                            <div className="tip-text">
                              <strong>Không phụ kiện</strong>
                              <span>Vui lòng tháo kính râm, mũ hoặc khẩu trang để nhận diện rõ nét.</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* SCREEN 0: UNVERIFIED PROMPT */
              <div className="kyc-unverified-wrapper">
                <div className="kyc-header-standard">
                  <h3>Xác thực tài khoản</h3>
                  <p className="subtitle">Hoàn tất các thông tin bên dưới để xác minh tài khoản, tăng độ uy tín trong giao dịch</p>
                </div>

                <div className="kyc-tab-grid">
                  <div className="kyc-main-panel">
                    <div className="kyc-unverified-card">
                      <div className="warning-icon-wrapper">
                        <ShieldAlert size={36} color="#f97316" />
                      </div>
                      <p className="unverified-text">
                        Để bảo vệ cộng đồng Swipe Nest và trải nghiệm đầy đủ các tính năng độc quyền, vui lòng hoàn tất xác thực danh tính.
                      </p>
                      <button className="btn-trigger-kyc" onClick={handleStartKyc}>
                        Xác thực ngay
                      </button>
                      <span className="kyc-secure-note">🛡️ Xác thực an toàn theo chuẩn AES-256</span>
                      <h4 className="unverified-status-title">Tài khoản chưa được xác minh</h4>
                    </div>
                  </div>

                  <div className="kyc-privileges-panel">
                    <div className="kyc-privileges-card">
                      <h4>Đặc quyền cho tài khoản đã xác minh</h4>
                      
                      <div className="privilege-list">
                        <div className="privilege-item">
                          <div className="priv-icon-box green">
                            <ShieldCheck size={18} color="#10b981" />
                          </div>
                          <div className="priv-text">
                            <h5>Huy hiệu "Verified"</h5>
                            <p>Huy hiệu uy tín xuất hiện trên mọi tin đăng và hồ sơ cá nhân của bạn.</p>
                          </div>
                        </div>

                        <div className="privilege-item">
                          <div className="priv-icon-box blue">
                            <TrendingUp size={18} color="#2563eb" />
                          </div>
                          <div className="priv-text">
                            <h5>Ưu tiên hiển thị</h5>
                            <p>Tin đăng của bạn được ưu tiên hiển thị cao hơn 40% so với tài khoản thường.</p>
                          </div>
                        </div>

                        <div className="privilege-item">
                          <div className="priv-icon-box teal">
                            <Lock size={18} color="#0d9488" />
                          </div>
                          <div className="priv-text">
                            <h5>Tăng độ tin cậy</h5>
                            <p>Khách hàng tin tưởng hơn vào các thông tin đã qua kiểm duyệt định danh.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="priv-footer-security">
                      *Lưu ý: Mọi thông tin định danh của bạn được bảo mật tuyệt đối theo tiêu chuẩn mã hóa AES-256.*
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. MODALS (PORTAL-LIKE) */}
      {previewProperty && (
        <PropertyDetailModal 
          property={previewProperty} 
          onClose={() => setPreviewProperty(null)} 
          showFavoriteActions={false}
        />
      )}

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

export default AgentProfile;
