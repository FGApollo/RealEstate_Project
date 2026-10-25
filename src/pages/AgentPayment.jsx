import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, CreditCard } from 'lucide-react';
import { billingDate, billingMoney, billingRequest, openCheckout, paymentStatus } from '../features/agent/pricing/billingApi';
import '../features/agent/pricing/AgentPricing.css';

function PaymentResult({ orderId }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const refresh = useCallback(async (signal) => {
    try {
      const data = await billingRequest(`/api/payments/${encodeURIComponent(orderId)}`, { signal });
      if (!signal?.aborted) { setOrder(data); setError(''); }
    } catch (err) { if (!signal?.aborted) setError(err.message); }
  }, [orderId]);
  useEffect(() => {
    const controller = new AbortController();
    billingRequest(`/api/payments/${encodeURIComponent(orderId)}`, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) { setOrder(data); setError(''); } },
      (err) => { if (!controller.signal.aborted) setError(err.message); }
    );
    return () => controller.abort();
  }, [orderId]);
  const orderKey = order?.id;
  const orderStatus = order?.status;
  useEffect(() => {
    if (!orderKey || !['PENDING', 'CREATING'].includes(orderStatus)) return;
    const controller = new AbortController();
    let attempts = 0;
    const interval = setInterval(() => {
      refresh(controller.signal);
      if (++attempts >= 24) clearInterval(interval);
    }, 5000);
    return () => { clearInterval(interval); controller.abort(); };
  }, [orderKey, orderStatus, refresh]);
  const action = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const cancel = () => action(async () => {
    const data = await billingRequest(`/api/payments/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' });
    setOrder(data); setConfirmCancel(false); setError('');
  });
  const pending = order && ['PENDING', 'CREATING'].includes(order.status);
  return <main className="billing-result pricing-panel-container">
    <Link to="/sale/overview?tab=pricing">← Gói dịch vụ & thanh toán</Link>
    <section className="current-subscription-card" aria-live="polite">
      {order?.status === 'PAID' ? <CheckCircle2 size={38} color="#059669" /> : <Clock size={38} color="#2563eb" />}
      <h1>{order ? paymentStatus(order.status) : 'Kiểm tra thanh toán'}</h1>
      {error && <p className="pricing-message-banner" role="alert">{error}</p>}
      {!order && !error && <p role="status">Đang kiểm tra với hệ thống thanh toán…</p>}
      {order && <><p>Đơn <strong>#{order.orderCode}</strong> · {order.planName} · {order.durationMonths} tháng</p><p className="billing-result-amount">{billingMoney(order.amount)}</p>
        {order.status === 'PAID' ? <><p>Gói đã được kích hoạt / gia hạn.</p><p>Hạn dùng sau thanh toán: <strong>{billingDate(order.subscriptionEnd)}</strong></p><p>Thanh toán lúc: {billingDate(order.paidAt)}</p></>
          : pending ? <><p>Gói sẽ được kích hoạt sau khi hệ thống xác minh thanh toán. Nếu đã chuyển tiền, hãy chờ rồi kiểm tra lại.</p><p>Liên kết có hạn đến {billingDate(order.expiresAt)}.</p></>
            : <p>Đơn này đã kết thúc. Bạn có thể tạo đơn mới từ trang gói dịch vụ. Nếu đã chuyển tiền, hãy kiểm tra lại hoặc liên hệ hỗ trợ kèm mã đơn.</p>}
      </>}
      <div className="billing-actions">
        {pending && order.checkoutUrl && <button className="btn-plan-action" disabled={busy} onClick={() => action(() => openCheckout(order.checkoutUrl))}><CreditCard size={17} /> Tiếp tục thanh toán</button>}
        {order?.status !== 'PAID' && <button disabled={busy} onClick={() => action(refresh)}>Kiểm tra lại</button>}
        {pending && !confirmCancel && <button disabled={busy} onClick={() => setConfirmCancel(true)}>Hủy đơn</button>}
      </div>
      {confirmCancel && <div className="billing-cancel-confirm"><p>Bạn muốn hủy đơn này? Nếu đã chuyển tiền, hãy kiểm tra trạng thái trước.</p><button disabled={busy} onClick={cancel}>Xác nhận hủy đơn</button><button disabled={busy} onClick={() => setConfirmCancel(false)}>Giữ đơn</button></div>}
      {order?.status === 'CREATING' && <p>Liên kết chưa sẵn sàng. Trở về trang gói dịch vụ và chọn thanh toán để thử tạo lại cùng đơn.</p>}
      <p className="billing-note">Bạn có thể quay lại trang này để kiểm tra thanh toán và hạn dùng. Không tự động trừ tiền.</p>
    </section>
  </main>;
}

export default function AgentPayment() {
  const { orderId } = useParams();
  return <PaymentResult key={orderId} orderId={orderId} />;
}
