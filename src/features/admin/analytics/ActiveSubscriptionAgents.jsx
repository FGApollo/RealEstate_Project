import { useEffect, useState } from 'react';
import { apiFetch } from '../../../auth/apiClient';
import { API_BASE_URL } from '../../../config';
import { number } from './analyticsFormat';

const dateTime = (value) => (value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—');
const accountStatus = (active) => (active === true ? 'Hoạt động' : active === false ? 'Vô hiệu hóa' : 'Chưa rõ trạng thái');
const plusSourceLabel = (source) => (source === 'ADMIN' ? 'Admin cấp' : 'Thanh toán payOS');

function SubscribersPage({
  endpoint,
  snapshotAt,
  expectedTotal,
  onRefresh,
  entityLabel,
  entityCapitalized,
  emptyAtSnapshot,
  headers,
  getRowKey,
  renderRow
}) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const query = new URLSearchParams({ at: snapshotAt, page, limit: 10 }).toString();
  const key = `${endpoint}?${query}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}${endpoint}?${query}`, { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || !Array.isArray(data.items)) {
          throw new Error(data?.error || `Không thể tải danh sách ${entityLabel}. Vui lòng thử lại.`);
        }
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error.message });
      }
    })();
    return () => controller.abort();
  }, [endpoint, entityLabel, query, key]);

  if (result?.key !== key) return <p role="status">Đang tải danh sách {entityLabel}…</p>;
  if (result.error) {
    return (
      <div className="analytics-agent-error" role="alert">
        <p>{result.error}</p>
        <button type="button" onClick={() => setRetry(retry + 1)}>Thử lại danh sách</button>
      </div>
    );
  }

  const { data } = result;
  return (
    <div className="analytics-agent-list">
      <p className="analytics-agent-summary">
        Tổng {number(data.total)} {entityLabel} · tại {dateTime(data.snapshotAt)} · mỗi {entityLabel} được tính một lần. Sắp xếp theo hạn dùng gần nhất.
      </p>
      {data.total !== expectedTotal && (
        <div className="analytics-notice" role="status">
          <span>Dữ liệu vừa thay đổi. Cập nhật thống kê để đồng bộ số lượng và danh sách.</span>
          <button type="button" onClick={onRefresh}>Cập nhật thống kê</button>
        </div>
      )}
      {!data.items.length ? (
        <p>{data.total === 0 ? emptyAtSnapshot : `Trang này không có ${entityLabel}. Chọn trang trước để xem danh sách.`}</p>
      ) : (
        <div className="analytics-table-wrap">
          <table className="analytics-agents-table">
            <thead>
              <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {data.items.map((item) => <tr key={getRowKey(item)}>{renderRow(item)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
      <div className="analytics-transaction-pagination" aria-label={`Phân trang ${entityCapitalized}`}>
        <button type="button" aria-label={`Trang ${entityCapitalized} trước`} disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button>
        <span>Trang {page} / {Math.max(1, Math.ceil(data.total / 10))}</span>
        <button type="button" aria-label={`Trang ${entityCapitalized} tiếp`} disabled={page * 10 >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
      </div>
    </div>
  );
}

export default function ActiveSubscriptionAgents(props) {
  return (
    <SubscribersPage
      key={props.snapshotAt}
      {...props}
      endpoint="/api/admin/analytics/subscriptions/agents"
      entityLabel="Agent"
      entityCapitalized="Agent"
      emptyAtSnapshot="Chưa có Agent đang sử dụng gói dịch vụ tại mốc chốt."
      headers={['Agent', 'Gói đang dùng', 'Ngày bắt đầu', 'Ngày hết hạn', 'Trạng thái tài khoản']}
      getRowKey={(agent) => agent.agentId}
      renderRow={(agent) => (
        <>
          <td><strong>{agent.name}</strong><small>{agent.email || 'Chưa có email'}</small></td>
          <td>{agent.planName}</td>
          <td>{dateTime(agent.startDate)}</td>
          <td>{dateTime(agent.endDate)}</td>
          <td>{accountStatus(agent.accountActive)}</td>
        </>
      )}
    />
  );
}

export function ActivePlusUsers(props) {
  return (
    <SubscribersPage
      key={props.snapshotAt}
      {...props}
      endpoint="/api/admin/analytics/subscriptions/plus-users"
      entityLabel="khách hàng Plus"
      entityCapitalized="khách hàng Plus"
      emptyAtSnapshot="Chưa có khách hàng đang sử dụng gói Plus tại mốc chốt."
      headers={['Khách hàng', 'Gói đang dùng', 'Nguồn kích hoạt', 'Ngày bắt đầu', 'Ngày hết hạn', 'Trạng thái tài khoản']}
      getRowKey={(user) => user.userId}
      renderRow={(user) => (
        <>
          <td><strong>{user.name}</strong><small>{user.email || 'Chưa có email'}</small></td>
          <td>
            {user.planName}
            {user.activePeriods > 1 && <small>{number(user.activePeriods)} kỳ cộng dồn</small>}
          </td>
          <td>
            <span className={`analytics-source-badge analytics-source-badge--${user.source === 'ADMIN' ? 'admin' : 'payos'}`}>
              {plusSourceLabel(user.source)}
            </span>
          </td>
          <td>{dateTime(user.startDate)}</td>
          <td>{dateTime(user.endDate)}</td>
          <td>{accountStatus(user.accountActive)}</td>
        </>
      )}
    />
  );
}
