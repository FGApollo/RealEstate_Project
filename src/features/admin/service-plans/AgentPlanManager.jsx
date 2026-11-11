import { useState } from 'react';
import { Search, ShieldCheck, UserCog } from 'lucide-react';
import { billingRequest, billingDate, billingMoney } from '../../agent/pricing/billingApi';
import PlanDialog from '../../agent/pricing/PlanDialog';

// Quản lý gói của một môi giới cụ thể: tra cứu theo email hoặc id, cấp gói, đổi hạng kỳ đang chạy, gỡ gói.
// Quy tắc nằm ở database (migration 023); giao diện chỉ thu thập lựa chọn và lý do.
const TIERS = [{ code: 'LITE', name: 'Lite' }, { code: 'PLUS', name: 'Plus' }, { code: 'PRO', name: 'Pro' }];
const AUDIT_NAMES = { GRANTED: 'Admin cấp gói', CHANGED: 'Admin đổi hạng', REMOVED: 'Admin gỡ gói', CANCELLED_QUEUED: 'Môi giới hủy kỳ chờ' };
const ACTIONS = {
  grant: { title: 'Cấp gói cho môi giới', button: 'Cấp gói' },
  change: { title: 'Đổi hạng kỳ đang chạy', button: 'Đổi hạng' },
  remove: { title: 'Gỡ gói của môi giới', button: 'Gỡ gói' }
};

// Nhật ký chỉ hiện vài thao tác gần nhất, bấm mới xem hết (tránh thẻ dài cả trang).
const AUDIT_PREVIEW = 5;

const isRunning = (subscription) => Boolean(subscription && subscription.status === 'ACTIVE'
  && new Date(subscription.start_date) <= new Date() && new Date(subscription.end_date) > new Date());

