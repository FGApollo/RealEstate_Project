import { useState } from 'react';
import { Activity, BarChart3, Check, CreditCard, Info, LogOut, Menu, X, ShieldCheck, TriangleAlert, UsersRound } from 'lucide-react';
import PlanDialog from '../agent/pricing/PlanDialog';
import { useMobileMenu } from '../../hooks/useMobileMenu';

const navigation = [
  { id: 'analytics', label: 'Thống kê & Báo cáo', icon: BarChart3 },
  { id: 'account-verification', label: 'Kiểm duyệt tài khoản', icon: UsersRound },
  { id: 'report-moderation', label: 'Kiểm duyệt báo cáo', icon: ShieldCheck },
  { id: 'review-moderation', label: 'Kiểm duyệt đánh giá', icon: Check },
  { id: 'appeal-moderation', label: 'Xử lý khiếu nại', icon: TriangleAlert },
  { id: 'service-plans', label: 'Gói dịch vụ & Giá bán', icon: CreditCard },
  { id: 'audit-logs', label: 'Nhật ký điểm uy tín', icon: Activity }
];

export default function AdminSidebar({ activeTab, onNavigate, onLogout }) {
  const [help, setHelp] = useState(false);
  const { open: menuOpen, setOpen: setMenuOpen, containerRef: menuRef, toggleRef: menuToggleRef, close: closeMenu } = useMobileMenu();
  const navigateTo = id => { closeMenu(); onNavigate(id); };
  return <aside ref={menuRef} className={`admin-sidebar${menuOpen ? ' mobile-nav-open' : ''}`}>
    <div className="admin-logo-wrapper"><button className="admin-logo" onClick={() => navigateTo('analytics')} aria-label="Swipe Nest — Tổng quan Admin">
      <svg className="admin-brand-symbol" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 2 29 11 16 20 3 11 16 2Z" fill="#2465F4" /><path d="m7 14 9 6 9-6v9l-9 7-9-7v-9Z" fill="#75A8FF" /><path d="m16 20 9-6v9l-9 7V20Z" fill="#377CF8" /><path d="M11 9h10v5H11z" fill="white" /></svg>
      <span>SWIPE NEST</span>
    </button><button ref={menuToggleRef} className="dashboard-mobile-menu-toggle" aria-label={menuOpen ? 'Đóng menu quản trị' : 'Mở menu quản trị'} aria-expanded={menuOpen} aria-controls="admin-dashboard-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}<span>Menu</span></button></div>
    <div id="admin-dashboard-navigation" className="dashboard-sidebar-navigation">
    <div className="admin-nav-label">Điều hướng Admin</div>
    <nav className="admin-nav-section" aria-label="Điều hướng quản trị">{navigation.map(({ id, label, icon: Icon }) =>
      <button key={id} className={`admin-nav-btn${activeTab === id ? ' active' : ''}`} aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigateTo(id)}>
        <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
      </button>)}</nav>
    <div className="admin-sidebar-bottom"><button className="admin-bottom-link" onClick={() => setHelp(true)}><Info size={17} strokeWidth={1.8} /><span>Help Center</span></button>
      <button className="admin-bottom-link admin-logout" onClick={onLogout}><LogOut size={17} strokeWidth={1.8} /><span>Đăng xuất</span></button></div>
    </div>
    {help && <PlanDialog title="Trợ giúp quản trị" onClose={() => setHelp(false)}><p>Chọn một mục ở thanh bên để mở công cụ quản trị tương ứng.</p><ul className="admin-help-list">
      <li><strong>Thống kê & Báo cáo:</strong> theo dõi người dùng, gói dịch vụ và giao dịch đã ghi nhận.</li>
      <li><strong>Kiểm duyệt:</strong> xem hồ sơ, báo cáo, đánh giá và xử lý khiếu nại.</li>
      <li><strong>Gói dịch vụ & Giá bán:</strong> cập nhật giá, lên lịch và xem lịch sử thay đổi. Đơn thanh toán đã tạo giữ nguyên mức giá đã chốt.</li>
      <li><strong>Nhật ký điểm uy tín:</strong> tra cứu thay đổi điểm và các điều chỉnh quản trị.</li>
    </ul></PlanDialog>}
  </aside>;
}
