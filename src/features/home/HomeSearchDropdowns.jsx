import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, BedDouble, BriefcaseBusiness, Building2, Check,
  ChevronDown, ChevronRight, Home as HomeIcon, LayoutGrid,
  MapPin, Search, Store, Tag, X
} from 'lucide-react';
import { useAdminAreas } from '../location/adminAreas';
import './HomeSearchDropdowns.css';

// Phân vùng 34 tỉnh/thành phố theo hệ thống hành chính mới 2025.
const SOUTH_CODES = new Set([75, 79, 80, 82, 86, 91, 92, 96]);
const CENTRAL_CODES = new Set([38, 40, 42, 44, 46, 48, 51, 52, 56, 66, 68]);
const MAJOR_CITY_ORDER = [79, 1, 48, 92, 31];

const REGION_TABS = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'SOUTH', label: 'Miền Nam' },
  { key: 'CENTRAL', label: 'Miền Trung' },
  { key: 'NORTH', label: 'Miền Bắc' }
];

const PROPERTY_TYPE_OPTIONS = [
  { value: 'ALL', label: 'Tất cả loại', Icon: LayoutGrid },
  { value: 'Căn Hộ', label: 'Căn hộ', Icon: Building2 },
  { value: 'Chung Cư', label: 'Chung cư', Icon: Building2 },
  { value: 'Nhà Ở', label: 'Nhà ở', Icon: HomeIcon },
  { value: 'Phòng Trọ', label: 'Phòng trọ', Icon: BedDouble },
  { value: 'Mặt Bằng', label: 'Mặt bằng', Icon: Store },
  { value: 'Văn Phòng', label: 'Văn phòng', Icon: BriefcaseBusiness }
];

const PRICE_PRESET_OPTIONS = [
  { value: 'ALL', label: 'Tất cả mức giá', min: '', max: '' },
  { value: 'under-5m', label: 'Dưới 5 triệu', min: '0', max: '5000000' },
  { value: '5m-10m', label: '5 - 10 triệu', min: '5000000', max: '10000000' },
  { value: '10m-20m', label: '10 - 20 triệu', min: '10000000', max: '20000000' },
  { value: 'over-20m', label: 'Trên 20 triệu', min: '20000000', max: '' }
];

const vndToMillionInput = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  if (num === 0) return '0';
  return String(Number((num / 1000000).toFixed(2)));
};

const millionInputToVnd = (value) => {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') return '';
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return '';
  return String(Math.round(num * 1000000));
};

const normalizeSearchText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

const regionOfProvince = (code) => {
  const num = Number(code);
  if (SOUTH_CODES.has(num)) return 'SOUTH';
  if (CENTRAL_CODES.has(num)) return 'CENTRAL';
  return 'NORTH';
};

const shortProvinceName = (name = '') =>
  String(name).replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();

