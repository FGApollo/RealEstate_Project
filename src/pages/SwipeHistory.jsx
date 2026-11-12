import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, Loader2, MapPin, X } from 'lucide-react';
import Header from '../components/Header';
import PropertyDetailModal from '../components/PropertyDetailModal';
import { fetchSwipeHistory } from '../features/swipe/swipeHistoryApi';
import { formatPrice } from '../features/search/searchParams';
import './SwipeHistory.css';

const PAGE_SIZE = 20;
const STATUS_LABELS = { SOLD: 'Đã bán', RENTED: 'Đã cho thuê' };
const timeLabel = (value) => new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

// Toàn bộ lịch sử vuốt, tải dần khi cuộn tới cuối (có nút "Tải thêm" dự phòng).
const SwipeHistory = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [state, setState] = useState({ loading: true, hasMore: false, error: '', total: 0 });
  const [selected, setSelected] = useState(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);

  const loadPage = useCallback(async (offset) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const page = await fetchSwipeHistory({ offset, limit: PAGE_SIZE });
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setState({ loading: false, hasMore: page.hasMore, error: '', total: page.total });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSwipeHistory({ offset: 0, limit: PAGE_SIZE, signal: controller.signal }).then(
      (page) => { setItems(page.items); setState({ loading: false, hasMore: page.hasMore, error: '', total: page.total }); },
      (error) => { if (error.name !== 'AbortError') setState({ loading: false, hasMore: false, error: error.message, total: 0 }); }
    );
    return () => controller.abort();
  }, []);

  // Cuộn tới gần cuối danh sách thì tự tải trang tiếp theo.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !state.hasMore || state.loading) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadPage(items.length);
    }, { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [items.length, loadPage, state.hasMore, state.loading]);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/swipe/Tất cả'));

  return (
    <div className="history-page">
      <Header activeTab="swipe" />
      <main className="history-main">
        <div className="history-heading">
          <button type="button" className="history-back" onClick={goBack} aria-label="Quay lại"><ArrowLeft size={18} /></button>
          <div>
            <h1>Lịch sử vuốt</h1>
            <p>{state.total ? `${state.total} bất động sản bạn đã vuốt qua` : 'Những bất động sản bạn đã vuốt qua'}</p>
          </div>
        </div>

        {state.error && <p className="history-error" role="alert">{state.error}</p>}
        {!state.loading && !state.error && items.length === 0 && (
          <div className="history-empty">
            <p>Bạn chưa vuốt bất động sản nào.</p>
            <button type="button" onClick={() => navigate('/swipe/Tất cả')}>Bắt đầu khám phá</button>
          </div>
        )}

        <ul className="history-page-list">
          {items.map((item) => {
            const unavailable = !item.available;
            return (
              <li key={item.id}>
                <button type="button" className="history-item" disabled={unavailable}
                  onClick={() => setSelected({ id: item.id, title: item.title, thumbnail: item.thumbnail, price: item.price, address: item.address })}>
                  {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" /> : <span className="history-thumb-empty" />}
                  <span className="history-item-copy">
                    <strong>{item.title}</strong>
                    <small><MapPin size={12} /> {item.address || 'Không rõ địa chỉ'}</small>
                    <small>
                      {item.price ? `${formatPrice(item.price)}${item.listing_type === 'RENT' ? '/tháng' : ''} · ` : ''}
                      {unavailable ? 'Tin không còn hiển thị' : STATUS_LABELS[item.status] || timeLabel(item.swipedAt)}
                    </small>
                  </span>
                  <span className={`history-result ${item.swipeType === 'right' ? 'liked' : ''}`}
                    title={item.swipeType === 'right' ? 'Đã thích' : 'Đã bỏ qua'}>
                    {item.swipeType === 'right' ? <Heart size={14} fill="currentColor" /> : <X size={14} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div ref={sentinelRef} className="history-footer">
          {state.loading && <span role="status"><Loader2 size={16} className="animate-spin" /> Đang tải…</span>}
          {!state.loading && state.hasMore && <button type="button" onClick={() => loadPage(items.length)}>Tải thêm</button>}
        </div>
      </main>

      {selected && (
        <PropertyDetailModal property={selected} onClose={() => setSelected(null)} onSelectProperty={(property) => setSelected(property)} />
      )}
    </div>
  );
};

export default SwipeHistory;
