import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight,
  CreditCard, Info, Loader2, ReceiptText
} from 'lucide-react';
import Header from '../components/Header';
import { billingDate, billingDay, billingMoney, openCheckout, paymentStatus } from '../features/agent/pricing/billingApi';
import { getPlusBenefits, createPlusPayment, fetchPlusCatalog, fetchPlusPayments } from '../features/plus/plusApi';
import PlusCrownIcon from '../features/plus/PlusCrownIcon';
import plusCrownArt from '../assets/plus-crown-art.webp';
import './Plus.css';

const SparkleStar = ({ className = '', size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C12.7 7.2 16.8 11.3 22 12C16.8 12.7 12.7 16.8 12 22C11.3 16.8 7.2 12.7 2 12C7.2 11.3 11.3 7.2 12 2Z" />
  </svg>
);

const PlusOwnedView = ({ plus, onOpenDetails }) => (
  <>
    <section className="plus-card plus-owned-card" aria-labelledby="plus-owned-title">
      <div className="plus-owned-backdrop" aria-hidden="true">
        <svg viewBox="0 0 760 210" preserveAspectRatio="none" fill="none">
          <path d="M0 0H760V126C635 178 495 168 355 118C225 72 105 92 0 144V0Z" fill="url(#plusOwnedWave)" />
          <defs>
            <linearGradient id="plusOwnedWave" x1="0" y1="0" x2="760" y2="160" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#e8f1ff" />
              <stop offset="52%" stopColor="#edf4ff" />
              <stop offset="100%" stopColor="#e2f7f2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="plus-owned-inner">
        <div className="plus-owned-badge-stage">
          <SparkleStar className="plus-owned-sparkle plus-owned-sparkle-1" size={14} />
          <SparkleStar className="plus-owned-sparkle plus-owned-sparkle-2" size={18} />
          <div className="plus-owned-check-halo">
            <div className="plus-owned-check-orb"><Check size={34} strokeWidth={3.2} /></div>
          </div>
        </div>

        <h2 id="plus-owned-title" className="plus-owned-heading">Bạn đã sở hữu Swipe <span>Nest Plus</span></h2>
        <p className="plus-owned-expiry">Thời hạn sử dụng đến ngày <strong>{billingDay(plus.currentEnd)}</strong></p>

        {plus?.periods?.length > 1 && (
          <p className="plus-owned-stack-note">Bạn hiện có {plus.periods.length} kỳ liên tiếp được cộng dồn tự động.</p>
        )}

        <button type="button" className="plus-detail-btn" onClick={onOpenDetails}>
          <CalendarDays size={17} />
          <span>Xem chi tiết gói</span>
          <ChevronRight size={17} />
        </button>
      </div>
    </section>

    <section className="plus-thanks-banner" aria-label="Lời cảm ơn">
      <div className="plus-thanks-left">
        <div className="plus-thanks-crown">
          <PlusCrownIcon size={44} />
          <SparkleStar className="plus-thanks-sparkle" size={12} />
        </div>
        <div className="plus-thanks-copy">
          <strong>Cảm ơn bạn đã ủng hộ Swipe Nest!</strong>
          <p>Chúng tôi luôn nỗ lực mang đến trải nghiệm tốt nhất.</p>
        </div>
      </div>
      <svg className="plus-thanks-rays" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M9 12L12 5" stroke="#1d63f6" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M13 18L21 15" stroke="#3b82f6" strokeWidth="2.8" strokeLinecap="round" />
      </svg>
    </section>
  </>
);

const PlusPlanView = ({ plan, plus, checkout, busy, onBuy, onBackToOwned }) => {
  const durationLabel = (plan?.duration_months || 1) === 1 ? 'tháng' : `${plan.duration_months} tháng`;
  return (
    <>
      {plus?.active && (
        <div className="plus-view-switch-row">
          <button type="button" className="plus-back-toggle" onClick={onBackToOwned}>
            <ArrowLeft size={16} />
            <span>Quay lại trạng thái thành viên Plus</span>
          </button>
        </div>
      )}

      <section className="plus-card plus-plan-card" aria-labelledby="plus-plan-title">
        <div className="plus-plan-layout">
          <div className="plus-crown-tile">
            <img src={plusCrownArt} alt="Swipe Nest Plus" className="plus-crown-tile-img" decoding="async" />
          </div>

          <div className="plus-plan-details">
            <div className="plus-card-head">
              <div>
                <h2 id="plus-plan-title">{plan?.name || 'Swipe Nest Plus'}</h2>
                <p className="plus-price">
                  {plan ? billingMoney(plan.amount_vnd) : '—'}
                  <span>/{durationLabel}</span>
                </p>
              </div>
              {plus?.active ? (
                <span className="plus-status active">
                  <CheckCircle2 size={15} />
                  <span>Đang dùng đến {billingDay(plus.currentEnd)}</span>
                </span>
              ) : (
                <span className="plus-status">Chưa đăng ký</span>
              )}
            </div>

            <div className="plus-card-divider" />

            <ul className="plus-benefits">
              {getPlusBenefits(plan?.duration_months).map((item) => (
                <li key={item.title}>
                  <span className="plus-benefit-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>

            {plus?.periods?.length > 1 && (
              <p className="plus-note">Bạn có {plus.periods.length} kỳ liên tiếp, kỳ cuối hết hạn {billingDay(plus.currentEnd)}.</p>
            )}
          </div>
        </div>

        <button type="button" className="plus-buy" onClick={onBuy} disabled={busy || !plan || checkout?.available === false}>
          {busy ? <Loader2 size={18} className="plus-spin" /> : <CreditCard size={18} />}
          <span>{plus?.active ? `Gia hạn thêm ${durationLabel}` : 'Đăng ký Plus'}</span>
        </button>

        {!plan && (
          <p className="plus-note plus-note-center">Gói Swipe Nest Plus hiện đang tạm ngừng đăng ký mới.</p>
        )}

        {checkout?.available === false && (
          <p className="plus-note plus-note-center">{checkout.reason || 'Thanh toán payOS chưa sẵn sàng.'}</p>
        )}
      </section>

      <div className="plus-info-bar">
        <span className="plus-info-item">
          <Info size={16} />
          {plus?.active
            ? <span>Hết hạn vào ngày <strong>{billingDay(plus.currentEnd)}</strong></span>
            : <span>Thanh toán an toàn qua <strong>payOS</strong></span>}
        </span>
        <span className="plus-info-sep" aria-hidden="true" />
        <span className="plus-info-item">
          <span>{plus?.active ? 'Phí gia hạn:' : 'Phí đăng ký:'} <strong>{plan ? billingMoney(plan.amount_vnd) : '—'}</strong></span>
        </span>
      </div>
    </>
  );
};

const Plus = () => {
  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPlanDetails, setShowPlanDetails] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPlusCatalog({ signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setCatalog(data); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    fetchPlusPayments({ signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setHistory(data?.items || []); })
      .catch((err) => console.warn('Chưa thể tải lịch sử thanh toán:', err));
    return () => controller.abort();
  }, []);

  const plan = catalog?.plans?.[0];
  const plus = catalog?.plus;
  const checkout = catalog?.checkout;
  const isOwnedView = Boolean(plus?.active && !showPlanDetails);

  const buy = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setError('');
    try {
      const order = await createPlusPayment(plan);
      if (order.checkoutUrl && ['PENDING', 'CREATING'].includes(order.status)) openCheckout(order.checkoutUrl);
      else window.location.assign(`/plus/payment/${encodeURIComponent(order.id)}`);
    } catch (err) {
      setError(err.code === 'PLAN_PRICE_CHANGED' ? 'Giá gói vừa thay đổi. Hãy tải lại trang rồi thử lại.' : err.message);
      setBusy(false);
    }
  };

  return (
    <div className="plus-page">
      <div className="plus-bg-decor" aria-hidden="true">
        <div className="plus-bg-halo" />
        <svg className="plus-bg-waves" viewBox="0 0 1440 420" preserveAspectRatio="none" fill="none">
          <path d="M0 156C165 92 310 175 490 198C690 224 850 118 1090 96C1255 80 1365 112 1440 132V420H0V156Z" fill="url(#plusBgWave1)" />
          <path d="M0 245C240 190 480 290 790 255C1080 222 1280 165 1440 192V420H0V245Z" fill="url(#plusBgWave2)" />
          <defs>
            <linearGradient id="plusBgWave1" x1="0" y1="90" x2="1440" y2="380" gradientUnits="userSpaceOnUse">
              <stop stopColor="#dbeafe" stopOpacity="0.65" />
              <stop offset="0.55" stopColor="#e8f1ff" stopOpacity="0.35" />
              <stop offset="1" stopColor="#cde0ff" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="plusBgWave2" x1="0" y1="200" x2="1440" y2="420" gradientUnits="userSpaceOnUse">
              <stop stopColor="#eff6ff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#e2eeff" stopOpacity="0.7" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <Header activeTab="plus" />

      <main className="plus-main">
        <section className="plus-hero">
          <SparkleStar className="plus-sparkle plus-sparkle-left" size={18} />
          <SparkleStar className="plus-sparkle plus-sparkle-right" size={20} />
          <div className="plus-hero-crown-wrap">
            <PlusCrownIcon size={64} withRays withCheck={isOwnedView} />
          </div>
          <h1 className="plus-hero-title">Swipe Nest <span>Plus</span></h1>
          <p className="plus-hero-subtitle">
            {isOwnedView ? 'Cảm ơn bạn đã đồng hành cùng Swipe Nest!' : 'Mở khóa nguồn hàng do đội Swipe Nest đăng.'}
          </p>
        </section>

        {error && <p className="plus-error" role="alert">{error}</p>}
        {!catalog && !error && (
          <div className="plus-loading" role="status">
            <Loader2 size={20} className="plus-spin" />
            <span>Đang tải thông tin gói Plus…</span>
          </div>
        )}

        {catalog && isOwnedView && (
          <PlusOwnedView plus={plus} onOpenDetails={() => setShowPlanDetails(true)} />
        )}
        {catalog && !isOwnedView && (
          <PlusPlanView
            plan={plan}
            plus={plus}
            checkout={checkout}
            busy={busy}
            onBuy={buy}
            onBackToOwned={() => setShowPlanDetails(false)}
          />
        )}

        {history.length > 0 && (
          <section className="plus-history" aria-labelledby="plus-history-title">
            <div className="plus-history-head">
              <ReceiptText size={18} />
              <h2 id="plus-history-title">Lịch sử thanh toán</h2>
            </div>
            <ul>
              {history.map((order) => (
                <li key={order.id}>
                  <Link to={`/plus/payment/${order.id}`} className="plus-order-link">#{order.orderCode}</Link>
                  <span className="plus-order-amount">{billingMoney(order.amount)}</span>
                  <span className={`plus-order-status status-${String(order.status || '').toLowerCase()}`}>{paymentStatus(order.status)}</span>
                  <span className="plus-order-date">{billingDate(order.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
};

export default Plus;
