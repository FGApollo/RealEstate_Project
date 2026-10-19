import { useState } from 'react';
import {
  Users, UserRound, BriefcaseBusiness, BadgeCheck, Wallet, RefreshCw, TrendingUp,
  BarChart3, Info, CalendarDays, LayoutDashboard, ReceiptText, ArrowUpRight
} from 'lucide-react';
import { useAnalytics } from './useAnalytics';
import { TrendChart, ComparisonChart, DistributionChart, Empty } from './AnalyticsCharts';
import { number, money, percent } from './analyticsFormat';
import './AdminAnalyticsPage.css';
import PaymentTransactions from './PaymentTransactions';

const dateTime = (value) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const SECTIONS = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard, title: 'Tổng quan hệ thống', description: 'Theo dõi những chỉ số chính về hoạt động của Swipe Nest.' },
  { id: 'users', label: 'Người dùng', icon: Users, title: 'Thống kê người dùng', description: 'Theo dõi tài khoản, khách hàng, môi giới và số lượt đăng ký mới.' },
  { id: 'subscriptions', label: 'Gói dịch vụ', icon: BriefcaseBusiness, title: 'Gói dịch vụ môi giới', description: 'Theo dõi số môi giới sử dụng gói, đăng ký mới và hạn dùng.' },
  { id: 'revenue', label: 'Doanh thu', icon: Wallet, title: 'Thống kê doanh thu', description: 'Theo dõi doanh thu thực thu, tiền hoàn và hiệu quả của từng gói.' },
  { id: 'transactions', label: 'Giao dịch', icon: ReceiptText, title: 'Lịch sử giao dịch', description: 'Tra cứu các giao dịch thanh toán đã được ghi nhận trong hệ thống.' }
];
const USER_SERIES = {
  total: [{ key: 'total', name: 'Tất cả tài khoản mới' }],
  customers: [{ key: 'customers', name: 'Khách hàng mới' }],
  agents: [{ key: 'agents', name: 'Môi giới mới' }],
  comparison: [{ key: 'customers', name: 'Khách hàng mới' }, { key: 'agents', name: 'Môi giới mới' }]
};

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

function OverviewAnalytics({ data, onNavigate }) {
  const { users, subscriptions, packages, revenue } = data;
  const detailLink = (section) => <button type="button" className="analytics-panel-link" onClick={() => onNavigate(section)}>Xem chi tiết <ArrowUpRight size={15} /></button>;
  return <>
    <div className="analytics-kpis">
      <Kpi icon={Users} label="Tổng tài khoản" value={users.total} growth={users.totalGrowthPercent} detail="Gồm khách hàng, môi giới và Admin · so với đầu kỳ" />
      <Kpi icon={BriefcaseBusiness} label="Tổng môi giới" value={users.agents} growth={users.agentGrowthPercent} detail="So với đầu kỳ · gồm tài khoản vô hiệu hóa" />
      <Kpi icon={BadgeCheck} label="Agent sử dụng gói dịch vụ" value={subscriptions.activeAgents} detail="Gói đang hoạt động và còn hạn tại mốc chốt · mỗi môi giới được tính một lần" />
      <Kpi icon={Wallet} label="Tổng doanh thu đã thu" value={revenue.totalGross} moneyValue detail={revenue.available ? 'Doanh thu gộp từ giao dịch xác thực' : revenue.reason} />
    </div>
    <div className="analytics-grid">
      <Panel title="Đăng ký tài khoản mới" subtitle="Số đăng ký mới trong từng kỳ" action={detailLink('users')}>
        <TrendChart data={data.userGrowth} series={USER_SERIES.total} bucket={data.filters.bucket} />
      </Panel>
      <Panel title="Gói dịch vụ đang dùng" subtitle="Tỷ trọng môi giới đang sử dụng gói dịch vụ tại mốc chốt" action={detailLink('subscriptions')}>
        <DistributionChart data={packages} dataKey="activeAgents" />
      </Panel>
    </div>
  </>;
}

