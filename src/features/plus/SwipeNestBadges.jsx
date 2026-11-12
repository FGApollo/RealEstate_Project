import { Link } from 'react-router-dom';
import { Crown, ShieldCheck } from 'lucide-react';
import './SwipeNestBadges.css';

// Nhãn "Swipe Nest": tin do tài khoản chính thức của đội Swipe Nest đăng (nguồn hàng Swipe Nest).
export const SwipeNestBadges = ({ property, className = '' }) => {
  const official = property?.owner?.is_official === true;
  if (!official) return null;
  return (
    <span className={`sn-badges ${className}`.trim()}>
      {official && <span className="sn-badge sn-badge-official" title="Tin do đội Swipe Nest đăng"><ShieldCheck size={12} /> Swipe Nest</span>}
    </span>
  );
};

// Hiện khi người dùng chưa có Plus bấm liên hệ tin của tài khoản chính thức.
export const PlusUpsell = ({ message }) => (
  <div className="plus-upsell" role="status">
    <span>{message || 'Tin này do đội Swipe Nest đăng. Nâng cấp Swipe Nest Plus (20.000đ/tháng) để nhắn tin và xem liên hệ.'}</span>
    <Link to="/plus"><Crown size={15} /> Xem gói Plus</Link>
  </div>
);
