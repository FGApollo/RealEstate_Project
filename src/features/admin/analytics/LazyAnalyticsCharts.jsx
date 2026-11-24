import { lazy, Suspense } from 'react';

const LazyTrendChart = lazy(() => import('./AnalyticsCharts').then((mod) => ({ default: mod.TrendChart })));
const LazyComparisonChart = lazy(() => import('./AnalyticsCharts').then((mod) => ({ default: mod.ComparisonChart })));
const LazyDistributionChart = lazy(() => import('./AnalyticsCharts').then((mod) => ({ default: mod.DistributionChart })));

const ChartFallback = () => <div className="analytics-skeleton analytics-skeleton-chart" aria-hidden="true" />;

export const Empty = ({ children = 'Chưa có dữ liệu trong khoảng thời gian này.' }) => (
  <div className="analytics-empty">{children}</div>
);

export function TrendChart(props) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <LazyTrendChart {...props} />
    </Suspense>
  );
}

export function ComparisonChart(props) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <LazyComparisonChart {...props} />
    </Suspense>
  );
}

export function DistributionChart(props) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <LazyDistributionChart {...props} />
    </Suspense>
  );
}
