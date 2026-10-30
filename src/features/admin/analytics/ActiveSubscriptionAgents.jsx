import { useEffect, useState } from 'react';
import { apiFetch } from '../../../auth/apiClient';
import { API_BASE_URL } from '../../../config';
import { number } from './analyticsFormat';

const dateTime = (value) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const accountStatus = (active) => active === true ? 'Hoạt động' : active === false ? 'Vô hiệu hóa' : 'Chưa rõ trạng thái';

function AgentsPage({ snapshotAt, expectedTotal, onRefresh }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const query = new URLSearchParams({ at: snapshotAt, page, limit: 10 }).toString();
  const key = `${query}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/admin/analytics/subscriptions/agents?${query}`, { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || !Array.isArray(data.items)) throw new Error(data?.error || 'Không thể tải danh sách Agent. Vui lòng thử lại.');
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (error) { if (!controller.signal.aborted) setResult({ key, error: error.message }); }
    })();
    return () => controller.abort();
  }, [query, key]);

  if (result?.key !== key) return <p role="status">Đang tải danh sách Agent…</p>;
  if (result.error) return <div className="analytics-agent-error" role="alert"><p>{result.error}</p><button type="button" onClick={() => setRetry(retry + 1)}>Thử lại danh sách</button></div>;
  const { data } = result;
  return <div className="analytics-agent-list">
    <p className="analytics-agent-summary">Tổng {number(data.total)} Agent · tại {dateTime(data.snapshotAt)} · mỗi Agent được tính một lần. Sắp xếp theo hạn dùng gần nhất.</p>
    {data.total !== expectedTotal && <div className="analytics-notice" role="status"><span>Dữ liệu vừa thay đổi. Cập nhật thống kê để đồng bộ số lượng và danh sách.</span><button type="button" onClick={onRefresh}>Cập nhật thống kê</button></div>}
    {!data.items.length ? <p>{data.total === 0 ? 'Chưa có Agent đang sử dụng gói dịch vụ tại mốc chốt.' : 'Trang này không có Agent. Chọn trang trước để xem danh sách.'}</p>
      : <div className="analytics-table-wrap"><table className="analytics-agents-table"><thead><tr><th>Agent</th><th>Gói đang dùng</th><th>Ngày bắt đầu</th><th>Ngày hết hạn</th><th>Trạng thái tài khoản</th></tr></thead>
        <tbody>{data.items.map((agent) => <tr key={agent.agentId}>
          <td><strong>{agent.name}</strong><small>{agent.email || 'Chưa có email'}</small></td><td>{agent.planName}</td>
          <td>{dateTime(agent.startDate)}</td><td>{dateTime(agent.endDate)}</td><td>{accountStatus(agent.accountActive)}</td>
        </tr>)}</tbody></table></div>}
    <div className="analytics-transaction-pagination" aria-label="Phân trang Agent">
      <button type="button" aria-label="Trang Agent trước" disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button>
      <span>Trang {page} / {Math.max(1, Math.ceil(data.total / 10))}</span>
      <button type="button" aria-label="Trang Agent tiếp" disabled={page * 10 >= data.total} onClick={() => setPage(page + 1)}>Sau</button>
    </div>
  </div>;
}

export default function ActiveSubscriptionAgents(props) {
  return <AgentsPage key={props.snapshotAt} {...props} />;
}
