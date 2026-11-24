import { useState } from 'react';
import {
  Users, UserRound, BriefcaseBusiness, BadgeCheck, CalendarDays, Crown, Info
} from 'lucide-react';
import { ComparisonChart, DistributionChart, Empty } from './LazyAnalyticsCharts';
import { number, money, percent } from './analyticsFormat';
import ActiveSubscriptionAgents, { ActivePlusUsers } from './ActiveSubscriptionAgents';

const PLUS_SOURCE_COLORS = { PAYOS: '#2563eb', ADMIN: '#8b5cf6' };

export default function SubscriptionAnalytics({
  subscriptions,
  packages,
  plusSubscriptions,
  snapshotAt,
  onRefresh,
  Kpi,
  Panel
}) {
  const [audience, setAudience] = useState('all');
  const plus = plusSubscriptions;
  const plusSources = (plus?.sources || []).map((item) => ({
    ...item,
    color: PLUS_SOURCE_COLORS[item.code] || '#2563eb'
  }));
  const showAgents = audience === 'all' || audience === 'agents';
  const showPlus = audience === 'all' || audience === 'plus';

  return (
    <div className="analytics-subscriptions-stack">
      <div className="analytics-subfilter" role="group" aria-label="Lọc theo đối tượng gói dịch vụ">
        <button type="button" aria-pressed={audience === 'all'} onClick={() => setAudience('all')}>
          Tất cả gói
        </button>
        <button type="button" aria-pressed={audience === 'agents'} onClick={() => setAudience('agents')}>
          <BriefcaseBusiness size={15} /> Gói môi giới ({number(subscriptions.activeAgents)})
        </button>
        <button type="button" aria-pressed={audience === 'plus'} onClick={() => setAudience('plus')}>
          <Crown size={15} /> Gói Plus khách hàng ({number(plus?.activeUsers || 0)})
        </button>
      </div>

      {showAgents && (
        <section className="analytics-section" aria-labelledby="analytics-subscriptions-title">
          <h2 id="analytics-subscriptions-title"><BriefcaseBusiness size={20} /> Gói dịch vụ môi giới</h2>
          <div className="analytics-kpis">
            <Kpi icon={Users} label="Đang sử dụng gói dịch vụ" value={subscriptions.activeAgents} detail="Gói đang hoạt động và còn hạn tại mốc chốt · mỗi môi giới được tính một lần" />
            <Kpi icon={UserRound} label="Chưa đăng ký gói dịch vụ" value={subscriptions.neverSubscribed} detail="Môi giới chưa từng đăng ký bất kỳ gói nào tính đến mốc chốt" />
            <Kpi icon={BadgeCheck} label="Đăng ký mới trong kỳ" value={subscriptions.newRecords} growth={subscriptions.newGrowthPercent} detail="Số lượt đăng ký, có thể gồm nhiều lượt của một môi giới" />
            <Kpi icon={CalendarDays} label="Hết hạn / hủy" value={subscriptions.expiredRecords + subscriptions.cancelledRecords} detail={`${number(subscriptions.expiredRecords)} lượt hết hạn · ${number(subscriptions.cancelledRecords)} lượt đã hủy tại mốc chốt · ${number(subscriptions.endedInPeriod)} lượt hết hạn trong kỳ`} />
          </div>
          <div className="analytics-status-strip">
            <span>Tổng môi giới <strong>{number(subscriptions.totalAgents)}</strong></span>
            <span><i /> Đang sử dụng gói dịch vụ <strong>{number(subscriptions.activeAgents)}</strong></span>
            <span>Hiện không sử dụng gói <strong>{number(subscriptions.withoutActive)}</strong></span>
          </div>
          <div className="analytics-grid">
            <Panel title="Agent đang sử dụng gói dịch vụ" subtitle="Agent có gói đang hoạt động, đã bắt đầu và còn hạn tại cùng mốc chốt với thống kê" wide>
              <ActiveSubscriptionAgents snapshotAt={snapshotAt} expectedTotal={subscriptions.activeAgents} onRefresh={onRefresh} />
            </Panel>
            <Panel title="Tỷ trọng gói đang dùng" subtitle="Mỗi môi giới một gói · tỷ lệ trên tổng môi giới đang sử dụng gói dịch vụ">
              <DistributionChart data={packages} dataKey="activeAgents" />
            </Panel>
            <Panel title="Đăng ký theo gói" subtitle="Số lượt đăng ký mới trong khoảng đã chọn">
              <ComparisonChart data={packages} dataKey="newSubscriptions" label="Lượt đăng ký" />
            </Panel>
            <Panel title="Chi tiết từng gói" subtitle="Tên gói lấy từ dữ liệu hệ thống · doanh thu trong kỳ" wide>
              {!packages.length ? <Empty /> : (
                <div className="analytics-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Gói dịch vụ</th><th>Agent đang dùng</th><th>Tỷ trọng</th><th>Đăng ký mới</th><th>Doanh thu (VND)</th></tr>
                    </thead>
                    <tbody>
                      {packages.map((plan) => (
                        <tr key={plan.name}>
                          <td><strong>{plan.name}</strong></td>
                          <td>{number(plan.activeAgents)}</td>
                          <td>{percent(plan.sharePercent)}</td>
                          <td>{number(plan.newSubscriptions)}</td>
                          <td>{money(plan.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </section>
      )}

      {showPlus && (
        <section className="analytics-section analytics-plus-section" aria-labelledby="analytics-plus-title">
          <h2 id="analytics-plus-title"><Crown size={20} className="analytics-plus-heading-icon" /> Gói Plus khách hàng</h2>
          {!plus?.available ? (
            <div className="analytics-notice">
              <Info size={20} />
              <div>
                <strong>Chưa có dữ liệu gói Swipe Nest Plus</strong>
                <p>{plus?.reason || 'Hệ thống chưa ghi nhận bảng dữ liệu gói Plus cho khách hàng.'}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="analytics-kpis">
                <Kpi icon={Crown} label="Đang sử dụng gói Plus" value={plus.activeUsers} detail="Khách hàng có gói Plus đang hoạt động và còn hạn tại mốc chốt · mỗi khách hàng tính một lần" />
                <Kpi icon={UserRound} label="Chưa đăng ký gói Plus" value={plus.neverSubscribed} detail="Khách hàng chưa từng có kỳ gói Plus nào tính đến mốc chốt" />
                <Kpi icon={BadgeCheck} label="Đăng ký Plus mới trong kỳ" value={plus.newRecords} growth={plus.newGrowthPercent} detail="Số kỳ Plus mới được kích hoạt qua payOS hoặc Admin cấp trong kỳ" />
                <Kpi icon={CalendarDays} label="Hết hạn / hủy" value={plus.expiredRecords + plus.cancelledRecords} detail={`${number(plus.expiredRecords)} lượt hết hạn · ${number(plus.cancelledRecords)} lượt đã hủy tại mốc chốt · ${number(plus.endedInPeriod)} lượt hết hạn trong kỳ`} />
              </div>
              <div className="analytics-status-strip analytics-status-strip--plus">
                <span>Tổng khách hàng <strong>{number(plus.totalCustomers)}</strong></span>
                <span><i /> Đang sử dụng gói Plus <strong>{number(plus.activeUsers)}</strong> ({percent(plus.adoptionRate)})</span>
                <span>Hiện không sử dụng Plus <strong>{number(plus.withoutActive)}</strong></span>
                {plus.periodRevenue != null && <span>Doanh thu Plus trong kỳ <strong>{money(plus.periodRevenue)}</strong></span>}
              </div>
              <div className="analytics-grid">
                <Panel title="Khách hàng đang sử dụng gói Plus" subtitle="Khách hàng có gói Plus đang hoạt động, đã bắt đầu và còn hạn tại cùng mốc chốt với thống kê" wide>
                  <ActivePlusUsers snapshotAt={snapshotAt} expectedTotal={plus.activeUsers} onRefresh={onRefresh} />
                </Panel>
                <Panel title="Nguồn kích hoạt gói Plus đang dùng" subtitle="Phân bổ khách hàng đang dùng Plus theo nguồn thanh toán payOS và Admin cấp">
                  <DistributionChart data={plusSources} dataKey="activeUsers" />
                </Panel>
                <Panel title="Đăng ký Plus mới theo nguồn" subtitle="Số kỳ Plus mới trong khoảng thời gian đã chọn">
                  <ComparisonChart data={plusSources} dataKey="newSubscriptions" label="Lượt đăng ký" />
                </Panel>
                <Panel title={`Chi tiết ${plus.planName}`} subtitle="Phân tích theo nguồn kích hoạt · doanh thu xác thực qua payOS trong kỳ" wide>
                  <div className="analytics-table-wrap">
                    <table>
                      <thead>
                        <tr><th>Nguồn kích hoạt</th><th>Khách hàng đang dùng</th><th>Tỷ trọng</th><th>Đăng ký mới</th><th>Doanh thu (VND)</th></tr>
                      </thead>
                      <tbody>
                        {plusSources.map((source) => (
                          <tr key={source.code}>
                            <td><strong>{source.name}</strong></td>
                            <td>{number(source.activeUsers)}</td>
                            <td>{percent(source.sharePercent)}</td>
                            <td>{number(source.newSubscriptions)}</td>
                            <td>{source.code === 'PAYOS' ? money(plus.periodRevenue) : '0 ₫ (miễn phí)'}</td>
                          </tr>
                        ))}
                        <tr className="analytics-summary-row">
                          <td><strong>Tổng {plus.planName}</strong></td>
                          <td><strong>{number(plus.activeUsers)}</strong></td>
                          <td><strong>{plus.activeUsers > 0 ? percent(100) : percent(0)}</strong></td>
                          <td><strong>{number(plus.newRecords)}</strong></td>
                          <td><strong>{money(plus.periodRevenue)}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
