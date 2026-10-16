import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { number, money, percent } from './analyticsFormat';

const COLORS = ['#2563eb', '#0891b2', '#6366f1', '#0d9488', '#b45309', '#be185d'];
const axisDate = (value) => new Date(`${value}T00:00:00+07:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
const compactMoney = (value) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(value);
export const Empty = ({ children = 'Chưa có dữ liệu trong khoảng thời gian này.' }) => <div className="analytics-empty">{children}</div>;

export function TrendChart({ data, series, currency = false }) {
  if (!data?.length || !data.some((row) => series.some((item) => Number(row[item.key]) > 0))) return <Empty />;
  return <div className="analytics-chart" role="group" aria-label={series.map((item) => item.name).join(', ')}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={data} margin={{ top: 15, right: 15, left: 8, bottom: 6 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="date" tickFormatter={axisDate} minTickGap={34} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={currency} tickFormatter={currency ? compactMoney : number} width={65} tick={{ fontSize: 11 }} />
        <Tooltip labelFormatter={axisDate} formatter={(value) => currency ? money(value) : number(value)} />
        <Legend />
        {series.map((item, i) => <Line key={item.key} dataKey={item.key} name={item.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={data.length < 16} isAnimationActive={false} />)}
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
