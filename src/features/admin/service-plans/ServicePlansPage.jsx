import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Check, Clock3, CreditCard, Eye, History, Info, Pencil, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { billingRequest, billingMoney, billingDate } from '../../agent/pricing/billingApi';
import ServicePlanCards from '../../agent/pricing/ServicePlanCards';
import PlanDialog from '../../agent/pricing/PlanDialog';
import '../../agent/pricing/AgentPricing.css';
import './ServicePlansPage.css';

const endpoint = '/api/admin/service-plans';
const actionNames = { UPDATED: 'Cập nhật ngay', SCHEDULED: 'Lên lịch', APPLIED: 'Đã áp dụng lịch', CANCELLED: 'Hủy lịch' };
const amountLabel = plan => plan.price_kind === 'CONTACT' ? 'Liên hệ' : billingMoney(plan.amount_vnd);
const initialDraft = plan => ({ amount: String(plan.amount_vnd), durationMonths: plan.duration_months, active: plan.active,
  mode: 'now', effectiveAt: '', reason: '' });
const vietnamDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Chọn ngày giờ áp dụng hợp lệ.');
  const parsed = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Ngày giờ không hợp lệ.');
  return parsed.toISOString();
};

function PlanEditor({ plan, pending, onSaved }) {
  const [draft, setDraft] = useState(() => initialDraft(plan));
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const formRef = useRef(null);
  const readOnly = plan.price_kind !== 'FIXED';
  const dirty = Number(draft.amount) !== plan.amount_vnd || draft.durationMonths !== plan.duration_months || draft.active !== plan.active;
  const update = (key, value) => { setDraft(old => ({ ...old, [key]: value })); request.current = null; setError(''); };
  const prepare = event => {
    event.preventDefault(); setError('');
    if (!formRef.current.reportValidity()) return;
    try {
      const payload = { action: 'SAVE', expectedVersion: plan.version, amount: Number(draft.amount),
        durationMonths: draft.durationMonths, active: draft.active, reason: draft.reason.trim(),
        effectiveAt: draft.mode === 'schedule' ? vietnamDate(draft.effectiveAt) : null };
      if (!dirty) throw new Error('Chưa có thay đổi về giá, chu kỳ hoặc trạng thái.');
      if (payload.reason.length < 5) throw new Error('Nhập lý do thay đổi từ 5 ký tự.');
      if (payload.effectiveAt && (new Date(payload.effectiveAt) < new Date(Date.now() + 5 * 60000)
        || new Date(payload.effectiveAt) > new Date(Date.now() + 365 * 86400000))) throw new Error('Chọn lịch sau ít nhất 5 phút và trong vòng 365 ngày.');
      setConfirmation(payload);
    } catch (err) { setError(err.message); }
  };
  const save = async () => {
    setBusy(true); setError(''); request.current ||= crypto.randomUUID();
    try {
      const result = await billingRequest(`${endpoint}/paid`, { method: 'POST', body: { ...confirmation, planCode: plan.code, requestId: request.current } });
      setConfirmation(null); onSaved(result, confirmation.action === 'CANCEL' ? 'Đã hủy lịch thay đổi.'
        : confirmation.effectiveAt ? 'Đã lưu lịch thay đổi giá.' : 'Đã lưu cấu hình mới.');
    } catch (err) {
      setConfirmation(null); setError(err.message);
      if (err.status === 409) request.current = null;
    } finally { setBusy(false); }
  };
  return <section className="service-panel service-editor" aria-label={`Cấu hình ${plan.name}`}>
    <div className="service-panel-head"><div><h2>{readOnly ? 'Cấu hình' : 'Chỉnh sửa giá'} · {plan.name}</h2><p>{readOnly ? 'Thông tin được sử dụng trên trang Agent.' : 'Quản lý giá niêm yết và thời điểm áp dụng.'}</p></div><span className="service-badge">{readOnly ? 'Chỉ xem' : 'Đang chỉnh sửa'}</span></div>
    <div className="service-editor-body">
      {error && <div className="service-feedback error" role="alert">{error}<span>Thông tin nhập vẫn được giữ lại. Dùng “Làm mới” để kiểm tra cấu hình mới nhất nếu có xung đột.</span></div>}
      {readOnly ? <div className="service-readonly"><span className="service-field-label">Loại gói</span><h3>{plan.name}</h3><strong>{amountLabel(plan)}</strong><p>{plan.description}</p>
        {plan.duration_months && <p>Thời hạn: {plan.duration_months} tháng</p>}
        <div className="service-note"><Info size={17} /><span>{plan.price_kind === 'FREE' ? 'Mỗi tài khoản chỉ được dùng thử một lần. Không tự động chuyển sang gói trả phí.' : 'Gói tư vấn riêng chưa tạo đơn thanh toán. Giá được thỏa thuận theo nhu cầu.'}</span></div>
      </div> : <form ref={formRef} onSubmit={prepare}>
        <div className="service-selected">Đang chọn <span>{plan.name}</span> · Gói {plan.duration_months} tháng</div>
        {pending && <div className="service-pending"><Clock3 size={19} /><div><strong>Có lịch thay đổi đang chờ</strong><p>{billingMoney(pending.amount_vnd)} / {pending.duration_months} tháng · {pending.active ? 'Đang bán' : 'Tạm ngừng'}</p><p>Áp dụng từ {billingDate(pending.effective_at)} (giờ Việt Nam)</p><button type="button" onClick={() => { setError(''); setConfirmation({ action: 'CANCEL', expectedVersion: plan.version, reason: '' }); }}>Hủy lịch này</button></div></div>}
        <fieldset disabled={busy || Boolean(pending)}>
          <label htmlFor="service-price">Giá bán mới <span aria-hidden="true">*</span></label>
          <div className="service-price-input"><input id="service-price" type="number" inputMode="numeric" min="2000" max="500000000" step="1" required value={draft.amount} onChange={event => update('amount', event.target.value)} /><span>VNĐ</span></div>
          <small>Giá hiện tại: <b>{billingMoney(plan.amount_vnd)}</b> / {plan.duration_months} tháng. Giá cho cả chu kỳ, từ 2.000 đến 500.000.000đ.</small>
          <div className="service-form-row"><label>Chu kỳ thanh toán<select value={draft.durationMonths} onChange={event => update('durationMonths', Number(event.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} tháng</option>)}</select></label>
            <label>Trạng thái đăng ký<select value={String(draft.active)} onChange={event => update('active', event.target.value === 'true')}><option value="true">● Đang bán</option><option value="false">Tạm ngừng đăng ký mới</option></select></label></div>
          <div className="service-timing"><span className="service-field-label">Thời điểm áp dụng</span>
            <label className={`service-radio ${draft.mode === 'now' ? 'selected' : ''}`}><input type="radio" name="effective-mode" checked={draft.mode === 'now'} onChange={() => update('mode', 'now')} /><span><b>Ngay khi lưu</b><small>Áp dụng cho đơn thanh toán mới sau khi cập nhật.</small></span></label>
            <label className={`service-radio ${draft.mode === 'schedule' ? 'selected' : ''}`}><input type="radio" name="effective-mode" checked={draft.mode === 'schedule'} onChange={() => update('mode', 'schedule')} /><span><b>Lên lịch thay đổi</b><small>Chọn thời điểm bắt đầu áp dụng giá mới.</small></span></label>
            {draft.mode === 'schedule' && <label className="service-schedule-time">Ngày giờ Việt Nam (UTC+7)<input type="datetime-local" required value={draft.effectiveAt} onChange={event => update('effectiveAt', event.target.value)} /><small>Sau ít nhất 5 phút, trong vòng 365 ngày.</small></label>}
          </div>
          <label>Lý do thay đổi<textarea minLength={5} maxLength={500} required rows={2} placeholder="Ví dụ: Điều chỉnh giá theo chính sách kinh doanh…" value={draft.reason} onChange={event => update('reason', event.target.value)} /></label>
          <div className="service-note warning"><TriangleAlert size={18} /><span>Đơn đã tạo giữ nguyên giá đã chốt. Giao dịch đã hoàn tất và hạn dùng đã cấp được giữ nguyên.</span></div>
          <div className="service-form-actions"><button type="button" disabled={!dirty && !draft.reason} onClick={() => { setDraft(initialDraft(plan)); request.current = null; setError(''); }}>Hủy thay đổi</button><button className="service-primary" type="submit" disabled={!dirty}><Check size={17} />Lưu cấu hình mới</button></div>
        </fieldset>
        <div className="service-mini-preview"><div><b>Xem trước trên trang Agent</b><span>GIÁ DỰ KIẾN</span></div><article><div><strong>{plan.name}</strong><small>{draft.active ? 'Đang mở đăng ký' : 'Tạm ngừng đăng ký mới'}</small></div><strong>{draft.amount ? billingMoney(Number(draft.amount)) : '—'}<small> / {draft.durationMonths} tháng</small></strong></article></div>
      </form>}
    </div>
    {confirmation && <PlanDialog title={confirmation.action === 'CANCEL' ? 'Xác nhận hủy lịch' : 'Xác nhận thay đổi gói'} locked={busy} onClose={() => setConfirmation(null)}>
      {confirmation.action === 'CANCEL' ? <><p>Lịch hiện tại sẽ được hủy; gói tiếp tục dùng cấu hình đang áp dụng.</p><label className="service-cancel-label">Lý do hủy<textarea rows={3} minLength={5} maxLength={500} value={confirmation.reason} onChange={event => { request.current = null; setConfirmation(old => ({ ...old, reason: event.target.value })); }} /></label></>
        : <><div className="service-confirm-values"><span>Hiện tại <b>{billingMoney(plan.amount_vnd)} / {plan.duration_months} tháng</b></span><ArrowRight size={20} /><span>Cấu hình mới <b>{billingMoney(confirmation.amount)} / {confirmation.durationMonths} tháng</b></span></div><p>Trạng thái: <strong>{confirmation.active ? 'Đang bán' : 'Tạm ngừng đăng ký mới'}</strong></p><p>Áp dụng: <strong>{confirmation.effectiveAt ? `${billingDate(confirmation.effectiveAt)} (UTC+7)` : 'Ngay khi lưu thành công'}</strong></p><p>Lý do: {confirmation.reason}</p></>}
      <div className="service-note warning"><ShieldCheck size={18} /><span>Thay đổi được ghi vào nhật ký quản trị. Giá và hạn dùng của các đơn đã tạo được giữ nguyên.</span></div>
      <div className="service-form-actions"><button disabled={busy} onClick={() => setConfirmation(null)}>Quay lại</button><button className="service-primary" disabled={busy || confirmation.reason.trim().length < 5} onClick={save}>{busy ? 'Đang lưu…' : 'Xác nhận lưu'}</button></div>
    </PlanDialog>}
  </section>;
}

