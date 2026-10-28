import { CheckCircle2 } from 'lucide-react';
import { billingMoney } from './billingApi';

export default function ServicePlanCards({ plans, subscription, checkoutAvailable = false, busy = false, onTrial, onSubscribe, preview = false }) {
  return <div className="pricing-grid">{plans.map(plan => {
    const paid = plan.price_kind === 'FIXED';
    const trial = plan.price_kind === 'FREE';
    return <article className={`pricing-card${paid ? ' popular-plan' : ''}`} key={plan.code}>
      {paid && <div className="popular-badge">{plan.active ? 'THANH TOÁN QUA PAYOS' : 'TẠM NGỪNG ĐĂNG KÝ'}</div>}
      <div className="plan-header"><h3>{plan.name}</h3><div className="price-row">
        <span className={plan.price_kind === 'CONTACT' ? 'amount-contact' : 'amount'}>{plan.price_kind === 'CONTACT' ? 'Liên hệ' : billingMoney(plan.amount_vnd)}</span>
        {plan.duration_months && <span className="period">/ {plan.duration_months} tháng</span>}
      </div><p className="plan-desc">{plan.description}</p></div>
      {plan.price_kind !== 'CONTACT' && <ul className="plan-features">{(trial
        ? ['Trải nghiệm công cụ môi giới', 'Không cần thông tin thanh toán']
        : ['Kích hoạt khi thanh toán được xác minh', 'Không tự động trừ tiền', 'Gia hạn cộng vào thời hạn còn lại']).map(feature => <li key={feature}><CheckCircle2 size={18} /><span>{feature}</span></li>)}</ul>}
      <div className="plan-action">{trial ? <button className={subscription ? 'btn-plan-disabled' : 'btn-plan-action'} disabled={preview || busy || Boolean(subscription)} onClick={onTrial}>
        {subscription ? 'Tài khoản đã đăng ký gói' : 'Kích hoạt dùng thử'}</button>
        : paid ? <button className="btn-plan-action" disabled={preview || busy || !plan.active || !checkoutAvailable} onClick={onSubscribe}>
          {!plan.active ? 'Tạm ngừng đăng ký mới' : busy ? 'Đang xử lý…' : subscription?.effective_status === 'ACTIVE' && subscription.plan_name === plan.code ? 'Gia hạn bằng payOS' : 'Thanh toán bằng payOS'}</button>
          : plan.contact_url && !preview ? <a className="btn-plan-contact" href={plan.contact_url}>Liên hệ tư vấn</a>
            : <p className="plan-desc">Kênh tư vấn đang được cập nhật.</p>}</div>
    </article>;
  })}</div>;
}
