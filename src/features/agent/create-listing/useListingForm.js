import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../config';

const DEFAULT_LISTING = (currentUser) => ({
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
  floor_range: '',
  address_detail: '',
  address: '',
  latitude: '',
  longitude: '',
  features: [],
  images: [],
  lifestyle_tags: [],
  contact_phone: currentUser?.phone || '0987654321',
  is_public: true,
  channels: ['Homepage', 'Social'],
  thumbnail: ''
});

// Shared form hook for Create and Edit listing wizards
const useListingForm = ({ mode, editingPropertyId, currentUser, setData, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [listing, setListing] = useState(() => DEFAULT_LISTING(currentUser));
  const [submittedProperty, setSubmittedProperty] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [showWarningsModal, setShowWarningsModal] = useState(false);
  const [isCheckingSave, setIsCheckingSave] = useState(false);

  // Location dropdowns
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedDistrictCode, setSelectedDistrictCode] = useState('');

  // Map
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // Load Leaflet from CDN once
  useEffect(() => {
    if (window.L) { setMapLoaded(true); return; }
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

  // Fetch provinces once
  useEffect(() => {
    const fetchProvinces = async () => {
      try {
        const res = await fetch('https://provinces.open-api.vn/api/p/');
        if (res.ok) setProvinces(await res.json());
      } catch (err) {
        console.error('Failed to fetch provinces:', err);
      }
    };
    fetchProvinces();
  }, []);

  // Preload data when editing
  useEffect(() => {
    if (mode !== 'edit' || !editingPropertyId || provinces.length === 0) return;

    const fetchProperty = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/properties/${editingPropertyId}`);
        if (!res.ok) return;
        const { property: prop } = await res.json();

        const features = prop.property_features?.map(f => f.feature_name) || [];
        const images = prop.property_images?.map((img, i) => ({
          url: img.image_url,
          name: `Image ${i + 1}`,
          size: '1.0',
          selected: false,
          isFeatured: img.image_url === prop.thumbnail
        })) || [];
        const lifestyle_tags = prop.lifestyle_tags?.map(t => t.tag_name) || [];

        setListing({
          title: prop.title || '',
          description: prop.description || '',
          price: prop.price || '',
          property_type: prop.property_type || 'Căn Hộ',
          status: prop.status || 'AVAILABLE',
          area: prop.area || '',
          bedrooms: prop.bedrooms || '',
          bathrooms: prop.bathrooms || '',
          city: prop.city || '',
          district: prop.district || '',
          ward: prop.ward || '',
          floor_range: prop.floor_range || '',
          address_detail: prop.address_detail || '',
          address: prop.address || '',
          latitude: prop.latitude || '',
          longitude: prop.longitude || '',
          features,
          images,
          lifestyle_tags,
          contact_phone: prop.contact_phone || currentUser?.phone || '0987654321',
          is_public: prop.is_public !== undefined ? prop.is_public : true,
          channels: prop.channels || ['Homepage', 'Social'],
          thumbnail: prop.thumbnail || ''
        });

        // Preload province → district → ward codes
        if (prop.city) {
          const pMatch = provinces.find(p => p.name.includes(prop.city) || prop.city.includes(p.name));
          if (pMatch) {
            setSelectedProvinceCode(pMatch.code);
            const distRes = await fetch(`https://provinces.open-api.vn/api/p/${pMatch.code}?depth=2`);
            if (distRes.ok) {
              const distData = await distRes.json();
              setDistricts(distData.districts || []);
              if (prop.district) {
                const dMatch = distData.districts?.find(d => d.name.includes(prop.district) || prop.district.includes(d.name));
                if (dMatch) {
                  setSelectedDistrictCode(dMatch.code);
                  const wardRes = await fetch(`https://provinces.open-api.vn/api/d/${dMatch.code}?depth=2`);
                  if (wardRes.ok) {
                    const wardData = await wardRes.json();
                    setWards(wardData.wards || []);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching property for editing:', err);
      }
    };

    fetchProperty();
  }, [mode, editingPropertyId, provinces]);

  // Location loaders
  const loadDistricts = async (provinceCode) => {
    if (!provinceCode) { setDistricts([]); setWards([]); return; }
    try {
      const res = await fetch(`https://provinces.open-api.vn/api/p/${provinceCode}?depth=2`);
      if (res.ok) { setDistricts((await res.json()).districts || []); setWards([]); }
    } catch (err) { console.error('Failed to load districts:', err); }
  };

  const loadWards = async (districtCode) => {
    if (!districtCode) { setWards([]); return; }
    try {
      const res = await fetch(`https://provinces.open-api.vn/api/d/${districtCode}?depth=2`);
      if (res.ok) setWards((await res.json()).wards || []);
    } catch (err) { console.error('Failed to load wards:', err); }
  };

  const selectLocationByNames = async (cityName, districtName, wardName) => {
    if (provinces.length === 0) return;
    const pMatch = provinces.find(p => p.name.toLowerCase().includes(cityName.toLowerCase()) || cityName.toLowerCase().includes(p.name.toLowerCase()));
    if (!pMatch) return;
    setSelectedProvinceCode(pMatch.code);
    const distRes = await fetch(`https://provinces.open-api.vn/api/p/${pMatch.code}?depth=2`);
    if (!distRes.ok) return;
    const distData = await distRes.json();
    setDistricts(distData.districts || []);
    const dMatch = distData.districts?.find(d => d.name.toLowerCase().includes(districtName.toLowerCase()) || districtName.toLowerCase().includes(d.name.toLowerCase()));
    if (!dMatch) return;
    setSelectedDistrictCode(dMatch.code);
    const wardRes = await fetch(`https://provinces.open-api.vn/api/d/${dMatch.code}?depth=2`);
    if (!wardRes.ok) return;
    const wardData = await wardRes.json();
    setWards(wardData.wards || []);
    const wMatch = wardData.wards?.find(w => w.name.toLowerCase().includes(wardName.toLowerCase()) || wardName.toLowerCase().includes(w.name.toLowerCase()));
    setListing(prev => ({
      ...prev,
      city: pMatch.name,
      district: dMatch.name,
      ward: wMatch ? wMatch.name : (wardData.wards[0]?.name || '')
    }));
  };

  // Leaflet map setup
  useEffect(() => {
    if (!mapLoaded || !window.L || currentStep !== 1) return;
    const lat = parseFloat(listing.latitude) || 16.0544;
    const lng = parseFloat(listing.longitude) || 108.2022;
    const container = document.getElementById('listing-map');
    if (!container) return;
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 13);
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      return;
    }
    const map = window.L.map('listing-map', { zoomControl: true, scrollWheelZoom: true }).setView([lat, lng], 13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);

    const updateCoordinates = async (newLat, newLng) => {
      setListing(prev => ({ ...prev, latitude: newLat, longitude: newLng }));
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${newLat}&lon=${newLng}&format=json&accept-language=vi`);
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          const cityName = addr.city || addr.town || addr.province || addr.state || '';
          const districtName = addr.district || addr.suburb || addr.city_district || addr.county || '';
          const wardName = addr.ward || addr.quarter || addr.subdivision || addr.village || '';
          const road = addr.road || '';
          const houseNumber = addr.house_number || '';
          const address_detail = [houseNumber, road].filter(Boolean).join(' ') || addr.amenity || addr.building || '';
          setListing(prev => ({ ...prev, address_detail, address: data.display_name || `${address_detail}, ${wardName}, ${districtName}, ${cityName}` }));
          if (cityName && districtName) selectLocationByNames(cityName, districtName, wardName);
        }
      } catch (err) { console.error('Reverse geocoding error:', err); }
    };

    marker.on('dragend', () => { const pos = marker.getLatLng(); updateCoordinates(pos.lat, pos.lng); });
    map.on('click', (e) => { marker.setLatLng(e.latlng); updateCoordinates(e.latlng.lat, e.latlng.lng); });
    mapRef.current = map;
    markerRef.current = marker;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
  }, [mapLoaded, currentStep, provinces]);

  const handleAutoLocation = () => {
    if (!navigator.geolocation) { alert('Trình duyệt không hỗ trợ Geolocation API'); return; }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lon } = position.coords;
        setListing(prev => ({ ...prev, latitude: lat, longitude: lon }));
        if (mapRef.current && markerRef.current) { mapRef.current.setView([lat, lon], 15); markerRef.current.setLatLng([lat, lon]); }
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=vi`);
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const cityName = addr.city || addr.town || addr.province || addr.state || '';
            const districtName = addr.district || addr.suburb || addr.city_district || addr.county || '';
            const wardName = addr.ward || addr.quarter || addr.subdivision || addr.village || '';
            const road = addr.road || '';
            const houseNumber = addr.house_number || '';
            const address_detail = [houseNumber, road].filter(Boolean).join(' ') || addr.amenity || addr.building || '';
            setListing(prev => ({ ...prev, address_detail, address: data.display_name || `${address_detail}, ${wardName}, ${districtName}, ${cityName}` }));
            if (cityName && districtName) selectLocationByNames(cityName, districtName, wardName);
          }
        } catch (err) { console.error('Auto location geocode error:', err); }
      },
      (error) => alert('Không thể lấy vị trí tự động: ' + error.message)
    );
  };

  const handleSearchAddressOnMap = async () => {
    if (!listing.address_detail || !listing.ward) { alert('Vui lòng chọn Tỉnh, Quận, Phường và nhập số nhà/tên đường trước khi tìm.'); return; }
    const searchVal = `${listing.address_detail}, ${listing.ward}, ${listing.district}, ${listing.city}`;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchVal)}&format=json&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          setListing(prev => ({ ...prev, latitude: lat, longitude: lon, address: data[0].display_name || prev.address }));
          if (mapRef.current && markerRef.current) { mapRef.current.setView([lat, lon], 15); markerRef.current.setLatLng([lat, lon]); }
        } else {
          alert('Không tìm thấy toạ độ cho địa chỉ này.');
        }
      }
    } catch (err) { console.error('Geocoding error:', err); }
  };

  // Image handlers
  const handleImageFileChange = (e) => {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setListing(prev => {
          const newImages = [...prev.images, { url: reader.result, name: file.name, size: (file.size / (1024 * 1024)).toFixed(2), selected: false, isFeatured: prev.images.length === 0 }];
          return { ...prev, images: newImages, thumbnail: newImages.find(img => img.isFeatured)?.url || prev.thumbnail };
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e) => {
    e.preventDefault();
    Array.from(e.dataTransfer.files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        setListing(prev => {
          const newImages = [...prev.images, { url: reader.result, name: file.name, size: (file.size / (1024 * 1024)).toFixed(2), selected: false, isFeatured: prev.images.length === 0 }];
          return { ...prev, images: newImages, thumbnail: newImages.find(img => img.isFeatured)?.url || prev.thumbnail };
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const toggleSelectImage = (index) => setListing(prev => ({ ...prev, images: prev.images.map((img, i) => i === index ? { ...img, selected: !img.selected } : img) }));

  const setFeaturedImage = () => setListing(prev => {
    const selectedIdx = prev.images.findIndex(img => img.selected);
    if (selectedIdx === -1) return prev;
    const updated = prev.images.map((img, i) => ({ ...img, isFeatured: i === selectedIdx, selected: false }));
    return { ...prev, images: updated, thumbnail: updated[selectedIdx].url };
  });

  const deleteSelectedImages = () => setListing(prev => {
    const remaining = prev.images.filter(img => !img.selected);
    if (remaining.length > 0 && !remaining.some(img => img.isFeatured)) remaining[0].isFeatured = true;
    return { ...prev, images: remaining, thumbnail: remaining.find(img => img.isFeatured)?.url || '' };
  });

  const toggleAmenity = (name) => setListing(prev => ({ ...prev, features: prev.features.includes(name) ? prev.features.filter(f => f !== name) : [...prev.features, name] }));
  const toggleLifestyleTag = (tag) => setListing(prev => ({ ...prev, lifestyle_tags: prev.lifestyle_tags.includes(tag) ? prev.lifestyle_tags.filter(t => t !== tag) : [...prev.lifestyle_tags, tag] }));
  const toggleChannel = (channel) => setListing(prev => ({ ...prev, channels: prev.channels.includes(channel) ? prev.channels.filter(c => c !== channel) : [...prev.channels, channel] }));

  // Execute direct database save
  const executeSaveListing = async () => {
    setShowWarningsModal(false);
    try {
      const payload = {
        owner_id: currentUser.id,
        title: listing.title,
        description: listing.description,
        price: parseFloat(listing.price) || 0,
        area: parseFloat(listing.area) || 0,
        bedrooms: parseInt(listing.bedrooms) || 0,
        bathrooms: parseInt(listing.bathrooms) || 0,
        property_type: listing.property_type,
        status: listing.status,
        city: listing.city,
        district: listing.district,
        ward: listing.ward,
        floor_range: listing.floor_range || '',
        address_detail: listing.address_detail,
        address: `${listing.address_detail}, ${listing.ward}, ${listing.district}, ${listing.city}`,
        thumbnail: listing.thumbnail || (listing.images.find(img => img.isFeatured)?.url || 'https://via.placeholder.com/400'),
        virtual_tour_url: listing.virtual_tour_url || null,
        contact_phone: listing.contact_phone,
        latitude: parseFloat(listing.latitude) || null,
        longitude: parseFloat(listing.longitude) || null,
        features: listing.features,
        images: listing.images.map(img => img.url),
        lifestyle_tags: listing.lifestyle_tags
      };

      const url = mode === 'edit'
        ? `${API_BASE_URL}/api/properties/${editingPropertyId}`
        : `${API_BASE_URL}/api/properties`;
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (response.ok) {
        const { property: savedProperty } = await response.json();
        setSubmittedProperty(savedProperty);

        if (mode === 'edit') {
          setData(prev => ({
            ...prev,
            activeListings: (prev.activeListings || []).map(l =>
              l.id === editingPropertyId
                ? { ...l, ...savedProperty, favoritesCount: l.favoritesCount }
                : l
            )
          }));
        } else {
          setData(prev => ({
            ...prev,
            totalProperties: prev.totalProperties + 1,
            activeListings: [{ ...savedProperty, favoritesCount: 0 }, ...prev.activeListings]
          }));
        }
        setCurrentStep(4);
      } else {
        alert(mode === 'edit' ? 'Cập nhật tin thất bại, vui lòng thử lại.' : 'Đăng tin thất bại, vui lòng thử lại.');
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối server.');
    }
  };

  // Submit handler (create or edit) - with validation checks
  const handleSubmitListing = async () => {
    setIsCheckingSave(true);
    setWarnings([]);
    try {
      const payload = {
        owner_id: currentUser.id,
        title: listing.title,
        description: listing.description,
        price: parseFloat(listing.price) || 0,
        area: parseFloat(listing.area) || 0,
        bedrooms: parseInt(listing.bedrooms) || 0,
        bathrooms: parseInt(listing.bathrooms) || 0,
        property_type: listing.property_type,
        status: listing.status,
        city: listing.city,
        district: listing.district,
        ward: listing.ward,
        floor_range: listing.floor_range || '',
        address_detail: listing.address_detail,
        address: `${listing.address_detail}, ${listing.ward}, ${listing.district}, ${listing.city}`,
        thumbnail: listing.thumbnail || (listing.images.find(img => img.isFeatured)?.url || 'https://via.placeholder.com/400'),
        virtual_tour_url: listing.virtual_tour_url || null,
        contact_phone: listing.contact_phone,
        latitude: parseFloat(listing.latitude) || null,
        longitude: parseFloat(listing.longitude) || null,
        features: listing.features,
        images: listing.images.map(img => img.url),
        lifestyle_tags: listing.lifestyle_tags
      };

      const checkUrl = mode === 'edit'
        ? `${API_BASE_URL}/api/properties/check-before-save?excludeId=${editingPropertyId}`
        : `${API_BASE_URL}/api/properties/check-before-save`;

      const checkRes = await fetch(checkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const activeWarnings = [];

        if (checkData.similarOwn) {
          activeWarnings.push({
            type: 'OWN_SPAM',
            text: 'Trông giống như bạn đã đăng căn này rồi. App tự tối ưu phân phối nên bạn không lo trôi bài. Bạn có chắc muốn đăng tiếp?'
          });
        }
        if (checkData.isMultiListing) {
          activeWarnings.push({
            type: 'MULTI_LISTING',
            text: 'Nền tảng khuyến khích bạn chỉ đăng thông tin của một căn duy nhất để tăng hiệu quả tiếp cận khách hàng. (Phát hiện giỏ hàng: ' + (checkData.geminiReason || 'Nhiều căn hộ') + ')'
          });
        }

        if (activeWarnings.length > 0) {
          setWarnings(activeWarnings);
          setShowWarningsModal(true);
          setIsCheckingSave(false);
          return;
        }
      }
    } catch (err) {
      console.error('Validation check failed:', err);
    }

    setIsCheckingSave(false);
    await executeSaveListing();
  };

  const resetForm = () => {
    setListing(DEFAULT_LISTING(currentUser));
    setCurrentStep(1);
    setSubmittedProperty(null);
    if (onSuccess) onSuccess();
  };

  return {
    listing, setListing,
    currentStep, setCurrentStep,
    submittedProperty,
    provinces, districts, wards,
    selectedProvinceCode, setSelectedProvinceCode,
    selectedDistrictCode, setSelectedDistrictCode,
    mapLoaded, mapRef, markerRef,
    loadDistricts, loadWards,
    handleAutoLocation, handleSearchAddressOnMap,
    handleImageFileChange, handleDragOver, handleDrop,
    toggleSelectImage, setFeaturedImage, deleteSelectedImages,
    toggleAmenity, toggleLifestyleTag, toggleChannel,
    handleSubmitListing,
    resetForm,
    warnings,
    showWarningsModal,
    setShowWarningsModal,
    isCheckingSave,
    executeSaveListing
  };
};

export default useListingForm;
