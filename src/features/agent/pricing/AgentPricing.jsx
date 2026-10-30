import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Clock } from 'lucide-react';
import ServicePlanCards from './ServicePlanCards';
import PlanDialog from './PlanDialog';
import { billingRequest, billingDate, billingMoney, paymentStatus, openCheckout } from './billingApi';
import './AgentPricing.css';

export default function AgentPricing({ currentUser }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOrder, setConfirmOrder] = useState(null);
  const [page, setPage] = useState(1);
  const requestId = useRef(null);
  const fetchBilling = useCallback(async (signal) => {
    const [subscription, catalog, history] = await Promise.all([
      billingRequest('/api/subscriptions', { signal }),
      billingRequest('/api/payments/catalog', { signal }),
      billingRequest(`/api/payments?page=${page}&limit=10`, { signal })
    ]);
    return { subscription, catalog, history };
  }, [page]);
  const load = async () => { setData(await fetchBilling()); setError(''); };
  useEffect(() => {
    const controller = new AbortController();
    fetchBilling(controller.signal).then((result) => { if (!controller.signal.aborted) { setData(result); setError(''); } },
      (err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [currentUser.id, fetchBilling]);
  const act = async (fn) => {
    setBusy(true); setMessage('');
    try { await fn(); } catch (err) {
      if (err.code === 'PLAN_PRICE_CHANGED' || err.code === 'PLAN_UNAVAILABLE') {
        requestId.current = null;
        setConfirmOrder(null);
        try { await load(); } catch { /* Retain the actionable payment error. */ }
      }
      setMessage(err.message);
    } finally { setBusy(false); }
  };
  const subscribe = () => act(async () => {
    requestId.current ||= crypto.randomUUID();
    const order = await billingRequest('/api/payments', { method: 'POST', body: {
      planCode: 'PAID', requestId: requestId.current, planVersion: confirmOrder.version
    } });
    setConfirmOrder(null);
    // An existing pending order may have a different, previously confirmed price.
    // Its detail screen shows that immutable amount before opening payOS.
    if (order.amount !== confirmOrder.amount_vnd || order.durationMonths !== confirmOrder.duration_months) {
      window.location.assign(`/sale/payment/${order.id}`);
    } else if (order.status === 'PENDING' && order.checkoutUrl) openCheckout(order.checkoutUrl);
    else { requestId.current = null; await load(); setMessage(`Đơn #${order.orderCode}: ${paymentStatus(order.status)}.`); }
  });
  const trial = () => act(async () => {
    await billingRequest('/api/subscriptions', { method: 'POST', body: { planName: 'FREE_TRIAL' } });
    await load(); setMessage('Đã kích hoạt một tháng dùng thử.');
  });
  const plan = data?.catalog.plans.find((item) => item.code === 'PAID');
  const subscription = data?.subscription;
  const active = subscription?.effective_status === 'ACTIVE';
  return <div className="pricing-panel-container">
    <div className="pricing-header"><h1>Gói dịch vụ & thanh toán</h1><p className="subtitle">Chọn gói phù hợp, thanh toán an toàn qua payOS và theo dõi lịch sử của bạn.</p></div>
    {message && <div className="pricing-message-banner" role="status"><AlertCircle size={18} />{message}</div>}
    {error ? <div className="pricing-message-banner" role="alert">{error}<button disabled={busy} onClick={() => act(load)}>Thử lại</button></div>
      : !data || data.history.page !== page ? <p role="status">Đang tải gói dịch vụ và giao dịch…</p> : <>
        <div className="current-subscription-card">
          <div className="status-header"><Clock size={20} /><h3>Gói hiện tại</h3></div>
          {subscription ? <div className="subscription-details"><p><strong>{subscription.plan_name === 'FREE_TRIAL' ? 'Dùng thử miễn phí' : subscription.plan_name === plan?.code ? plan.name : subscription.plan_name}</strong></p>
            <p>Hạn dùng: <strong>{billingDate(subscription.end_date)}</strong></p><span className={active ? 'badge-active' : 'badge-inactive'}>{active ? 'ĐANG HOẠT ĐỘNG' : 'ĐÃ HẾT HẠN / NGỪNG'}</span></div>
            : <p>Bạn chưa đăng ký gói dịch vụ.</p>}
        </div>
        {!data.catalog.checkout.available && <div className="pricing-message-banner" role="status"><AlertCircle size={18} />{data.catalog.checkout.reason}</div>}
        <ServicePlanCards plans={data.catalog.plans} subscription={subscription} checkoutAvailable={data.catalog.checkout.available}
          busy={busy} onTrial={trial} onSubscribe={() => setConfirmOrder(plan)} />
        {confirmOrder && <PlanDialog title="Xác nhận thanh toán" locked={busy} onClose={() => setConfirmOrder(null)}>
          <p><strong>{confirmOrder.name}</strong> · {confirmOrder.duration_months} tháng</p>
          <p>Số tiền: <strong>{billingMoney(confirmOrder.amount_vnd)}</strong></p>
          <p>Gia hạn chủ động, không tự động trừ tiền. Đơn đang chờ trước đó sẽ giữ giá đã chốt và được hiển thị riêng để bạn kiểm tra.</p>
          <div className="billing-actions"><button disabled={busy} onClick={() => setConfirmOrder(null)}>Quay lại</button><button className="btn-plan-action" disabled={busy} onClick={subscribe}>{busy ? 'Đang tạo đơn…' : 'Xác nhận và tiếp tục'}</button></div>
        </PlanDialog>}
        <section className="billing-history current-subscription-card" aria-labelledby="billing-history-title"><div className="billing-heading"><h2 id="billing-history-title">Lịch sử thanh toán</h2><button disabled={busy} onClick={() => act(load)}>Làm mới</button></div>
          {!data.history.items.length ? <p>Chưa có đơn thanh toán.</p> : <div className="billing-table-wrap"><table><thead><tr><th>Mã đơn / ngày tạo</th><th>Gói</th><th>Số tiền</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{data.history.items.map((order) => <tr key={order.id}><td>#{order.orderCode}<small>{billingDate(order.createdAt)}</small></td><td>{order.planName}</td><td>{billingMoney(order.amount)}</td><td>{paymentStatus(order.status)}</td><td><Link to={`/sale/payment/${order.id}`}>{['CREATING', 'PENDING'].includes(order.status) ? 'Tiếp tục / kiểm tra' : 'Xem giao dịch'}</Link></td></tr>)}</tbody></table></div>}
          <div className="billing-pagination"><button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page} · {data.history.total} đơn</span><button disabled={page * 10 >= data.history.total || busy} onClick={() => setPage(page + 1)}>Sau</button></div>
        </section>
      </>}
  </div>;
}
