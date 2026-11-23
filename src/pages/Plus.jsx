import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, CheckCircle2, CreditCard, Loader2, Info,
  CalendarDays, ChevronRight, ArrowLeft, ReceiptText
} from 'lucide-react';
import Header from '../components/Header';
import { billingDate, billingDay, billingMoney, openCheckout, paymentStatus } from '../features/agent/pricing/billingApi';
import { PLUS_BENEFITS, createPlusPayment, fetchPlusCatalog, fetchPlusPayments } from '../features/plus/plusApi';
import plusCrownArt from '../assets/plus-crown-art.jpg';
import './Plus.css';

const PlusCrownEmblem = ({ size = 62, withRays = false, withCheck = false }) => (
  <span className={`plus-crown-emblem ${withRays ? 'has-rays' : ''}`} aria-hidden="true">
    {withRays && (
      <svg className="plus-crown-rays" viewBox="0 0 116 56" fill="none">
        <path d="M16 18L24 23" stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M11 32L21 32" stroke="#fbbf24" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M100 18L92 23" stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M105 32L95 32" stroke="#fbbf24" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    )}
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="plus-crown-svg">
      <defs>
        <linearGradient id="plusCrownGoldBody" x1="12" y1="14" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffe885" />
          <stop offset="48%" stopColor="#ffc133" />
          <stop offset="100%" stopColor="#e58a08" />
        </linearGradient>
        <linearGradient id="plusCrownGoldRim" x1="14" y1="45" x2="50" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffd75e" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="plusCrownPearl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff8d6" />
          <stop offset="55%" stopColor="#ffcb47" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <filter id="plusCrownShadow" x="4" y="8" width="56" height="52" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#f59e0b" floodOpacity="0.28" />
        </filter>
      </defs>
      <g filter="url(#plusCrownShadow)">
        <path
          d="M12 25.5C11.6 23.6 13.8 22.3 15.3 23.5L23.5 30.2L30.2 17.6C31 16.1 33 16.1 33.8 17.6L40.5 30.2L48.7 23.5C50.2 22.3 52.4 23.6 52 25.5L47.8 45.2C47.4 47 45.8 48.2 44 48.2H20C18.2 48.2 16.6 47 16.2 45.2L12 25.5Z"
          fill="url(#plusCrownGoldBody)"
        />
        <rect x="16" y="45" width="32" height="6.2" rx="3.1" fill="url(#plusCrownGoldRim)" />
        <path
          d="M16.5 27.5L23.8 33.2L32 19.5L36.2 27.5"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12.5" cy="21" r="3.6" fill="url(#plusCrownPearl)" />
        <circle cx="32" cy="14" r="4.4" fill="url(#plusCrownPearl)" />
        <circle cx="51.5" cy="21" r="3.6" fill="url(#plusCrownPearl)" />
        <path
          d="M32 28.2L33.9 32.1L38.2 32.7L35.1 35.7L35.8 40L32 37.9L28.2 40L28.9 35.7L25.8 32.7L30.1 32.1L32 28.2Z"
          fill="#ffffff"
          fillOpacity="0.96"
        />
      </g>
    </svg>
    {withCheck && (
      <span className="plus-crown-verified-dot">
        <Check size={13} strokeWidth={3.2} />
      </span>
    )}
  </span>
);

const SparkleStar = ({ className = '', size = 16 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2C12.7 7.2 16.8 11.3 22 12C16.8 12.7 12.7 16.8 12 22C11.3 16.8 7.2 12.7 2 12C7.2 11.3 11.3 7.2 12 2Z" />
  </svg>
);

const Plus = () => {
  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPlanDetails, setShowPlanDetails] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPlusCatalog({ signal: controller.signal })
      .then((catalogData) => {
        if (!controller.signal.aborted) setCatalog(catalogData);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      });

    fetchPlusPayments({ signal: controller.signal })
      .then((payments) => {
        if (!controller.signal.aborted) setHistory(payments?.items || []);
      })
      .catch((err) => {
        console.warn('Chưa thể tải lịch sử thanh toán:', err);
      });

    return () => controller.abort();
  }, []);

  const plan = catalog?.plans?.[0];
  const plus = catalog?.plus;
  const checkout = catalog?.checkout;
  const isOwnedView = Boolean(plus?.active && !showPlanDetails);
  const durationLabel = (plan?.duration_months || 1) === 1 ? 'tháng' : `${plan.duration_months} tháng`;

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
      {/* Soft atmospheric pastel sky waves */}
      <div className="plus-bg-decor" aria-hidden="true">
        <div className="plus-bg-halo" />
        <svg className="plus-bg-waves" viewBox="0 0 1440 420" preserveAspectRatio="none" fill="none">
          <path
            d="M0 156C165 92 310 175 490 198C690 224 850 118 1090 96C1255 80 1365 112 1440 132V420H0V156Z"
            fill="url(#plusBgWave1)"
          />
          <path
            d="M0 245C240 190 480 290 790 255C1080 222 1280 165 1440 192V420H0V245Z"
            fill="url(#plusBgWave2)"
          />
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
        {/* Hero Header */}
        <section className="plus-hero">
          <SparkleStar className="plus-sparkle plus-sparkle-left" size={18} />
          <SparkleStar className="plus-sparkle plus-sparkle-right" size={20} />

          <div className="plus-hero-crown-wrap">
            <PlusCrownEmblem size={64} withRays withCheck={isOwnedView} />
          </div>

          <h1 className="plus-hero-title">
            Swipe Nest <span>Plus</span>
          </h1>
          <p className="plus-hero-subtitle">
            {isOwnedView
              ? 'Cảm ơn bạn đã đồng hành cùng Swipe Nest!'
              : 'Mở khóa nguồn hàng do đội Swipe Nest đăng.'}
          </p>
        </section>

        {error && (
          <p className="plus-error" role="alert">
            {error}
          </p>
        )}

        {!catalog && !error && (
          <div className="plus-loading" role="status">
            <Loader2 size={20} className="plus-spin" />
            <span>Đang tải thông tin gói Plus…</span>
          </div>
        )}

        {/* OWNED / ACTIVE CELEBRATION VIEW */}
        {catalog && isOwnedView && (
          <>
            <section className="plus-card plus-owned-card" aria-labelledby="plus-owned-title">
              <div className="plus-owned-backdrop" aria-hidden="true">
                <svg viewBox="0 0 760 210" preserveAspectRatio="none" fill="none">
                  <path
                    d="M0 0H760V126C635 178 495 168 355 118C225 72 105 92 0 144V0Z"
                    fill="url(#plusOwnedWave)"
                  />
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
                    <div className="plus-owned-check-orb">
                      <Check size={34} strokeWidth={3.2} />
                    </div>
                  </div>
                </div>

                <h2 id="plus-owned-title" className="plus-owned-heading">
                  Bạn đã sở hữu Swipe <span>Nest Plus</span>
                </h2>
                <p className="plus-owned-expiry">
                  Thời hạn sử dụng đến ngày <strong>{billingDay(plus.currentEnd)}</strong>
                </p>

                {plus?.periods?.length > 1 && (
                  <p className="plus-owned-stack-note">
                    Bạn hiện có {plus.periods.length} kỳ liên tiếp được cộng dồn tự động.
                  </p>
                )}

                <button
                  type="button"
                  className="plus-detail-btn"
                  onClick={() => setShowPlanDetails(true)}
                >
                  <CalendarDays size={17} />
                  <span>Xem chi tiết gói</span>
                  <ChevronRight size={17} />
                </button>
              </div>
            </section>

            <section className="plus-thanks-banner" aria-label="Lời cảm ơn">
              <div className="plus-thanks-left">
                <div className="plus-thanks-crown">
                  <PlusCrownEmblem size={44} />
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
        )}

        {/* PLAN DETAIL / SUBSCRIBE / RENEW VIEW */}
        {catalog && !isOwnedView && (
          <>
            {plus?.active && (
              <div className="plus-view-switch-row">
                <button
                  type="button"
                  className="plus-back-toggle"
                  onClick={() => setShowPlanDetails(false)}
                >
                  <ArrowLeft size={16} />
                  <span>Quay lại trạng thái thành viên Plus</span>
                </button>
              </div>
            )}

            <section className="plus-card plus-plan-card" aria-labelledby="plus-plan-title">
              <div className="plus-plan-layout">
                {/* Left 3D Crown Visual Tile */}
                <div className="plus-crown-tile">
                  <img
                    src={plusCrownArt}
                    alt="Swipe Nest Plus"
                    className="plus-crown-tile-img"
                    decoding="async"
                  />
                </div>

                {/* Right Plan Info & Benefits */}
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
                    {PLUS_BENEFITS.map((item) => (
                      <li key={item.title}>
                        <span className="plus-benefit-check" aria-hidden="true">
                          <Check size={13} strokeWidth={3} />
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {plus?.periods?.length > 1 && (
                    <p className="plus-note">
                      Bạn có {plus.periods.length} kỳ liên tiếp, kỳ cuối hết hạn {billingDay(plus.currentEnd)}.
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="plus-buy"
                onClick={buy}
                disabled={busy || !plan || checkout?.available === false}
              >
                {busy ? <Loader2 size={18} className="plus-spin" /> : <CreditCard size={18} />}
                <span>{plus?.active ? 'Gia hạn thêm 1 tháng' : 'Đăng ký Plus'}</span>
              </button>

              {checkout?.available === false && (
                <p className="plus-note plus-note-center">
                  {checkout.reason || 'Thanh toán payOS chưa sẵn sàng.'}
                </p>
              )}
            </section>

            {/* Bottom Summary Info Pill */}
            <div className="plus-info-bar">
              <span className="plus-info-item">
                <Info size={16} />
                {plus?.active ? (
                  <span>
                    Hết hạn vào ngày <strong>{billingDay(plus.currentEnd)}</strong>
                  </span>
                ) : (
                  <span>Thanh toán an toàn qua <strong>payOS</strong></span>
                )}
              </span>
              <span className="plus-info-sep" aria-hidden="true" />
              <span className="plus-info-item">
                <span>
                  {plus?.active ? 'Phí gia hạn:' : 'Phí đăng ký:'}{' '}
                  <strong>{plan ? billingMoney(plan.amount_vnd) : '—'}</strong>
                </span>
              </span>
            </div>
          </>
        )}

        {/* Payment History */}
        {history.length > 0 && (
          <section className="plus-history" aria-labelledby="plus-history-title">
            <div className="plus-history-head">
              <ReceiptText size={18} />
              <h2 id="plus-history-title">Lịch sử thanh toán</h2>
            </div>
            <ul>
              {history.map((order) => (
                <li key={order.id}>
                  <Link to={`/plus/payment/${order.id}`} className="plus-order-link">
                    #{order.orderCode}
                  </Link>
                  <span className="plus-order-amount">{billingMoney(order.amount)}</span>
                  <span className={`plus-order-status status-${String(order.status || '').toLowerCase()}`}>
                    {paymentStatus(order.status)}
                  </span>
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
