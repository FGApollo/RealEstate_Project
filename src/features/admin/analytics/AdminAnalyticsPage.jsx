import { useState } from 'react';
import { Users, UserRound, BriefcaseBusiness, BadgeCheck, Wallet, RefreshCw, TrendingUp, BarChart3, Info, CalendarDays } from 'lucide-react';
import { useAnalytics } from './useAnalytics';
import { TrendChart, ComparisonChart, DistributionChart, Empty } from './AnalyticsCharts';
import { number, money, percent } from './analyticsFormat';
import './AdminAnalyticsPage.css';

const dateTime = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);

function Kpi({ icon: Icon, label, value, detail, growth, moneyValue = false }) {
  return <article className="analytics-kpi">
    <div className="analytics-kpi-label"><span>{label}</span><span className="analytics-kpi-icon"><Icon size={19} /></span></div>
    <strong className="analytics-kpi-value">{moneyValue ? money(value) : number(value)}</strong>
    {growth != null && <span className={`analytics-change ${growth < 0 ? 'negative' : ''}`}><TrendingUp size={14} /> {growth > 0 ? '+' : ''}{percent(growth)}</span>}
    <small>{detail}</small>
  </article>;
}

function Panel({ title, subtitle, children, wide = false, action }) {
  return <article className={`analytics-panel ${wide ? 'analytics-wide' : ''}`}>
    <div className="analytics-panel-heading"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
    {children}
  </article>;
}

function RevenueAnalytics({ revenue, packages }) {
  const [comparison, setComparison] = useState('package');
  return <section className="analytics-section" aria-labelledby="analytics-revenue-title">
    <h2 id="analytics-revenue-title"><Wallet size={20} /> Thống kê doanh thu</h2>
    {!revenue.available && <div className="analytics-notice"><Info size={20} /><div><strong>{revenue.reason}</strong><p>Hệ thống chưa có sổ giao dịch thanh toán và hoàn tiền được xác thực. Giá gói và trạng thái đăng ký không được dùng để tính doanh thu.</p></div></div>}
    <div className="analytics-kpis">
      <Kpi icon={Wallet} label="Tổng đã thanh toán" value={revenue.totalGross} moneyValue detail="Doanh thu gộp, toàn bộ lịch sử" />
      <Kpi icon={CalendarDays} label="Doanh thu tháng hiện tại" value={revenue.currentMonthGross} moneyValue detail="Theo ngày thanh toán, giờ Việt Nam" />
      <Kpi icon={TrendingUp} label="Doanh thu trong kỳ" value={revenue.periodGross} moneyValue detail="Doanh thu gộp của khoảng đã chọn" growth={revenue.growthPercent} />
      <Kpi icon={BadgeCheck} label="Giao dịch thành công" value={revenue.successfulTransactions} detail="Chỉ giao dịch đã xác thực thanh toán" />
      <Kpi icon={Wallet} label="Giá trị giao dịch trung bình" value={revenue.averageTransaction} moneyValue detail="Doanh thu gộp kỳ / giao dịch thành công kỳ" />
      <Kpi icon={RefreshCw} label="Số tiền hoàn trong kỳ" value={revenue.periodRefunds} moneyValue detail="Theo ngày hoàn tiền thực tế" />
      <Kpi icon={Wallet} label="Doanh thu sau hoàn tiền" value={revenue.periodNet} moneyValue detail="Doanh thu gộp kỳ − hoàn tiền trong kỳ" />
    </div>
    <div className="analytics-grid">
      <Panel title="Xu hướng doanh thu" subtitle="VND · theo ngày thanh toán · cùng khoảng thời gian đã chọn" wide>
        {revenue.available ? <TrendChart data={revenue.trend} series={[{ key: 'gross', name: 'Doanh thu gộp' }, { key: 'net', name: 'Sau hoàn tiền' }]} currency /> : <Empty>{revenue.reason}</Empty>}
      </Panel>
      <Panel title="So sánh doanh thu" subtitle={comparison === 'subscriptions' ? 'Số bản ghi đăng ký trong kỳ' : 'VND · doanh thu gộp trong kỳ'} action={<select aria-label="Loại so sánh" value={comparison} onChange={(e) => setComparison(e.target.value)}><option value="package">Theo gói dịch vụ</option><option value="month">Theo tháng</option><option value="subscriptions">Số lượt đăng ký theo gói</option></select>}>
        {comparison === 'subscriptions' ? <ComparisonChart data={packages} dataKey="newSubscriptions" label="Lượt đăng ký" /> : revenue.available ? <ComparisonChart data={comparison === 'month' ? revenue.monthly : revenue.byPackage} dataKey="gross" label="Doanh thu (VND)" currency /> : <Empty>{revenue.reason}</Empty>}
      </Panel>
      <Panel title="Tỷ trọng doanh thu" subtitle="Theo gói dịch vụ · doanh thu gộp trong kỳ">
        {revenue.available ? <DistributionChart data={revenue.byPackage} dataKey="gross" currency /> : <Empty>{revenue.reason}</Empty>}
      </Panel>
    </div>
  </section>;
}

