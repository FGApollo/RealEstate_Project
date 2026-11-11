import { Gift } from 'lucide-react';
import AgentPlanManager from '../service-plans/AgentPlanManager';
import { UserPlusPanel } from '../plus/PlusAdminPage';
import '../service-plans/ServicePlansPage.css';
import '../plus/PlusAdminPage.css';
import './PlanGrantsPage.css';

// Admin cấp / đổi / gỡ gói thủ công ở một chỗ: gói môi giới (Lite / Plus / Pro) và gói Plus của người dùng.
// Bảng giá vẫn ở "Gói dịch vụ & Giá bán"; tài khoản chính thức ở "Nguồn hàng Swipe Nest".
export default function PlanGrantsPage() {
  return (
    <div className="plan-grants-page">
      <header className="plan-grants-heading">
        <span className="service-eyebrow"><Gift size={14} />CẤP / HỦY GÓI</span>
        <h1>Cấp và hủy gói thủ công</h1>
        <p>Tra cứu tài khoản theo email để cấp tặng, đổi hạng hoặc gỡ gói. Mọi thao tác cần lý do và được ghi nhật ký.</p>
      </header>
      <div className="plan-grants-grid">
        <div className="plan-grants-column">
          <h2 className="plan-grants-audience">Môi giới <small>Gói Lite / Plus / Pro</small></h2>
          <AgentPlanManager />
        </div>
        <div className="plan-grants-column">
          <h2 className="plan-grants-audience">Người dùng <small>Swipe Nest Plus</small></h2>
          <UserPlusPanel />
        </div>
      </div>
    </div>
  );
}