function UserAnalytics({ data, metric, onMetricChange }) {
  const { users } = data;
  return <section className="analytics-section" aria-labelledby="analytics-users-title">
    <h2 id="analytics-users-title"><Users size={20} /> Người dùng hệ thống</h2>
    <div className="analytics-kpis">
      <Kpi icon={Users} label="Tổng tài khoản" value={users.total} growth={users.totalGrowthPercent} detail="Tất cả tài khoản · thay đổi so với đầu kỳ" />
      <Kpi icon={UserRound} label="Khách hàng" value={users.customers} growth={users.customerGrowthPercent} detail="Tài khoản khách hàng · thay đổi so với đầu kỳ" />
      <Kpi icon={BriefcaseBusiness} label="Môi giới" value={users.agents} growth={users.agentGrowthPercent} detail="Tài khoản môi giới · thay đổi so với đầu kỳ" />
      <Kpi icon={Users} label="Tài khoản mới trong kỳ" value={users.newAccounts} growth={users.newGrowthPercent} detail={`Kỳ trước (${data.previousPeriod.start} → ${data.previousPeriod.end}): ${number(users.previousNewAccounts)}`} />
    </div>
    <div className="analytics-status-strip"><span><i /> Đang hoạt động <strong>{number(users.active)}</strong></span><span>Vô hiệu hóa <strong>{number(users.inactive)}</strong></span><span>Chưa rõ trạng thái <strong>{number(users.unknownStatus)}</strong></span></div>
    <div className="analytics-grid">
      <Panel title="Đăng ký tài khoản mới" subtitle="Số đăng ký trong từng kỳ; không phải tổng tài khoản lũy kế" wide action={<select aria-label="Nhóm người dùng trên biểu đồ" value={metric} onChange={(event) => onMetricChange(event.target.value)}><option value="total">Tất cả tài khoản</option><option value="customers">Khách hàng</option><option value="agents">Môi giới</option><option value="comparison">So sánh khách hàng / môi giới</option></select>}>
        <TrendChart data={data.userGrowth} series={USER_SERIES[metric]} bucket={data.filters.bucket} />
      </Panel>
      <Panel title="Khách hàng / môi giới" subtitle={`Không gồm ${number(users.admins)} Admin và ${number(users.otherRoles)} tài khoản nhóm khác`}>
        <DistributionChart data={[{ name: 'Khách hàng', count: users.customers, sharePercent: users.customerShare }, { name: 'Môi giới', count: users.agents, sharePercent: users.agentShare }]} dataKey="count" />
      </Panel>
    </div>
  </section>;
}

function SubscriptionAnalytics({ subscriptions, packages }) {
  return <section className="analytics-section" aria-labelledby="analytics-subscriptions-title">
    <h2 id="analytics-subscriptions-title"><BriefcaseBusiness size={20} /> Gói dịch vụ môi giới</h2>
    <div className="analytics-kpis">
      <Kpi icon={Users} label="Đang sử dụng gói dịch vụ" value={subscriptions.activeAgents} detail="Gói đang hoạt động và còn hạn tại mốc chốt · mỗi môi giới được tính một lần" />
      <Kpi icon={UserRound} label="Chưa đăng ký gói dịch vụ" value={subscriptions.neverSubscribed} detail="Môi giới chưa từng đăng ký bất kỳ gói nào tính đến mốc chốt" />
      <Kpi icon={BadgeCheck} label="Đăng ký mới trong kỳ" value={subscriptions.newRecords} growth={subscriptions.newGrowthPercent} detail="Số lượt đăng ký, có thể gồm nhiều lượt của một môi giới" />
      <Kpi icon={CalendarDays} label="Hết hạn / hủy" value={subscriptions.expiredRecords + subscriptions.cancelledRecords} detail={`${number(subscriptions.expiredRecords)} lượt hết hạn · ${number(subscriptions.cancelledRecords)} lượt đã hủy tại mốc chốt · ${number(subscriptions.endedInPeriod)} lượt hết hạn trong kỳ`} />
    </div>
    <div className="analytics-status-strip"><span>Tổng môi giới <strong>{number(subscriptions.totalAgents)}</strong></span><span><i /> Đang sử dụng gói dịch vụ <strong>{number(subscriptions.activeAgents)}</strong></span><span>Hiện không sử dụng gói <strong>{number(subscriptions.withoutActive)}</strong></span></div>
    <div className="analytics-grid">
      <Panel title="Tỷ trọng gói đang dùng" subtitle="Mỗi môi giới một gói · tỷ lệ trên tổng môi giới đang sử dụng gói dịch vụ">
        <DistributionChart data={packages} dataKey="activeAgents" />
      </Panel>
      <Panel title="Đăng ký theo gói" subtitle="Số lượt đăng ký mới trong khoảng đã chọn">
        <ComparisonChart data={packages} dataKey="newSubscriptions" label="Lượt đăng ký" />
      </Panel>
      <Panel title="Chi tiết từng gói" subtitle="Tên gói lấy từ dữ liệu hệ thống · doanh thu trong kỳ" wide>
        {!packages.length ? <Empty /> : <div className="analytics-table-wrap"><table><thead><tr><th>Gói dịch vụ</th><th>Agent đang dùng</th><th>Tỷ trọng</th><th>Đăng ký mới</th><th>Doanh thu (VND)</th></tr></thead><tbody>{packages.map((plan) => <tr key={plan.name}><td><strong>{plan.name}</strong></td><td>{number(plan.activeAgents)}</td><td>{percent(plan.sharePercent)}</td><td>{number(plan.newSubscriptions)}</td><td>{money(plan.revenue)}</td></tr>)}</tbody></table></div>}
      </Panel>
    </div>
  </section>;
}

