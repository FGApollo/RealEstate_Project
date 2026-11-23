import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, BedDouble, BriefcaseBusiness, Building2, Check,
  ChevronDown, ChevronRight, Home as HomeIcon, LayoutGrid,
  MapPin, Search, Store, Tag, X
} from 'lucide-react';
import { useAdminAreas } from '../location/adminAreas';
import {
  PRICE_PRESET_OPTIONS,
  PROPERTY_TYPE_ITEMS,
  REGION_TABS,
  filterAndSortProvinces,
  filterWards,
  formatAreaDropdownLabel,
  formatPriceDropdownLabel,
  formatPropertyTypeLabel,
  matchPricePreset,
  millionInputToVnd,
  normalizeSearchText,
  shortProvinceName,
  vndToMillionInput
} from './searchDropdownLogic';
import './HomeSearchDropdowns.css';

const TYPE_ICONS = {
  all: LayoutGrid,
  building: Building2,
  home: HomeIcon,
  room: BedDouble,
  shop: Store,
  office: BriefcaseBusiness
};

const DropdownPopover = ({ open, anchorRef, onClose, width = 336, label, children }) => {
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const isMobile = vw <= 640;
    if (isMobile) {
      setCoords({ isMobile: true, top: Math.min(rect.bottom + 10, Math.max(76, window.innerHeight * 0.16)), left: 14, width: vw - 28 });
      return;
    }
    const panelW = Math.min(width, vw - 24);
    const left = rect.left + panelW > vw - 16 ? Math.max(16, vw - panelW - 16) : rect.left;
    setCoords({ isMobile: false, top: rect.bottom + 12, left, width: panelW });
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
    const onPointerDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, anchorRef, onClose]);

  if (!open || !coords) return null;

  return createPortal(
    <>
      {coords.isMobile && <div className="hsd-mobile-backdrop" onClick={onClose} aria-hidden="true" />}
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        className={`hsd-popover ${coords.isMobile ? 'is-mobile' : ''}`}
        style={{ top: `${coords.top}px`, left: `${coords.left}px`, width: `${coords.width}px` }}
      >
        {children}
      </div>
    </>,
    document.body
  );
};

// Shared trigger + popover shell with consistent footer actions.
const FilterDropdown = ({
  fieldClassName,
  icon: Icon,
  label,
  value,
  isActive,
  open,
  onToggle,
  onClose,
  onReset,
  onApply,
  width,
  dialogLabel,
  children
}) => {
  const triggerRef = useRef(null);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`home-hero-field ${fieldClassName} home-hero-dropdown-trigger ${open ? 'is-open' : ''}`}
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon aria-hidden="true" size={20} />
        <span className="home-hero-field-content">
          <span>{label}</span>
          <span className={`home-hero-field-value ${isActive ? 'is-active' : ''}`}>{value}</span>
        </span>
        <ChevronDown aria-hidden="true" size={14} className="hsd-chevron" />
      </button>

      <DropdownPopover open={open} anchorRef={triggerRef} onClose={onClose} width={width} label={dialogLabel}>
        <div className="hsd-body">{children}</div>
        <div className="hsd-footer">
          <button type="button" className="hsd-reset-btn" onClick={onReset}>Đặt lại</button>
          <button type="button" className="hsd-apply-btn" onClick={onApply}>Áp dụng</button>
        </div>
      </DropdownPopover>
    </>
  );
};

const DropdownSearchInput = ({ value, onChange, placeholder, autoFocus = false }) => (
  <div className="hsd-search-wrap">
    <Search size={16} className="hsd-search-icon" aria-hidden="true" />
    <input
      type="text"
      className="hsd-search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
    {value && (
      <button type="button" className="hsd-search-clear" onClick={() => onChange('')} aria-label="Xóa từ khóa">
        <X size={15} />
      </button>
    )}
  </div>
);

const DropdownOptionRow = ({ icon: Icon, label, selected, onClick }) => (
  <button
    type="button"
    role="option"
    aria-selected={selected}
    className={`hsd-option ${selected ? 'is-selected' : ''}`}
    onClick={onClick}
  >
    <Icon size={16} className="hsd-opt-icon" />
    <span className="hsd-opt-label">{label}</span>
    {selected && <Check size={16} className="hsd-opt-check" />}
  </button>
);

