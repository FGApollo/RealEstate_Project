import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert, AlertTriangle, CheckCircle, XCircle, Clock,
  FileText, Image as ImageIcon, Send, X, ExternalLink, HelpCircle, Scale,
  UploadCloud, Trash2, Loader2, Check
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { apiFetch } from '../../../auth/apiClient';
import './AgentViolations.css';

const REASON_LABELS = {
  'WRONG_PRICE': { label: 'Sai giá niêm yết', penalty: -5, color: '#f59e0b', bg: '#fef3c7' },
  'WRONG_IMAGE': { label: 'Sai hình ảnh thực tế', penalty: -10, color: '#ea580c', bg: '#ffedd5' },
  'WRONG_LOCATION': { label: 'Sai vị trí / Địa chỉ', penalty: -10, color: '#ea580c', bg: '#ffedd5' },
  'DUPLICATE': { label: 'Tin đăng trùng lặp', penalty: -5, color: '#f59e0b', bg: '#fef3c7' },
  'ALREADY_RENTED': { label: 'Đã bán/thuê chưa cập nhật', penalty: -8, color: '#d97706', bg: '#fef3c7' },
  'SCAM': { label: 'Lừa đảo / Gian lận', penalty: -30, color: '#dc2626', bg: '#fee2e2' },
  'OTHER': { label: 'Lý do khác', penalty: 0, color: '#64748b', bg: '#f1f5f9' }
};

