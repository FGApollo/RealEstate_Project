import { CheckCircle2 } from 'lucide-react';
import { billingMoney, billingDay, lastPeriodEnd } from './billingApi';

// Nhãn nút theo loại giao dịch server tính sẵn (purchase_action): mua mới, gia hạn, nâng cấp, hạ cấp.
const actionLabel = (plan, subscription) => {
  switch (plan.purchase_action) {
    case 'UPGRADE': return 'Nâng cấp ngay';
    case 'DOWNGRADE': return `Hạ cấp từ ${billingDay(lastPeriodEnd(subscription))}`;
    case 'RENEW': return 'Gia hạn bằng payOS';
    default: return 'Thanh toán bằng payOS';
  }
};

export default function ServicePlanCards({ plans, subscription, checkoutAvailable = false, busy = false, onSubscribe, preview = false }) {
  return <div className="pricing-grid">{plans.map(plan => {
    const paid = plan.price_kind === 'FIXED';
    return <article className={`pricing-card${plan.code === 'PRO' ? ' popular-plan' : ''}`} key={plan.code} data-plan-code={plan.code}>
      {plan.code === 'PRO' && <div className="popular-badge">ƯU TIÊN HIỂN THỊ CAO NHẤT</div>}
      <div className="plan-header"><h3>{plan.name}</h3><div className="price-row">
        <span className={plan.price_kind === 'CONTACT' ? 'amount-contact' : 'amount'}>{plan.price_kind === 'CONTACT' ? 'Liên hệ' : billingMoney(plan.amount_vnd)}</span>
        {plan.duration_months && <span className="period">/ {plan.duration_months} tháng</span>}
      </div><p className="plan-desc">{plan.description}</p></div>
      <ul className="plan-features">{[
        `Tối đa ${plan.listing_limit} tin đang công khai`,
        `${plan.priority_points} điểm ưu tiên hiển thị`,
        `Support ${plan.support_tier === 'PRO' ? 'Pro' : plan.support_tier === 'PLUS' ? 'Plus' : 'Lite'}`,
        'Thanh toán xác thực qua payOS', 'Không tự động trừ tiền'
      ].map(feature => <li key={feature}><CheckCircle2 size={18} /><span>{feature}</span></li>)}</ul>
      <div className="plan-action">{paid ? <button className="btn-plan-action" disabled={preview || busy || !plan.active || !checkoutAvailable} onClick={() => onSubscribe?.(plan)}>
          {!plan.active ? 'Tạm ngừng đăng ký mới' : busy ? 'Đang xử lý…' : actionLabel(plan, subscription)}</button>
          : plan.contact_url && !preview ? <a className="btn-plan-contact" href={plan.contact_url}>Liên hệ tư vấn</a>
            : <p className="plan-desc">Kênh tư vấn đang được cập nhật.</p>}</div>
    </article>;
  })}</div>;
}
