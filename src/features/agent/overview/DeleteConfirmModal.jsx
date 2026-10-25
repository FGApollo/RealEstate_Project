import React, { useState } from 'react';
import { Trash2, X, AlertTriangle } from 'lucide-react';
import './DeleteConfirmModal.css';

const DeleteConfirmModal = ({ property, onConfirm, onCancel }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  if (!property) return null;

  return (
    <div className="delete-modal-backdrop" onClick={onCancel}>
      <div className="delete-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="delete-modal-close" onClick={onCancel} aria-label="Close" disabled={isConfirming}>
          <X size={18} />
        </button>

        <div className="delete-modal-header">
          <div className="warning-icon-wrapper">
            <AlertTriangle size={24} color="#dc2626" />
          </div>
          <h3>Xác nhận gỡ tin đăng</h3>
        </div>

        <div className="delete-modal-body">
          <p className="warning-text">
            Bạn có chắc chắn muốn gỡ tin đăng này? Tin sẽ ngừng hiển thị trên sàn và chuyển sang trạng thái <strong>Đã gỡ</strong>. Bạn có thể xem lại hoặc kích hoạt lại bất kỳ lúc nào.
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
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={isConfirming}>
            Hủy bỏ
          </button>
          <button 
            type="button" 
            className="btn-confirm-delete" 
            disabled={isConfirming} 
            onClick={() => {
              if (isConfirming) return;
              setIsConfirming(true);
              onConfirm(property.id);
            }}
            style={{ opacity: isConfirming ? 0.7 : 1, cursor: isConfirming ? 'not-allowed' : 'pointer' }}
          >
            {isConfirming ? 'Đang xóa...' : (
              <>
                <Trash2 size={16} />
                Xóa tin đăng
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
