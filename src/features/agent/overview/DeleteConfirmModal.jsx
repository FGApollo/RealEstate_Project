import React from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';
import './DeleteConfirmModal.css';

const DeleteConfirmModal = ({ property, onConfirm, onCancel }) => {
  if (!property) return null;

  return (
    <div className="delete-modal-backdrop" onClick={onCancel}>
      <div className="delete-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="delete-modal-close" onClick={onCancel} aria-label="Close">
          <X size={18} />
        </button>

        <div className="delete-modal-header">
          <div className="warning-icon-wrapper">
            <AlertTriangle size={24} color="#dc2626" />
          </div>
          <h3>Xác nhận xóa tin đăng</h3>
        </div>

        <div className="delete-modal-body">
          <p className="warning-text">
            Bạn có chắc chắn muốn xóa tin đăng này? Hành động này không thể hoàn tác.
          </p>

          <div className="delete-property-preview">
            <img 
              src={property.thumbnail || 'https://via.placeholder.com/100'} 
              alt={property.title} 
              className="preview-thumb"
            />
            <div className="preview-info">
              <h4>{property.title}</h4>
              <p className="preview-address">{property.address || `${property.district}, ${property.city}`}</p>
              <p className="preview-price">
                {(property.price || 0).toLocaleString('vi-VN')} VND/tháng
              </p>
            </div>
          </div>
        </div>

        <div className="delete-modal-footer">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Hủy bỏ
          </button>
          <button type="button" className="btn-confirm-delete" onClick={() => onConfirm(property.id)}>
            <Trash2 size={16} />
            Xóa tin đăng
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