export default function AgentPlanManager() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAllAudit, setShowAllAudit] = useState(false);
  const [dialog, setDialog] = useState(null); // { kind, planCode, months, reason, requestId }

  const lookup = async (event) => {
    event?.preventDefault();
    const value = query.trim();
    if (!value) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const param = /^\d+$/.test(value) ? `id=${value}` : `email=${encodeURIComponent(value)}`;
      setData(await billingRequest(`/api/admin/agents/subscription?${param}`));
    } catch (err) {
      setData(null);
      setError(err.message);
    } finally { setBusy(false); }
  };

  const reload = async (agentId) => setData(await billingRequest(`/api/admin/agents/subscription?id=${agentId}`));

  const open = (kind) => {
    setError(''); setMessage('');
    setDialog({ kind, planCode: kind === 'change' ? '' : 'LITE', months: 1, reason: '', requestId: crypto.randomUUID() });
  };

  const submit = async () => {
    const agentId = data.agent.id;
    const body = { requestId: dialog.requestId, reason: dialog.reason.trim() };
    if (dialog.kind !== 'remove') body.planCode = dialog.planCode;
    if (dialog.kind === 'grant') body.months = Number(dialog.months);
    setBusy(true); setError('');
    try {
      await billingRequest(`/api/admin/agents/${agentId}/subscription/${dialog.kind}`, { method: 'POST', body });
      setDialog(null);
      setMessage(`${ACTIONS[dialog.kind].button} thành công.`);
      await reload(agentId);
    } catch (err) {
      setError(err.message);
      if (err.status === 400 || err.status === 409) setDialog((old) => old && { ...old, requestId: crypto.randomUUID() });
    } finally { setBusy(false); }
  };

  const subscription = data?.subscription;
  const running = isRunning(subscription);
  const validReason = (dialog?.reason || '').trim().length >= 5;
  const canSubmit = dialog && validReason && (dialog.kind === 'remove' || dialog.planCode);

  return <section className="service-panel agent-plan-manager" aria-labelledby="agent-plan-manager-title">
    <div className="service-panel-head"><div><h2 id="agent-plan-manager-title"><UserCog size={18} />Gói của từng môi giới</h2>
      <p>Cấp gói miễn phí, đổi hạng kỳ đang chạy hoặc gỡ gói. Mọi thao tác cần lý do và được ghi nhật ký.</p></div></div>
    <div className="service-editor-body">
      <form className="agent-plan-search" onSubmit={lookup}>
        <input type="text" placeholder="Email hoặc ID của môi giới" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Email hoặc ID của môi giới" />
        <button className="service-primary" type="submit" disabled={busy || !query.trim()}><Search size={16} />Tra cứu</button>
      </form>
      {message && <div className="service-feedback success" role="status">{message}</div>}
      {error && <div className="service-feedback error" role="alert">{error}</div>}
      {data && <>
        <div className="agent-plan-summary">
          <div><b>{data.agent.name}</b> · #{data.agent.id}<small>{data.agent.email} · {data.agent.verification_status === 'VERIFIED' ? 'Đã xác minh' : 'Chưa xác minh'} · {data.agent.trust_score ?? 50} điểm uy tín{data.agent.is_active ? '' : ' · Đang bị khóa'}</small></div>
          {running ? <div><b>Đang dùng: {subscription.plan_name}</b> ({subscription.source === 'ADMIN' ? 'admin cấp' : subscription.source === 'TRIAL' ? 'dùng thử miễn phí' : 'thanh toán payOS'})
            <small>{billingDate(subscription.start_date)} → {billingDate(subscription.end_date)} · {subscription.listing_limit} tin · {subscription.priority_points} điểm ưu tiên</small></div>
            : <div><b>Không có gói đang chạy</b></div>}
          {Boolean(subscription?.upcoming?.length) && <div><b>Kỳ đang chờ</b>{subscription.upcoming.map((item) => <small key={item.id}>{item.plan_name} · {billingDate(item.start_date)} → {billingDate(item.end_date)}</small>)}</div>}
        </div>
        <div className="service-form-actions agent-plan-actions">
          <button className="service-primary" disabled={busy} onClick={() => open('grant')}>Cấp gói</button>
          <button disabled={busy || !running} onClick={() => open('change')}>Đổi hạng kỳ đang chạy</button>
          <button className="agent-plan-danger" disabled={busy || !running} onClick={() => open('remove')}>Gỡ gói</button>
        </div>
        <h3 className="agent-plan-audit-title">Nhật ký gói của môi giới</h3>
        {!data.audit.length ? <p className="service-loading">Chưa có thao tác nào.</p>
          : <div className="service-table-wrap"><table><thead><tr><th>Thao tác</th><th>Người thực hiện</th><th>Thời gian</th><th>Lý do</th></tr></thead>
            <tbody>{(showAllAudit ? data.audit : data.audit.slice(0, AUDIT_PREVIEW)).map((item) => <tr key={item.id}><td>{AUDIT_NAMES[item.action] || item.action}</td><td>{item.actor_name}</td><td>{billingDate(item.created_at)}</td><td>{item.reason}</td></tr>)}</tbody></table>
            {data.audit.length > AUDIT_PREVIEW && <button type="button" className="agent-plan-audit-more" onClick={() => setShowAllAudit((value) => !value)}>{showAllAudit ? 'Thu gọn' : `Xem tất cả ${data.audit.length} thao tác`}</button>}</div>}
      </>}
    </div>

    {dialog && <PlanDialog title={ACTIONS[dialog.kind].title} locked={busy} onClose={() => setDialog(null)}>
      {dialog.kind === 'grant' && <>
        <p>Gói cấp miễn phí áp dụng cùng quy tắc như khi môi giới thanh toán: hạng cao hơn gói đang chạy thì có hiệu lực ngay, cùng hạng hoặc thấp hơn thì xếp sau các kỳ hiện có.</p>
        <div className="service-form-row">
          <label>Hạng gói<select value={dialog.planCode} onChange={(event) => setDialog((old) => ({ ...old, planCode: event.target.value }))}>
            {TIERS.map((tier) => <option key={tier.code} value={tier.code}>{tier.name}</option>)}</select></label>
          <label>Số tháng<select value={dialog.months} onChange={(event) => setDialog((old) => ({ ...old, months: Number(event.target.value) }))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} tháng</option>)}</select></label>
        </div>
        <p>Giá ghi nhận: <strong>{billingMoney(0)}</strong> (không tạo đơn thanh toán).</p>
      </>}
      {dialog.kind === 'change' && <>
        <p>Đổi hạng có hiệu lực ngay, giữ nguyên ngày hết hạn {billingDate(subscription?.end_date)} và không thu thêm tiền.</p>
        <label>Hạng mới<select value={dialog.planCode} onChange={(event) => setDialog((old) => ({ ...old, planCode: event.target.value }))}>
          <option value="" disabled>Chọn hạng</option>
          {TIERS.filter((tier) => tier.code !== subscription?.support_tier).map((tier) => <option key={tier.code} value={tier.code}>{tier.name}</option>)}</select></label>
      </>}
      {dialog.kind === 'remove' && <p>Kỳ đang chạy kết thúc ngay và các kỳ đang chờ bị hủy. Tin công khai vượt hạn mức miễn phí sẽ không còn được ưu tiên hiển thị. <strong>Hệ thống không tự hoàn tiền.</strong></p>}
      <label>Lý do (5–500 ký tự)<textarea rows={3} maxLength={500} value={dialog.reason}
        onChange={(event) => setDialog((old) => ({ ...old, reason: event.target.value }))} /></label>
      <div className="service-note warning"><ShieldCheck size={18} /><span>Thao tác được ghi vào nhật ký kèm tên người thực hiện.</span></div>
      <div className="service-form-actions"><button disabled={busy} onClick={() => setDialog(null)}>Quay lại</button>
        <button className={dialog.kind === 'remove' ? 'agent-plan-danger' : 'service-primary'} disabled={busy || !canSubmit} onClick={submit}>{busy ? 'Đang lưu…' : ACTIONS[dialog.kind].button}</button></div>
    </PlanDialog>}
  </section>;
}