const AgentViolations = ({ currentUser }) => {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal & File Upload State
  const fileInputRef = useRef(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [appealReason, setAppealReason] = useState('');
  const [evidenceList, setEvidenceList] = useState([]); // [{ url, name }]
  const [urlInput, setUrlInput] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchViolations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appeals/my-violations`);
      if (res.ok) {
        const data = await res.json();
        setViolations(data.violations || []);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Không thể tải danh sách vi phạm.');
      }
    } catch (err) {
      console.error('Lỗi khi tải vi phạm:', err);
      setError('Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchViolations();
  }, []);

  const handleOpenAppealModal = (report) => {
    setSelectedReport(report);
    setAppealReason('');
    setEvidenceList([]);
    setUrlInput('');
    setUploadingFile(false);
    setUploadError('');
  };

  const handleCloseModal = () => {
    setSelectedReport(null);
    setAppealReason('');
    setEvidenceList([]);
    setUrlInput('');
    setUploadingFile(false);
    setUploadError('');
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (evidenceList.length + files.length > 5) {
      setUploadError(`Bạn chỉ có thể tải lên tối đa 5 hình ảnh (Hiện tại đã có ${evidenceList.length} ảnh).`);
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    for (const f of files) {
      if (!validTypes.includes(f.type)) {
        setUploadError(`File "${f.name}" không đúng định dạng JPG, PNG hoặc WEBP.`);
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        setUploadError(`File "${f.name}" vượt quá dung lượng tối đa 5MB.`);
        return;
      }
    }

    setUploadError('');
    setUploadingFile(true);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('evidenceImages', file);
      });

      const res = await apiFetch(`${API_BASE_URL}/api/appeals/upload-evidence`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.urls && Array.isArray(data.urls)) {
        const newItems = data.urls.map((u, idx) => ({
          url: u,
          name: files[idx]?.name || `Bằng chứng ${evidenceList.length + idx + 1}`
        }));
        setEvidenceList(prev => [...prev, ...newItems]);
      } else if (res.ok && data.url) {
        setEvidenceList(prev => [...prev, { url: data.url, name: files[0]?.name || 'Ảnh bằng chứng' }]);
      } else {
        setUploadError(data.error || 'Tải ảnh lên thất bại. Bạn có thể dán link trực tiếp bên dưới.');
      }
    } catch (err) {
      console.error('Lỗi khi tải ảnh:', err);
      setUploadError('Không thể kết nối đến máy chủ khi tải ảnh.');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveEvidence = (indexToRemove) => {
    setEvidenceList(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAddUrl = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) return;

    if (evidenceList.length >= 5) {
      setUploadError('Bạn chỉ có thể thêm tối đa 5 hình ảnh bằng chứng.');
      return;
    }

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      setUploadError('Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://');
      return;
    }

    setEvidenceList(prev => [...prev, { url: cleanUrl, name: `Link ảnh ${prev.length + 1}` }]);
    setUrlInput('');
    setUploadError('');
  };

  const handleSubmitAppeal = async (e) => {
    e.preventDefault();
    if (!selectedReport || !appealReason.trim()) {
      alert('Vui lòng nhập lý do giải trình chi tiết.');
      return;
    }

    const urls = evidenceList.map(item => item.url);

    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/appeals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          reason: appealReason.trim(),
          evidenceUrls: urls,
          evidenceUrl: urls.length > 0 ? (urls.length === 1 ? urls[0] : JSON.stringify(urls)) : null
        })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Gửi đơn khiếu nại thành công!');
        handleCloseModal();
        fetchViolations();
      } else {
        alert(data.error || 'Gửi đơn khiếu nại thất bại.');
      }
    } catch (err) {
      console.error('Lỗi nộp khiếu nại:', err);
      alert('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  // Stats calculation
  const totalViolations = violations.length;
  const hiddenPropertiesCount = violations.filter(v => v.property?.is_hidden).length;
  const pendingAppealsCount = violations.filter(v => v.appeal?.status === 'PENDING').length;
  const approvedAppealsCount = violations.filter(v => v.appeal?.status === 'APPROVED').length;

  return (
    <div className="agent-violations-container">
      {/* Header */}
      <div className="violations-header">
        <div>
          <h2 className="violations-title">
            <Scale size={24} style={{ color: '#4f46e5' }} /> Lịch sử Vi phạm & Khiếu nại
          </h2>
          <p className="violations-subtitle">
            Theo dõi các báo cáo vi phạm đối với bài đăng của bạn, kiểm tra điểm phạt Trust Score và gửi đơn giải trình nếu bạn bị tố cáo oan.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="violations-stats-grid">
        <div className="v-stat-card">
          <div className="v-stat-icon-wrapper" style={{ backgroundColor: '#eff6ff', color: '#3b82f6' }}>
            <FileText size={20} />
          </div>
          <div className="v-stat-info">
            <span className="v-stat-label">Tổng báo cáo vi phạm</span>
            <span className="v-stat-value">{totalViolations}</span>
          </div>
        </div>

        <div className="v-stat-card">
          <div className="v-stat-icon-wrapper" style={{ backgroundColor: '#fef2f2', color: '#ef4444' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="v-stat-info">
            <span className="v-stat-label">Tin đăng đang bị ẩn</span>
            <span className="v-stat-value" style={{ color: '#dc2626' }}>{hiddenPropertiesCount}</span>
          </div>
        </div>

        <div className="v-stat-card">
          <div className="v-stat-icon-wrapper" style={{ backgroundColor: '#fffbeb', color: '#f59e0b' }}>
            <Clock size={20} />
          </div>
          <div className="v-stat-info">
            <span className="v-stat-label">Khiếu nại chờ duyệt</span>
            <span className="v-stat-value" style={{ color: '#d97706' }}>{pendingAppealsCount}</span>
          </div>
        </div>

        <div className="v-stat-card">
          <div className="v-stat-icon-wrapper" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
            <CheckCircle size={20} />
          </div>
          <div className="v-stat-info">
            <span className="v-stat-label">Kháng cáo thành công</span>
            <span className="v-stat-value" style={{ color: '#16a34a' }}>{approvedAppealsCount}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="violations-content-card">
        {loading ? (
          <div className="violations-loading">Đang tải lịch sử vi phạm...</div>
        ) : error ? (
          <div className="violations-error">{error}</div>
        ) : violations.length === 0 ? (
          <div className="violations-empty">
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 12 }} />
            <h3>Tài khoản hoàn toàn trong sạch!</h3>
            <p>Bạn không có bất kỳ bài đăng nào bị phản ánh vi phạm hoặc bị xử phạt Trust Score.</p>
          </div>
        ) : (
          <div className="violations-list">
            {violations.map((rep) => {
              const reasonInfo = REASON_LABELS[rep.reason] || { label: rep.reason, penalty: 0, color: '#64748b', bg: '#f1f5f9' };
              const appeal = rep.appeal;
              const isResolved = rep.status === 'RESOLVED';

              return (
                <div key={rep.id} className="violation-item-card">
                  {/* Property Info Header */}
                  <div className="v-item-header">
                    <div className="v-property-thumb-container">
                      <img
                        src={rep.property?.thumbnail || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=300'}
                        alt={rep.property?.title}
                        className="v-property-thumb"
                      />
                    </div>
                    <div className="v-property-meta">
                      <h4 className="v-property-title">{rep.property?.title || 'Bài đăng không xác định'}</h4>
                      <div className="v-badges-row">
                        <span className="v-reason-badge" style={{ color: reasonInfo.color, backgroundColor: reasonInfo.bg }}>
                          {reasonInfo.label} ({reasonInfo.penalty}đ)
                        </span>

                        {rep.property?.is_hidden ? (
                          <span className="v-status-badge v-status-hidden">
                            ⛔ Đã bị ẩn khỏi sàn
                          </span>
                        ) : (
                          <span className="v-status-badge v-status-visible">
                            ✓ Đang hiển thị
                          </span>
                        )}

                        <span className="v-date-text">
                          <Clock size={12} /> {new Date(rep.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description of Report */}
                  <div className="v-report-description">
                    <span className="v-label">Nội dung người dùng phản ánh:</span>
                    <p className="v-desc-text">"{rep.description || 'Không có mô tả chi tiết'}"</p>
                  </div>

                  {/* Appeal Status Section */}
                  <div className="v-appeal-section">
                    {!appeal ? (
                      <div className="v-appeal-action-box">
                        <div className="v-appeal-note">
                          <span>Bạn bị trừ điểm hoặc ẩn bài đăng oan? Bạn có thể gửi giải trình kèm bằng chứng để Admin xem xét lại.</span>
                        </div>
                        {isResolved ? (
                          <button
                            className="v-btn-appeal"
                            onClick={() => handleOpenAppealModal(rep)}
                          >
                            <Scale size={16} /> Gửi Khiếu Nại / Kháng Cáo
                          </button>
                        ) : rep.status === 'REJECTED' ? (
                          <span className="v-status-badge v-status-visible">
                            ✓ Tố cáo không chính xác (Admin đã bác bỏ, bạn không bị phạt)
                          </span>
                        ) : (
                          <span className="v-pending-badge">Báo cáo đang chờ Admin xử lý</span>
                        )}
                      </div>
                    ) : appeal.status === 'PENDING' ? (
                      <div className="v-appeal-status-box status-pending">
                        <div className="v-status-header">
                          <Clock size={16} style={{ color: '#d97706' }} />
                          <strong style={{ color: '#d97706' }}>Đơn khiếu nại đang chờ Quản trị viên xem xét</strong>
                        </div>
                        <p className="v-appeal-reason-preview">
                          <strong>Giải trình của bạn:</strong> {appeal.reason}
                        </p>
                        {(() => {
                          const evUrls = appeal.evidence_urls && appeal.evidence_urls.length > 0
                            ? appeal.evidence_urls
                            : (appeal.evidence_url ? (appeal.evidence_url.startsWith('[') ? (() => { try { return JSON.parse(appeal.evidence_url); } catch(e) { return [appeal.evidence_url]; } })() : [appeal.evidence_url]) : []);
                          if (evUrls.length === 0) return null;
                          return (
                            <div className="v-submitted-evidence-box">
                              <span className="v-submitted-label">
                                <ImageIcon size={14} /> Ảnh bằng chứng đã gửi ({evUrls.length} ảnh):
                              </span>
                              <div className="v-submitted-thumbs-row">
                                {evUrls.map((u, i) => (
                                  <a key={i} href={u} target="_blank" rel="noreferrer" className="v-submitted-thumb-item">
                                    <img src={u} alt={`Bằng chứng ${i + 1}`} className="v-submitted-thumb-img" />
                                    <span>Ảnh #{i + 1} <ExternalLink size={10} /></span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ) : appeal.status === 'APPROVED' ? (
                      <div className="v-appeal-status-box status-approved">
                        <div className="v-status-header">
                          <CheckCircle size={16} style={{ color: '#16a34a' }} />
                          <strong style={{ color: '#16a34a' }}>Khiếu nại được CHẤP THUẬN - Đã hoàn lại điểm phạt & mở tin đăng</strong>
                        </div>
                        <p className="v-admin-note-text">
                          <strong>Phản hồi từ Admin:</strong> {appeal.admin_note || 'Admin đã chấp thuận đơn kháng cáo của bạn.'}
                        </p>
                      </div>
                    ) : (
                      <div className="v-appeal-status-box status-rejected">
                        <div className="v-status-header">
                          <XCircle size={16} style={{ color: '#dc2626' }} />
                          <strong style={{ color: '#dc2626' }}>Khiếu nại đã bị BÁC BỎ - Giữ nguyên hình phạt</strong>
                        </div>
                        <p className="v-admin-note-text">
                          <strong>Lý do từ chối:</strong> {appeal.admin_note || 'Bằng chứng không đủ thuyết phục hoặc thông tin sai lệch.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* APPEAL SUBMISSION MODAL */}
      {selectedReport && (
        <div className="v-modal-overlay" onClick={handleCloseModal}>
          <div className="v-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="v-modal-header">
              <div className="v-modal-title-group">
                <Scale size={20} style={{ color: '#4f46e5' }} />
                <h3>Gửi Đơn Khiếu Nại Quyết Định Xử Phạt</h3>
              </div>
              <button className="v-modal-close" onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitAppeal} className="v-modal-body">
              {/* Report Summary */}
              <div className="v-modal-summary">
                <div className="v-summary-row">
                  <span className="v-summary-label">Bài đăng bị phạt:</span>
                  <span className="v-summary-val font-semibold">{selectedReport.property?.title}</span>
                </div>
                <div className="v-summary-row">
                  <span className="v-summary-label">Lý do vi phạm:</span>
                  <span className="v-summary-val" style={{ color: '#ea580c', fontWeight: 600 }}>
                    {REASON_LABELS[selectedReport.reason]?.label} ({REASON_LABELS[selectedReport.reason]?.penalty}đ)
                  </span>
                </div>
              </div>

              {/* Reason Input */}
              <div className="v-form-group">
                <label className="v-form-label">
                  Nội dung giải trình chi tiết <span className="req">*</span>
                </label>
                <textarea
                  className="v-textarea"
                  rows={4}
                  placeholder="Giải thích rõ vì sao quyết định xử phạt này chưa chính xác (ví dụ: khách hiểu nhầm giá cọc với giá thuê, tin đăng đã thỏa thuận trước, bị đối thủ cạnh tranh chơi xấu...)"
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  required
                />
              </div>

              {/* Evidence Upload Section */}
              <div className="v-form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="v-form-label" style={{ margin: 0 }}>
                    Hình ảnh bằng chứng đối chứng (Tối đa 5 ảnh)
                  </label>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: evidenceList.length >= 5 ? '#dc2626' : '#6366f1' }}>
                    {evidenceList.length} / 5 ảnh
                  </span>
                </div>

                {/* Uploaded Images List */}
                {evidenceList.length > 0 && (
                  <div className="v-upload-grid">
                    {evidenceList.map((item, idx) => (
                      <div key={idx} className="v-upload-thumb-card">
                        <img src={item.url} alt={`Bằng chứng ${idx + 1}`} className="v-upload-thumb-img" />
                        <div className="v-upload-thumb-info">
                          <span className="v-upload-thumb-name" title={item.name}>{item.name}</span>
                          <span className="v-upload-thumb-idx">Ảnh #{idx + 1}</span>
                        </div>
                        <button
                          type="button"
                          className="v-upload-thumb-del"
                          onClick={() => handleRemoveEvidence(idx)}
                          title="Xóa ảnh này"
                          disabled={uploadingFile}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dropzone if fewer than 5 */}
                {evidenceList.length < 5 && (
                  <div
                    className="v-upload-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      multiple
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />
                    <div className="v-upload-dropzone-content">
                      <div className="v-upload-icon-circle">
                        {uploadingFile ? (
                          <Loader2 size={24} className="animate-spin text-indigo-600" />
                        ) : (
                          <UploadCloud size={24} className="text-indigo-600" />
                        )}
                      </div>
                      <div className="v-upload-text">
                        <strong>
                          {uploadingFile
                            ? 'Đang tải ảnh lên hệ thống...'
                            : evidenceList.length === 0
                            ? 'Chọn hoặc kéo thả nhiều ảnh bằng chứng cùng lúc'
                            : `+ Chọn thêm ảnh (${5 - evidenceList.length} ảnh còn lại)`}
                        </strong>
                        <span>Hỗ trợ chọn cùng lúc nhiều file JPG, PNG, WEBP (tối đa 5MB/ảnh)</span>
                      </div>
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div className="v-upload-error-msg">
                    <AlertTriangle size={14} />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Alternative URL Input */}
                {evidenceList.length < 5 && (
                  <div className="v-alt-url-toggle">
                    <span className="v-alt-label">Hoặc nhập link URL ảnh trực tiếp:</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="url"
                        className="v-input v-input-sm"
                        placeholder="https://... hoặc link ảnh trực tiếp"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddUrl();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="v-btn-add-url"
                        onClick={handleAddUrl}
                        disabled={!urlInput.trim() || evidenceList.length >= 5}
                      >
                        Thêm
                      </button>
                    </div>
                  </div>
                )}

                <span className="v-input-help">
                  <HelpCircle size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Bạn có thể chọn cùng lúc nhiều ảnh (hợp đồng, hóa đơn/biên lai cọc, ảnh chụp thực tế, tin nhắn trao đổi...) để chứng minh rõ ràng nhất.
                </span>
              </div>

              {/* Modal Actions */}
              <div className="v-modal-actions">
                <button
                  type="button"
                  className="v-btn-cancel"
                  onClick={handleCloseModal}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="v-btn-submit"
                  disabled={submitting || uploadingFile || !appealReason.trim()}
                >
                  {submitting ? 'Đang gửi đơn...' : uploadingFile ? 'Đang tải ảnh...' : (
                    <>
                      <Send size={15} /> Gửi đơn khiếu nại
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentViolations;
