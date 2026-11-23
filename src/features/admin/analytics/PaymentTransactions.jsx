import { useCallback, useEffect, useState } from 'react';
import { BriefcaseBusiness, Crown } from 'lucide-react';
import { apiFetch } from '../../../auth/apiClient';
import { API_BASE_URL } from '../../../config';
import { money, number } from './analyticsFormat';

const dateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—');
const STATUS_LABELS = {
  CREATING: 'Đang tạo',
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  FAILED: 'Không thành công'
};
const STATUS_TONE = {
  PAID: 'paid',
  PENDING: 'pending',
  CREATING: 'pending',
  CANCELLED: 'muted',
  EXPIRED: 'muted',
  FAILED: 'failed'
};

function AudienceTransactionsBody({ filters, revision, audience, accountLabel, emptyLabel, onCounts }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const query = new URLSearchParams({ ...filters, audience, page, limit: 10 }).toString();
  const key = `${query}:${revision}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/admin/analytics/transactions?${query}`, { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error(data?.error || 'Không thể tải giao dịch.');
        if (!controller.signal.aborted) {
          setResult({ key, data });
          if (data.counts && onCounts) onCounts(data.counts);
        }
      } catch (err) {
        if (!controller.signal.aborted) setResult({ key, error: err.message });
      }
    })();
    return () => controller.abort();
  }, [query, key, onCounts]);

  if (result?.key !== key) return <p role="status">Đang tải giao dịch…</p>;
  if (result.error) {
    return (
      <div className="analytics-agent-error" role="alert">
        <p>{result.error}</p>
        <button type="button" onClick={() => setRetry(retry + 1)}>Thử lại</button>
      </div>
    );
  }
  const { data } = result;
  if (!data.available) return <p>{data.reason}</p>;

  const totalPages = Math.max(1, Math.ceil(data.total / 10));
  return (
    <>
      <p className="analytics-agent-summary">
        Đơn tạo trong khoảng đã chọn · <strong>{number(data.total)}</strong> đơn. Ngày thanh toán được hiển thị riêng để đối soát doanh thu.
      </p>
      {!data.items.length ? (
        <p>{emptyLabel}</p>
      ) : (
        <div className="analytics-table-wrap">
          <table className="analytics-agents-table">
            <thead>
              <tr>
                <th>Mã đơn / ngày tạo</th>
                <th>{accountLabel}</th>
                <th>Gói</th>
                <th>Số tiền</th>
                <th>Trạng thái</th>
                <th>Ngày thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>#{item.orderCode}</strong>
                    <small>{dateTime(item.createdAt)}</small>
                  </td>
                  <td>
                    <strong>{item.accountName || item.agent}</strong>
                    {item.accountEmail && <small>{item.accountEmail}</small>}
                  </td>
                  <td>{item.planName}</td>
                  <td>{money(item.amount)}</td>
                  <td>
                    <span className={`analytics-tx-status analytics-tx-status--${STATUS_TONE[item.status] || 'muted'}`}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td>{dateTime(item.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="analytics-transaction-pagination" aria-label={`Phân trang giao dịch ${accountLabel.toLowerCase()}`}>
        <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button>
        <span>Trang {page} / {totalPages}</span>
        <button type="button" disabled={page * 10 >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
      </div>
    </>
  );
}

export default function PaymentTransactions({ filters, revision }) {
  const [view, setView] = useState('all');
  const filterKey = `${new URLSearchParams(filters).toString()}:${revision}`;
  const [countsState, setCountsState] = useState(null);
  const counts = countsState?.key === filterKey ? countsState.counts : null;
  const handleCounts = useCallback((nextCounts) => setCountsState({ key: filterKey, counts: nextCounts }), [filterKey]);
  const showAgent = view === 'all' || view === 'AGENT';
  const showUser = view === 'all' || view === 'USER';

  return (
    <div className="analytics-subscriptions-stack">
      <div className="analytics-subfilter" role="group" aria-label="Lọc giao dịch theo đối tượng">
        <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
          Tất cả{counts ? ` (${number(counts.all)})` : ''}
        </button>
        <button type="button" aria-pressed={view === 'AGENT'} onClick={() => setView('AGENT')}>
          <BriefcaseBusiness size={15} /> Giao dịch môi giới{counts ? ` (${number(counts.agent)})` : ''}
        </button>
        <button type="button" aria-pressed={view === 'USER'} onClick={() => setView('USER')}>
          <Crown size={15} /> Giao dịch khách hàng{counts ? ` (${number(counts.user)})` : ''}
        </button>
      </div>

      {showAgent && (
        <article className="analytics-panel analytics-wide">
          <div className="analytics-panel-heading">
            <div>
              <h3 className="analytics-panel-title"><BriefcaseBusiness size={17} /> Giao dịch môi giới</h3>
              <p>Đơn thanh toán gói dịch vụ môi giới qua payOS · Ngày · môi giới · gói · số tiền · trạng thái</p>
            </div>
          </div>
          <AudienceTransactionsBody
            key={`AGENT:${filterKey}`}
            filters={filters}
            revision={revision}
            audience="AGENT"
            accountLabel="Môi giới"
            emptyLabel="Chưa có giao dịch của môi giới trong khoảng thời gian này."
            onCounts={handleCounts}
          />
        </article>
      )}

      {showUser && (
        <article className="analytics-panel analytics-wide">
          <div className="analytics-panel-heading">
            <div>
              <h3 className="analytics-panel-title"><Crown size={17} className="analytics-plus-heading-icon" /> Giao dịch khách hàng</h3>
              <p>Đơn thanh toán gói Swipe Nest Plus của khách hàng qua payOS · Ngày · khách hàng · gói · số tiền · trạng thái</p>
            </div>
          </div>
          <AudienceTransactionsBody
            key={`USER:${filterKey}`}
            filters={filters}
            revision={revision}
            audience="USER"
            accountLabel="Khách hàng"
            emptyLabel="Chưa có giao dịch của khách hàng trong khoảng thời gian này."
            onCounts={handleCounts}
          />
        </article>
      )}
    </div>
  );
}