function RevenueAnalytics({ revenue, packages, bucket, comparison, onComparisonChange }) {
  return <section className="analytics-section" aria-labelledby="analytics-revenue-title">
    <h2 id="analytics-revenue-title"><Wallet size={20} /> Thống kê doanh thu</h2>
    <div className="analytics-notice"><Info size={20} /><div><strong>{revenue.available ? 'Doanh thu đã xác minh qua payOS' : revenue.reason}</strong><p>{revenue.available ? `${revenue.coverage} Chưa tích hợp đối soát hoàn tiền; số tiền hoàn và doanh thu sau hoàn được để trống.` : 'Hệ thống chưa có sổ giao dịch thanh toán và hoàn tiền được xác thực. Giá gói và trạng thái đăng ký không được dùng để tính doanh thu.'}</p></div></div>
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
        {revenue.available ? <TrendChart data={revenue.trend} series={revenue.refundsAvailable ? [{ key: 'gross', name: 'Doanh thu gộp' }, { key: 'net', name: 'Sau hoàn tiền' }] : [{ key: 'gross', name: 'Doanh thu gộp' }]} bucket={bucket} currency /> : <Empty>{revenue.reason}</Empty>}
      </Panel>
      <Panel title="So sánh doanh thu" subtitle={comparison === 'subscriptions' ? 'Số lượt đăng ký trong kỳ' : 'VND · doanh thu gộp trong kỳ'} action={<select aria-label="Loại so sánh" value={comparison} onChange={(event) => onComparisonChange(event.target.value)}><option value="package">Theo gói dịch vụ</option><option value="month">Theo tháng</option><option value="subscriptions">Số lượt đăng ký theo gói</option></select>}>
        {comparison === 'subscriptions' ? <ComparisonChart data={packages} dataKey="newSubscriptions" label="Lượt đăng ký" /> : revenue.available ? <ComparisonChart data={comparison === 'month' ? revenue.monthly : revenue.byPackage} dataKey="gross" label="Doanh thu (VND)" currency /> : <Empty>{revenue.reason}</Empty>}
      </Panel>
      <Panel title="Tỷ trọng doanh thu" subtitle="Theo gói dịch vụ · doanh thu gộp trong kỳ">
        {revenue.available ? <DistributionChart data={revenue.byPackage} dataKey="gross" currency /> : <Empty>{revenue.reason}</Empty>}
      </Panel>
    </div>
  </section>;
}

