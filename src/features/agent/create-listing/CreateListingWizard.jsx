import { 
  Check, UploadCloud, MapPin, Wifi, Wind, Cpu, Layers, 
  Car, Shield, Armchair, Waves, Dumbbell, Cctv, Cat, Bed, Bath, 
  Maximize, Globe, Lock, ArrowLeft, ArrowRight, CheckCircle2, 
  Megaphone, Info, ShieldCheck, Trash2, Image as ImageIcon, CheckCircle,
  LayoutDashboard, Compass, Home, SlidersHorizontal, Send
} from 'lucide-react';
import './CreateListingWizard.css';
import useListingForm from './useListingForm';

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

// ponytail: create-only wizard — edit logic lives in EditListingWizard
const CreateListingWizard = ({ setActiveTab, setData, currentUser }) => {
  const {
    listing, setListing,
    currentStep, setCurrentStep,
    submittedProperty,
    provinces, districts, wards,
    selectedProvinceCode, setSelectedProvinceCode,
    selectedDistrictCode, setSelectedDistrictCode,
    loadDistricts, loadWards,
    handleAutoLocation, handleSearchAddressOnMap,
    handleImageFileChange, handleDragOver, handleDrop,
    toggleSelectImage, setFeaturedImage, deleteSelectedImages,
    toggleAmenity, toggleLifestyleTag, toggleChannel,
    handleSubmitListing, resetForm,
    warnings, showWarningsModal, setShowWarningsModal, isCheckingSave, executeSaveListing
  } = useListingForm({
    mode: 'create',
    currentUser,
    setData,
    onSuccess: () => setActiveTab('listings')
  });

  return (
    <div className="create-flow-container">
      {/* Page Header */}
      {currentStep < 4 && (
        <div className="create-flow-header" style={{ marginBottom: '24px' }}>
          <button
            type="button"
            className="back-to-listings-btn"
            onClick={() => setActiveTab('listings')}
          >
            <ArrowLeft size={16} />
            <span>Quay lại danh sách</span>
          </button>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
            Tạo tin đăng mới
          </h1>
          <p style={{ fontSize: '14px', color: '#475569', margin: '0' }}>
            Hoàn tất các thông tin bên dưới để đăng tải tài sản có giá trị của bạn lên nền tảng giao dịch.
          </p>
        </div>
      )}

      {/* Stepper */}
      {currentStep < 4 && (
        <div className="stepper-wrapper">
          <div className={`step-item ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
            <div className="step-number">{currentStep > 1 ? <Check size={16} /> : 1}</div>
            <span className="step-label">Thông tin</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
            <div className="step-number">{currentStep > 2 ? <Check size={16} /> : 2}</div>
            <span className="step-label">Hình ảnh</span>
          </div>
          <div className="step-line" />
          <div className={`step-item ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
            <div className="step-number">{currentStep > 3 ? <Check size={16} /> : 3}</div>
            <span className="step-label">Hiển thị</span>
          </div>
        </div>
      )}

      {/* Unverified banner */}
      {currentStep < 4 && currentUser.verification_status !== 'VERIFIED' && (
        <div className="unverified-warning-alert">
          <div className="alert-left">
            <ShieldCheck size={20} color="#b45309" />
            <span>Tài khoản của bạn chưa được xác minh. Tin vẫn có thể đăng, nhưng sẽ chưa có badge Verified Seller.</span>
          </div>
          <button className="alert-verify-btn" onClick={(e) => e.preventDefault()}>Xác minh ngay</button>
        </div>
      )}

      {/* STEP 1: INFO FORM */}
      {currentStep === 1 && (
        <div className="step-form-grid">
          <div className="form-column">
            <div className="form-card">
              <h2 className="card-title">Thông tin cơ bản</h2>
              <div className="input-group">
                <label>Tiêu đề bài đăng</label>
                <input type="text" placeholder="Nhập tiêu đề hấp dẫn (VD: Căn hộ cao cấp ven sông Hàn)" value={listing.title} onChange={(e) => setListing(prev => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="input-group">
                <label>Mô tả chi tiết</label>
                <textarea rows={5} placeholder="Mô tả đặc điểm nổi bật, hướng nhà, tình trạng nội thất..." value={listing.description} onChange={(e) => setListing(prev => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="form-row-2">
                <div className="input-group">
                  <label>Giá thuê / giá bán (VND)</label>
                  <div className="input-with-suffix">
                    <input type="number" placeholder="Nhập giá tiền" value={listing.price} onChange={(e) => setListing(prev => ({ ...prev, price: e.target.value }))} />
                    <span className="suffix">VND</span>
                  </div>
                </div>
                <div className="input-group">
                  <label>Loại bất động sản</label>
                  <select value={listing.property_type} onChange={(e) => setListing(prev => ({ ...prev, property_type: e.target.value }))}>
                    {propertyTypesList.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Trạng thái tin</label>
                <select value={listing.status} onChange={(e) => setListing(prev => ({ ...prev, status: e.target.value }))}>
                  <option value="AVAILABLE">Đang bán / Cho thuê</option>
                  <option value="PENDING">Chờ duyệt</option>
                </select>
              </div>
            </div>

            <div className="form-card">
              <h2 className="card-title">Diện tích &amp; Phòng</h2>
              <div className="form-row-3">
                <div className="input-group">
                  <label>Diện tích (m²)</label>
                  <input type="number" placeholder="m²" value={listing.area} onChange={(e) => setListing(prev => ({ ...prev, area: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Số phòng ngủ</label>
                  <input type="number" placeholder="Số phòng" value={listing.bedrooms} onChange={(e) => setListing(prev => ({ ...prev, bedrooms: e.target.value }))} />
                </div>
                <div className="input-group">
                  <label>Số nhà vệ sinh</label>
                  <input type="number" placeholder="Số tắm" value={listing.bathrooms} onChange={(e) => setListing(prev => ({ ...prev, bathrooms: e.target.value }))} />
                </div>
              </div>
              {(listing.property_type === 'Chung Cư' || listing.property_type === 'Căn Hộ') && (
                <div className="input-group" style={{ marginTop: '15px' }}>
                  <label>Khoảng tầng</label>
                  <select value={listing.floor_range} onChange={(e) => setListing(prev => ({ ...prev, floor_range: e.target.value }))}>
                    <option value="">Chọn khoảng tầng</option>
                    <option value="Thấp">Thấp</option>
                    <option value="Trung">Trung</option>
                    <option value="Cao">Cao</option>
                  </select>
                </div>
              )}
            </div>

            <div className="form-card">
              <div className="card-title-header">
                <h2 className="card-title">Địa chỉ</h2>
                <button type="button" className="text-action-btn" onClick={handleAutoLocation}>Tự động lấy vị trí</button>
              </div>
              <div className="form-row-3">
                <div className="input-group">
                  <label>Thành phố / Tỉnh</label>
                  <select value={listing.city} onChange={(e) => {
                    const cityName = e.target.value;
                    setListing(prev => ({ ...prev, city: cityName, district: '', ward: '' }));
                    const match = provinces.find(p => p.name === cityName);
                    if (match) { setSelectedProvinceCode(match.code); loadDistricts(match.code); }
                    else { setSelectedProvinceCode(''); }
                  }}>
                    <option value="">Chọn Tỉnh / Thành Phố</option>
                    {provinces.map(p => <option key={p.code} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Quận / Huyện</label>
                  <select value={listing.district} disabled={!selectedProvinceCode} onChange={(e) => {
                    const distName = e.target.value;
                    setListing(prev => ({ ...prev, district: distName, ward: '' }));
                    const match = districts.find(d => d.name === distName);
                    if (match) { setSelectedDistrictCode(match.code); loadWards(match.code); }
                    else setSelectedDistrictCode('');
                  }}>
                    <option value="">Chọn Quận / Huyện</option>
                    {districts.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label>Phường / Xã</label>
                  <select value={listing.ward} disabled={!selectedDistrictCode} onChange={(e) => setListing(prev => ({ ...prev, ward: e.target.value }))}>
                    <option value="">Chọn Phường / Xã</option>
                    {wards.map(w => <option key={w.code} value={w.name}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Số nhà, tên đường</label>
                <div className="map-search-row">
                  <input type="text" placeholder="Nhập số nhà, tên đường" value={listing.address_detail} onChange={(e) => setListing(prev => ({ ...prev, address_detail: e.target.value }))} />
                  <button type="button" className="map-search-btn" onClick={handleSearchAddressOnMap}>Tìm trên bản đồ</button>
                </div>
              </div>
              <div className="map-container-wrapper">
                <div id="listing-map"></div>
                <div className="map-coordinates-badge">
                  <MapPin size={14} />
                  <span>Toạ độ: {listing.latitude ? `${parseFloat(listing.latitude).toFixed(5)}, ${parseFloat(listing.longitude).toFixed(5)}` : 'Chưa chọn'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="form-column">
            <div className="form-card">
              <h2 className="card-title">Tiện ích căn nhà</h2>
              <div className="utilities-toggle-grid">
                {amenitiesList.map(item => (
                  <button key={item.name} type="button" className={`utility-toggle-item ${listing.features.includes(item.name) ? 'selected' : ''}`} onClick={() => toggleAmenity(item.name)}>
                    {item.icon}<span>{item.name}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="dashed-add-feature-btn" onClick={() => { const name = prompt('Nhập tên tiện ích khác:'); if (name) toggleAmenity(name); }}>
                + Thêm tiện ích khác
              </button>
            </div>

            <div className="form-card">
              <h2 className="card-title">Khu vực nhu cầu sống (Lifestyle Tags)</h2>
              <div className="selectable-tags-list">
                {lifestyleTagsList.map(tag => (
                  <button key={tag} type="button" className={`selectable-tag-pill ${listing.lifestyle_tags.includes(tag) ? 'selected' : ''}`} onClick={() => toggleLifestyleTag(tag)}>
                    {listing.lifestyle_tags.includes(tag) ? '✓ ' : '+ '} {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-card contact-card">
              <h2 className="card-title">Thông tin liên hệ</h2>
              <div className="input-group">
                <label>Số điện thoại liên hệ</label>
                <input type="text" disabled value={listing.contact_phone} className="disabled-field" />
              </div>
              <div className="verified-zalo-badge">
                <ShieldCheck size={18} color="#22c55e" />
                <span>Đã xác thực Zalo (Số điện thoại chính chủ)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: IMAGE UPLOAD */}
      {currentStep === 2 && (
        <div className="step-images-panel">
          <div className="file-drag-drop-zone" onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => document.getElementById('file-upload-input').click()}>
            <input type="file" id="file-upload-input" multiple accept="image/*" style={{ display: 'none' }} onChange={handleImageFileChange} />
            <UploadCloud size={48} color="#2563eb" />
            <h3>Chọn hoặc Kéo thả nhiều tệp tin ảnh ở đây</h3>
            <p>Hỗ trợ định dạng PNG, JPG, JPEG dung lượng tối đa 10MB</p>
            <button type="button" className="upload-select-btn">Chọn tệp tin</button>
          </div>

          <div className="images-action-toolbar">
            <span className="images-counter-text">ĐÃ CHỌN {listing.images.filter(img => img.selected).length} ẢNH</span>
            <div className="toolbar-buttons">
              <button type="button" className="toolbar-btn featured-action" disabled={listing.images.filter(img => img.selected).length !== 1} onClick={setFeaturedImage}>Đặt làm Ảnh nổi bật</button>
              <button type="button" className="toolbar-btn delete-action" disabled={!listing.images.some(img => img.selected)} onClick={deleteSelectedImages}><Trash2 size={16} /> Xóa</button>
            </div>
          </div>

          <div className="images-preview-thumbnails-grid">
            {listing.images.map((image, index) => (
              <div key={index} className={`image-preview-card ${image.selected ? 'checked' : ''} ${image.isFeatured ? 'featured' : ''}`}>
                <img src={image.url} alt={`Preview ${index}`} />
                <div className="card-checkbox-overlay" onClick={() => toggleSelectImage(index)}>
                  <div className={`mock-checkbox ${image.selected ? 'checked' : ''}`}>{image.selected && <Check size={12} />}</div>
                </div>
                {image.isFeatured && <span className="featured-badge-ribbon">★ Ảnh nổi bật</span>}
                <div className="image-metadata">
                  <p className="img-name">{image.name}</p>
                  <p className="img-size">{image.size} MB</p>
                </div>
              </div>
            ))}
            <div className="image-preview-card dashed-add-card" onClick={() => document.getElementById('file-upload-input').click()}>
              <div className="add-card-content"><ImageIcon size={24} /><span>Thêm ảnh</span></div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: VISIBILITY */}
      {currentStep === 3 && (
        <div className="step-visibility-panel">
          <div className="config-column">
            <div className="form-card">
              <h2 className="card-title">Chế độ hiển thị</h2>
              <div className="radio-cards-group">
                <div className={`radio-card-item ${listing.is_public ? 'selected' : ''}`} onClick={() => setListing(prev => ({ ...prev, is_public: true }))}>
                  <div className="radio-circle">{listing.is_public && <div className="inner" />}</div>
                  <div className="radio-card-text"><h3>Công khai</h3><p>Mọi người đều có thể tìm thấy và xem tin này</p></div>
                  <Globe size={20} className="suffix-icon" />
                </div>
                <div className={`radio-card-item ${!listing.is_public ? 'selected' : ''}`} onClick={() => setListing(prev => ({ ...prev, is_public: false }))}>
                  <div className="radio-circle">{!listing.is_public && <div className="inner" />}</div>
                  <div className="radio-card-text"><h3>Riêng tư</h3><p>Chỉ bạn mới có thể chỉnh sửa và hiển thị tin này</p></div>
                  <Lock size={20} className="suffix-icon" />
                </div>
              </div>
            </div>

            <div className="form-card">
              <h2 className="card-title">Lựa chọn kênh đăng tải</h2>
              <div className="checkbox-cards-grid">
                {[
                  { key: 'Homepage', icon: <Home size={24} className="channel-icon" />, label: 'Trang chủ', desc: 'Hiển thị ở danh mục trang chủ chính' },
                  { key: 'Social', icon: <Megaphone size={24} className="channel-icon" />, label: 'Mạng xã hội', desc: 'Tự động chia sẻ lên kênh tin tức' },
                  { key: 'Affiliate', icon: <SlidersHorizontal size={24} className="channel-icon" />, label: 'Đối tác', desc: 'Đồng bộ đến mạng lưới liên kết' }
                ].map(ch => (
                  <div key={ch.key} className={`checkbox-card-item ${listing.channels.includes(ch.key) ? 'checked' : ''}`} onClick={() => toggleChannel(ch.key)}>
                    {ch.icon}<h3>{ch.label}</h3><p>{ch.desc}</p>
                    <div className="checkbox-box">{listing.channels.includes(ch.key) && <Check size={14} />}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="preview-column">
            <h2 className="card-title">Xem trước tin đăng</h2>
            <div className="live-preview-card">
              <div className="preview-image-wrap">
                <img src={listing.thumbnail || (listing.images.find(img => img.isFeatured)?.url || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80')} alt="Listing Preview" />
                <span className="verified-overlay-badge">ĐÃ XÁC THỰC</span>
                <div className="preview-bottom-gradient">
                  <h3>{listing.title || 'Tiêu đề tin đăng của bạn'}</h3>
                  <p className="preview-address"><MapPin size={12} /><span>{listing.address_detail ? `${listing.address_detail}, ${listing.ward}, ${listing.district}` : 'Địa chỉ bất động sản'}</span></p>
                  <div className="preview-specs-chips">
                    <div className="chip"><Bed size={12} /><span>{listing.bedrooms || 0} Giường</span></div>
                    <div className="chip"><Bath size={12} /><span>{listing.bathrooms || 0} Tắm</span></div>
                    <div className="chip"><Maximize size={12} /><span>{listing.area || 0} m²</span></div>
                  </div>
                  <div className="preview-price-row">
                    <span className="price">{(parseFloat(listing.price) || 0).toLocaleString('vi-VN')} VND</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="tip-insight-alert">
              <Info size={18} color="#047857" />
              <p>Mẹo: Thêm ít nhất 3 ảnh chất lượng cao và ghi chi tiết tiện ích để tăng gấp đôi cơ hội tiếp cận khách hàng!</p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {currentStep === 4 && (
        <div className="success-finished-panel">
          <div className="result-success-component">
            <div className="success-animated-checkmark">
              <CheckCircle size={64} color="#22c55e" />
            </div>
            <h1>Đăng tin thành công</h1>
            <p className="success-subtext">Chúc mừng! Tin đăng của bạn đã được kiểm duyệt và hiển thị công khai trên Swipe Nest.</p>
          </div>

          <div className="success-preview-listing">
            <div className="property-card horizontal-listing">
              <img src={submittedProperty?.thumbnail || 'https://via.placeholder.com/150'} alt="Listing" />
              <div className="listing-info">
                <h3>{submittedProperty?.title}</h3>
                <p className="card-address"><MapPin size={14} /><span>{submittedProperty?.address || submittedProperty?.district}</span></p>
                <p className="price">{(submittedProperty?.price || 0).toLocaleString('vi-VN')} VND</p>
              </div>
            </div>
          </div>

          <div className="large-go-home-shortcut" onClick={resetForm}>
            <LayoutDashboard size={32} color="#2563eb" />
            <span>VỀ TRANG CHỦ QUẢN LÝ TIN ĐĂNG</span>
          </div>

          <div className="upsell-marketing-banner">
            <div className="banner-left">
              <div className="megaphone-wrap"><Megaphone size={24} color="#1d4ed8" /></div>
              <div className="marketing-copy">
                <h3>NÂNG CẤP DANH SÁCH TIN ĐĂNG</h3>
                <p>Đẩy tin đăng lên đầu trang tìm kiếm, tiếp cận hơn 10,000 khách hàng tiềm năng mỗi ngày.</p>
              </div>
            </div>
            <button type="button" className="cta-pill-btn" onClick={() => alert('Chức năng nâng cấp đang được cập nhật')}>Tìm hiểu ngay</button>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      {currentStep < 4 && (
        <div className="step-navigation-footer">
          {currentStep > 1 ? (
            <button type="button" className="nav-secondary-btn" onClick={() => setCurrentStep(prev => prev - 1)}>
              <ArrowLeft size={16} /><span>Quay lại</span>
            </button>
          ) : <div />}

          {currentStep < 3 ? (
            <button 
              type="button" 
              className="nav-primary-btn" 
              onClick={() => setCurrentStep(prev => prev + 1)}
              disabled={currentStep === 2 && listing.images.length === 0}
            >
              <span>Tiếp theo</span><ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="nav-primary-btn submit-action" onClick={handleSubmitListing} disabled={isCheckingSave}>
              <span>{isCheckingSave ? 'Đang kiểm tra...' : 'Hoàn tất & Đăng tin'}</span>
              <CheckCircle2 size={16} />
            </button>
          )}
        </div>
      )}

      {showWarningsModal && (
        <div className="modal-backdrop warning-modal-backdrop" style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)' }}>
          <div className="filter-modal-content warning-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%', padding: '30px', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <h2 style={{ color: '#ea580c', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', fontSize: '20px', fontWeight: '700' }}>
              <Info size={24} /> Lưu ý trước khi lưu tin
            </h2>
            <div className="warnings-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '25px' }}>
              {warnings.map((warn, i) => (
                <div key={i} className="warning-item" style={{ padding: '15px', borderRadius: '10px', backgroundColor: '#fff7ed', borderLeft: '4px solid #ea580c' }}>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: '#7c2d12', fontWeight: '500' }}>{warn.text}</p>
                </div>
              ))}
            </div>
            <div className="filter-actions" style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => setShowWarningsModal(false)}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #d1d5db', cursor: 'pointer', backgroundColor: 'transparent', fontWeight: '600', color: '#4b5563' }}
              >
                Chỉnh sửa thêm
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                onClick={executeSaveListing}
                style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: '#ea580c', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' }}
              >
                Vẫn đăng tin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateListingWizard;