function DashboardContent({ data }) {
  const { users, subscriptions, packages, revenue } = data;
  return <>
    <p className="analytics-scope">Mốc chốt: {dateTime(data.snapshotAt)}. Chỉ số “trong kỳ” dùng {data.filters.start} → {data.filters.end}. Múi giờ: Việt Nam (UTC+7). Tổng tài khoản và gói dựa trên bản ghi còn trong hệ thống, với role/trạng thái hiện tại.</p>
    <div className="analytics-kpis">
      <Kpi icon={Users} label="Tổng tài khoản" value={users.total} growth={users.totalGrowthPercent} detail="Gồm khách hàng, môi giới và Admin · so với đầu kỳ" />
      <Kpi icon={BriefcaseBusiness} label="Tổng môi giới" value={users.agents} growth={users.agentGrowthPercent} detail="So với đầu kỳ · gồm tài khoản vô hiệu hóa" />
      <Kpi icon={BadgeCheck} label="Agent có gói hiệu lực" value={subscriptions.activeAgents} detail="Agent duy nhất · ACTIVE và còn hạn" />
      <Kpi icon={Wallet} label="Tổng doanh thu đã thu" value={revenue.totalGross} moneyValue detail={revenue.available ? 'Doanh thu gộp từ giao dịch xác thực' : revenue.reason} />
    </div>

    <section className="analytics-section" aria-labelledby="analytics-users-title">
      <h2 id="analytics-users-title"><Users size={20} /> Người dùng hệ thống</h2>
      <div className="analytics-kpis">
        <Kpi icon={UserRound} label="Khách hàng" value={users.customers} growth={users.customerGrowthPercent} detail="Role USER · thay đổi so với đầu kỳ" />
        <Kpi icon={BriefcaseBusiness} label="Môi giới" value={users.agents} growth={users.agentGrowthPercent} detail="Role AGENT · thay đổi so với đầu kỳ" />
        <Kpi icon={Users} label="Tài khoản mới trong kỳ" value={users.newAccounts} growth={users.newGrowthPercent} detail={`Kỳ trước (${data.previousPeriod.start} → ${data.previousPeriod.end}): ${number(users.previousNewAccounts)}`} />
        <Kpi icon={BadgeCheck} label="Đang hoạt động / vô hiệu hóa" value={users.active} detail={`${number(users.inactive)} tài khoản vô hiệu hóa · ${number(users.unknownStatus)} chưa rõ trạng thái`} />
      </div>
      <div className="analytics-grid">
        <Panel title="Đăng ký tài khoản mới" subtitle="Số đăng ký trong từng kỳ; không phải tổng tài khoản lũy kế">
          <TrendChart data={data.userGrowth} series={[{ key: 'customers', name: 'Khách hàng mới' }, { key: 'agents', name: 'Môi giới mới' }, { key: 'total', name: 'Tất cả tài khoản mới' }]} />
        </Panel>
        <Panel title="Khách hàng / môi giới" subtitle={`Không gồm ${number(users.admins)} Admin và ${number(users.otherRoles)} role khác`}>
          <DistributionChart data={[{ name: 'Khách hàng', count: users.customers, sharePercent: users.customerShare }, { name: 'Môi giới', count: users.agents, sharePercent: users.agentShare }]} dataKey="count" />
        </Panel>
      </div>
    </section>

    <section className="analytics-section" aria-labelledby="analytics-subscriptions-title">
      <h2 id="analytics-subscriptions-title"><BriefcaseBusiness size={20} /> Gói dịch vụ môi giới</h2>
      <div className="analytics-kpis">
        <Kpi icon={Users} label="Đã từng đăng ký" value={subscriptions.everSubscribed} detail="Agent duy nhất, gồm cả gói đã hết hạn" />
        <Kpi icon={UserRound} label="Chưa từng có gói" value={subscriptions.neverSubscribed} detail={`${number(subscriptions.withoutActive)} Agent hiện không có gói hiệu lực`} />
        <Kpi icon={BadgeCheck} label="Đăng ký mới trong kỳ" value={subscriptions.newRecords} growth={subscriptions.newGrowthPercent} detail="Số bản ghi, có thể gồm nhiều lượt của một Agent" />
        <Kpi icon={CalendarDays} label="Hết hạn / hủy" value={subscriptions.expiredRecords} detail={`${number(subscriptions.cancelledRecords)} bản ghi đã hủy · ${number(subscriptions.endedInPeriod)} hết hạn trong kỳ`} />
      </div>
      <div className="analytics-grid">
        <Panel title="Tỷ trọng gói đang dùng" subtitle="Mỗi Agent một gói · tỷ lệ trên tổng Agent có gói hiệu lực">
          <DistributionChart data={packages} dataKey="activeAgents" />
        </Panel>
        <Panel title="Đăng ký theo gói" subtitle="Số bản ghi đăng ký mới trong khoảng đã chọn">
          <ComparisonChart data={packages} dataKey="newSubscriptions" label="Lượt đăng ký" />
        </Panel>
        <Panel title="Chi tiết từng gói" subtitle="Tên gói lấy từ bản ghi trong database · doanh thu trong kỳ" wide>
          {!packages.length ? <Empty /> : <div className="analytics-table-wrap"><table><thead><tr><th>Gói dịch vụ</th><th>Agent đang dùng</th><th>Tỷ trọng</th><th>Đăng ký mới</th><th>Doanh thu (VND)</th></tr></thead><tbody>{packages.map((plan) => <tr key={plan.name}><td><strong>{plan.name}</strong></td><td>{number(plan.activeAgents)}</td><td>{percent(plan.sharePercent)}</td><td>{number(plan.newSubscriptions)}</td><td>{money(plan.revenue)}</td></tr>)}</tbody></table></div>}
        </Panel>
      </div>
    </section>

    <RevenueAnalytics revenue={revenue} packages={packages} />
    <Panel title="Giao dịch gần đây" subtitle="Ngày · môi giới · gói · số tiền · trạng thái" wide><Empty>{revenue.reason}</Empty></Panel>
    <details className="analytics-definitions"><summary>Quy tắc tính và giới hạn dữ liệu</summary>
      <p>Tổng tài khoản gồm mọi role và cả tài khoản is_active=false. USER và AGENT là role hiện tại của tài khoản; tỷ lệ chỉ tính trên hai nhóm này. is_active=false là vô hiệu hóa, không suy ra nguyên nhân khóa. Tăng trưởng tổng tài khoản so với đầu kỳ; đăng ký mới so với kỳ liền trước có cùng số ngày. Kỳ trước bằng 0 hiển thị không có tỷ lệ.</p>
      <p>Gói hiệu lực phải có status=ACTIVE, ngày bắt đầu trước mốc chốt và ngày kết thúc sau mốc chốt. Mỗi Agent được chọn bản ghi hiệu lực có ngày bắt đầu mới nhất, sau đó ngày tạo và ID mới nhất. Bao gồm Agent bị vô hiệu hóa vì hiệu lực gói và quyền truy cập tài khoản là hai chỉ số riêng.</p>
      <p>Không có bảng danh mục gói nên chỉ thống kê các tên gói đã xuất hiện trong DB. Giá gói không phải chứng từ thanh toán. Chưa có sổ thanh toán/hoàn tiền, nguồn thu hoặc lịch sử đổi trạng thái; không thể tái dựng chính xác trạng thái tài khoản/gói trong quá khứ. Bộ lọc quá khứ dùng ngày tạo/hạn dùng và role/status hiện tại.</p>
      <p>Ngày kết thúc được tính trọn ngày Việt Nam, kỳ hiện tại chốt tại thời điểm cập nhật. Timestamp cũ được đọc là UTC. Bản ghi thiếu ngày vẫn có thể nằm trong tổng nhưng không nằm trong biểu đồ đăng ký; gói thiếu ngày bắt đầu/kết thúc không được tính hiệu lực. Thiếu ngày: {number(users.unknownDates)} tài khoản, {number(subscriptions.unknownDates)} đăng ký.</p>
      <p>Doanh thu tích hợp sau sẽ dùng ngày thanh toán xác thực và số tiền giao dịch gốc bằng VND; PENDING/FAILED/CANCELLED không tính. Hoàn tiền tính riêng theo ngày hoàn, doanh thu sau hoàn = gộp − hoàn trong cùng kỳ; callback phải được khử trùng trước khi ghi sổ.</p>
    </details>
  </>;
}

