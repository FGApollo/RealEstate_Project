import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, CreditCard } from 'lucide-react';
import Header from '../components/Header';
import { billingDate, billingDay, billingMoney, openCheckout, paymentStatus } from '../features/agent/pricing/billingApi';
import { cancelPlusPayment, fetchPlusPayment } from '../features/plus/plusApi';
import './Plus.css';

// Trang payOS chuyển về sau khi thanh toán gói Plus. Kích hoạt chỉ dựa trên xác minh của backend, không dựa vào URL.
const PlusPayment = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (signal) => {
    try {
      const data = await fetchPlusPayment(orderId, { signal });
      if (!signal?.aborted) { setOrder(data); setError(''); }
    } catch (err) { if (!signal?.aborted) setError(err.message); }
  }, [orderId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPlusPayment(orderId, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) { setOrder(data); setError(''); } },
      (err) => { if (!controller.signal.aborted) setError(err.message); }
    );
    return () => controller.abort();
  }, [orderId]);

  const pending = order && ['PENDING', 'CREATING'].includes(order.status);
  useEffect(() => {
    if (!pending) return undefined;
    const controller = new AbortController();
    let attempts = 0;
    const timer = setInterval(() => {
      refresh(controller.signal);
      if (++attempts >= 24) clearInterval(timer);
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [pending, refresh]);

  const cancel = async () => {
    setBusy(true);
    try { setOrder(await cancelPlusPayment(orderId)); setError(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="plus-page">
      <Header activeTab="plus" />
      <main className="plus-main">
        <Link to="/plus" className="plus-back">← Swipe Nest Plus</Link>
        <section className="plus-card plus-result" aria-live="polite">
          {order?.status === 'PAID' ? <CheckCircle2 size={38} color="#059669" /> : <Clock size={38} color="#2563eb" />}
          <h1>{order ? paymentStatus(order.status) : 'Kiểm tra thanh toán'}</h1>
          {error && <p className="plus-error" role="alert">{error}</p>}
          {!order && !error && <p role="status">Đang kiểm tra với hệ thống thanh toán…</p>}
          {order && (
            <>
              <p>Đơn <strong>#{order.orderCode}</strong> · {order.planName} · {billingMoney(order.amount)}</p>
              {order.status === 'PAID' && <p>Plus có hiệu lực từ <strong>{billingDay(order.subscriptionStart)}</strong> đến <strong>{billingDay(order.subscriptionEnd)}</strong>.</p>}
              {pending && <p>Plus sẽ được kích hoạt ngay khi hệ thống xác minh thanh toán. Liên kết có hạn đến {billingDate(order.expiresAt)}.</p>}
              {!pending && order.status !== 'PAID' && <p>Đơn này đã kết thúc. Bạn có thể tạo đơn mới. Nếu đã chuyển tiền, hãy liên hệ hỗ trợ kèm mã đơn.</p>}
            </>
          )}
          {pending && (
            <div className="plus-actions">
              {order.checkoutUrl && <button type="button" className="plus-buy" disabled={busy} onClick={() => openCheckout(order.checkoutUrl)}><CreditCard size={17} /> Tiếp tục thanh toán</button>}
              <button type="button" className="plus-secondary" disabled={busy} onClick={cancel}>Hủy đơn</button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default PlusPayment;
