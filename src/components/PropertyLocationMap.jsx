import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, ExternalLink, Compass, School, Hospital, ShoppingCart, TreePine, Bus } from 'lucide-react';
import './PropertyLocationMap.css';

const DEFAULT_CENTER = { lat: 10.7769, lng: 106.7009 }; // TP. Hồ Chí Minh

const PropertyLocationMap = ({ property }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [coords, setCoords] = useState(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [activeAmenity, setActiveAmenity] = useState('all');

  // Load Leaflet once from CDN
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
    script.onload = () => setMapLoaded(true);
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

    // Attempt geocoding from address if latitude/longitude is missing
    if (property.address) {
      setIsGeocoding(true);
      const query = encodeURIComponent(property.address);
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1&accept-language=vi`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            setCoords({
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon),
              isExact: false
            });
          } else {
            setCoords({ ...DEFAULT_CENTER, isExact: false, isDefault: true });
          }
        })
        .catch(() => {
          setCoords({ ...DEFAULT_CENTER, isExact: false, isDefault: true });
        })
        .finally(() => {
          setIsGeocoding(false);
        });
    } else {
      setCoords({ ...DEFAULT_CENTER, isExact: false, isDefault: true });
    }
  }, [property?.id, property?.latitude, property?.longitude, property?.address]);

  // Setup Leaflet map when ready
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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Custom pulse marker icon
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

    // Formatted popup
    const popupContent = `
      <div class="map-popup-card">
        ${property.thumbnail ? `<img src="${property.thumbnail}" alt="${property.title || 'BĐS'}" class="popup-thumb" />` : ''}
        <div class="popup-info">
          <h4 class="popup-title">${property.title || 'Vị trí bất động sản'}</h4>
          <p class="popup-address">${property.address || ''}</p>
          <p class="popup-price">${property.price ? property.price.toLocaleString('vi-VN') + ' VNĐ/tháng' : 'Liên hệ'}</p>
        </div>
      </div>
    `;
    marker.bindPopup(popupContent, { maxWidth: 260 }).openPopup();

    // 500m radius circle showing walkable area
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

    // Trigger resize after small delay to fix container sizing in modal
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [mapLoaded, coords]);

  const openGoogleMaps = () => {
    if (!coords) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const amenities = [
    { id: 'all', label: 'Tất cả tiện ích', icon: <Compass size={14} />, distance: '' },
    { id: 'school', label: 'Trường học', icon: <School size={14} />, distance: '~500m' },
    { id: 'hospital', label: 'Bệnh viện', icon: <Hospital size={14} />, distance: '~1.2km' },
    { id: 'market', label: 'Siêu thị / Chợ', icon: <ShoppingCart size={14} />, distance: '~350m' },
    { id: 'park', label: 'Công viên', icon: <TreePine size={14} />, distance: '~700m' },
    { id: 'transit', label: 'Trạm xe bus / Metro', icon: <Bus size={14} />, distance: '~200m' }
  ];

  return (
    <div className="property-location-map-wrapper">
      <div className="location-map-header">
        <div className="location-title-group">
          <div className="map-badge-icon">
            <MapPin size={18} />
          </div>
          <div>
            <h3>Vị trí trên bản đồ & Tiện ích lân cận</h3>
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

      {/* Amenity Filter Badges */}
      <div className="location-amenities-bar">
        {amenities.map(item => (
          <button
            key={item.id}
            className={`amenity-chip-btn ${activeAmenity === item.id ? 'active' : ''}`}
            onClick={() => setActiveAmenity(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.distance && <span className="amenity-dist">{item.distance}</span>}
          </button>
        ))}
      </div>

      {/* Map Display Container */}
      <div className="map-canvas-container">
        {(!mapLoaded || isGeocoding) && (
          <div className="map-loading-overlay">
            <div className="map-spinner"></div>
            <span>Đang tải bản đồ tương tác...</span>
          </div>
        )}
        <div ref={mapContainerRef} className="map-leaflet-box" />

        {coords?.isDefault && (
          <div className="map-approx-notice">
            <MapPin size={12} />
            <span>Vị trí hiển thị mang tính ước lượng theo khu vực</span>
          </div>
        )}
      </div>

      <div className="location-footer-note">
        <span>Bán kính vòng tròn màu xanh biểu thị khu vực đi bộ thuận tiện (500m) xung quanh bất động sản.</span>
      </div>
    </div>
  );
};

export default PropertyLocationMap;
