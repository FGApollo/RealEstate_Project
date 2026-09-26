import { useState, useEffect } from 'react';
import {
  ShieldCheck, Award, CheckCircle2, AlertCircle, Clock,
  ArrowRight, X, Sparkles, UserCheck, Shield, ChevronRight, RefreshCw
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { apiFetch } from '../../../auth/apiClient';
import { useAuth } from '../../../auth/useAuth';
import './TrustScoreBonusModal.css';

const TrustScoreBonusModal = ({
  isOpen,
  onClose,
  currentUser,
  onScoreUpdated,
  onNavigateToKyc
}) => {
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [notification, setNotification] = useState(null);

  const fetchBonusStatus = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`${API_BASE_URL}/api/trust-score/tasks`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        if (result.trustScore !== undefined && Number(result.trustScore) !== Number(currentUser?.trust_score)) {
          updateUser({ trust_score: result.trustScore });
          if (onScoreUpdated) onScoreUpdated(result.trustScore);
        }
      }
    } catch (err) {
      console.error('Failed to load trust score bonus tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBonusStatus();
      setNotification(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClaimProfileBonus = async () => {
    try {
      setActionLoading('PROFILE_COMPLETED');
      setNotification(null);
      const res = await apiFetch(`${API_BASE_URL}/api/trust-score/profile-completed/check`, {
        method: 'POST'
      });
      const result = await res.json();

      if (res.ok && result.applied) {
        setNotification({
          type: 'success',
          message: `🎉 Chúc mừng! Bạn nhận được +5 điểm tín nhiệm vì đã hoàn thiện hồ sơ!`
        });
        if (result.trustScore !== undefined) {
          updateUser({ trust_score: result.trustScore });
          if (onScoreUpdated) onScoreUpdated(result.trustScore);
        }
        await fetchBonusStatus();
      } else {
        setNotification({
          type: 'info',
          message: result.message || 'Không thể cộng điểm lúc này.'
        });
      }
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.message || 'Lỗi kết nối khi nhận thưởng.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaimThirtyDaysBonus = async () => {
    try {
      setActionLoading('ACCOUNT_30_DAYS_CLEAN');
      setNotification(null);
      const res = await apiFetch(`${API_BASE_URL}/api/trust-score/30-days-clean/check`, {
        method: 'POST'
      });
      const result = await res.json();

      if (res.ok && result.applied) {
        setNotification({
          type: 'success',
          message: `🎉 Chúc mừng! Bạn nhận được +5 điểm tín nhiệm cho mốc 30 ngày uy tín!`
        });
        if (result.trustScore !== undefined) {
          updateUser({ trust_score: result.trustScore });
          if (onScoreUpdated) onScoreUpdated(result.trustScore);
        }
        await fetchBonusStatus();
      } else {
        let msg = result.message || 'Chưa đủ điều kiện nhận thưởng.';
        if (result.message === 'Account has confirmed violations') {
          msg = 'Tài khoản có vi phạm xác nhận chưa được hoàn phạt nên không đủ điều kiện nhận thưởng.';
        } else if (result.message === 'Account is not old enough for this bonus') {
          msg = 'Tài khoản chưa đủ 30 ngày tuổi.';
        }
        setNotification({
          type: 'warning',
          message: msg
        });
      }
    } catch (err) {
      setNotification({
        type: 'error',
        message: err.message || 'Lỗi kết nối khi nhận thưởng.'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const currentScore = data?.trustScore ?? Number(currentUser?.trust_score ?? 50);

  let scoreTier = 'Bình thường';
  let scoreColor = '#6b7280';
  if (currentScore <= 39) {
    scoreTier = 'Rủi ro cao';
    scoreColor = '#dc2626';
  } else if (currentScore <= 59) {
    scoreTier = 'Bình thường';
    scoreColor = '#6b7280';
  } else if (currentScore <= 79) {
    scoreTier = 'Đáng tin cậy';
    scoreColor = '#059669';
  } else {
    scoreTier = 'Rất uy tín';
    scoreColor = '#d97706';
  }

  const profileTask = data?.tasks?.find(t => t.id === 'PROFILE_COMPLETED');
  const cleanTask = data?.tasks?.find(t => t.id === 'ACCOUNT_30_DAYS_CLEAN');
  const kycTask = data?.tasks?.find(t => t.id === 'KYC_VERIFIED');

  return (
    <div className="trust-modal-overlay" onClick={onClose}>
      <div className="trust-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="trust-modal-header">
          <div className="trust-modal-title-group">
            <div className="trust-modal-icon-badge">
              <Award size={22} color="#f59e0b" />
            </div>
            <div>
              <h3 className="trust-modal-title">Nhiệm vụ Tích điểm Tín nhiệm</h3>
              <p className="trust-modal-subtitle">Hoàn thành các cột mốc để tăng độ uy tín và tiếp cận nhiều khách hàng hơn</p>
            </div>
          </div>
          <button type="button" className="trust-modal-close-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {/* Current Score Ribbon */}
        <div className="trust-score-ribbon" style={{ borderColor: scoreColor }}>
          <div className="trust-ribbon-left">
            <div className="trust-badge-circle" style={{ backgroundColor: `${scoreColor}15`, color: scoreColor }}>
              <ShieldCheck size={28} />
            </div>
            <div className="trust-ribbon-text">
              <div className="trust-ribbon-label">Điểm tín nhiệm hiện tại</div>
              <div className="trust-ribbon-value">
                <span className="score-num" style={{ color: scoreColor }}>{currentScore}</span>
                <span className="score-max">/100</span>
                <span className="score-tier-badge" style={{ backgroundColor: `${scoreColor}18`, color: scoreColor }}>
                  {scoreTier}
                </span>
              </div>
            </div>
          </div>
          <div className="trust-ribbon-tip">
            {currentScore >= 80 ? '⭐ Bạn đang là Môi giới Rất uy tín!' : '🎯 Tích lũy đủ ≥ 80 điểm để đạt cấp Rất uy tín!'}
          </div>
        </div>

        {/* Notification Alert */}
        {notification && (
          <div className={`trust-notification-banner ${notification.type}`}>
            {notification.type === 'success' && <Sparkles size={18} className="notif-icon" />}
            {notification.type === 'warning' && <AlertCircle size={18} className="notif-icon" />}
            {notification.type === 'error' && <AlertCircle size={18} className="notif-icon" />}
            {notification.type === 'info' && <AlertCircle size={18} className="notif-icon" />}
            <span>{notification.message}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="trust-modal-body">
          {loading ? (
            <div className="trust-modal-loading">
              <RefreshCw size={24} className="spin-icon" />
              <span>Đang tải thông tin nhiệm vụ...</span>
            </div>
          ) : (
            <div className="trust-tasks-list">
              {/* TASK 1: PROFILE COMPLETED */}
              <div className={`trust-task-card ${profileTask?.claimed ? 'claimed' : profileTask?.eligible ? 'eligible' : ''}`}>
                <div className="trust-task-header">
                  <div className="trust-task-icon-wrapper">
                    <UserCheck size={20} />
                  </div>
                  <div className="trust-task-info">
                    <div className="trust-task-title-row">
                      <h4 className="trust-task-title">1. Hoàn thiện hồ sơ cá nhân</h4>
                      <span className="trust-task-points">+5 Điểm</span>
                    </div>
                    <p className="trust-task-desc">
                      Cập nhật đầy đủ Ảnh đại diện, Họ và tên, và Số điện thoại liên hệ.
                    </p>
                    {/* Checklist details */}
                    <div className="trust-task-checklist">
                      <span className={`checklist-item ${profileTask?.progress?.hasAvatar ? 'done' : 'missing'}`}>
                        {profileTask?.progress?.hasAvatar ? '✓ Ảnh đại diện' : '✗ Thiếu ảnh'}
                      </span>
                      <span className={`checklist-item ${profileTask?.progress?.hasName ? 'done' : 'missing'}`}>
                        {profileTask?.progress?.hasName ? '✓ Họ và tên' : '✗ Thiếu tên'}
                      </span>
                      <span className={`checklist-item ${profileTask?.progress?.hasPhone ? 'done' : 'missing'}`}>
                        {profileTask?.progress?.hasPhone ? '✓ Số điện thoại' : '✗ Thiếu SĐT'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="trust-task-action-wrapper">
                  {profileTask?.claimed ? (
                    <div className="trust-claimed-badge">
                      <CheckCircle2 size={16} />
                      <span>Đã nhận thưởng (+5đ)</span>
                    </div>
                  ) : profileTask?.eligible ? (
                    <button
                      type="button"
                      className="trust-claim-btn"
                      onClick={handleClaimProfileBonus}
                      disabled={actionLoading === 'PROFILE_COMPLETED'}
                    >
                      {actionLoading === 'PROFILE_COMPLETED' ? (
                        <>
                          <RefreshCw size={14} className="spin-icon" />
                          <span>Đang nhận...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} />
                          <span>Nhận thưởng (+5đ)</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="trust-incomplete-note">
                      <span>Cần cập nhật đủ 3 thông tin</span>
                    </div>
                  )}
                </div>
              </div>

              {/* TASK 2: 30 DAYS CLEAN */}
              <div className={`trust-task-card ${cleanTask?.claimed ? 'claimed' : cleanTask?.eligible ? 'eligible' : ''}`}>
                <div className="trust-task-header">
                  <div className="trust-task-icon-wrapper">
                    <Shield size={20} />
                  </div>
                  <div className="trust-task-info">
                    <div className="trust-task-title-row">
                      <h4 className="trust-task-title">2. Cột mốc 30 ngày hoạt động uy tín</h4>
                      <span className="trust-task-points">+5 Điểm</span>
                    </div>
                    <p className="trust-task-desc">
                      Tài khoản hoạt động từ 30 ngày trở lên và không có vi phạm xác nhận chưa được hoàn phạt.
                    </p>

                    {/* Progress details */}
                    <div className="clean-task-progress-box">
                      <div className="clean-progress-bar-container">
                        <div
                          className="clean-progress-bar-fill"
                          style={{ width: `${Math.min(100, Math.round(((cleanTask?.progress?.daysActive || 0) / 30) * 100))}%` }}
                        />
                      </div>
                      <div className="clean-progress-text">
                        <span>Đã hoạt động: <strong>{cleanTask?.progress?.daysActive || 0}/30 ngày</strong></span>
                        {(cleanTask?.progress?.daysRemaining || 0) > 0 && (
                          <span className="days-remain">Còn {cleanTask?.progress?.daysRemaining} ngày</span>
                        )}
                      </div>
                    </div>

                    {/* Status note about violations and appeals */}
                    {cleanTask?.progress?.activeViolationsCount > 0 && (
                      <div className="violation-appeal-notice warning">
                        {cleanTask?.progress?.pendingAppealsCount > 0 ? (
                          <>
                            <Clock size={14} />
                            <span>Đang có {cleanTask?.progress?.pendingAppealsCount} đơn khiếu nại chờ Admin duyệt. Bạn sẽ nhận được điểm thưởng khi kháng cáo được chấp thuận.</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} />
                            <span>Tài khoản có vi phạm xác nhận. (Nếu bạn bị báo cáo sai, hãy gửi đơn Khiếu nại để được khôi phục quyền lợi).</span>
                          </>
                        )}
                      </div>
                    )}

                    {cleanTask?.progress?.refundedAppealsCount > 0 && cleanTask?.progress?.activeViolationsCount === 0 && (
                      <div className="violation-appeal-notice success">
                        <CheckCircle2 size={14} />
                        <span>Các khiếu nại trước đây đã được chấp thuận hoàn phạt, tài khoản vẫn đạt tiêu chuẩn trong sạch!</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="trust-task-action-wrapper">
                  {cleanTask?.claimed ? (
                    <div className="trust-claimed-badge">
                      <CheckCircle2 size={16} />
                      <span>Đã nhận thưởng (+5đ)</span>
                    </div>
                  ) : cleanTask?.eligible ? (
                    <button
                      type="button"
                      className="trust-claim-btn"
                      onClick={handleClaimThirtyDaysBonus}
                      disabled={actionLoading === 'ACCOUNT_30_DAYS_CLEAN'}
                    >
                      {actionLoading === 'ACCOUNT_30_DAYS_CLEAN' ? (
                        <>
                          <RefreshCw size={14} className="spin-icon" />
                          <span>Đang nhận...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} />
                          <span>Nhận thưởng (+5đ)</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="trust-incomplete-note">
                      <span>{(cleanTask?.progress?.daysRemaining || 0) > 0 ? `Chưa đủ 30 ngày` : 'Chưa đủ điều kiện'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* TASK 3: KYC VERIFICATION */}
              <div className={`trust-task-card ${kycTask?.claimed ? 'claimed' : ''}`}>
                <div className="trust-task-header">
                  <div className="trust-task-icon-wrapper">
                    <ShieldCheck size={20} />
                  </div>
                  <div className="trust-task-info">
                    <div className="trust-task-title-row">
                      <h4 className="trust-task-title">3. Xác thực định danh môi giới (KYC)</h4>
                      <span className="trust-task-points highlight">+20 Điểm</span>
                    </div>
                    <p className="trust-task-desc">
                      Xác thực căn cước công dân và thông tin hành nghề để nhận huy hiệu Verified Broker uy tín.
                    </p>
                  </div>
                </div>

                <div className="trust-task-action-wrapper">
                  {kycTask?.claimed ? (
                    <div className="trust-claimed-badge">
                      <CheckCircle2 size={16} />
                      <span>Đã xác thực (+20đ)</span>
                    </div>
                  ) : kycTask?.isPending ? (
                    <div className="trust-pending-badge">
                      <Clock size={16} />
                      <span>Đang chờ Admin duyệt</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="trust-action-link-btn"
                      onClick={() => {
                        onClose();
                        if (onNavigateToKyc) onNavigateToKyc();
                      }}
                    >
                      <span>Xác thực ngay</span>
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="trust-modal-footer">
          <div className="trust-footer-tip">
            💡 <em>Lưu ý:</em> Mỗi nhiệm vụ chỉ nhận thưởng 1 lần duy nhất trong suốt vòng đời tài khoản.
          </div>
          <button type="button" className="trust-modal-close-action-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrustScoreBonusModal;
