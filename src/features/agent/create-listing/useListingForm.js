import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../../../config';
import { apiFetch } from '../../../auth/apiClient';
import { loadAdminAreas, findProvince, findWard } from '../../location/adminAreas';
import { DEFAULT_MAP_VIEWPORT, parsePinnedCoords, useLeafletCdn } from '../../location/leaflet';

const MAX_LISTING_IMAGES = 6;
const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
const LEAFLET_IMAGES = 'https://unpkg.com/leaflet@1.9.4/dist/images/';

const createMapPinIcon = (L) => L.icon({
  iconUrl: `${LEAFLET_IMAGES}marker-icon.png`,
  iconRetinaUrl: `${LEAFLET_IMAGES}marker-icon-2x.png`,
  shadowUrl: `${LEAFLET_IMAGES}marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const buildListingPayload = (listing) => {
  const pinned = parsePinnedCoords(listing.latitude, listing.longitude);
  const ward = (listing.ward || '').trim();
  const city = (listing.city || '').trim();
  const address_detail = (listing.address_detail || '').trim();
  return {
    title: listing.title,
    description: listing.description,
    price: parseFloat(listing.price) || 0,
    listing_type: listing.listing_type,
    area: parseFloat(listing.area) || 0,
    bedrooms: parseInt(listing.bedrooms) || 0,
    bathrooms: parseInt(listing.bathrooms) || 0,
    property_type: listing.property_type,
    status: listing.status,
    is_public: listing.is_public,
    city,
    district: '',
    ward,
    floor_range: listing.floor_range || '',
    address_detail,
    address: [address_detail, ward, city].filter(Boolean).join(', '),
    thumbnail: listing.thumbnail || (listing.images.find(img => img.isFeatured)?.url || '/listing-placeholder.svg'),
    virtual_tour_url: listing.virtual_tour_url || null,
    contact_phone: listing.contact_phone,
    latitude: pinned ? pinned.lat : null,
    longitude: pinned ? pinned.lng : null,
    features: listing.features,
    images: listing.images.map(img => img.url),
    lifestyle_tags: listing.lifestyle_tags
  };
};

const DEFAULT_LISTING = (currentUser) => ({
  title: '',
  description: '',
  price: '',
  listing_type: '',
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
  contact_phone: currentUser?.phone || '',
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
  const [isSaving, setIsSaving] = useState(false);

  // Map
  const { mapLoaded } = useLeafletCdn(currentStep === 1);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const defaultPhoneRef = useRef(currentUser?.phone || '');
  useEffect(() => {
    defaultPhoneRef.current = currentUser?.phone || '';
  }, [currentUser?.phone]);

  // Preload data when editing
  useEffect(() => {
    if (mode !== 'edit' || !editingPropertyId) return;

    const fetchProperty = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/properties/${editingPropertyId}`);
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

        const pinned = parsePinnedCoords(prop.latitude, prop.longitude);
        const finalLat = pinned ? pinned.lat : '';
        const finalLng = pinned ? pinned.lng : '';

        setListing({
          title: prop.title || '',
          description: prop.description || '',
          price: prop.price || '',
          listing_type: prop.listing_type || '',
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
          latitude: finalLat,
          longitude: finalLng,
          features,
          images,
          lifestyle_tags,
          contact_phone: prop.contact_phone || defaultPhoneRef.current,
          is_public: prop.is_public !== undefined ? prop.is_public : true,
          channels: prop.channels || ['Homepage', 'Social'],
          thumbnail: prop.thumbnail || ''
        });

        // Đổi tỉnh / phường của tin cũ sang đơn vị hành chính mới khi khớp được; nếu không, người đăng chọn lại.
        const areas = await loadAdminAreas().catch(() => []);
        const province = findProvince(areas, prop.admin_area?.province || prop.city);
        if (province) {
          const ward = findWard(province, prop.admin_area?.ward || prop.ward);
          setListing(prev => ({ ...prev, city: province.name, ward: ward ? ward.name : '', district: ward ? '' : prev.district }));
        }
      } catch (err) {
        console.error('Error fetching property for editing:', err);
      }
    };

    fetchProperty();
  }, [mode, editingPropertyId]);

  const attachPinnedMarker = (map, lat, lng) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      return markerRef.current;
    }
    const marker = window.L.marker([lat, lng], { draggable: true, icon: createMapPinIcon(window.L) }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setListing(prev => ({ ...prev, latitude: pos.lat, longitude: pos.lng }));
    });
    markerRef.current = marker;
    return marker;
  };

  // Leaflet map setup: không tự chấm ghim nếu tin chưa có tọa độ; chỉ tạo/cập nhật ghim khi người đăng tự nhấp hoặc kéo thả.
  useEffect(() => {
    if (!mapLoaded || !window.L || currentStep !== 1) return;
    const container = document.getElementById('listing-map');
    if (!container || mapRef.current) return;

    const map = window.L.map('listing-map', { zoomControl: true, scrollWheelZoom: true }).setView(DEFAULT_MAP_VIEWPORT, 12);
    window.L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '&copy; Google Maps',
      subdomains: ['0', '1', '2', '3'],
      maxZoom: 20
    }).addTo(map);

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      attachPinnedMarker(map, lat, lng);
      setListing(prev => ({ ...prev, latitude: lat, longitude: lng }));
    });

    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
  }, [mapLoaded, currentStep]);

  // Sync marker when coordinates are loaded (edit mode), returning from step 2, or cleared manually
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L || currentStep !== 1) return;
    const pinned = parsePinnedCoords(listing.latitude, listing.longitude);
    if (!pinned) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }
    const { lat, lng } = pinned;
    const hadMarker = Boolean(markerRef.current);
    const currentPos = markerRef.current?.getLatLng();
    const moved = !hadMarker || !currentPos || Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001;
    attachPinnedMarker(map, lat, lng);
    if (moved) map.setView([lat, lng], 15);
  }, [mapLoaded, currentStep, listing.latitude, listing.longitude]);

  const handleClearMapPin = () => {
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    setListing(prev => ({ ...prev, latitude: '', longitude: '' }));
  };

  // Image handlers
  const handleImageFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const availableSlots = Math.max(0, MAX_LISTING_IMAGES - listing.images.length);
    if (selectedFiles.length > availableSlots) {
      alert(`Mỗi tin đăng tối đa ${MAX_LISTING_IMAGES} ảnh.`);
    }
    selectedFiles.slice(0, availableSlots).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > MAX_LISTING_IMAGE_BYTES) {
        alert('Mỗi ảnh đăng tin phải từ 5 MB trở xuống.');
        return;
      }
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
    const selectedFiles = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    const availableSlots = Math.max(0, MAX_LISTING_IMAGES - listing.images.length);
    if (selectedFiles.length > availableSlots) {
      alert(`Mỗi tin đăng tối đa ${MAX_LISTING_IMAGES} ảnh.`);
    }
    selectedFiles.slice(0, availableSlots).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > MAX_LISTING_IMAGE_BYTES) {
        alert('Mỗi ảnh đăng tin phải từ 5 MB trở xuống.');
        return;
      }
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
    if (isSaving) return;
    setIsSaving(true);
    setShowWarningsModal(false);
    try {
      const payload = buildListingPayload(listing);

      const url = mode === 'edit'
        ? `${API_BASE_URL}/api/properties/${editingPropertyId}`
        : `${API_BASE_URL}/api/properties`;
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

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
        // Hiện đúng lý do server trả về (hết hạn mức tin, chưa có gói, ảnh quá lớn...) thay vì một câu chung chung.
        const errData = await response.json().catch(() => ({}));
        alert(errData.error || (mode === 'edit' ? 'Cập nhật tin thất bại, vui lòng thử lại.' : 'Đăng tin thất bại, vui lòng thử lại.'));
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi kết nối server.');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit handler (create or edit) - with validation checks
  const handleSubmitListing = async () => {
    if (isCheckingSave || isSaving) return;

    if (mode === 'create' && currentUser?.verification_status !== 'VERIFIED' && currentUser?.is_official !== true) {
      alert('Tài khoản chưa hoàn tất xác thực KYC. Vui lòng xác thực danh tính trước khi đăng tin.');
      return;
    }

    const cleanPhone = (listing.contact_phone || currentUser?.phone || '').trim().replace(/[\s().-]/g, '').replace(/^\+84/, '0');
    if (!/^0[35789]\d{8}$/.test(cleanPhone)) {
      alert('Vui lòng cung cấp số điện thoại liên hệ hợp lệ (số di động Việt Nam 10 chữ số).');
      return;
    }

    if (!['RENT', 'SALE'].includes(listing.listing_type)) {
      alert('Vui lòng chọn tin cho thuê hoặc mua bán để Swipe Nest gợi ý đúng nhu cầu.');
      return;
    }

    if (!listing.city || !listing.ward) {
      alert('Vui lòng chọn Tỉnh/Thành phố và Phường/Xã theo danh sách hành chính mới.');
      setCurrentStep(1);
      return;
    }

    setIsCheckingSave(true);
    setWarnings([]);
    try {
      const payload = buildListingPayload(listing);

      const checkUrl = mode === 'edit'
        ? `${API_BASE_URL}/api/properties/check-before-save?excludeId=${editingPropertyId}`
        : `${API_BASE_URL}/api/properties/check-before-save`;

      const checkRes = await apiFetch(checkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const activeWarnings = [];

        // F31: Multiple agents can list the same property - no blocking or warning needed for similarOther.
        // If agent re-lists their own property, prompt confirmation (isBlocking: false) while backend silently penalizes display score.
        if (checkData.similarOwn) {
          activeWarnings.push({
            type: 'OWN_SPAM',
            isBlocking: false,
            text: 'Bạn đã có một bất động sản tương tự trong hệ thống của mình. Bạn có chắc chắn muốn tiếp tục đăng tin này không?'
          });
        }
        if (checkData.isMultiListing) {
          activeWarnings.push({
            type: 'MULTI_LISTING',
            isBlocking: true,
            text: 'Mô tả chứa dấu hiệu giỏ hàng rác / nhiều căn hộ (' + (checkData.geminiReason || 'Nhiều căn hộ') + '). Quy định sàn yêu cầu mỗi bài đăng chỉ đại diện cho một căn duy nhất.'
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

  const handleNextStep = () => {
    if (currentStep === 1 && (!listing.city || !listing.ward)) {
      alert('Vui lòng chọn Tỉnh/Thành phố và Phường/Xã theo danh sách hành chính mới.');
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  return {
    listing, setListing,
    currentStep, setCurrentStep,
    submittedProperty,
    mapLoaded, mapRef, markerRef,
    handleClearMapPin,
    handleNextStep,
    handleImageFileChange, handleDragOver, handleDrop,
    toggleSelectImage, setFeaturedImage, deleteSelectedImages,
    toggleAmenity, toggleLifestyleTag, toggleChannel,
    handleSubmitListing,
    resetForm,
    warnings,
    showWarningsModal,
    setShowWarningsModal,
    isCheckingSave,
    isSaving,
    executeSaveListing
  };
};

export default useListingForm;
