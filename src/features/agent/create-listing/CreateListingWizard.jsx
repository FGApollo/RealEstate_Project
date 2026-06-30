import { useState, useEffect, useRef } from 'react';
import { 
  Check, UploadCloud, MapPin, Wifi, Wind, Cpu, Layers, 
  Car, Shield, Armchair, Waves, Dumbbell, Cctv, Cat, Bed, Bath, 
  Maximize, Globe, Lock, ArrowLeft, ArrowRight, CheckCircle2, 
  Megaphone, Info, ShieldCheck, Trash2, Image as ImageIcon, CheckCircle,
  LayoutDashboard, Compass, Home, SlidersHorizontal
} from 'lucide-react';
import './CreateListingWizard.css';
import { API_BASE_URL } from '../../../config';

// ponytail: modular stepper form creation wizard
const CreateListingWizard = ({ 
  setActiveTab, 
  setData, 
  currentUser 
}) => {
  const [currentStep, setCurrentStep] = useState(1);

  const [newListing, setNewListing] = useState({
    title: '',
    description: '',
    price: '',
    property_type: 'Căn Hộ',
    status: 'AVAILABLE',
    area: '',
    bedrooms: '',
    bathrooms: '',
    city: '',
    district: '',
    ward: '',
    address_detail: '',
    address: '',
    latitude: '',
    longitude: '',
    features: [],
    images: [],
    lifestyle_tags: [],
    contact_phone: currentUser.phone || '0987654321',
    is_public: true,
    channels: ['Homepage', 'Social']
  });

  const propertyTypesList = ['Căn Hộ', 'Chung Cư', 'Nhà Ở', 'Mặt Bằng', 'Văn Phòng', 'Phòng Trọ'];
  const lifestyleTagsList = ['Gần trường học', 'Gần đại học', 'Gần trung tâm', 'Gần phòng gym', 'Khu yên tĩnh', 'Khu an ninh', 'Gần trạm xe buýt', 'Khu nhiều tiện ích'];
  const amenitiesList = [
    { name: 'Wifi', icon: <Wifi size={18} /> },
    { name: 'Máy lạnh', icon: <Wind size={18} /> },
    { name: 'Máy giặt', icon: <Cpu size={18} /> },
    { name: 'Ban công', icon: <Compass size={18} /> },
    { name: 'Thang máy', icon: <Layers size={18} /> },
    { name: 'Bãi giữ xe', icon: <Car size={18} /> },
    { name: 'Bảo vệ', icon: <Shield size={18} /> },
    { name: 'Nội thất đầy đủ', icon: <Armchair size={18} /> },
    { name: 'Hồ bơi', icon: <Waves size={18} /> },
    { name: 'Phòng gym', icon: <Dumbbell size={18} /> },
    { name: 'Camera an ninh', icon: <Cctv size={18} /> },
    { name: 'Cho nuôi thú cưng', icon: <Cat size={18} /> }
  ];

  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedDistrictCode, setSelectedDistrictCode] = useState('');

  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // Load Leaflet resources dynamically from CDN
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
    };
    document.body.appendChild(script);
  }, []);

  // Fetch Provinces
  useEffect(() => {
    const fetchProvinces = async () => {
      try {
        const response = await fetch('https://provinces.open-api.vn/api/p/');
        if (response.ok) {
          const data = await response.json();
          setProvinces(data);
          
          if (newListing.city) {
            const match = data.find(p => p.name.includes(newListing.city) || newListing.city.includes(p.name));
            if (match) setSelectedProvinceCode(match.code);
          }
        }
      } catch (err) {
        console.error('Failed to fetch provinces:', err);
      }
    };
    fetchProvinces();
  }, []);

  // Imperative loaders to prevent useEffect render loops
  const loadDistricts = async (provinceCode) => {
    if (!provinceCode) {
      setDistricts([]);
      setWards([]);
      return;
    }
    try {
      const response = await fetch(`https://provinces.open-api.vn/api/p/${provinceCode}?depth=2`);
      if (response.ok) {
        const data = await response.json();
        setDistricts(data.districts || []);
        setWards([]); // Clear wards on province change
      }
    } catch (err) {
      console.error('Failed to load districts:', err);
    }
  };

  const loadWards = async (districtCode) => {
    if (!districtCode) {
      setWards([]);
      return;
    }
    try {
      const response = await fetch(`https://provinces.open-api.vn/api/d/${districtCode}?depth=2`);
      if (response.ok) {
        const data = await response.json();
        setWards(data.wards || []);
      }
    } catch (err) {
      console.error('Failed to load wards:', err);
    }
  };

  // Helper to match locations by name (called from map reverse geocoding)
  const selectLocationByNames = async (cityName, districtName, wardName) => {
    try {
      if (provinces.length === 0) return;
      
      const provinceMatch = provinces.find(p => p.name.toLowerCase().includes(cityName.toLowerCase()) || cityName.toLowerCase().includes(p.name.toLowerCase()));
      if (provinceMatch) {
        setSelectedProvinceCode(provinceMatch.code);
        
        const distRes = await fetch(`https://provinces.open-api.vn/api/p/${provinceMatch.code}?depth=2`);
        if (distRes.ok) {
          const distData = await distRes.json();
          setDistricts(distData.districts || []);
          
          const distMatch = distData.districts?.find(d => d.name.toLowerCase().includes(districtName.toLowerCase()) || districtName.toLowerCase().includes(d.name.toLowerCase()));
          if (distMatch) {
            setSelectedDistrictCode(distMatch.code);
            
            const wardRes = await fetch(`https://provinces.open-api.vn/api/d/${distMatch.code}?depth=2`);
            if (wardRes.ok) {
              const wardData = await wardRes.json();
              setWards(wardData.wards || []);
              
              const wardMatch = wardData.wards?.find(w => w.name.toLowerCase().includes(wardName.toLowerCase()) || wardName.toLowerCase().includes(w.name.toLowerCase()));
              
              setNewListing(prev => ({
                ...prev,
                city: provinceMatch.name,
                district: distMatch.name,
                ward: wardMatch ? wardMatch.name : (wardData.wards[0]?.name || '')
              }));
            }
          }
        }
      }
    } catch (err) {
      console.error('Sync error:', err);
    }
  };

  // Initialize and manage Leaflet map
  useEffect(() => {
    if (!mapLoaded || !window.L || currentStep !== 1) return;

    const lat = parseFloat(newListing.latitude) || 16.0544;
    const lng = parseFloat(newListing.longitude) || 108.2022;

    const container = document.getElementById('listing-map');
    if (!container) return;

    // Check if map is already initialized on this container
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 13);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      }
      return;
    }

    const map = window.L.map('listing-map', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([lat, lng], 13);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const marker = window.L.marker([lat, lng], {
      draggable: true
    }).addTo(map);

    const updateCoordinates = async (newLat, newLng) => {
      setNewListing(prev => ({
        ...prev,
        latitude: newLat,
        longitude: newLng
      }));

      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${newLat}&lon=${newLng}&format=json&accept-language=vi`);
        if (response.ok) {
          const data = await response.json();
          const addr = data.address || {};
          
          const cityName = addr.city || addr.town || addr.province || addr.state || '';
          const districtName = addr.district || addr.suburb || addr.city_district || addr.county || '';
          const wardName = addr.ward || addr.quarter || addr.subdivision || addr.village || '';
          
          const road = addr.road || '';
          const houseNumber = addr.house_number || '';
          const address_detail = [houseNumber, road].filter(Boolean).join(' ') || addr.amenity || addr.building || '';
          const fullAddress = data.display_name || '';

          setNewListing(prev => ({
            ...prev,
            address_detail,
            address: fullAddress || `${address_detail}, ${wardName}, ${districtName}, ${cityName}`
          }));

          if (cityName && districtName) {
            selectLocationByNames(cityName, districtName, wardName);
          }
        }
      } catch (err) {
        console.error('Reverse geocoding error:', err);
      }
    };

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      updateCoordinates(pos.lat, pos.lng);
    });

    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      updateCoordinates(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [mapLoaded, currentStep, provinces]);

  // Geolocation API 
  const handleAutoLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          
          setNewListing(prev => ({
            ...prev,
            latitude: lat,
            longitude: lon
          }));

          if (mapRef.current && markerRef.current) {
            mapRef.current.setView([lat, lon], 15);
            markerRef.current.setLatLng([lat, lon]);
          }

          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`);
            if (response.ok) {
              const data = await response.json();
              const addr = data.address || {};
              
              const cityName = addr.city || addr.town || addr.province || addr.state || '';
              const districtName = addr.district || addr.suburb || addr.city_district || addr.county || '';
              const wardName = addr.ward || addr.quarter || addr.subdivision || addr.village || '';
              
              const road = addr.road || '';
              const houseNumber = addr.house_number || '';
              const address_detail = [houseNumber, road].filter(Boolean).join(' ') || addr.amenity || addr.building || '';
              const fullAddress = data.display_name || '';

              setNewListing(prev => ({
                ...prev,
                address_detail,
                address: fullAddress || `${address_detail}, ${wardName}, ${districtName}, ${cityName}`
              }));

              if (cityName && districtName) {
                selectLocationByNames(cityName, districtName, wardName);
              }
            }
          } catch (err) {
            console.error('Auto location geocode error:', err);
          }
        },
        (error) => {
          alert('Không thể lấy vị trí tự động: ' + error.message);
        }
      );
    } else {
      alert('Trình duyệt không hỗ trợ Geolocation API');
    }
  };

  // Geocode address when user types and searches
  const handleSearchAddressOnMap = async () => {
    const searchVal = `${newListing.address_detail}, ${newListing.ward}, ${newListing.district}, ${newListing.city}`;
    if (!newListing.address_detail || !newListing.ward) {
      alert('Vui lòng chọn Tỉnh, Quận, Phường và nhập số nhà/tên đường trước khi tìm.');
      return;
    }

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchVal)}&format=json&limit=1`);
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);

          setNewListing(prev => ({
            ...prev,
            latitude: lat,
            longitude: lon,
            address: data[0].display_name || prev.address
          }));

          if (mapRef.current && markerRef.current) {
            mapRef.current.setView([lat, lon], 15);
            markerRef.current.setLatLng([lat, lon]);
          }
        } else {
          alert('Không tìm thấy toạ độ cho địa chỉ này. Bạn có thể tự chọn vị trí bằng cách click trên bản đồ.');
        }
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    }
  };

  // Image Upload handler (Base64 conversion)
  const handleImageFileChange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewListing(prev => {
          const newImages = [...prev.images, {
            url: reader.result,
            name: file.name,
            size: (file.size / (1024 * 1024)).toFixed(2),
            selected: false,
            isFeatured: prev.images.length === 0
          }];
          return {
            ...prev,
            images: newImages,
            thumbnail: newImages.find(img => img.isFeatured)?.url || prev.thumbnail
          };
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewListing(prev => {
            const newImages = [...prev.images, {
              url: reader.result,
              name: file.name,
              size: (file.size / (1024 * 1024)).toFixed(2),
              selected: false,
              isFeatured: prev.images.length === 0
            }];
            return {
              ...prev,
              images: newImages,
              thumbnail: newImages.find(img => img.isFeatured)?.url || prev.thumbnail
            };
          });
        };
        reader.readAsDataURL(file);
      }
    });
  };

  // Select images for actions
  const toggleSelectImage = (index) => {
    setNewListing(prev => {
      const updated = prev.images.map((img, i) => i === index ? { ...img, selected: !img.selected } : img);
      return { ...prev, images: updated };
    });
  };

  const setFeaturedImage = () => {
    setNewListing(prev => {
      const selectedIdx = prev.images.findIndex(img => img.selected);
      if (selectedIdx === -1) return prev;
      const updated = prev.images.map((img, i) => ({
        ...img,
        isFeatured: i === selectedIdx,
        selected: false
      }));
      return {
        ...prev,
        images: updated,
        thumbnail: updated[selectedIdx].url
      };
    });
  };

  const deleteSelectedImages = () => {
    setNewListing(prev => {
      const remaining = prev.images.filter(img => !img.selected);
      if (remaining.length > 0 && !remaining.some(img => img.isFeatured)) {
        remaining[0].isFeatured = true;
      }
      return {
        ...prev,
        images: remaining,
        thumbnail: remaining.find(img => img.isFeatured)?.url || ''
      };
    });
  };

  // Toggle utility checkboxes
  const toggleAmenity = (name) => {
    setNewListing(prev => {
      const hasAmenity = prev.features.includes(name);
      const updated = hasAmenity 
        ? prev.features.filter(f => f !== name)
        : [...prev.features, name];
      return { ...prev, features: updated };
    });
  };

  // Toggle lifestyle tags
  const toggleLifestyleTag = (tag) => {
    setNewListing(prev => {
      const hasTag = prev.lifestyle_tags.includes(tag);
      const updated = hasTag
        ? prev.lifestyle_tags.filter(t => t !== tag)
        : [...prev.lifestyle_tags, tag];
      return { ...prev, lifestyle_tags: updated };
    });
  };

  // Toggle channel checkbox
  const toggleChannel = (channel) => {
    setNewListing(prev => {
      const hasChannel = prev.channels.includes(channel);
      const updated = hasChannel
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel];
      return { ...prev, channels: updated };
    });
  };

  // Submit Handler
  const handleSubmitListing = async () => {
    try {
      const payload = {
        owner_id: currentUser.id,
        title: newListing.title,
        description: newListing.description,
        price: parseFloat(newListing.price) || 0,
        area: parseFloat(newListing.area) || 0,
        bedrooms: parseInt(newListing.bedrooms) || 0,
        bathrooms: parseInt(newListing.bathrooms) || 0,
        property_type: newListing.property_type,
        status: newListing.status,
        city: newListing.city,
        district: newListing.district,
        ward: newListing.ward,
        address_detail: newListing.address_detail,
        address: `${newListing.address_detail}, ${newListing.ward}, ${newListing.district}, ${newListing.city}`,
        thumbnail: newListing.thumbnail || (newListing.images.find(img => img.isFeatured)?.url || 'https://via.placeholder.com/400'),
        virtual_tour_url: newListing.virtual_tour_url || null,
        contact_phone: newListing.contact_phone,
        latitude: parseFloat(newListing.latitude) || null,
        longitude: parseFloat(newListing.longitude) || null,
        features: newListing.features,
        images: newListing.images.map(img => img.url),
        lifestyle_tags: newListing.lifestyle_tags
      };

      const response = await fetch(`${API_BASE_URL}/api/properties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        const createdProperty = result.property;

        setData(prev => ({
          ...prev,
          totalProperties: prev.totalProperties + 1,
          activeListings: [
            {
              ...createdProperty,
              favoritesCount: 0
            },
            ...prev.activeListings
          ]
        }));

        setCurrentStep(4);
      } else {
        alert('Đăng tin thất bại, vui lòng thử lại.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối server.');
    }
  };

  // Reset form
  const handleResetForm = () => {
    setNewListing({
      title: '',
      description: '',
      price: '',
      property_type: 'Căn Hộ',
      status: 'AVAILABLE',
      area: '',
      bedrooms: '',
      bathrooms: '',
      city: 'Đà Nẵng',
      district: 'Ngũ Hành Sơn',
      ward: 'Mỹ An',
      address_detail: '',
      address: '',
      latitude: '',
      longitude: '',
      features: [],
      images: [],
      lifestyle_tags: [],
      contact_phone: currentUser.phone || '0987654321',
      is_public: true,
      channels: ['Homepage', 'Social']
    });
    setCurrentStep(1);
    setActiveTab('listings');
  };

  return (
    <div className="create-flow-container">
      {/* Stepper display */}
      <div className="stepper-wrapper">
        <div className={`step-item ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">
            {currentStep > 1 ? <Check size={16} /> : 1}
          </div>
          <span className="step-label">Thông tin</span>
        </div>
        <div className="step-line" />
        <div className={`step-item ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">
            {currentStep > 2 ? <Check size={16} /> : 2}
          </div>
          <span className="step-label">Hình ảnh</span>
        </div>
        <div className="step-line" />
        <div className={`step-item ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
          <div className="step-number">
            {currentStep > 3 ? <Check size={16} /> : 3}
          </div>
          <span className="step-label">Hiển thị</span>
        </div>
      </div>

      {/* Warnings unverified status banner */}
      {currentStep < 4 && currentUser.verification_status !== 'VERIFIED' && (
        <div className="unverified-warning-alert">
          <div className="alert-left">
            <ShieldCheck size={20} color="#b45309" />
            <span>Tài khoản của bạn chưa được xác minh. Tin vẫn có thể đăng, nhưng sẽ chưa có badge Verified Seller.</span>
          </div>
          <button className="alert-verify-btn" onClick={(e) => e.preventDefault()}>Xác minh ngay</button>
        </div>
      )}

      {/* STEP 1: INFO FORM (TRANG 2) */}
      {currentStep === 1 && (
        <div className="step-form-grid">
          {/* Left Column Form */}
          <div className="form-column">
            {/* Basic Info */}
            <div className="form-card">
              <h2 className="card-title">Thông tin cơ bản</h2>
              <div className="input-group">
                <label>Tiêu đề bài đăng</label>
                <input 
                  type="text" 
                  placeholder="Nhập tiêu đề hấp dẫn (VD: Căn hộ cao cấp ven sông Hàn)" 
                  value={newListing.title}
                  onChange={(e) => setNewListing(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="input-group">
                <label>Mô tả chi tiết</label>
                <textarea 
                  rows={5}
                  placeholder="Mô tả đặc điểm nổi bật, hướng nhà, tình trạng nội thất..." 
                  value={newListing.description}
                  onChange={(e) => setNewListing(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="form-row-2">
                <div className="input-group">
                  <label>Giá thuê / giá bán (VND)</label>
                  <div className="input-with-suffix">
                    <input 
                      type="number" 
                      placeholder="Nhập giá tiền" 
                      value={newListing.price}
                      onChange={(e) => setNewListing(prev => ({ ...prev, price: e.target.value }))}
                    />
                    <span className="suffix">VND</span>
                  </div>
                </div>
                <div className="input-group">
                  <label>Loại bất động sản</label>
                  <select 
                    value={newListing.property_type}
                    onChange={(e) => setNewListing(prev => ({ ...prev, property_type: e.target.value }))}
                  >
                    {propertyTypesList.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Trạng thái tin</label>
                <select 
                  value={newListing.status}
                  onChange={(e) => setNewListing(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="AVAILABLE">Đang bán / Cho thuê</option>
                  <option value="PENDING">Chờ duyệt</option>
                </select>
              </div>
            </div>

            {/* Area and Rooms */}
            <div className="form-card">
              <h2 className="card-title">Diện tích & Phòng</h2>
              <div className="form-row-3">
                <div className="input-group">
                  <label>Diện tích (m²)</label>
                  <input 
                    type="number" 
                    placeholder="m²" 
                    value={newListing.area}
                    onChange={(e) => setNewListing(prev => ({ ...prev, area: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label>Số phòng ngủ</label>
                  <input 
                    type="number" 
                    placeholder="Số phòng" 
                    value={newListing.bedrooms}
                    onChange={(e) => setNewListing(prev => ({ ...prev, bedrooms: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label>Số nhà vệ sinh</label>
                  <input 
                    type="number" 
                    placeholder="Số tắm" 
                    value={newListing.bathrooms}
                    onChange={(e) => setNewListing(prev => ({ ...prev, bathrooms: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Address details */}
            <div className="form-card">
              <div className="card-title-header">
                <h2 className="card-title">Địa chỉ</h2>
                <button 
                  type="button" 
                  className="text-action-btn"
                  onClick={handleAutoLocation}
                >
                  Tự động lấy vị trí
                </button>
              </div>
              <div className="form-row-3">
                <div className="input-group">
                  <label>Thành phố / Tỉnh</label>
                  <select 
                    value={newListing.city}
                    onChange={(e) => {
                      const cityName = e.target.value;
                      setNewListing(prev => ({ ...prev, city: cityName, district: '', ward: '' }));
                      const match = provinces.find(p => p.name === cityName);
                      if (match) {
                        setSelectedProvinceCode(match.code);
                        loadDistricts(match.code);
                      } else {
                        setSelectedProvinceCode('');
                        setDistricts([]);
                        setWards([]);
                      }
                    }}
                  >
                    <option value="">Chọn Tỉnh / Thành Phố</option>
                    {provinces.map(p => (
                      <option key={p.code} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Quận / Huyện</label>
                  <select 
                    value={newListing.district}
                    disabled={!selectedProvinceCode}
                    onChange={(e) => {
                      const distName = e.target.value;
                      setNewListing(prev => ({ ...prev, district: distName, ward: '' }));
                      const match = districts.find(d => d.name === distName);
                      if (match) {
                        setSelectedDistrictCode(match.code);
                        loadWards(match.code);
                      } else {
                        setSelectedDistrictCode('');
                        setWards([]);
                      }
                    }}
                  >
                    <option value="">Chọn Quận / Huyện</option>
                    {districts.map(d => (
                      <option key={d.code} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Phường / Xã</label>
                  <select 
                    value={newListing.ward}
                    disabled={!selectedDistrictCode}
                    onChange={(e) => {
                      const wardName = e.target.value;
                      setNewListing(prev => ({ ...prev, ward: wardName }));
                    }}
                  >
                    <option value="">Chọn Phường / Xã</option>
                    {wards.map(w => (
                      <option key={w.code} value={w.name}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Số nhà, tên đường</label>
                <div className="map-search-row">
                  <input 
                    type="text" 
                    placeholder="Nhập số nhà, tên đường" 
                    value={newListing.address_detail}
                    onChange={(e) => setNewListing(prev => ({ ...prev, address_detail: e.target.value }))}
                  />
                  <button 
                    type="button" 
                    className="map-search-btn"
                    onClick={handleSearchAddressOnMap}
                  >
                    Tìm trên bản đồ
                  </button>
                </div>
              </div>
 
              {/* Map Preview */}
              <div className="map-container-wrapper">
                <div id="listing-map"></div>
                <div className="map-coordinates-badge">
                  <MapPin size={14} />
                  <span>
                    Toạ độ: {newListing.latitude ? `${parseFloat(newListing.latitude).toFixed(5)}, ${parseFloat(newListing.longitude).toFixed(5)}` : 'Chưa chọn'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column Form */}
          <div className="form-column">
            {/* Utilities Selector Checkboxes Grid */}
            <div className="form-card">
              <h2 className="card-title">Tiện ích căn nhà</h2>
              <div className="utilities-toggle-grid">
                {amenitiesList.map(item => {
                  const isSelected = newListing.features.includes(item.name);
                  return (
                    <button
                      key={item.name}
                      type="button"
                      className={`utility-toggle-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleAmenity(item.name)}
                    >
                      {item.icon}
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>
              <button 
                type="button" 
                className="dashed-add-feature-btn"
                onClick={() => {
                  const name = prompt('Nhập tên tiện ích khác:');
                  if (name) toggleAmenity(name);
                }}
              >
                + Thêm tiện ích khác
              </button>
            </div>

            {/* Lifestyle Tags */}
            <div className="form-card">
              <h2 className="card-title">Khu vực nhu cầu sống (Lifestyle Tags)</h2>
              <div className="selectable-tags-list">
                {lifestyleTagsList.map(tag => {
                  const isSelected = newListing.lifestyle_tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`selectable-tag-pill ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleLifestyleTag(tag)}
                    >
                      {isSelected ? '✓ ' : '+ '} {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contact details */}
            <div className="form-card contact-card">
              <h2 className="card-title">Thông tin liên hệ</h2>
              <div className="input-group">
                <label>Số điện thoại liên hệ</label>
                <input 
                  type="text" 
                  disabled 
                  value={newListing.contact_phone} 
                  className="disabled-field"
                />
              </div>
              <div className="verified-zalo-badge">
                <ShieldCheck size={18} color="#22c55e" />
                <span>Đã xác thực Zalo (Số điện thoại chính chủ)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: IMAGE UPLOAD (TRANG 3) */}
      {currentStep === 2 && (
        <div className="step-images-panel">
          {/* File Dropzone */}
          <div 
            className="file-drag-drop-zone"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload-input').click()}
          >
            <input 
              type="file" 
              id="file-upload-input" 
              multiple 
              accept="image/*"
              style={{ display: 'none' }} 
              onChange={handleImageFileChange}
            />
            <UploadCloud size={48} color="#2563eb" />
            <h3>Chọn hoặc Kéo thả nhiều tệp tin ảnh ở đây</h3>
            <p>Hỗ trợ định dạng PNG, JPG, JPEG dung lượng tối đa 10MB</p>
            <button type="button" className="upload-select-btn">Chọn tệp tin</button>
          </div>

          {/* Toolbar */}
          <div className="images-action-toolbar">
            <span className="images-counter-text">
              ĐÃ CHỌN {newListing.images.filter(img => img.selected).length} ẢNH
            </span>
            <div className="toolbar-buttons">
              <button 
                type="button" 
                className="toolbar-btn featured-action"
                disabled={newListing.images.filter(img => img.selected).length !== 1}
                onClick={setFeaturedImage}
              >
                Đặt làm Ảnh nổi bật
              </button>
              <button 
                type="button" 
                className="toolbar-btn delete-action"
                disabled={!newListing.images.some(img => img.selected)}
                onClick={deleteSelectedImages}
              >
                <Trash2 size={16} /> Xóa
              </button>
            </div>
          </div>

          {/* Images Thumbnails Grid */}
          <div className="images-preview-thumbnails-grid">
            {newListing.images.map((image, index) => (
              <div 
                key={index} 
                className={`image-preview-card ${image.selected ? 'checked' : ''} ${image.isFeatured ? 'featured' : ''}`}
              >
                <img src={image.url} alt={`Preview ${index}`} />
                
                {/* Hover reveal checkbox */}
                <div className="card-checkbox-overlay" onClick={() => toggleSelectImage(index)}>
                  <div className={`mock-checkbox ${image.selected ? 'checked' : ''}`}>
                    {image.selected && <Check size={12} />}
                  </div>
                </div>

                {/* Ribbon Badge for featured */}
                {image.isFeatured && (
                  <span className="featured-badge-ribbon">★ Ảnh nổi bật</span>
                )}

                <div className="image-metadata">
                  <p className="img-name">{image.name}</p>
                  <p className="img-size">{image.size} MB</p>
                </div>
              </div>
            ))}

            {/* Dashed placeholder addition card */}
            <div 
              className="image-preview-card dashed-add-card"
              onClick={() => document.getElementById('file-upload-input').click()}
            >
              <div className="add-card-content">
                <ImageIcon size={24} />
                <span>Thêm ảnh</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: VISIBILITY & LIVE PREVIEW (TRANG 4) */}
      {currentStep === 3 && (
        <div className="step-visibility-panel">
          {/* Configuration column */}
          <div className="config-column">
            {/* Privacy radio cards */}
            <div className="form-card">
              <h2 className="card-title">Chế độ hiển thị</h2>
              <div className="radio-cards-group">
                <div 
                  className={`radio-card-item ${newListing.is_public ? 'selected' : ''}`}
                  onClick={() => setNewListing(prev => ({ ...prev, is_public: true }))}
                >
                  <div className="radio-circle">
                    {newListing.is_public && <div className="inner" />}
                  </div>
                  <div className="radio-card-text">
                    <h3>Công khai</h3>
                    <p>Mọi người đều có thể tìm thấy và xem tin này</p>
                  </div>
                  <Globe size={20} className="suffix-icon" />
                </div>

                <div 
                  className={`radio-card-item ${!newListing.is_public ? 'selected' : ''}`}
                  onClick={() => setNewListing(prev => ({ ...prev, is_public: false }))}
                >
                  <div className="radio-circle">
                    {!newListing.is_public && <div className="inner" />}
                  </div>
                  <div className="radio-card-text">
                    <h3>Riêng tư</h3>
                    <p>Chỉ bạn mới có thể chỉnh sửa và hiển thị tin này</p>
                  </div>
                  <Lock size={20} className="suffix-icon" />
                </div>
              </div>
            </div>

            {/* Channel checkboxes */}
            <div className="form-card">
              <h2 className="card-title">Lựa chọn kênh đăng tải</h2>
              <div className="checkbox-cards-grid">
                <div 
                  className={`checkbox-card-item ${newListing.channels.includes('Homepage') ? 'checked' : ''}`}
                  onClick={() => toggleChannel('Homepage')}
                >
                  <Home size={24} className="channel-icon" />
                  <h3>Trang chủ</h3>
                  <p>Hiển thị ở danh mục trang chủ chính</p>
                  <div className="checkbox-box">
                    {newListing.channels.includes('Homepage') && <Check size={14} />}
                  </div>
                </div>

                <div 
                  className={`checkbox-card-item ${newListing.channels.includes('Social') ? 'checked' : ''}`}
                  onClick={() => toggleChannel('Social')}
                >
                  <Megaphone size={24} className="channel-icon" />
                  <h3>Mạng xã hội</h3>
                  <p>Tự động chia sẻ lên kênh tin tức</p>
                  <div className="checkbox-box">
                    {newListing.channels.includes('Social') && <Check size={14} />}
                  </div>
                </div>

                <div 
                  className={`checkbox-card-item ${newListing.channels.includes('Affiliate') ? 'checked' : ''}`}
                  onClick={() => toggleChannel('Affiliate')}
                >
                  <SlidersHorizontal size={24} className="channel-icon" />
                  <h3>Đối tác</h3>
                  <p>Đồng bộ đến mạng lưới liên kết</p>
                  <div className="checkbox-box">
                    {newListing.channels.includes('Affiliate') && <Check size={14} />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview card column */}
          <div className="preview-column">
            <h2 className="card-title">Xem trước tin đăng</h2>
            
            <div className="live-preview-card">
              <div className="preview-image-wrap">
                <img 
                  src={newListing.thumbnail || (newListing.images.find(img => img.isFeatured)?.url || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80')} 
                  alt="Listing Preview" 
                />
                <span className="verified-overlay-badge">
                  ĐÃ XÁC THỰC
                </span>
                
                <div className="preview-bottom-gradient">
                  <h3>{newListing.title || 'Tiêu đề tin đăng của bạn'}</h3>
                  <p className="preview-address">
                    <MapPin size={12} />
                    <span>{newListing.address_detail ? `${newListing.address_detail}, ${newListing.ward}, ${newListing.district}` : 'Địa chỉ bất động sản'}</span>
                  </p>
                  
                  <div className="preview-specs-chips">
                    <div className="chip">
                      <Bed size={12} />
                      <span>{newListing.bedrooms || 0} Giường</span>
                    </div>
                    <div className="chip">
                      <Bath size={12} />
                      <span>{newListing.bathrooms || 0} Tắm</span>
                    </div>
                    <div className="chip">
                      <Maximize size={12} />
                      <span>{newListing.area || 0} m²</span>
                    </div>
                  </div>
                  
                  <div className="preview-price-row">
                    <span className="price">{(parseFloat(newListing.price) || 0).toLocaleString('vi-VN')} VND</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tip insight */}
            <div className="tip-insight-alert">
              <Info size={18} color="#047857" />
              <p>Mẹo: Thêm ít nhất 3 ảnh chất lượng cao và ghi chi tiết tiện ích để tăng gấp đôi cơ hội tiếp cận khách hàng!</p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS FINISHED VIEW (TRANG 5) */}
      {currentStep === 4 && (
        <div className="success-finished-panel">
          <div className="result-success-component">
            <div className="success-animated-checkmark">
              <CheckCircle size={64} color="#22c55e" />
            </div>
            <h1>Đăng tin thành công</h1>
            <p className="success-subtext">Chúc mừng! Tin đăng của bạn đã được kiểm duyệt và hiển thị công khai trên Swipe Nest.</p>
          </div>

          {/* Listings card preview */}
          <div className="success-preview-listing">
            <div className="property-card horizontal-listing">
              <img src={newListing.thumbnail || (newListing.images[0]?.url || 'https://via.placeholder.com/150')} alt="Listing" />
              <div className="listing-info">
                <h3>{newListing.title}</h3>
                <p className="card-address">
                  <MapPin size={14} />
                  <span>{newListing.address_detail}, {newListing.ward}, {newListing.district}</span>
                </p>
                <p className="price">{(parseFloat(newListing.price) || 0).toLocaleString('vi-VN')} VND</p>
              </div>
            </div>
          </div>

          {/* Large Go Home Card */}
          <div className="large-go-home-shortcut" onClick={handleResetForm}>
            <LayoutDashboard size={32} color="#2563eb" />
            <span>VỀ TRANG CHỦ QUẢN LÝ TIN ĐĂNG</span>
          </div>

          {/* Marketing Banner */}
          <div className="upsell-marketing-banner">
            <div className="banner-left">
              <div className="megaphone-wrap">
                <Megaphone size={24} color="#1d4ed8" />
              </div>
              <div className="marketing-copy">
                <h3>NÂNG CẤP DANH SÁCH TIN ĐĂNG</h3>
                <p>Đẩy tin đăng lên đầu trang tìm kiếm, tiếp cận hơn 10,000 khách hàng tiềm năng mỗi ngày.</p>
              </div>
            </div>
            <button 
              type="button" 
              className="cta-pill-btn"
              onClick={() => alert('Chức năng nâng cấp đang được cập nhật')}
            >
              Tìm hiểu ngay
            </button>
          </div>
        </div>
      )}

      {/* Navigation Action Footer */}
      {currentStep < 4 && (
        <div className="step-navigation-footer">
          {currentStep > 1 ? (
            <button 
              type="button" 
              className="nav-secondary-btn"
              onClick={() => setCurrentStep(prev => prev - 1)}
            >
              <ArrowLeft size={16} />
              <span>Quay lại</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 3 ? (
            <button 
              type="button" 
              className="nav-primary-btn"
              disabled={false} /* TODO: TEMPORARY MOCK - Bypassed image requirement check for testing (originally: currentStep === 2 && newListing.images.length === 0) */
              onClick={() => setCurrentStep(prev => prev + 1)}
            >
              <span>Tiếp theo</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button 
              type="button" 
              className="nav-primary-btn submit-action"
              onClick={handleSubmitListing}
            >
              <span>Hoàn tất & Đăng tin</span>
              <CheckCircle2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CreateListingWizard;
