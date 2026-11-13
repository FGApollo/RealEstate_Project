import { useEffect, useMemo, useRef } from 'react';
import { MapPin, Navigation, ExternalLink, AlertCircle } from 'lucide-react';
import './PropertyLocationMap.css';
import { parsePinnedCoords, useLeafletCdn } from '../features/location/leaflet';

const PropertyLocationMap = ({ property }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const coords = useMemo(
    () => (property ? parsePinnedCoords(property.latitude, property.longitude) : null),
    [property]
  );

  // Chỉ tải Leaflet khi tin đã được chấm tọa độ ghim.
  const { mapLoaded, mapLoadError } = useLeafletCdn(Boolean(coords));

  const propertyThumbnail = property?.thumbnail;
  const propertyTitle = property?.title;
  const propertyAddress = property?.address;
  const propertyPrice = property?.price;
  const propertyListingType = property?.listing_type;

  // Setup Leaflet map when pinned coords exist and Leaflet is ready
  useEffect(() => {
    if (!mapLoaded || !window.L || !coords || !mapContainerRef.current) return;

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

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

    // Popup dựng bằng phần tử DOM + textContent: tiêu đề / địa chỉ do môi giới nhập không bao giờ được hiểu là HTML
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const popupContent = element('div', 'map-popup-card');
    if (propertyThumbnail) {
      const thumb = element('img', 'popup-thumb');
      thumb.src = propertyThumbnail;
      thumb.alt = propertyTitle || 'BĐS';
      popupContent.appendChild(thumb);
    }
    const info = element('div', 'popup-info');
    const price = Number(propertyPrice);
    info.append(
      element('h4', 'popup-title', propertyTitle || 'Vị trí bất động sản'),
      element('p', 'popup-address', propertyAddress || ''),
      element('p', 'popup-price', price > 0
        ? `${price.toLocaleString('vi-VN')} VNĐ${propertyListingType === 'SALE' ? '' : '/tháng'}`
        : 'Liên hệ')
    );
    popupContent.appendChild(info);
    marker.bindPopup(popupContent, { maxWidth: 260 }).openPopup();

    // Vòng 500m đi bộ xung quanh vị trí ghim của căn.
    const circle = L.circle([lat, lng], {
      color: '#3b82f6',
      fillColor: '#60a5fa',
      fillOpacity: 0.12,
      weight: 1.5,
      radius: 500
    }).addTo(map);

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    const resizeTimer = setTimeout(() => {
      if (mapInstanceRef.current === map) map.invalidateSize({ pan: false });
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.off();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapLoaded, coords, propertyThumbnail, propertyTitle, propertyAddress, propertyPrice, propertyListingType]);

  // Ẩn hoàn toàn phần bản đồ khi tin chưa có tọa độ ghim.
  if (!coords) return null;

  const openGoogleMaps = () => {
    const query = `${coords.lat},${coords.lng}`;
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
        ) : !mapLoaded ? (
          <div className="map-loading-overlay">
            <div className="map-spinner"></div>
            <span>Đang tải bản đồ tương tác...</span>
          </div>
        ) : null}

        <div ref={mapContainerRef} className="map-leaflet-box" />
      </div>

      <div className="location-footer-note">
        <span>Bán kính vòng tròn màu xanh biểu thị phạm vi đi bộ 500m xung quanh bất động sản.</span>
      </div>
    </div>
  );
};

export default PropertyLocationMap;