export const HomeAreaDropdown = ({ province, ward, onChange }) => {
  const { provinces, error } = useAdminAreas();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('ALL');
  const [step, setStep] = useState('province');
  const [draft, setDraft] = useState({ province: province || '', ward: ward || '' });

  const selectedProvince = useMemo(
    () => provinces.find((item) => item.name === draft.province) || null,
    [provinces, draft.province]
  );
  const visibleProvinces = useMemo(
    () => filterAndSortProvinces(provinces, { region, query }),
    [provinces, region, query]
  );
  const visibleWards = useMemo(
    () => filterWards(selectedProvince?.wards || [], query),
    [selectedProvince, query]
  );

  const toggle = () => {
    setDraft({ province: province || '', ward: ward || '' });
    setQuery('');
    setStep('province');
    setOpen((prev) => !prev);
  };

  const reset = () => {
    const empty = { province: '', ward: '' };
    setDraft(empty);
    setQuery('');
    setRegion('ALL');
    setStep('province');
    onChange(empty);
  };

  return (
    <FilterDropdown
      fieldClassName="home-hero-field-area"
      icon={MapPin}
      label="Khu vực"
      value={formatAreaDropdownLabel({ province, ward, hasProvinces: provinces.length > 0, error })}
      isActive={Boolean(province)}
      open={open}
      onToggle={toggle}
      onClose={() => setOpen(false)}
      onReset={reset}
      onApply={() => { onChange(draft); setOpen(false); }}
      width={346}
      dialogLabel="Chọn khu vực"
    >
      <DropdownSearchInput
        value={query}
        onChange={setQuery}
        placeholder={step === 'ward' ? `Tìm phường/xã tại ${shortProvinceName(draft.province)}...` : 'Tìm kiếm khu vực...'}
        autoFocus
      />

      {step === 'province' ? (
        <>
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

          {selectedProvince?.wards?.length > 0 && (
            <button type="button" className="hsd-ward-banner" onClick={() => { setQuery(''); setStep('ward'); }}>
              <span>{draft.ward ? `Phường/xã: ${draft.ward}` : `Chọn phường/xã tại ${shortProvinceName(selectedProvince.name)}`}</span>
              <ChevronRight size={15} />
            </button>
          )}

          <div className="hsd-list" role="listbox" aria-label="Danh sách tỉnh thành">
            {!query && region === 'ALL' && (
              <DropdownOptionRow
                icon={MapPin}
                label="Tất cả tỉnh/thành phố"
                selected={!draft.province}
                onClick={() => setDraft({ province: '', ward: '' })}
              />
            )}
            {visibleProvinces.length === 0 ? (
              <div className="hsd-empty">Không tìm thấy khu vực phù hợp</div>
            ) : (
              visibleProvinces.map((item) => (
                <DropdownOptionRow
                  key={item.code}
                  icon={MapPin}
                  label={item.name}
                  selected={draft.province === item.name}
                  onClick={() => setDraft((prev) => ({ province: item.name, ward: prev.province === item.name ? prev.ward : '' }))}
                />
              ))
            )}
          </div>
        </>
      ) : (
        <>
          <div className="hsd-sub-header">
            <button type="button" className="hsd-sub-back" onClick={() => { setQuery(''); setStep('province'); }}>
              <ArrowLeft size={15} />
              <span>{selectedProvince?.name}</span>
            </button>
          </div>
          <div className="hsd-list" role="listbox" aria-label="Danh sách phường xã">
            {!query && (
              <DropdownOptionRow
                icon={MapPin}
                label="Tất cả phường/xã"
                selected={!draft.ward}
                onClick={() => setDraft((prev) => ({ ...prev, ward: '' }))}
              />
            )}
            {visibleWards.length === 0 ? (
              <div className="hsd-empty">Không tìm thấy phường/xã phù hợp</div>
            ) : (
              visibleWards.map((item) => (
                <DropdownOptionRow
                  key={item.code}
                  icon={MapPin}
                  label={item.name}
                  selected={draft.ward === item.name}
                  onClick={() => setDraft((prev) => ({ ...prev, ward: item.name }))}
                />
              ))
            )}
          </div>
        </>
      )}
    </FilterDropdown>
  );
};