function ChangeHistory({ revision }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    billingRequest(`${endpoint}/history?page=${page}&limit=10`, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(''); }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [page, revision, retry]);
  return <section className="service-panel service-history" id="service-change-history"><div className="service-panel-head"><div><h2><History size={18} />Lịch sử thay đổi</h2><p>Nhật ký thay đổi giá, lịch áp dụng và người thực hiện.</p></div></div>
    {error ? <div className="service-feedback error" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>Thử lại</button></div>
      : !data || data.page !== page ? <p className="service-loading" role="status">Đang tải lịch sử…</p> : !data.items.length ? <p className="service-loading">Chưa có thay đổi cấu hình nào được ghi nhận.</p>
        : <><div className="service-table-wrap"><table><thead><tr><th>Thao tác / người thực hiện</th><th>Trước thay đổi</th><th>Cấu hình mới</th><th>Thời gian</th><th>Lý do</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><b>{item.plan_code} · {actionNames[item.action]}</b><small>{item.actor_name} · #{item.actor_id}</small></td><td>{billingMoney(item.before_config.amount_vnd)}<small>{item.before_config.duration_months} tháng · {item.before_config.active ? 'Đang bán' : 'Tạm ngừng'}</small></td><td>{billingMoney(item.after_config.amount_vnd)}<small>{item.after_config.duration_months} tháng · {item.after_config.active ? 'Đang bán' : 'Tạm ngừng'}</small></td><td>{billingDate(item.created_at)}<small>Hiệu lực: {billingDate(item.effective_at)}</small></td><td>{item.reason}</td></tr>)}</tbody></table></div>
          <div className="service-pagination"><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>Trước</button><span>Trang {page} · {data.total} thay đổi</span><button disabled={page * 10 >= data.total} onClick={() => setPage(value => value + 1)}>Sau</button></div></>}
  </section>;
}

