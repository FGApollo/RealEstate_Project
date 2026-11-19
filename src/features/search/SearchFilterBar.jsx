import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, Layers3, MapPin, Search, Tag, X } from 'lucide-react';
import AreaSelect from '../location/AreaSelect';
import { PRICE_RANGES, PROPERTY_TYPE_OPTIONS, priceRangeOf } from './searchParams';
import './SearchFilterBar.css';

const TRANSACTION_OPTIONS = [
  { value: '', label: 'Thuê & bán' },
  { value: 'RENT', label: 'Cho thuê' },
  { value: 'SALE', label: 'Mua bán' }
];

const FilterSelect = ({ label, ariaLabel, icon: Icon, value, options, onChange }) => {
  const selected = options.find((option) => option.value === value);
  return (
  <label className="search-filter-field search-filter-select-field">
    <span className="search-filter-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
    <span className="search-filter-copy">
      <span className="search-filter-label">{label}</span>
      <span className="search-filter-value" aria-hidden="true">
        <span className="search-filter-long-value">{selected?.label}</span>
        <span className="search-filter-short-value">{selected?.mobileLabel || selected?.label}</span>
      </span>
    </span>
    <ChevronDown className="search-filter-chevron" size={15} aria-hidden="true" />
    <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
  );
};

// The parent keys this form by the URL, so Back/Forward and filter chips reset
// its draft without an effect that can overwrite a user's current input.
const SearchFilterBar = ({ search, onApply }) => {
  const [draft, setDraft] = useState(() => ({
    province: search.province,
    ward: search.ward,
    type: search.types.length === 1 ? search.types[0] : (search.types.length > 1 ? 'CUSTOM' : 'ALL'),
    price: priceRangeOf(search),
    listing: search.listing
  }));
  const [locationOpen, setLocationOpen] = useState(false);
  const locationId = useId();
  const locationRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!locationOpen) return undefined;
    const closeOutside = (event) => {
      if (!locationRef.current?.contains(event.target)) setLocationOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLocationOpen(false);
        triggerRef.current?.focus();
      }
    };
    (panelRef.current?.querySelector('select:not(:disabled)') || panelRef.current)?.focus();
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [locationOpen]);

  const closeLocation = () => {
    setLocationOpen(false);
    triggerRef.current?.focus();
  };
  const submit = (event) => {
    event.preventDefault();
    const range = PRICE_RANGES.find((item) => item.value === draft.price);
    onApply({
      ...search,
      province: draft.province,
      ward: draft.ward,
      types: draft.type === 'ALL' ? [] : draft.type === 'CUSTOM' ? search.types : [draft.type],
      listing: draft.listing,
      ...(range ? { minPrice: range.min, maxPrice: range.max } : {})
    });
    setLocationOpen(false);
  };
  const region = [draft.ward, draft.province].filter(Boolean).join(', ') || 'Tất cả tỉnh/thành phố';
  const types = [
    { value: 'ALL', label: 'Tất cả loại' },
    ...PROPERTY_TYPE_OPTIONS.map((type) => ({ value: type, label: type })),
    ...(draft.type === 'CUSTOM' ? [{ value: 'CUSTOM', label: 'Nhiều loại hình' }] : [])
  ];
  const prices = [...PRICE_RANGES.map((range) => range.value === 'ALL' ? { ...range, mobileLabel: 'Tất cả' } : range),
    ...(draft.price === 'CUSTOM' ? [{ value: 'CUSTOM', label: 'Tùy chọn giá' }] : [])];

  return (
    <form className="search-page-bar" onSubmit={submit} role="search" aria-label="Bộ lọc bất động sản">
      <div className="search-filter-location" ref={locationRef}>
        <button ref={triggerRef} type="button" className={`search-filter-field search-filter-location-trigger${locationOpen ? ' is-open' : ''}`}
          aria-label={`Khu vực: ${region}`} aria-expanded={locationOpen} aria-controls={locationId} aria-haspopup="dialog"
          onClick={() => setLocationOpen((open) => !open)}>
          <span className="search-filter-icon"><MapPin size={19} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className="search-filter-copy">
            <span className="search-filter-label">Khu vực</span>
            <span className="search-filter-value" title={region}>
              <span className="search-filter-long-value">{region}</span>
              <span className="search-filter-short-value">{draft.ward || draft.province || 'Toàn quốc'}</span>
            </span>
          </span>
          <ChevronDown className="search-filter-chevron" size={15} aria-hidden="true" />
        </button>
        {locationOpen && (
          <div ref={panelRef} id={locationId} className="search-location-panel" role="dialog" aria-label="Chọn khu vực" tabIndex={-1}>
            <div className="search-location-panel-heading">
              <h2>Chọn khu vực</h2>
              <button type="button" aria-label="Đóng chọn khu vực" onClick={closeLocation}><X size={18} /></button>
            </div>
            <p>Chọn tỉnh/thành phố, sau đó phường/xã.</p>
            <AreaSelect province={draft.province} ward={draft.ward} className="search-filter-area"
              onChange={(area) => setDraft((current) => ({ ...current, ...area }))} />
            <button type="button" className="search-location-done" onClick={closeLocation}>Xong</button>
          </div>
        )}
      </div>
      <FilterSelect label="Loại BĐS" ariaLabel="Loại bất động sản" icon={Layers3} value={draft.type} options={types}
        onChange={(type) => setDraft((current) => ({ ...current, type }))} />
      <FilterSelect label="Khoảng giá" ariaLabel="Khoảng giá" icon={Tag} value={draft.price} options={prices}
        onChange={(price) => setDraft((current) => ({ ...current, price }))} />
      <FilterSelect label="Hình thức giao dịch" ariaLabel="Hình thức" icon={CalendarDays} value={draft.listing} options={TRANSACTION_OPTIONS}
        onChange={(listing) => setDraft((current) => ({ ...current, listing }))} />
      <button type="submit" className="search-page-submit"><Search size={18} aria-hidden="true" /><span>Tìm kiếm</span></button>
    </form>
  );
};

export default SearchFilterBar;
