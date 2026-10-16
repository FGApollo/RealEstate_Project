import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { number, money, percent } from './analyticsFormat';

const COLORS = ['#2563eb', '#0891b2', '#6366f1', '#0d9488', '#b45309', '#be185d'];
const TREND_COLORS = ['#4f96ff', '#14b8a6', '#8b93e6'];
const compactMoney = (value) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value);
const trendDate = (value, bucket, multipleYears, full = false) => {
  const [year, month, day] = String(value).split('-').map(Number);
  if (bucket === 'year') return String(year);
  if (bucket === 'month') return full ? `Tháng ${month}/${year}` : `T${month}${multipleYears ? `/${year}` : ''}`;
  const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}${full || multipleYears ? `/${year}` : ''}`;
  return bucket === 'week' && full ? `Tuần từ ${date}` : date;
};
const trendMoney = (value) => {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e9) return `${number(value / 1e9)} tỷ đ`;
  if (magnitude >= 1e6) return `${number(value / 1e6)} tr đ`;
  if (magnitude >= 1e3) return `${number(value / 1e3)} nghìn đ`;
  return `${number(value)} đ`;
};

function TrendTooltip({ active, payload, label, bucket, multipleYears, currency }) {
  if (!active || !payload?.length) return null;
  return <div className="analytics-trend-tooltip">
    <strong>{trendDate(label, bucket, multipleYears, true)}</strong>
    {payload.map((item) => <div className="analytics-trend-tooltip-row" key={item.dataKey}>
      <i style={{ background: item.color }} /><span>{item.name}</span><b>{currency ? money(item.value) : number(item.value)}</b>
    </div>)}
  </div>;
}

export const Empty = ({ children = 'Chưa có dữ liệu trong khoảng thời gian này.' }) => <div className="analytics-empty">{children}</div>;

export function TrendChart({ data, series, currency = false, bucket = 'day' }) {
  if (!data?.length || !data.some((row) => series.some((item) => Number(row[item.key]) !== 0 && Number.isFinite(Number(row[item.key]))))) return <Empty />;
  const multipleYears = new Set(data.map((row) => row.date.slice(0, 4))).size > 1;
  return <div className="analytics-chart analytics-trend-chart" role="group" aria-label={series.map((item) => item.name).join(', ')}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={data} margin={{ top: 20, right: 24, left: 0, bottom: 12 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#e9edf3" />
        <XAxis dataKey="date" tickFormatter={(value) => trendDate(value, bucket, multipleYears)} axisLine={false} tickLine={false} tickMargin={14} minTickGap={34} padding={{ left: 10, right: 10 }} tick={{ fontSize: 12, fill: '#7b8190' }} />
        <YAxis allowDecimals={currency} tickFormatter={currency ? trendMoney : number} axisLine={false} tickLine={false} tickMargin={12} tickCount={5} width={currency ? 88 : 48} domain={currency ? ['auto', 'auto'] : [0, 'auto']} tick={{ fontSize: 12, fill: '#7b8190' }} />
        <Tooltip cursor={{ stroke: '#dfe3e9', strokeWidth: 1 }} content={<TrendTooltip bucket={bucket} multipleYears={multipleYears} currency={currency} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />}
        {series.map((item, i) => <Line key={item.key} type="linear" dataKey={item.key} name={item.name} stroke={TREND_COLORS[i % TREND_COLORS.length]} strokeWidth={2.4} dot={data.length <= 45 ? { r: 4.5, fill: TREND_COLORS[i % TREND_COLORS.length], stroke: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 6, fill: TREND_COLORS[i % TREND_COLORS.length], stroke: '#fff', strokeWidth: 3 }} isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

export function ComparisonChart({ data, dataKey, currency = false, label }) {
  if (!data?.length || !data.some((row) => Number(row[dataKey]) > 0)) return <Empty />;
  return <div className="analytics-chart" role="group" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} margin={{ top: 15, right: 15, left: 8, bottom: 12 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis allowDecimals={currency} tickFormatter={currency ? compactMoney : number} width={65} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => currency ? money(value) : number(value)} />
        <Bar dataKey={dataKey} name={label} fill={COLORS[0]} radius={[5, 5, 0, 0]} maxBarSize={60} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}

export function DistributionChart({ data, dataKey, currency = false }) {
  const visible = data?.filter((row) => Number(row[dataKey]) > 0) || [];
  if (!visible.length) return <Empty />;
  return <div className="analytics-distribution">
    <div className="analytics-donut" role="group" aria-label="Biểu đồ tỷ trọng">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart accessibilityLayer>
          <Pie data={visible} dataKey={dataKey} nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={2} isAnimationActive={false}>
            {visible.map((row, i) => <Cell key={row.name} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value, name, item) => [`${currency ? money(value) : number(value)} · ${percent(item.payload.sharePercent)}`, name]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
    <ul className="analytics-legend">{visible.map((row, i) => <li key={row.name}>
      <i style={{ background: COLORS[i % COLORS.length] }} /><span>{row.name}</span>
      <strong>{currency ? money(row[dataKey]) : number(row[dataKey])}</strong><small>{percent(row.sharePercent)}</small>
    </li>)}</ul>
  </div>;
}
