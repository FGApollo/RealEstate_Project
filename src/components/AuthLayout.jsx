import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart, House, ShieldCheck } from 'lucide-react';
import SwipeNestMark from './SwipeNestMark';
import './AuthLayout.css';

const AuthBrand = () => (
  <Link to="/" className="auth-brand" aria-label="Swipe Nest — Trang chủ">
    <span className="auth-brand-mark"><SwipeNestMark /></span>
    <span>Swipe Nest</span>
  </Link>
);

const AuthLayout = ({ children, title, subtitle, theme = 'user', variant = 'default' }) => {
  const isWelcomeLayout = variant === 'login' || variant === 'register';
  const isRegister = variant === 'register';

  return (
    <div className={`auth-container ${theme === 'agent' ? 'agent-theme' : ''} ${isWelcomeLayout ? `auth-welcome auth-welcome--${variant}` : ''}`}>
      <div className="auth-background" aria-hidden="true">
        {/* Abstract shapes or image could go here for larger screens */}
        <div className="auth-shape shape-1"></div>
        <div className="auth-shape shape-2"></div>
      </div>

      {isWelcomeLayout && (
        <aside className="auth-story" aria-label="Chào mừng đến với Swipe Nest">
          <AuthBrand />
          <h1 className="auth-story-title">
            {isRegister ? 'Bắt đầu hành trình' : 'Chào mừng bạn'}
            <span>{isRegister ? 'tìm tổ ấm mới!' : 'quay trở lại!'}</span>
          </h1>
          <p className="auth-story-description">
            {isRegister
              ? 'Tạo tài khoản để tìm nơi thuê lý tưởng, lưu những tin bạn yêu thích và khám phá không gian phù hợp với mình.'
              : 'Tiếp tục hành trình tìm nơi thuê lý tưởng với những tin đăng phù hợp với nhu cầu và phong cách sống của bạn.'}
          </p>

          <ul className="auth-benefits">
            <li>
              <span className="auth-benefit-icon"><House size={25} strokeWidth={2} /></span>
              <div><h2>Tìm nhà nhanh</h2><p>Bộ lọc thông minh, dễ tìm nơi phù hợp</p></div>
            </li>
            <li>
              <span className="auth-benefit-icon"><ShieldCheck size={26} fill="currentColor" stroke="white" /></span>
              <div><h2>Tin đăng minh bạch</h2><p>Thông tin rõ ràng, thuận tiện so sánh</p></div>
            </li>
            <li>
              <span className="auth-benefit-icon auth-benefit-icon--heart"><Heart size={26} fill="currentColor" strokeWidth={0} /></span>
              <div><h2>Trải nghiệm cá nhân hóa</h2><p>Đề xuất phù hợp với nhu cầu của bạn</p></div>
            </li>
          </ul>

          <div className="auth-story-art" aria-hidden="true">
            <div className="auth-story-bubble">Cùng tìm<br />ngôi nhà lý tưởng<br />nào!</div>
            <img src="/auth-welcome.png" alt="" width="1800" height="900" loading="lazy" decoding="async" />
          </div>
        </aside>
      )}
      
      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="auth-header">
          {isWelcomeLayout ? <AuthBrand /> : <h1 className="brand-title">Swipe Nest</h1>}
          {title && <h2 className="auth-title">{title}</h2>}
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        
        <div className="auth-content">
          {children}
        </div>

        {isWelcomeLayout && (
          <div className="auth-security-note">
            <ShieldCheck size={24} aria-hidden="true" />
            <p>Thông tin của bạn được bảo vệ.<br />An tâm bắt đầu hành trình cùng Swipe Nest.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AuthLayout;
