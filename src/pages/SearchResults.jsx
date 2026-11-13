import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bath, Bed, Heart, Loader2, MapPin, Ruler, Search, X } from 'lucide-react';
import Header from '../components/Header';
import PropertyDetailModal from '../components/PropertyDetailModal';
import { SwipeNestBadges } from '../features/plus/SwipeNestBadges';
import AreaSelect from '../features/location/AreaSelect';
import { API_BASE_URL } from '../config';
import { apiFetch, publicApiFetch } from '../auth/apiClient';
import { useAuth } from '../auth/useAuth';
import {
  PRICE_RANGES, PROPERTY_TYPE_OPTIONS, formatPrice, priceRangeOf, readSearch, toApiFilters, writeSearch
} from '../features/search/searchParams';
import './SearchResults.css';

const PAGE_SIZE = 24;
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80';

const draftFromSearch = (search) => ({
  province: search.province,
  ward: search.ward,
  type: search.types.length === 1 ? search.types[0] : (search.types.length > 1 ? 'CUSTOM' : 'ALL'),
  price: priceRangeOf(search),
  listing: search.listing
});

// Trang kết quả tìm kiếm: thanh tìm kiếm luôn ở trên để tìm tiếp; bấm một tin để mở chi tiết, đóng chi tiết vẫn ở đây.
const SearchResults = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCustomer = String(user?.role || '').toUpperCase() === 'USER';
  const search = useMemo(() => readSearch(new URLSearchParams(location.search)), [location.search]);

  // Bản nháp của thanh tìm kiếm; chỉ áp dụng khi bấm Tìm / Enter, đồng bộ lại nếu URL đổi (chip, Back/Forward, reset).
  const [draft, setDraft] = useState(() => draftFromSearch(search));
  useEffect(() => {
    setDraft(draftFromSearch(search));
  }, [search]);
  const [result, setResult] = useState({ key: null, items: [], hasMore: false, error: '' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [favorites, setFavorites] = useState([]);

  const queryKey = location.search;
  const loading = result.key !== queryKey;

  const fetchPage = useCallback((offset, signal) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), filters: toApiFilters(search) });
    return publicApiFetch(`${API_BASE_URL}/api/properties?${params}`, { signal }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chưa thể tìm kiếm lúc này. Vui lòng thử lại.');
      return (data.properties || []).filter((property) => !property.is_hidden);
    });
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPage(0, controller.signal).then(
      (items) => setResult({ key: queryKey, items, hasMore: items.length === PAGE_SIZE, error: '' }),
      (error) => { if (error.name !== 'AbortError') setResult({ key: queryKey, items: [], hasMore: false, error: error.message }); }
    );
    return () => controller.abort();
  }, [fetchPage, queryKey]);

  useEffect(() => {
    if (!isCustomer) return undefined;
    const controller = new AbortController();
    apiFetch(`${API_BASE_URL}/api/favorites`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { favorites: [] }))
      .then((data) => setFavorites(data.favorites || []), () => {});
    return () => controller.abort();
  }, [isCustomer]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const items = await fetchPage(result.items.length);
      setResult((current) => {
        const seen = new Set(current.items.map((item) => item.id));
        return { ...current, items: [...current.items, ...items.filter((item) => !seen.has(item.id))], hasMore: items.length === PAGE_SIZE };
      });
    } catch (error) {
      setResult((current) => ({ ...current, error: error.message }));
    } finally {
      setLoadingMore(false);
    }
  };

  const apply = (next) => navigate(`/search?${writeSearch(next)}`, { replace: true });
  const submit = (event) => {
    event.preventDefault();
    const range = PRICE_RANGES.find((item) => item.value === draft.price);
    apply({
      ...search,
      province: draft.province,
      ward: draft.ward,
      types: draft.type === 'ALL' ? [] : draft.type === 'CUSTOM' ? search.types : [draft.type],
      listing: draft.listing,
      ...(range ? { minPrice: range.min, maxPrice: range.max } : {})
    });
  };

  // Bộ lọc nâng cao mang từ trang chủ sang: hiện dạng chip, bấm để bỏ.
  const chips = [
    ...(search.q ? [{ key: 'q', label: `Từ khóa: ${search.q}`, remove: { q: '' } }] : []),
    ...(search.minArea || search.maxArea ? [{ key: 'area', label: `Diện tích ${search.minArea || 0}–${search.maxArea || '∞'} m²`,
      remove: { minArea: '', maxArea: '' } }] : []),
    ...search.beds.map((bed) => ({ key: `bed-${bed}`, label: `${bed} phòng ngủ`, remove: { beds: search.beds.filter((b) => b !== bed) } })),
    ...search.wards.map((ward) => ({ key: `ward-${ward}`, label: ward, remove: { wards: search.wards.filter((w) => w !== ward) } })),
    ...search.tags.map((tag) => ({ key: `tag-${tag}`, label: tag, remove: { tags: search.tags.filter((t) => t !== tag) } })),
    ...(search.types.length > 1 ? [{ key: 'types', label: search.types.join(', '), remove: { types: [] } }] : [])
  ];

  const isFavorite = (property) => favorites.some((favorite) => Number(favorite.id) === Number(property.id));
  const toggleFavorite = async (property) => {
    const saved = isFavorite(property);
    setFavorites((current) => (saved ? current.filter((item) => Number(item.id) !== Number(property.id)) : [...current, property]));
    const response = await apiFetch(`${API_BASE_URL}/api/favorites${saved ? '/delete' : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: property.id })
    }).catch(() => null);
    if (!response?.ok) setFavorites((current) => (saved ? [...current, property] : current.filter((item) => Number(item.id) !== Number(property.id))));
  };

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));
  const place = [search.ward, search.province].filter(Boolean).join(', ') || search.q;
  const title = place ? `Kết quả tại ${place}` : 'Tất cả tin đăng';

  return (
    <div className="search-page">
      <Header activeTab="home" />
      <div className="search-page-bar-wrap">
        <form className="search-page-bar" onSubmit={submit} role="search">
          <button type="button" className="search-page-back" onClick={goBack} aria-label="Quay lại"><ArrowLeft size={18} /></button>
          <div className="search-page-field search-page-location">
            <MapPin size={16} aria-hidden="true" />
            <AreaSelect province={draft.province} ward={draft.ward} className="search-page-area"
              onChange={(area) => setDraft({ ...draft, ...area })} />
          </div>
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} aria-label="Loại bất động sản">
            <option value="ALL">Tất cả loại</option>
            {PROPERTY_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
            {draft.type === 'CUSTOM' && <option value="CUSTOM">Nhiều loại hình</option>}
          </select>
          <select value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} aria-label="Khoảng giá">
            {PRICE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
            {draft.price === 'CUSTOM' && <option value="CUSTOM">Tùy chọn giá</option>}
          </select>
          <select value={draft.listing} onChange={(e) => setDraft({ ...draft, listing: e.target.value })} aria-label="Hình thức">
            <option value="">Thuê & bán</option>
            <option value="RENT">Cho thuê</option>
            <option value="SALE">Mua bán</option>
          </select>
          <button type="submit" className="search-page-submit"><Search size={16} /> Tìm</button>
        </form>
        {chips.length > 0 && (
          <div className="search-page-chips" aria-label="Bộ lọc đang áp dụng">
            {chips.map((chip) => (
              <button key={chip.key} type="button" onClick={() => apply({ ...search, ...chip.remove })}>{chip.label} <X size={12} /></button>
            ))}
          </div>
        )}
      </div>

      <main className="search-page-main">
        <div className="search-page-heading">
          <h1>{title}</h1>
          {!loading && !result.error && <p>{result.items.length}{result.hasMore ? '+' : ''} tin phù hợp</p>}
        </div>

        {loading && <p className="search-page-status" role="status"><Loader2 size={18} className="animate-spin" /> Đang tìm…</p>}
        {!loading && result.error && <p className="search-page-error" role="alert">{result.error}</p>}
        {!loading && !result.error && result.items.length === 0 && (
          <div className="search-page-empty">
            <p>Chưa có tin nào{place ? ` tại ${place}` : ''} khớp bộ lọc.</p>
            <p>Thử chọn phường/xã lân cận, chỉ chọn tỉnh/thành phố, hoặc bỏ bớt bộ lọc.</p>
            <button type="button" onClick={() => apply({ ...readSearch(new URLSearchParams()), q: '' })}>Xem tất cả tin đăng</button>
          </div>
        )}

        {!loading && result.items.length > 0 && (
          <div className="search-page-grid">
            {result.items.map((property) => (
              <article key={property.id} className="search-card" onClick={() => setSelected(property)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSelected(property); }} tabIndex={0} role="button" aria-label={property.title}>
                <div className="search-card-image">
                  <img src={property.thumbnail || property.images?.[0] || FALLBACK_IMAGE} alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = FALLBACK_IMAGE; }} />
                  {isCustomer && (
                    <button type="button" className={`search-card-favorite ${isFavorite(property) ? 'active' : ''}`}
                      aria-label={isFavorite(property) ? 'Bỏ lưu' : 'Lưu tin'}
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(property); }}>
                      <Heart size={16} fill={isFavorite(property) ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </div>
                <div className="search-card-body">
                  <SwipeNestBadges property={property} />
                  <h2>{property.title}</h2>
                  <p className="search-card-address"><MapPin size={12} /> {property.address}</p>
                  <div className="search-card-bottom">
                    <p className="search-card-price">
                      <strong>{formatPrice(property.price)}</strong>
                      {property.listing_type === 'RENT' && <span>/tháng</span>}
                    </p>
                    <div className="search-card-specs">
                      <span><Bed size={12} /> {property.bedrooms || 0}</span>
                      <span><Bath size={12} /> {property.bathrooms || 0}</span>
                      <span><Ruler size={12} /> {property.area || '—'}m²</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && result.hasMore && (
          <div className="search-page-more">
            <button type="button" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 size={16} className="animate-spin" /> : null} Xem thêm
            </button>
          </div>
        )}
      </main>

      {selected && (
        <PropertyDetailModal
          property={selected}
          onClose={() => setSelected(null)}
          showFavoriteActions={isCustomer}
          isFavorite={isFavorite(selected)}
          onToggleFavorite={() => toggleFavorite(selected)}
          onSelectProperty={(property) => setSelected(property)}
        />
      )}
    </div>
  );
};

export default SearchResults;
