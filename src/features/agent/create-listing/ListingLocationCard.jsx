import { MapPin } from 'lucide-react';
import AreaSelect from '../../location/AreaSelect';

/**
 * Shared Step-1 location card for Create & Edit listing wizards:
 * strictly selects 2025 administrative province/ward via dropdown,
 * optional street address stored only in DB, and optional manual map pin.
 */
const ListingLocationCard = ({ listing, setListing, onClearMapPin }) => (
  <div className="form-card">
    <div className="card-title-header">
      <h2 className="card-title">Địa chỉ</h2>
    </div>
    <div className="input-group">
      <label>Tỉnh / Thành phố · Phường / Xã <small>(đơn vị hành chính mới, từ 1/7/2025)</small></label>
      <AreaSelect
        required
        allLabel="Chọn"
        province={listing.city}
        ward={listing.ward}
        onChange={({ province, ward }) => {
          setListing(prev => ({ ...prev, city: province, ward, district: '' }));
        }}
      />
      {listing.district && (
        <small className="legacy-area-note">Tin này đang ghi theo địa chỉ cũ ({listing.district}). Hãy chọn lại phường/xã mới.</small>
      )}
    </div>
    <div className="input-group">
      <label>Số nhà, tên đường <small>(tuỳ chọn)</small></label>
      <input
        type="text"
        placeholder="Nhập số nhà, tên đường (chỉ lưu DB, không tự định vị bản đồ)"
        value={listing.address_detail}
        onChange={(e) => setListing(prev => ({ ...prev, address_detail: e.target.value }))}
      />
    </div>
    <div className="input-group">
      <label>Vị trí trên bản đồ <small>(tuỳ chọn)</small></label>
      <small className="map-manual-hint">Nhấp lên bản đồ để chấm ghim vị trí bất động sản. Nếu không chấm ghim, tin đăng sẽ không hiển thị bản đồ.</small>
      <div className="map-container-wrapper">
        <div id="listing-map"></div>
        <div className="map-coordinates-badge">
          <MapPin size={14} />
          <span>
            {listing.latitude && listing.longitude
              ? `Toạ độ: ${parseFloat(listing.latitude).toFixed(5)}, ${parseFloat(listing.longitude).toFixed(5)}`
              : 'Chưa chấm vị trí (không tạo bản đồ)'}
          </span>
          {listing.latitude && listing.longitude && (
            <button type="button" className="map-clear-pin-btn" onClick={onClearMapPin}>Xóa ghim</button>
          )}
        </div>
      </div>
    </div>
  </div>
);

export default ListingLocationCard;

