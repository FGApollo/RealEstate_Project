import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import Header from '../components/Header';
import { billingDate, billingDay, billingMoney, openCheckout, paymentStatus } from '../features/agent/pricing/billingApi';
import { PLUS_BENEFITS, createPlusPayment, fetchPlusCatalog, fetchPlusPayments } from '../features/plus/plusApi';
import './Plus.css';

const Plus = () => {
  const [catalog, setCatalog] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      <Header activeTab="plus" />
      <main className="plus-main">
        <section className="plus-hero">
          <span className="plus-hero-icon"><Crown size={28} /></span>
          <h1>Swipe Nest Plus</h1>
          <p>Mở khóa nguồn hàng do đội Swipe Nest đăng.</p>
        </section>

        {error && <p className="plus-error" role="alert">{error}</p>}
        {!catalog && !error && <p className="plus-loading" role="status"><Loader2 size={18} className="animate-spin" /> Đang tải…</p>}

        {catalog && (
          <section className="plus-card" aria-labelledby="plus-plan-title">
            <div className="plus-card-head">
              <div>
                <h2 id="plus-plan-title">{plan?.name || 'Swipe Nest Plus'}</h2>
                <p className="plus-price">{plan ? billingMoney(plan.amount_vnd) : '—'}<span>/{plan?.duration_months || 1} tháng</span></p>
              </div>
              {plus?.active
                ? <span className="plus-status active"><CheckCircle2 size={16} /> Đang dùng đến {billingDay(plus.currentEnd)}</span>
                : <span className="plus-status">Chưa đăng ký</span>}
            </div>

            <ul className="plus-benefits">
              {PLUS_BENEFITS.map((item) => (
                <li key={item.title}><CheckCircle2 size={18} /><div><strong>{item.title}</strong><p>{item.text}</p></div></li>
              ))}
            </ul>

            {plus?.periods?.length > 1 && (
              <p className="plus-note">Bạn có {plus.periods.length} kỳ liên tiếp, kỳ cuối hết hạn {billingDay(plus.currentEnd)}.</p>
            )}

            <button type="button" className="plus-buy" onClick={buy} disabled={busy || !plan || checkout?.available === false}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {plus?.active ? 'Gia hạn thêm 1 tháng' : 'Đăng ký Plus'}
            </button>
            {checkout?.available === false && <p className="plus-note">{checkout.reason || 'Thanh toán payOS chưa sẵn sàng.'}</p>}
          </section>
        )}

        {history.length > 0 && (
          <section className="plus-history" aria-labelledby="plus-history-title">
            <h2 id="plus-history-title">Lịch sử thanh toán</h2>
            <ul>
              {history.map((order) => (
                <li key={order.id}>
                  <Link to={`/plus/payment/${order.id}`}>#{order.orderCode}</Link>
                  <span>{billingMoney(order.amount)}</span>
                  <span>{paymentStatus(order.status)}</span>
                  <span>{billingDate(order.createdAt)}</span>
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
