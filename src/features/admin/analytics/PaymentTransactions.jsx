import { useEffect, useState } from 'react';
import { apiFetch } from '../../../auth/apiClient';
import { API_BASE_URL } from '../../../config';
import { money, number } from './analyticsFormat';

const dateTime = (value) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const status = { CREATING: 'Đang tạo', PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', FAILED: 'Không thành công' };

function TransactionsPage({ filters, revision }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const query = new URLSearchParams({ ...filters, page, limit: 10 }).toString();
  const key = `${query}:${revision}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/admin/analytics/transactions?${query}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không thể tải giao dịch.');
        if (!controller.signal.aborted) setResult({ key, data });
      } catch (err) { if (!controller.signal.aborted) setResult({ key, error: err.message }); }
    })();
    return () => controller.abort();
  }, [query, key]);
  if (result?.key !== key) return <p role="status">Đang tải giao dịch…</p>;
  if (result.error) return <div role="alert"><p>{result.error}</p><button onClick={() => setRetry(retry + 1)}>Thử lại</button></div>;
  const { data } = result;
  if (!data.available) return <p>{data.reason}</p>;
  return <><p>Đơn tạo trong khoảng đã chọn · {number(data.total)} đơn. Ngày thanh toán được hiển thị riêng để đối soát doanh thu.</p>
    {!data.items.length ? <p>Chưa có dữ liệu trong khoảng thời gian này.</p> : <div className="analytics-table-wrap"><table><thead><tr><th>Mã đơn / ngày tạo</th><th>Môi giới</th><th>Gói</th><th>Số tiền</th><th>Trạng thái</th><th>Ngày thanh toán</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td>#{item.orderCode}<br />{dateTime(item.createdAt)}</td><td>{item.agent}</td><td>{item.planName}</td><td>{money(item.amount)}</td><td>{status[item.status] || item.status}</td><td>{dateTime(item.paidAt)}</td></tr>)}</tbody></table></div>}
    <div className="analytics-transaction-pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Trước</button><span>Trang {page}</span><button disabled={page * 10 >= data.total} onClick={() => setPage(page + 1)}>Sau</button></div>
  </>;
}
export default function PaymentTransactions(props) {
  return <TransactionsPage key={new URLSearchParams(props.filters).toString()} {...props} />;
}
