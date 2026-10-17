import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { billingRequest, billingDate, billingMoney, paymentStatus, openCheckout } from './billingApi';
import './AgentPricing.css';

export default function AgentPricing({ currentUser }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
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
    try { await fn(); } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  };
  const subscribe = () => act(async () => {
    requestId.current ||= crypto.randomUUID();
    const order = await billingRequest('/api/payments', { method: 'POST', body: { planCode: 'PAID', requestId: requestId.current } });
    if (order.status === 'PENDING' && order.checkoutUrl) openCheckout(order.checkoutUrl);
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
        <div className="pricing-grid">
          <article className="pricing-card"><div className="plan-header"><h3>Miễn phí dùng thử</h3><div className="price-row"><span className="amount">0đ</span><span className="period">/ một tháng</span></div><p className="plan-desc">Một lần cho mỗi tài khoản. Không tự động chuyển sang gói trả phí.</p></div>
            <ul className="plan-features"><li><CheckCircle2 size={18} /><span>Trải nghiệm công cụ môi giới</span></li><li><CheckCircle2 size={18} /><span>Không cần thông tin thanh toán</span></li></ul>
            <button className={subscription ? 'btn-plan-disabled' : 'btn-plan-action'} disabled={busy || Boolean(subscription)} onClick={trial}>{subscription ? 'Tài khoản đã đăng ký gói' : 'Kích hoạt dùng thử'}</button>
          </article>
          <article className="pricing-card popular-plan"><div className="popular-badge">THANH TOÁN QUA PAYOS</div><div className="plan-header"><h3>{plan?.name || 'Gói trả phí'}</h3><div className="price-row"><span className="amount">{plan ? billingMoney(plan.amount_vnd) : 'Chưa có giá'}</span><span className="period">/ {plan?.duration_months || '—'} tháng</span></div><p className="plan-desc">Gia hạn chủ động. Thời hạn được cộng vào phần còn lại của gói đang hoạt động.</p></div>
            <ul className="plan-features"><li><CheckCircle2 size={18} /><span>Kích hoạt khi thanh toán được xác minh</span></li><li><CheckCircle2 size={18} /><span>Không tự động trừ tiền</span></li><li><CheckCircle2 size={18} /><span>Lưu lịch sử và hạn dùng sau mỗi lần thanh toán</span></li></ul>
            <button className="btn-plan-action" disabled={busy || !plan || !data.catalog.checkout.available} onClick={subscribe}>{busy ? 'Đang xử lý…' : active && subscription.plan_name === 'PAID' ? 'Gia hạn bằng payOS' : 'Thanh toán bằng payOS'}</button>
          </article>
          <article className="pricing-card"><div className="plan-header"><h3>Giải pháp doanh nghiệp</h3><div className="price-row"><span className="amount-contact">Liên hệ</span></div><p className="plan-desc">Trao đổi nhu cầu và phạm vi dịch vụ trước khi đăng ký.</p></div><div className="plan-action"><a className="btn-plan-contact" href="mailto:contact@swipenest.com?subject=Tu%20van%20goi%20doanh%20nghiep">Liên hệ tư vấn</a></div></article>
        </div>
        <section className="billing-history current-subscription-card" aria-labelledby="billing-history-title"><div className="billing-heading"><h2 id="billing-history-title">Lịch sử thanh toán</h2><button disabled={busy} onClick={() => act(load)}>Làm mới</button></div>
          {!data.history.items.length ? <p>Chưa có đơn thanh toán.</p> : <div className="billing-table-wrap"><table><thead><tr><th>Mã đơn / ngày tạo</th><th>Gói</th><th>Số tiền</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{data.history.items.map((order) => <tr key={order.id}><td>#{order.orderCode}<small>{billingDate(order.createdAt)}</small></td><td>{order.planName}</td><td>{billingMoney(order.amount)}</td><td>{paymentStatus(order.status)}</td><td><Link to={`/sale/payment/${order.id}`}>{['CREATING', 'PENDING'].includes(order.status) ? 'Tiếp tục / kiểm tra' : 'Xem giao dịch'}</Link></td></tr>)}</tbody></table></div>}
          <div className="billing-pagination"><button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page} · {data.history.total} đơn</span><button disabled={page * 10 >= data.history.total || busy} onClick={() => setPage(page + 1)}>Sau</button></div>
        </section>
      </>}
  </div>;
}