export default function AdminAnalyticsPage() {
  const [filters, setFilters] = useState({ preset: '30d', bucket: 'day' });
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(() => ({ start: new Date(Date.parse(`${today()}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10), end: today() }));
  const { data, error, loading } = useAnalytics(filters, revision);
  const rangeDays = filters.preset === 'custom' ? (Date.parse(filters.end) - Date.parse(filters.start)) / 86400000 + 1 : filters.preset === '12m' ? 366 : Number(filters.preset.slice(0, -1));
  const selectPreset = (preset) => {
    const days = (Date.parse(draft.end) - Date.parse(draft.start)) / 86400000 + 1;
    setFilters(preset === 'custom' ? { preset, ...draft, bucket: days > 366 ? 'month' : 'day' } : { preset, bucket: preset === '12m' ? 'month' : 'day' });
  };
  const applyDates = (event) => {
    event.preventDefault();
    const days = (Date.parse(draft.end) - Date.parse(draft.start)) / 86400000 + 1;
    setFilters({ preset: 'custom', ...draft, bucket: days > 366 && filters.bucket === 'day' ? 'month' : filters.bucket });
  };
  return <div className="admin-analytics">
    <header className="analytics-header"><div><span className="analytics-eyebrow"><BarChart3 size={15} /> THỐNG KÊ & BÁO CÁO</span><h1>Tổng quan hệ thống</h1><p>Theo dõi người dùng, gói dịch vụ và hiệu quả kinh doanh của Swipe Nest.</p></div>
      <div className="analytics-refresh"><button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'analytics-spin' : ''} /> Làm mới</button><small>{data ? `Cập nhật: ${dateTime(data.generatedAt)}` : loading ? 'Đang cập nhật…' : 'Chưa tải được dữ liệu'}</small></div>
    </header>
    <form className="analytics-filters" onSubmit={applyDates}>
      <label>Khoảng thời gian<select value={filters.preset} onChange={(e) => selectPreset(e.target.value)}><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="90d">90 ngày</option><option value="12m">12 tháng</option><option value="custom">Tùy chỉnh</option></select></label>
      {filters.preset === 'custom' && <><label>Từ ngày<input aria-label="Từ ngày" type="date" required min="2000-01-01" max={draft.end} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label><label>Đến ngày<input aria-label="Đến ngày" type="date" required min={draft.start} max={today()} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></label><button type="submit">Áp dụng</button></>}
      <label>Nhóm biểu đồ<select value={filters.bucket} onChange={(e) => setFilters({ ...filters, bucket: e.target.value })}><option value="day" disabled={rangeDays > 366}>Ngày</option><option value="week" disabled={rangeDays > 2793}>Tuần</option><option value="month">Tháng</option><option value="year">Năm</option></select></label>
      <span className="analytics-filter-note">Múi giờ Việt Nam · tối đa 10 năm</span>
    </form>
    <div aria-live="polite" aria-busy={loading}>
      {loading ? <div className="analytics-loading" role="status"><span className="analytics-sr-only">Đang tải dữ liệu thống kê</span><div className="analytics-kpis">{[0, 1, 2, 3].map((id) => <div className="analytics-skeleton analytics-skeleton-kpi" key={id} />)}</div><div className="analytics-grid"><div className="analytics-skeleton analytics-skeleton-chart" /><div className="analytics-skeleton analytics-skeleton-chart" /></div></div>
        : error ? <div className="analytics-error" role="alert"><Info size={24} /><h2>Không thể tải thống kê</h2><p>{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Thử lại</button></div>
          : <DashboardContent data={data} />}
    </div>
  </div>;
}
