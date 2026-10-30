import React, { useState } from 'react';
import { X, CheckCircle2, Home, Key, BadgeCheck, Loader2 } from 'lucide-react';
import './PropertyStatusModal.css';

const STATUS_OPTIONS = [
  {
    id: 'AVAILABLE',
    label: 'Đang hiển thị',
    sublabel: 'Mở tìm khách mới trên sàn',
    icon: Home,
    color: '#10b981',
    bg: '#ecfdf5',
    border: '#a7f3d0'
  },
  {
    id: 'RENTED',
    label: 'Đã cho thuê',
    sublabel: 'Đã ký hợp đồng cho thuê',
    icon: Key,
    color: '#3b82f6',
    bg: '#eff6ff',
    border: '#bfdbfe'
  },
  {
    id: 'SOLD',
    label: 'Đã bán',
    sublabel: 'Đã chốt giao dịch chuyển nhượng',
    icon: BadgeCheck,
    color: '#ef4444',
    bg: '#fef2f2',
    border: '#fecaca'
  }
];

const PropertyStatusModal = ({ property, onClose, onConfirm }) => {
  const [selectedStatus, setSelectedStatus] = useState(property?.status || 'AVAILABLE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!property) return null;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(property.id, selectedStatus);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="status-modal-backdrop" onClick={onClose}>
      <div className="status-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="status-modal-close" onClick={onClose} aria-label="Close" disabled={isSubmitting}>
          <X size={18} />
        </button>

        <div className="status-modal-header">
          <div className="status-header-icon-wrap">
            <CheckCircle2 size={24} color="#2563eb" />
          </div>
          <div>
            <h3>Cập nhật trạng thái giao dịch</h3>
            <p className="status-modal-subtitle">Thay đổi trạng thái hiển thị và quản lý kinh doanh của tin đăng</p>
          </div>
        </div>

        <div className="status-property-preview">
          <img 
            src={property.thumbnail || 'https://via.placeholder.com/100'} 
            alt={property.title} 
            className="status-preview-thumb"
          />
          <div className="status-preview-info">
            <h4>{property.title}</h4>
            <p className="status-preview-address">{property.address || `${property.district}, ${property.city}`}</p>
            <p className="status-preview-price">
              {(property.price || 0).toLocaleString('vi-VN')} VND{property.listing_type === 'SALE' ? '' : '/tháng'}
            </p>
          </div>
        </div>

        <div className="status-options-list">
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selectedStatus === opt.id;
            return (
              <div 
                key={opt.id}
                className={`status-option-item ${isSelected ? 'selected' : ''}`}
                style={{
                  borderColor: isSelected ? opt.color : '#e2e8f0',
                  backgroundColor: isSelected ? opt.bg : '#ffffff'
                }}
                onClick={() => setSelectedStatus(opt.id)}
              >
                <div 
                  className="status-opt-icon"
                  style={{ color: opt.color, backgroundColor: opt.border }}
                >
                  <Icon size={20} />
                </div>
                <div className="status-opt-text">
                  <div className="status-opt-title" style={{ color: isSelected ? opt.color : '#1e293b' }}>
                    {opt.label}
                    {property.status === opt.id && (
                      <span className="current-status-tag">Hiện tại</span>
                    )}
                  </div>
                  <div className="status-opt-desc">{opt.sublabel}</div>
                </div>
                <div className={`status-radio-dot ${isSelected ? 'active' : ''}`} style={{ borderColor: isSelected ? opt.color : '#cbd5e1' }}>
                  {isSelected && <div className="status-radio-inner" style={{ backgroundColor: opt.color }} />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="status-modal-footer">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </button>
          <button 
            type="button" 
            className="btn-confirm-status" 
            disabled={isSubmitting || selectedStatus === property.status}
            onClick={handleSubmit}
            style={{ 
              opacity: (isSubmitting || selectedStatus === property.status) ? 0.6 : 1, 
              cursor: (isSubmitting || selectedStatus === property.status) ? 'not-allowed' : 'pointer' 
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              'Lưu thay đổi'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertyStatusModal;
