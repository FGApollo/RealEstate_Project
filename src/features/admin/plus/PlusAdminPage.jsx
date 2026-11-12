import { useState } from 'react';
import { Crown, Search, ShieldCheck } from 'lucide-react';
import { billingDay, billingRequest } from '../../agent/pricing/billingApi';
import './PlusAdminPage.css';

// Admin: gói Plus của người dùng (dùng ở trang "Cấp / hủy gói") và tài khoản chính thức Swipe Nest (migration 026).
// Tin của tài khoản chính thức là "nguồn hàng Swipe Nest" — quyền lợi của gói Plus.
const newRequestId = () => crypto.randomUUID();
const ACTION_LABELS = { GRANTED: 'Cấp', REMOVED: 'Gỡ' };

export function UserPlusPanel() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [months, setMonths] = useState(1);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, success) => {
    setBusy(true); setMessage('');
    try { await fn(); if (success) setMessage(success); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  const lookup = (event) => {
    event?.preventDefault();
    if (!email.trim()) return;
    run(async () => setResult(await billingRequest(`/api/admin/users/plus?email=${encodeURIComponent(email.trim())}`)));
  };
  const change = (kind) => run(async () => {
    const body = kind === 'grant' ? { requestId: newRequestId(), months: Number(months), reason } : { requestId: newRequestId(), reason };
    await billingRequest(`/api/admin/users/${result.user.id}/plus/${kind}`, { method: 'POST', body });
    setResult(await billingRequest(`/api/admin/users/plus?id=${result.user.id}`));
    setReason('');
  }, kind === 'grant' ? 'Đã cấp Plus.' : 'Đã gỡ Plus.');

  const plus = result?.plus;
  return (
    <section className="plus-admin-card" aria-labelledby="plus-admin-users">
      <h2 id="plus-admin-users"><Crown size={18} /> Gói Plus của người dùng</h2>
      <p className="plus-admin-hint">Cấp tặng (miễn phí, cộng dồn sau kỳ hiện tại) hoặc gỡ Plus. Người dùng tự mua qua payOS ở trang /plus.</p>
      <form className="plus-admin-search" onSubmit={lookup}>
        <input type="email" placeholder="Email người dùng" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email người dùng" />
        <button type="submit" disabled={busy}><Search size={16} /> Tra cứu</button>
      </form>
      {message && <p className="plus-admin-message" role="status">{message}</p>}
      {result && (
        <div className="plus-admin-result">
          <p><strong>{result.user.name}</strong> · {result.user.email}</p>
          <p>{plus?.active ? <>Đang có Plus đến <strong>{billingDay(plus.current_end)}</strong> ({plus.periods.length} kỳ)</> : 'Chưa có Plus.'}</p>
          <div className="plus-admin-form">
            <label>Số tháng <select value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            <input placeholder="Lý do (5–500 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lý do" />
            <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => change('grant')}>Cấp Plus</button>
            <button type="button" className="danger" disabled={busy || reason.trim().length < 5 || !plus?.active} onClick={() => change('remove')}>Gỡ Plus</button>
          </div>
          {result.audit?.length > 0 && (
            <ul className="plus-admin-audit">
              {result.audit.map((item) => (
                <li key={`${item.created_at}-${item.action}`}>{billingDay(item.created_at)} · {ACTION_LABELS[item.action] || item.action}{item.months ? ` ${item.months} tháng` : ''} · {item.actor_name}: {item.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function OfficialAccountPanel() {
  const [email, setEmail] = useState('');
  const [agent, setAgent] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setMessage('');
    try { setAgent((await billingRequest(`/api/admin/agents/subscription?email=${encodeURIComponent(email.trim())}`)).agent); }
    catch (error) { setAgent(null); setMessage(error.message); }
    finally { setBusy(false); }
  };
  const toggle = async () => {
    setBusy(true); setMessage('');
    try {
      const { account } = await billingRequest(`/api/admin/agents/${agent.id}/official`, { method: 'PUT', body: { official: !agent.is_official } });
      setAgent({ ...agent, is_official: account.is_official });
      setMessage(account.is_official ? 'Đã đặt làm tài khoản chính thức.' : 'Đã bỏ tài khoản chính thức.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="plus-admin-card" aria-labelledby="plus-admin-official">
      <h2 id="plus-admin-official"><ShieldCheck size={18} /> Tài khoản chính thức Swipe Nest</h2>
      <p className="plus-admin-hint">Tài khoản môi giới do đội Swipe Nest vận hành: đăng tin không cần KYC hay gói, có huy hiệu "Swipe Nest". Chỉ người có Plus mới nhắn tin được với tài khoản này.</p>
      <form className="plus-admin-search" onSubmit={lookup}>
        <input type="email" placeholder="Email tài khoản môi giới" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email tài khoản môi giới" />
        <button type="submit" disabled={busy}><Search size={16} /> Tra cứu</button>
      </form>
      {message && <p className="plus-admin-message" role="status">{message}</p>}
      {agent && (
        <div className="plus-admin-result">
          <p><strong>{agent.name}</strong> · {agent.email} · KYC: {agent.verification_status}</p>
          <button type="button" disabled={busy} className={agent.is_official ? 'danger' : ''} onClick={toggle}>
            {agent.is_official ? 'Bỏ tài khoản chính thức' : 'Đặt làm tài khoản chính thức'}
          </button>
        </div>
      )}
    </section>
  );
}

export default function PlusAdminPage() {
  return (
    <div className="plus-admin-page">
      <OfficialAccountPanel />
    </div>
  );
}