function AnalyticsDefinitions({ users, subscriptions }) {
  return <details className="analytics-definitions"><summary>Quy tắc tính và giới hạn dữ liệu</summary>
    <p>Tổng tài khoản gồm mọi role và cả tài khoản is_active=false. USER và AGENT là role hiện tại của tài khoản; tỷ lệ chỉ tính trên hai nhóm này. is_active=false là vô hiệu hóa, không suy ra nguyên nhân khóa. Tăng trưởng tổng tài khoản so với đầu kỳ; đăng ký mới so với kỳ liền trước có cùng số ngày. Kỳ trước bằng 0 hiển thị không có tỷ lệ.</p>
    <p>“Đang sử dụng gói dịch vụ” đếm Agent có gói đang hoạt động, đã bắt đầu và còn hạn tại mốc chốt; bao gồm gói dùng thử và gói trả phí. Mỗi Agent được tính một lần, chọn gói có ngày bắt đầu mới nhất, sau đó ngày tạo và ID mới nhất. Bao gồm Agent bị vô hiệu hóa vì hiệu lực gói và quyền truy cập tài khoản là hai chỉ số riêng.</p>
    <p>“Chưa đăng ký gói dịch vụ” đếm Agent chưa từng có bản ghi đăng ký tính đến mốc chốt. “Hiện không sử dụng gói” gồm cả nhóm này và Agent đã đăng ký nhưng hiện chưa có gói đang hoạt động, đã bắt đầu và còn hạn. “Hết hạn / hủy” là tổng số lượt đăng ký đã hết hạn hoặc đã hủy tại mốc chốt; một Agent có thể có nhiều lượt.</p>
    <p>Thống kê gói dựa trên bản ghi đăng ký đã xuất hiện trong DB. Gia hạn cập nhật hạn dùng của gói hiện tại; các lần thanh toán được lưu riêng trong sổ payOS. Giá gói không phải chứng từ thanh toán. Bộ lọc quá khứ dùng ngày tạo/hạn dùng và role/status hiện tại, không tái dựng toàn bộ lịch sử đổi trạng thái.</p>
    <p>Ngày kết thúc được tính trọn ngày Việt Nam, kỳ hiện tại chốt tại thời điểm cập nhật. Timestamp cũ được đọc là UTC. Bản ghi thiếu ngày vẫn có thể nằm trong tổng nhưng không nằm trong biểu đồ đăng ký; gói thiếu ngày bắt đầu/kết thúc không được tính hiệu lực. Thiếu ngày: {number(users.unknownDates)} tài khoản, {number(subscriptions.unknownDates)} đăng ký.</p>
    <p>Doanh thu dùng ngày thanh toán xác thực và số tiền gốc bằng VND trong sổ payOS; PENDING/FAILED/CANCELLED không tính. Webhook lặp không ghi nhận trùng. Không suy ra thanh toán từ gói cũ. Chưa đối soát hoàn tiền nên chỉ công bố doanh thu gộp; tiền hoàn và doanh thu sau hoàn chưa có dữ liệu.</p>
  </details>;
}

function DashboardContent({ data, section, onNavigate, userMetric, onUserMetricChange, comparison, onComparisonChange, revision }) {
  return <>
    <p className="analytics-scope">Mốc chốt: {dateTime(data.snapshotAt)} · Trong kỳ: {data.filters.start} → {data.filters.end} · Giờ Việt Nam (UTC+7). Tài khoản và gói được phân loại theo vai trò, trạng thái hiện tại.</p>
    {section === 'overview' && <OverviewAnalytics data={data} onNavigate={onNavigate} />}
    {section === 'users' && <UserAnalytics data={data} metric={userMetric} onMetricChange={onUserMetricChange} />}
    {section === 'subscriptions' && <SubscriptionAnalytics subscriptions={data.subscriptions} packages={data.packages} />}
    {section === 'revenue' && <RevenueAnalytics revenue={data.revenue} packages={data.packages} bucket={data.filters.bucket} comparison={comparison} onComparisonChange={onComparisonChange} />}
    {section === 'transactions' && <Panel title="Giao dịch gần đây" subtitle="Ngày · môi giới · gói · số tiền · trạng thái" wide><PaymentTransactions filters={data.filters.preset === 'custom' ? { preset: 'custom', start: data.filters.start, end: data.filters.end, bucket: data.filters.bucket } : { preset: data.filters.preset, bucket: data.filters.bucket }} revision={revision} /></Panel>}
    <AnalyticsDefinitions users={data.users} subscriptions={data.subscriptions} />
  </>;
}

