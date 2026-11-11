import { useMemo } from 'react';
import { useAdminAreas } from './adminAreas';
import './AreaSelect.css';

// Chọn khu vực theo đơn vị hành chính mới: Tỉnh/TP rồi Phường/xã. Giá trị là tên đầy đủ (VD "Phường Bình Thạnh").
// Tìm kiếm phía server vẫn khớp được tin cũ ghi theo quận/huyện trước sáp nhập.
const AreaSelect = ({ province, ward, onChange, required = false, allLabel = 'Tất cả', className = '', selectClassName = '' }) => {
  const { provinces, error } = useAdminAreas();
  const current = useMemo(() => provinces.find((item) => item.name === province) || null, [provinces, province]);

  return (
    <div className={`area-select ${className}`.trim()}>
      <select
        className={selectClassName}
        value={province || ''}
        required={required}
        aria-label="Tỉnh/Thành phố"
        disabled={!provinces.length}
        onChange={(event) => onChange({ province: event.target.value, ward: '' })}
      >
        <option value="">{provinces.length ? `${allLabel} tỉnh/thành phố` : (error || 'Đang tải…')}</option>
        {provinces.map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
      </select>
      <select
        className={selectClassName}
        value={ward || ''}
        required={required}
        aria-label="Phường/Xã"
        disabled={!current}
        onChange={(event) => onChange({ province, ward: event.target.value })}
      >
        <option value="">{current ? `${allLabel} phường/xã` : 'Chọn tỉnh/thành phố trước'}</option>
        {(current?.wards || []).map((item) => <option key={item.code} value={item.name}>{item.name}</option>)}
      </select>
    </div>
  );
};

export default AreaSelect;