const DropdownPopover = ({ open, anchorRef, onClose, width = 336, label, children }) => {
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isNarrow = vw <= 640;

    if (isNarrow) {
      setCoords({
        isMobileSheet: true,
        top: Math.min(rect.bottom + 10, Math.max(76, vh * 0.16)),
        left: 14,
        width: vw - 28
      });
      return;
    }

    const panelW = Math.min(width, vw - 24);
    let left = rect.left;
    if (left + panelW > vw - 16) {
      left = Math.max(16, vw - panelW - 16);
    }
    const top = rect.bottom + 12;
    setCoords({ isMobileSheet: false, top, left, width: panelW });
  }, [anchorRef, width]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      if (anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !coords) return null;

  return createPortal(
    <>
      {coords.isMobileSheet && (
        <div className="hsd-mobile-backdrop" onClick={onClose} aria-hidden="true" />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        className={`hsd-popover ${coords.isMobileSheet ? 'is-mobile' : ''}`}
        style={{
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          width: `${coords.width}px`
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
};

/* =========================================================
   1. KHU VỰC DROPDOWN
   ========================================================= */
export const HomeAreaDropdown = ({ province, ward, onChange }) => {
  const { provinces, error } = useAdminAreas();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('ALL');
  const [step, setStep] = useState('province'); // 'province' | 'ward'
  const [draft, setDraft] = useState({ province: province || '', ward: ward || '' });

  const openDropdown = () => {
    setDraft({ province: province || '', ward: ward || '' });
    setQuery('');
    setStep('province');
    setOpen((prev) => !prev);
  };

  const selectedProvinceObj = useMemo(
    () => provinces.find((item) => item.name === draft.province) || null,
    [provinces, draft.province]
  );

  const sortedProvinces = useMemo(() => {
    const q = normalizeSearchText(query);
    return provinces
      .filter((item) => {
        if (region !== 'ALL' && regionOfProvince(item.code) !== region) return false;
        if (!q) return true;
        return normalizeSearchText(item.name).includes(q);
      })
      .sort((a, b) => {
        if (region === 'ALL' && !q) {
          const ia = MAJOR_CITY_ORDER.indexOf(Number(a.code));
          const ib = MAJOR_CITY_ORDER.indexOf(Number(b.code));
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
        }
        return a.name.localeCompare(b.name, 'vi');
      });
  }, [provinces, region, query]);

  const filteredWards = useMemo(() => {
    const list = selectedProvinceObj?.wards || [];
    const q = normalizeSearchText(query);
    if (!q) return list;
    return list.filter((item) => normalizeSearchText(item.name).includes(q));
  }, [selectedProvinceObj, query]);

  const handleReset = () => {
    const empty = { province: '', ward: '' };
    setDraft(empty);
    setQuery('');
    setRegion('ALL');
    setStep('province');
    onChange(empty);
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const displayValue = ward
    ? `${ward}, ${shortProvinceName(province)}`
    : (province || (provinces.length ? 'Tất cả tỉnh/thành phố' : (error || 'Đang tải…')));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`home-hero-field home-hero-field-area home-hero-dropdown-trigger ${open ? 'is-open' : ''}`}
        onClick={openDropdown}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MapPin aria-hidden="true" size={20} />
        <span className="home-hero-field-content">
          <span>Khu vực</span>
          <span className={`home-hero-field-value ${province ? 'is-active' : ''}`}>
            {displayValue}
          </span>
        </span>
        <ChevronDown aria-hidden="true" size={14} className="hsd-chevron" />
      </button>

      <DropdownPopover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        width={346}
        label="Chọn khu vực"
      >
        <div className="hsd-body">
          {/* Search Input */}
          <div className="hsd-search-wrap">
            <Search size={16} className="hsd-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="hsd-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={step === 'ward' ? `Tìm phường/xã tại ${shortProvinceName(draft.province)}...` : 'Tìm kiếm khu vực...'}
              autoFocus
            />
            {query && (
              <button
                type="button"
                className="hsd-search-clear"
                onClick={() => setQuery('')}
                aria-label="Xóa từ khóa"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {step === 'province' ? (
            <>
              {/* Region Segmented Tabs */}
              <div className="hsd-tabs" role="tablist" aria-label="Lọc theo miền">
                {REGION_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={region === tab.key}
                    className={`hsd-tab ${region === tab.key ? 'active' : ''}`}
                    onClick={() => setRegion(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Optional quick jump to Ward selection when a province is picked */}
              {selectedProvinceObj && selectedProvinceObj.wards?.length > 0 && (
                <button
                  type="button"
                  className="hsd-ward-banner"
                  onClick={() => {
                    setQuery('');
                    setStep('ward');
                  }}
                >
                  <span>
                    {draft.ward
                      ? `Phường/xã: ${draft.ward}`
                      : `Chọn phường/xã tại ${shortProvinceName(selectedProvinceObj.name)}`}
                  </span>
                  <ChevronRight size={15} />
                </button>
              )}

              {/* Province Scrollable List */}
              <div className="hsd-list" role="listbox" aria-label="Danh sách tỉnh thành">
                {!query && region === 'ALL' && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={!draft.province}
                    className={`hsd-option ${!draft.province ? 'is-selected' : ''}`}
                    onClick={() => setDraft({ province: '', ward: '' })}
                  >
                    <MapPin size={16} className="hsd-opt-icon" />
                    <span className="hsd-opt-label">Tất cả tỉnh/thành phố</span>
                    {!draft.province && <Check size={16} className="hsd-opt-check" />}
                  </button>
                )}

                {sortedProvinces.length === 0 ? (
                  <div className="hsd-empty">Không tìm thấy khu vực phù hợp</div>
                ) : (
                  sortedProvinces.map((item) => {
                    const selected = draft.province === item.name;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`hsd-option ${selected ? 'is-selected' : ''}`}
                        onClick={() =>
                          setDraft((prev) => ({
                            province: item.name,
                            ward: prev.province === item.name ? prev.ward : ''
                          }))
                        }
                      >
                        <MapPin size={16} className="hsd-opt-icon" />
                        <span className="hsd-opt-label">{item.name}</span>
                        {selected && <Check size={16} className="hsd-opt-check" />}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <>
              {/* Ward step header */}
              <div className="hsd-sub-header">
                <button
                  type="button"
                  className="hsd-sub-back"
                  onClick={() => {
                    setQuery('');
                    setStep('province');
                  }}
                >
                  <ArrowLeft size={15} />
                  <span>{selectedProvinceObj?.name}</span>
                </button>
              </div>

              <div className="hsd-list" role="listbox" aria-label="Danh sách phường xã">
                {!query && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={!draft.ward}
                    className={`hsd-option ${!draft.ward ? 'is-selected' : ''}`}
                    onClick={() => setDraft((prev) => ({ ...prev, ward: '' }))}
                  >
                    <MapPin size={16} className="hsd-opt-icon" />
                    <span className="hsd-opt-label">Tất cả phường/xã</span>
                    {!draft.ward && <Check size={16} className="hsd-opt-check" />}
                  </button>
                )}

                {filteredWards.length === 0 ? (
                  <div className="hsd-empty">Không tìm thấy phường/xã phù hợp</div>
                ) : (
                  filteredWards.map((item) => {
                    const selected = draft.ward === item.name;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`hsd-option ${selected ? 'is-selected' : ''}`}
                        onClick={() => setDraft((prev) => ({ ...prev, ward: item.name }))}
                      >
                        <MapPin size={16} className="hsd-opt-icon" />
                        <span className="hsd-opt-label">{item.name}</span>
                        {selected && <Check size={16} className="hsd-opt-check" />}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        <div className="hsd-footer">
          <button type="button" className="hsd-reset-btn" onClick={handleReset}>
            Đặt lại
          </button>
          <button type="button" className="hsd-apply-btn" onClick={handleApply}>
            Áp dụng
          </button>
        </div>
      </DropdownPopover>
    </>
  );
};

/* =========================================================
   2. LOẠI BẤT ĐỘNG SẢN DROPDOWN
   ========================================================= */
export const HomePropertyTypeDropdown = ({ selectedCategories = [], onApplyCategories }) => {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(selectedCategories);

  const openDropdown = () => {
    setDraft(selectedCategories);
    setQuery('');
    setOpen((prev) => !prev);
  };

  const filteredOptions = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return PROPERTY_TYPE_OPTIONS;
    return PROPERTY_TYPE_OPTIONS.filter(
      (opt) => opt.value !== 'ALL' && normalizeSearchText(opt.label).includes(q)
    );
  }, [query]);

  const toggleOption = (val) => {
    if (val === 'ALL') {
      setDraft([]);
      return;
    }
    setDraft((prev) =>
      prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]
    );
  };

  const handleReset = () => {
    setDraft([]);
    setQuery('');
    onApplyCategories([]);
  };

  const handleApply = () => {
    onApplyCategories(draft);
    setOpen(false);
  };

  const displayLabel =
    selectedCategories.length === 0
      ? 'Tất cả loại'
      : selectedCategories.length === 1
        ? (PROPERTY_TYPE_OPTIONS.find((o) => o.value === selectedCategories[0])?.label || selectedCategories[0])
        : `${selectedCategories.length} loại hình`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`home-hero-field home-hero-field-type home-hero-dropdown-trigger ${open ? 'is-open' : ''}`}
        onClick={openDropdown}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <HomeIcon aria-hidden="true" size={20} />
        <span className="home-hero-field-content">
          <span>Loại bất động sản</span>
          <span className={`home-hero-field-value ${selectedCategories.length ? 'is-active' : ''}`}>
            {displayLabel}
          </span>
        </span>
        <ChevronDown aria-hidden="true" size={14} className="hsd-chevron" />
      </button>

      <DropdownPopover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        width={312}
        label="Chọn loại bất động sản"
      >
        <div className="hsd-body">
          <div className="hsd-search-wrap">
            <Search size={16} className="hsd-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="hsd-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm loại bất động sản..."
            />
            {query && (
              <button
                type="button"
                className="hsd-search-clear"
                onClick={() => setQuery('')}
                aria-label="Xóa từ khóa"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="hsd-list hsd-list-compact" role="listbox" aria-label="Danh sách loại bất động sản">
            {filteredOptions.length === 0 ? (
              <div className="hsd-empty">Không tìm thấy loại hình phù hợp</div>
            ) : (
              filteredOptions.map((opt) => {
                const Icon = opt.Icon;
                const isSelected =
                  opt.value === 'ALL'
                    ? draft.length === 0
                    : draft.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`hsd-option ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => toggleOption(opt.value)}
                  >
                    <Icon size={16} className="hsd-opt-icon" />
                    <span className="hsd-opt-label">{opt.label}</span>
                    {isSelected && <Check size={16} className="hsd-opt-check" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="hsd-footer">
          <button type="button" className="hsd-reset-btn" onClick={handleReset}>
            Đặt lại
          </button>
          <button type="button" className="hsd-apply-btn" onClick={handleApply}>
            Áp dụng
          </button>
        </div>
      </DropdownPopover>
    </>
  );
};

/* =========================================================
   3. KHOẢNG GIÁ DROPDOWN
   ========================================================= */
export const HomePriceDropdown = ({ priceRange, minPrice, maxPrice, onApplyPrice }) => {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [draftMinMillion, setDraftMinMillion] = useState(() => vndToMillionInput(minPrice));
  const [draftMaxMillion, setDraftMaxMillion] = useState(() => vndToMillionInput(maxPrice));

  const openDropdown = () => {
    setDraftMinMillion(vndToMillionInput(minPrice));
    setDraftMaxMillion(vndToMillionInput(maxPrice));
    setOpen((prev) => !prev);
  };

  const activeDraftPreset = useMemo(() => {
    const minVnd = millionInputToVnd(draftMinMillion);
    const maxVnd = millionInputToVnd(draftMaxMillion);
    const matched = PRICE_PRESET_OPTIONS.find(
      (opt) => opt.min === minVnd && opt.max === maxVnd
    );
    return matched ? matched.value : 'CUSTOM';
  }, [draftMinMillion, draftMaxMillion]);

  const handleSelectPreset = (opt) => {
    setDraftMinMillion(vndToMillionInput(opt.min));
    setDraftMaxMillion(vndToMillionInput(opt.max));
  };

  const handleReset = () => {
    setDraftMinMillion('');
    setDraftMaxMillion('');
    onApplyPrice({ minPrice: '', maxPrice: '' });
  };

  const handleApply = () => {
    onApplyPrice({
      minPrice: millionInputToVnd(draftMinMillion),
      maxPrice: millionInputToVnd(draftMaxMillion)
    });
    setOpen(false);
  };

  const displayLabel = useMemo(() => {
    const matched = PRICE_PRESET_OPTIONS.find((opt) => opt.value === priceRange);
    if (matched) return matched.label;
    const minM = vndToMillionInput(minPrice);
    const maxM = vndToMillionInput(maxPrice);
    if (minM && maxM) return `${minM} - ${maxM} triệu`;
    if (minM) return `Từ ${minM} triệu`;
    if (maxM) return `Đến ${maxM} triệu`;
    return 'Tất cả mức giá';
  }, [priceRange, minPrice, maxPrice]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`home-hero-field home-hero-field-price home-hero-dropdown-trigger ${open ? 'is-open' : ''}`}
        onClick={openDropdown}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Tag aria-hidden="true" size={20} />
        <span className="home-hero-field-content">
          <span>Khoảng giá</span>
          <span className={`home-hero-field-value ${(minPrice || maxPrice) ? 'is-active' : ''}`}>
            {displayLabel}
          </span>
        </span>
        <ChevronDown aria-hidden="true" size={14} className="hsd-chevron" />
      </button>

      <DropdownPopover
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        width={316}
        label="Chọn khoảng giá"
      >
        <div className="hsd-body">
          <div className="hsd-list hsd-list-compact" role="listbox" aria-label="Danh sách khoảng giá">
            {PRICE_PRESET_OPTIONS.map((opt) => {
              const isSelected = activeDraftPreset === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`hsd-option ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => handleSelectPreset(opt)}
                >
                  <Tag size={15} className="hsd-opt-icon" />
                  <span className="hsd-opt-label">{opt.label}</span>
                  {isSelected && <Check size={16} className="hsd-opt-check" />}
                </button>
              );
            })}
          </div>

          {/* Custom price range inputs */}
          <div className="hsd-custom-price">
            <span className="hsd-custom-label">Hoặc nhập mức giá (triệu/tháng)</span>
            <div className="hsd-custom-inputs">
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="Từ"
                value={draftMinMillion}
                onChange={(e) => setDraftMinMillion(e.target.value)}
                aria-label="Giá tối thiểu (triệu)"
              />
              <span className="hsd-custom-dash">–</span>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="Đến"
                value={draftMaxMillion}
                onChange={(e) => setDraftMaxMillion(e.target.value)}
                aria-label="Giá tối đa (triệu)"
              />
            </div>
          </div>
        </div>

        <div className="hsd-footer">
          <button type="button" className="hsd-reset-btn" onClick={handleReset}>
            Đặt lại
          </button>
          <button type="button" className="hsd-apply-btn" onClick={handleApply}>
            Áp dụng
          </button>
        </div>
      </DropdownPopover>
    </>
  );
};