export default function AdminAnalyticsPage() {
  const [activeSection, setActiveSection] = useState('overview');
  const [userMetric, setUserMetric] = useState('total');
  const [comparison, setComparison] = useState('package');
  const [filters, setFilters] = useState({ preset: '30d', bucket: 'day' });
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(() => ({ start: new Date(Date.parse(`${today()}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10), end: today() }));
  const { data, error, loading } = useAnalytics(filters, revision);
  const section = SECTIONS.find((item) => item.id === activeSection);
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
  const navigateTabs = (event) => {
    const index = SECTIONS.findIndex((item) => item.id === activeSection);
    const nextIndex = { ArrowRight: (index + 1) % SECTIONS.length, ArrowLeft: (index + SECTIONS.length - 1) % SECTIONS.length, Home: 0, End: SECTIONS.length - 1 }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    const id = SECTIONS[nextIndex].id;
    setActiveSection(id);
    event.currentTarget.querySelector(`#analytics-tab-${id}`).focus();
  };
  return <div className="admin-analytics">
    <header className="analytics-header"><div><span className="analytics-eyebrow"><BarChart3 size={15} /> THỐNG KÊ & BÁO CÁO</span><h1>{section.title}</h1><p>{section.description}</p></div>
      <div className="analytics-refresh"><button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'analytics-spin' : ''} /> Làm mới</button><small>{data ? `Cập nhật: ${dateTime(data.generatedAt)}` : loading ? 'Đang cập nhật…' : 'Chưa tải được dữ liệu'}</small></div>
    </header>
    <div className="analytics-tabs" role="tablist" aria-label="Các mục thống kê" onKeyDown={navigateTabs}>
      {SECTIONS.map(({ id, label, icon: Icon }) => <button type="button" role="tab" id={`analytics-tab-${id}`} aria-controls={`analytics-panel-${id}`} aria-selected={activeSection === id} tabIndex={activeSection === id ? 0 : -1} key={id} onClick={() => setActiveSection(id)}><Icon size={17} />{label}</button>)}
    </div>
    <form className="analytics-filters" onSubmit={applyDates}>
      <label>Khoảng thời gian<select value={filters.preset} onChange={(event) => selectPreset(event.target.value)}><option value="7d">7 ngày</option><option value="30d">30 ngày</option><option value="90d">90 ngày</option><option value="12m">12 tháng</option><option value="custom">Tùy chỉnh</option></select></label>
      {filters.preset === 'custom' && <><label>Từ ngày<input aria-label="Từ ngày" type="date" required min="2000-01-01" max={draft.end} value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label><label>Đến ngày<input aria-label="Đến ngày" type="date" required min={draft.start} max={today()} value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label><button type="submit">Áp dụng</button></>}
      <label>Nhóm biểu đồ<select value={filters.bucket} onChange={(event) => setFilters({ ...filters, bucket: event.target.value })}><option value="day" disabled={rangeDays > 366}>Ngày</option><option value="week" disabled={rangeDays > 2793}>Tuần</option><option value="month">Tháng</option><option value="year">Năm</option></select></label>
      <span className="analytics-filter-note">Múi giờ Việt Nam · tối đa 10 năm</span>
    </form>
    <div role="tabpanel" id={`analytics-panel-${activeSection}`} aria-labelledby={`analytics-tab-${activeSection}`} tabIndex={0} aria-live="polite" aria-busy={loading}>
      {loading ? <div className="analytics-loading" role="status"><span className="analytics-sr-only">Đang tải dữ liệu thống kê</span><div className="analytics-kpis">{[0, 1, 2, 3].map((id) => <div className="analytics-skeleton analytics-skeleton-kpi" key={id} />)}</div><div className="analytics-grid"><div className="analytics-skeleton analytics-skeleton-chart" /><div className="analytics-skeleton analytics-skeleton-chart" /></div></div>
        : error ? <div className="analytics-error" role="alert"><Info size={24} /><h2>Không thể tải thống kê</h2><p>{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Thử lại</button></div>
          : <DashboardContent data={data} section={activeSection} onNavigate={setActiveSection} userMetric={userMetric} onUserMetricChange={setUserMetric} comparison={comparison} onComparisonChange={setComparison} revision={revision} />}
    </div>
  </div>;
}