export default function ServicePlansPage() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('LITE');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState(false);
  const [preview, setPreview] = useState(false);
  const controller = useRef(null);
  const load = useCallback(async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setLoading(true); setError('');
    try { const result = await billingRequest(endpoint, { signal: request.signal }); if (!request.signal.aborted) setData(result); }
    catch (err) { if (!request.signal.aborted) setError(err.message); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const request = new AbortController(); controller.current = request;
    billingRequest(endpoint, { signal: request.signal }).then(result => {
      if (!request.signal.aborted) { setData(result); setError(''); }
    }).catch(err => { if (!request.signal.aborted) setError(err.message); })
      .finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, []);
  const plan = data?.plans.find(item => item.code === selected);
  return <div className="service-plans-page">
    <header className="service-page-heading"><div><span className="service-eyebrow"><CreditCard size={14} />CẤU HÌNH THANH TOÁN</span><h1>Quản lý gói dịch vụ</h1><p>Quản lý bảng giá và thiết lập gói hiển thị trên trang dành cho môi giới (Agent).</p></div><div className="service-heading-actions"><button onClick={() => setHistory(value => !value)} aria-expanded={history}><History size={16} />Lịch sử thay đổi</button><button disabled={!data} onClick={() => setPreview(true)}><Eye size={16} />Xem trang Agent</button><button disabled={loading} onClick={load} aria-label="Làm mới cấu hình"><RefreshCw size={16} /></button></div></header>
    {message && <div className="service-feedback success" role="status"><Check size={18} />{message}</div>}
    {error && <div className="service-feedback error" role="alert">{error}<button disabled={loading} onClick={load}>Thử lại</button></div>}
    {!data ? <div className="service-loading" role="status">{loading ? 'Đang tải cấu hình gói dịch vụ…' : 'Chưa tải được cấu hình gói dịch vụ.'}</div> : <>
      <div className="service-summary"><article><span className="service-summary-icon"><BriefcaseBusiness size={21} /></span><div><small>Gói đang hiển thị</small><strong>{data.plans.length} gói</strong></div></article><article><span className="service-summary-icon purple"><CreditCard size={21} /></span><div><small>Gói có giá cố định</small><strong>{data.plans.filter(item => item.price_kind === 'FIXED').length} gói</strong></div></article><article><span className="service-summary-icon green"><ShieldCheck size={22} /></span><div><small>Cách áp dụng giá mới</small><strong className="service-summary-policy">Cho đơn thanh toán mới</strong></div></article></div>
      {loading && <p className="service-refreshing" role="status">Đang làm mới cấu hình…</p>}
      <div className="service-workspace"><section className="service-panel service-list"><div className="service-panel-head"><div><h2>Danh sách gói dịch vụ</h2><p>Chọn Lite, Plus hoặc Pro để cập nhật giá và xem trước thay đổi.</p></div><span className="service-count">{data.plans.length} GÓI DỊCH VỤ</span></div>
        <div className="service-plan-list">{data.plans.map(item => <button className={`service-plan-item${selected === item.code ? ' selected' : ''}`} key={item.code} onClick={() => setSelected(item.code)} aria-pressed={selected === item.code}><div><h3>{item.name}</h3><span className={`service-badge ${item.price_kind === 'FREE' ? 'muted' : item.price_kind === 'CONTACT' ? 'orange' : !item.active ? 'muted' : ''}`}>{item.price_kind === 'FREE' ? 'Miễn phí' : item.price_kind === 'CONTACT' ? 'Tư vấn riêng' : item.active ? '● Đang bán' : 'Tạm ngừng đăng ký'}</span></div><p>{item.description}</p><p>{item.listing_limit} tin công khai · {item.priority_points} điểm ưu tiên · Support {item.support_tier}</p><span className="service-plan-link">{item.price_kind === 'FIXED' ? <><Pencil size={14} />Chỉnh giá</> : <>Xem cấu hình<ArrowRight size={15} /></>}</span><div className="service-plan-price"><strong>{amountLabel(item)}</strong>{item.duration_months && <small> / {item.duration_months} tháng</small>}</div></button>)}</div>
        <footer className="service-list-footer"><Info size={15} />Mức giá trên trang Agent được lấy từ cấu hình đã lưu.<span>Cập nhật: {billingDate(data.snapshotAt)}</span></footer>
      </section>
        {plan && <PlanEditor key={`${plan.code}:${plan.version ?? 0}:${data.snapshotAt}`} plan={plan} pending={data.pending.find(item => item.plan_code === plan.code)} onSaved={(result, notice) => { setData(result); setMessage(notice); setError(''); }} />}
      </div>
      {history && <ChangeHistory revision={data.snapshotAt} />}
      <div className="service-footnote"><ShieldCheck size={18} /><span>Mỗi thay đổi cần xác nhận và được ghi nhật ký. Lịch đã lưu được áp dụng theo giờ Việt Nam khi mở bảng giá hoặc tạo đơn mới.</span></div>
    </>}
    {preview && data && <PlanDialog title="Trang gói dịch vụ dành cho Agent" wide onClose={() => setPreview(false)}><p>Bản xem trước dùng cấu hình đã lưu. Các nút đăng ký bị tắt trong chế độ Admin.</p><ServicePlanCards plans={data.plans} preview /></PlanDialog>}
  </div>;
}