export const HomePropertyTypeDropdown = ({ selectedCategories = [], onApplyCategories }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(selectedCategories);

  const visibleItems = useMemo(() => {
    const q = normalizeSearchText(query);
    return q ? PROPERTY_TYPE_ITEMS.filter((o) => o.value !== 'ALL' && normalizeSearchText(o.label).includes(q)) : PROPERTY_TYPE_ITEMS;
  }, [query]);

  const toggleItem = (val) => {
    if (val === 'ALL') return setDraft([]);
    setDraft((prev) => (prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]));
  };

  return (
    <FilterDropdown
      fieldClassName="home-hero-field-type"
      icon={HomeIcon}
      label="Loại bất động sản"
      value={formatPropertyTypeLabel(selectedCategories)}
      isActive={selectedCategories.length > 0}
      open={open}
      onToggle={() => { setDraft(selectedCategories); setQuery(''); setOpen((prev) => !prev); }}
      onClose={() => setOpen(false)}
      onReset={() => { setDraft([]); setQuery(''); onApplyCategories([]); }}
      onApply={() => { onApplyCategories(draft); setOpen(false); }}
      width={312}
      dialogLabel="Chọn loại bất động sản"
    >
      <DropdownSearchInput value={query} onChange={setQuery} placeholder="Tìm loại bất động sản..." />
      <div className="hsd-list hsd-list-compact" role="listbox" aria-label="Danh sách loại bất động sản">
        {visibleItems.length === 0 ? (
          <div className="hsd-empty">Không tìm thấy loại hình phù hợp</div>
        ) : (
          visibleItems.map((opt) => (
            <DropdownOptionRow
              key={opt.value}
              icon={TYPE_ICONS[opt.iconKey] || HomeIcon}
              label={opt.label}
              selected={opt.value === 'ALL' ? draft.length === 0 : draft.includes(opt.value)}
              onClick={() => toggleItem(opt.value)}
            />
          ))
        )}
      </div>
    </FilterDropdown>
  );
};

export const HomePriceDropdown = ({ priceRange, minPrice, maxPrice, onApplyPrice }) => {
  const [open, setOpen] = useState(false);
  const [draftMin, setDraftMin] = useState(() => vndToMillionInput(minPrice));
  const [draftMax, setDraftMax] = useState(() => vndToMillionInput(maxPrice));

  const activePreset = useMemo(() => matchPricePreset(draftMin, draftMax), [draftMin, draftMax]);

  return (
    <FilterDropdown
      fieldClassName="home-hero-field-price"
      icon={Tag}
      label="Khoảng giá"
      value={formatPriceDropdownLabel({ priceRange, minPrice, maxPrice })}
      isActive={Boolean(minPrice || maxPrice)}
      open={open}
      onToggle={() => { setDraftMin(vndToMillionInput(minPrice)); setDraftMax(vndToMillionInput(maxPrice)); setOpen((prev) => !prev); }}
      onClose={() => setOpen(false)}
      onReset={() => { setDraftMin(''); setDraftMax(''); onApplyPrice({ minPrice: '', maxPrice: '' }); }}
      onApply={() => { onApplyPrice({ minPrice: millionInputToVnd(draftMin), maxPrice: millionInputToVnd(draftMax) }); setOpen(false); }}
      width={316}
      dialogLabel="Chọn khoảng giá"
    >
      <div className="hsd-list hsd-list-compact" role="listbox" aria-label="Danh sách khoảng giá">
        {PRICE_PRESET_OPTIONS.map((opt) => (
          <DropdownOptionRow
            key={opt.value}
            icon={Tag}
            label={opt.label}
            selected={activePreset === opt.value}
            onClick={() => { setDraftMin(vndToMillionInput(opt.min)); setDraftMax(vndToMillionInput(opt.max)); }}
          />
        ))}
      </div>

      <div className="hsd-custom-price">
        <span className="hsd-custom-label">Hoặc nhập mức giá (triệu/tháng)</span>
        <div className="hsd-custom-inputs">
          <input type="number" min="0" step="0.5" placeholder="Từ" value={draftMin} onChange={(e) => setDraftMin(e.target.value)} aria-label="Giá tối thiểu (triệu)" />
          <span className="hsd-custom-dash">–</span>
          <input type="number" min="0" step="0.5" placeholder="Đến" value={draftMax} onChange={(e) => setDraftMax(e.target.value)} aria-label="Giá tối đa (triệu)" />
        </div>
      </div>
    </FilterDropdown>
  );
};
