import { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, ExternalLink, AlertCircle } from 'lucide-react';
import './PropertyLocationMap.css';
import { API_BASE_URL } from '../config';
import { publicApiFetch } from '../auth/apiClient';

const DEFAULT_CENTER = { lat: 10.7769, lng: 106.7009 }; // TP. Hồ Chí Minh

const PropertyLocationMap = ({ property }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapLoadError, setMapLoadError] = useState(false);
  const [coords, setCoords] = useState(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Load Leaflet once from CDN with error handling
  useEffect(() => {
    if (window.L) {
      setMapLoaded(true);
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => {
      setMapLoaded(true);
      setMapLoadError(false);
    };
    script.onerror = () => {
      console.error('Failed to load Leaflet CDN');
      setMapLoadError(true);
    };
    document.body.appendChild(script);
  }, []);

  // Determine coordinates: from property or geocoding
  useEffect(() => {
    if (!property) return;

    const propLat = parseFloat(property.latitude);
    const propLng = parseFloat(property.longitude);

    if (!isNaN(propLat) && !isNaN(propLng) && propLat !== 0 && propLng !== 0) {
      setCoords({ lat: propLat, lng: propLng, isExact: true });
      return;
    }

    // Tin chưa có tọa độ: tra vị trí GẦN ĐÚNG theo khu vực, từ chi tiết tới tổng quát (phường -> quận -> tỉnh).
    // Không bao giờ cắm ghim như vị trí thật; không tra được thì báo "chưa có vị trí" thay vì đặt ghim giữa TP.HCM.
    const queries = [
      [property.ward, property.district, property.city],
      [property.district, property.city],
      [property.city]
    ].map((parts) => parts.filter(Boolean).join(', ')).filter((query, index, list) => query && list.indexOf(query) === index);
    if (!queries.length && property.address) queries.push(property.address);
    if (!queries.length) {
      setCoords({ ...DEFAULT_CENTER, isExact: false, isDefault: true });
      return;
    }
    let cancelled = false;
    setIsGeocoding(true);
    (async () => {
      for (const [level, query] of queries.entries()) {
        try {
          const res = await publicApiFetch(`${API_BASE_URL}/api/geocode/search?q=${encodeURIComponent(query)}&limit=1`);
          const data = await res.json();
          if (cancelled) return;
          if (Array.isArray(data) && data.length > 0) {
            // level 0 = phường, 1 = quận/huyện, 2 = tỉnh: càng tổng quát vòng khu vực càng lớn.
            setCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), isExact: false, approxRadius: [1200, 3000, 12000][level] || 3000 });
            return;
          }
        } catch { /* thử mức tổng quát hơn */ }
      }
      if (!cancelled) setCoords({ ...DEFAULT_CENTER, isExact: false, isDefault: true });
    })().finally(() => { if (!cancelled) setIsGeocoding(false); });
    return () => { cancelled = true; };
  }, [property?.id, property?.latitude, property?.longitude, property?.address]);

  // Setup Leaflet map when ready
  useEffect(() => {
    if (!mapLoaded || !window.L || !coords || coords.isDefault || !mapContainerRef.current) return;

    const L = window.L;
    const { lat, lng } = coords;

    // Cleanup previous map instance if re-initializing
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true
    }).setView([lat, lng], 15);

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20
    }).addTo(map);

    // Custom pulse marker icon for main property
    const customIcon = L.divIcon({
      className: 'leaflet-property-custom-pin',
      html: `
        <div class="pin-marker-pulse"></div>
        <div class="pin-marker-core">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 36],
      popupAnchor: [0, -36]
    });

    // Chỉ cắm ghim khi tin có tọa độ thật; vị trí tra theo khu vực chỉ khoanh vùng.
    const marker = coords.isExact ? L.marker([lat, lng], { icon: customIcon }).addTo(map) : null;

    // Popup dựng bằng phần tử DOM + textContent: tiêu đề / địa chỉ do môi giới nhập không bao giờ được hiểu là HTML
    // (trước đây chèn chuỗi vào innerHTML, tiêu đề chứa thẻ <img onerror> sẽ chạy mã trên trình duyệt người xem).
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const popupContent = element('div', 'map-popup-card');
    if (property.thumbnail) {
      const thumb = element('img', 'popup-thumb');
      thumb.src = property.thumbnail;
      thumb.alt = property.title || 'BĐS';
      popupContent.appendChild(thumb);
    }
    const info = element('div', 'popup-info');
    const price = Number(property.price);
    info.append(
      element('h4', 'popup-title', property.title || 'Vị trí bất động sản'),
      element('p', 'popup-address', property.address || ''),
      element('p', 'popup-price', price > 0
        ? `${price.toLocaleString('vi-VN')} VNĐ${property.listing_type === 'SALE' ? '' : '/tháng'}`
        : 'Liên hệ')
    );
    popupContent.appendChild(info);
    if (marker) marker.bindPopup(popupContent, { maxWidth: 260 }).openPopup();

    // Tọa độ thật: vòng 500m đi bộ quanh căn. Vị trí gần đúng: vòng khu vực (nét đứt), phóng vừa khu vực.
    const circle = L.circle([lat, lng], {
      color: coords.isExact ? '#3b82f6' : '#d97706',
      fillColor: coords.isExact ? '#60a5fa' : '#fbbf24',
      fillOpacity: coords.isExact ? 0.12 : 0.1,
      weight: 1.5,
      dashArray: coords.isExact ? null : '6 6',
      radius: coords.isExact ? 500 : coords.approxRadius || 1500
    }).addTo(map);
    if (!coords.isExact) map.fitBounds(circle.getBounds(), { padding: [12, 12] });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    // Trigger resize after small delay to fix container sizing in modal.
    // The timer must be cleared on unmount: closing the modal within 250ms would otherwise
    // call invalidateSize on a removed map (Leaflet throws "_leaflet_pos" of undefined).
    const resizeTimer = setTimeout(() => {
      if (mapInstanceRef.current === map) map.invalidateSize({ pan: false });
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
      if (mapInstanceRef.current) {
        // Stop pending pan/zoom animations (popup autoPan) before tearing the map down.
        mapInstanceRef.current.stop();
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapLoaded, coords]);

  const openGoogleMaps = () => {
    // Không có tọa độ thật thì tìm theo địa chỉ khu vực, tránh chỉ đường tới một điểm đoán.
    const query = coords?.isExact ? `${coords.lat},${coords.lng}` : (property?.address || '');
    if (!query) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="property-location-map-wrapper">
      <div className="location-map-header">
        <div className="location-title-group">
          <div className="map-badge-icon">
            <MapPin size={18} />
          </div>
          <div>
            <h3>Vị trí bất động sản</h3>
            <p className="location-sub-address">
              {property?.address || 'Đang cập nhật địa chỉ...'}
            </p>
          </div>
        </div>

        <button 
          className="google-maps-btn"
          onClick={openGoogleMaps}
          title="Mở trên Google Maps"
        >
          <Navigation size={14} />
          <span>Chỉ đường Google Maps</span>
          <ExternalLink size={12} />
        </button>
      </div>

      {/* Map Display Container */}
      <div className="map-canvas-container">
        {mapLoadError ? (
          <div className="map-loading-overlay" style={{ backgroundColor: '#fef2f2', color: '#991b1b' }}>
            <AlertCircle size={24} color="#dc2626" />
            <span>Không thể kết nối dịch vụ bản đồ vệ tinh. Bạn có thể mở trực tiếp trên Google Maps.</span>
            <button 
              className="google-maps-btn" 
              style={{ marginTop: '8px' }} 
              onClick={openGoogleMaps}
            >
              Mở vị trí trên Google Maps
            </button>
          </div>
        ) : (!mapLoaded || isGeocoding) ? (
          <div className="map-loading-overlay">
            <div className="map-spinner"></div>
            <span>Đang tải bản đồ tương tác...</span>
          </div>
        ) : null}

        <div ref={mapContainerRef} className="map-leaflet-box" />

        {coords?.isDefault && !isGeocoding && (
          <div className="map-loading-overlay">
            <MapPin size={22} />
            <span>Người đăng chưa ghim vị trí và chưa xác định được khu vực trên bản đồ.</span>
          </div>
        )}
        {coords && !coords.isExact && !coords.isDefault && (
          <div className="map-approx-notice">
            <MapPin size={12} />
            <span>Vị trí gần đúng theo khu vực — người đăng chưa ghim vị trí chính xác</span>
          </div>
        )}
      </div>

      <div className="location-footer-note">
        <span>{coords?.isExact
          ? 'Bán kính vòng tròn màu xanh biểu thị phạm vi đi bộ 500m xung quanh bất động sản.'
          : 'Vùng nét đứt là khu vực của tin đăng, không phải vị trí chính xác của căn.'}</span>
      </div>
    </div>
  );
};

export default PropertyLocationMap;


