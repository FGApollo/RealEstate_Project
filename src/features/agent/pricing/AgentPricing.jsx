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
      planCode: confirmOrder.code, requestId: requestId.current, planVersion: confirmOrder.version
    } });
    setConfirmOrder(null);
    // An existing pending order may have a different, previously confirmed price.
    // Its detail screen shows that immutable amount before opening payOS.
    if (order.planCode !== confirmOrder.code || order.amount !== confirmOrder.amount_vnd || order.durationMonths !== confirmOrder.duration_months) {
      window.location.assign(`/sale/payment/${order.id}`);
    } else if (order.status === 'PENDING' && order.checkoutUrl) openCheckout(order.checkoutUrl);
    else { requestId.current = null; await load(); setMessage(`Đơn #${order.orderCode}: ${paymentStatus(order.status)}.`); }
  });
  const plan = data?.catalog.plans.find((item) => item.code === data?.subscription?.plan_name);
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
          {!active && <p>Tin được giữ trong danh mục của bạn và chỉ hiển thị với khách hàng khi có gói còn hiệu lực.</p>}
          {active && <div className="subscription-benefits"><p><strong>{subscription.visible_listing_count} / {subscription.listing_limit}</strong> tin đang hiển thị · <strong>{subscription.priority_points}</strong> điểm ưu tiên hiển thị</p><p>Support {subscription.support_tier} · Tin đã ẩn hoặc kết thúc không chiếm chỗ.</p>
            {subscription.public_listing_count > subscription.listing_limit && <p role="status">Có {subscription.public_listing_count} tin bật công khai. Gói hiện tại chỉ hiển thị {subscription.listing_limit} tin mới nhất; tin còn lại được giữ trong danh mục. Hãy ẩn/kết thúc bớt tin để chọn lại các tin muốn hiển thị.</p>}</div>}
          {Boolean(subscription?.upcoming?.length) && <div className="subscription-upcoming"><h4>Gói đã thanh toán, chờ đến kỳ</h4><ul>{subscription.upcoming.map(item => <li key={item.id}><strong>{item.plan_name}</strong> · {billingDate(item.start_date)} → {billingDate(item.end_date)} · {item.listing_limit} tin · {item.priority_points} điểm</li>)}</ul></div>}
        </div>
        {!data.catalog.checkout.available && <div className="pricing-message-banner" role="status"><AlertCircle size={18} />{data.catalog.checkout.reason}</div>}
        <ServicePlanCards plans={data.catalog.plans} subscription={subscription} checkoutAvailable={data.catalog.checkout.available}
          busy={busy} onSubscribe={selectedPlan => { if (confirmOrder?.code !== selectedPlan.code) requestId.current = null; setConfirmOrder(selectedPlan); }} />
        {confirmOrder && <PlanDialog title="Xác nhận thanh toán" locked={busy} onClose={() => setConfirmOrder(null)}>
          <p><strong>{confirmOrder.name}</strong> · {confirmOrder.duration_months} tháng</p>
          <p>Số tiền: <strong>{billingMoney(confirmOrder.amount_vnd)}</strong></p>
          <p>{confirmOrder.listing_limit} tin công khai · {confirmOrder.priority_points} điểm ưu tiên · Support {confirmOrder.support_tier}.</p>
          <p>Gói mới bắt đầu sau tất cả kỳ đã thanh toán còn hạn. Nếu chưa có gói còn hạn, gói bắt đầu khi thanh toán được xác minh. Không tự động trừ tiền.</p>
          <p>Đơn đang chờ trước đó giữ nguyên gói và giá đã chốt; bạn sẽ được đưa đến trang kiểm tra nếu khác lựa chọn này.</p>
          <div className="billing-actions"><button disabled={busy} onClick={() => setConfirmOrder(null)}>Quay lại</button><button className="btn-plan-action" disabled={busy} onClick={subscribe}>{busy ? 'Đang tạo đơn…' : 'Xác nhận và tiếp tục'}</button></div>
        </PlanDialog>}
        <section className="billing-history current-subscription-card" aria-labelledby="billing-history-title"><div className="billing-heading"><h2 id="billing-history-title">Lịch sử thanh toán</h2><button disabled={busy} onClick={() => act(load)}>Làm mới</button></div>
          {!data.history.items.length ? <p>Chưa có đơn thanh toán.</p> : <div className="billing-table-wrap"><table><thead><tr><th>Mã đơn / ngày tạo</th><th>Gói</th><th>Số tiền</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{data.history.items.map((order) => <tr key={order.id}><td>#{order.orderCode}<small>{billingDate(order.createdAt)}</small></td><td>{order.planName}</td><td>{billingMoney(order.amount)}</td><td>{paymentStatus(order.status)}</td><td><Link to={`/sale/payment/${order.id}`}>{['CREATING', 'PENDING'].includes(order.status) ? 'Tiếp tục / kiểm tra' : 'Xem giao dịch'}</Link></td></tr>)}</tbody></table></div>}
          <div className="billing-pagination"><button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page} · {data.history.total} đơn</span><button disabled={page * 10 >= data.history.total || busy} onClick={() => setPage(page + 1)}>Sau</button></div>
        </section>
      </>}
  </div>;
}
