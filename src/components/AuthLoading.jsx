import { Building2, Heart, House, LockKeyhole, ShieldCheck, Zap } from 'lucide-react';
import { Mascot } from 'page-mascot';
import './AuthLoading.css';

const AuthLoading = () => (
  <main className="auth-loading" aria-busy="true">
    <div className="auth-loading__cloud auth-loading__cloud--left" aria-hidden="true" />
    <div className="auth-loading__cloud auth-loading__cloud--right" aria-hidden="true" />

    <div className="auth-loading__skyline" aria-hidden="true">
      <svg viewBox="0 0 1440 270" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="auth-skyline-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c6ddf7" stopOpacity="0.18" />
            <stop offset="1" stopColor="#a8c9ee" stopOpacity="0.56" />
          </linearGradient>
        </defs>
        <path
          fill="url(#auth-skyline-fill)"
          d="M0 224h36v-58h28v-27h44v85h44v-42h30v42h42v-84h19v-42h52v126h48v-66h25v-37h41v103h45v-36h32v36h33v-122h21v-49h55v171h42v-74h28v-36h44v110h49v-45h24v45h37v-110h22v-30h51v140h43v-72h33v-51h45v123h44v-49h28v49h40v-134h24v-42h48v176h40v-70h30v-34h45v104h45v-46h26v46h38v-96h24v-48h53v144h35v-61h31v-39h44v100h42v-42h25v42h38v-123h26v-31h46v154h39v-67h33v-48h47v115h31v-48h41v48h25v46H0z"
        />
        <path d="M0 229c185-26 284 9 442-1s270-16 420 0 350 15 578-5" fill="none" stroke="#fff" strokeOpacity=".78" strokeWidth="4" />
      </svg>
    </div>

    <section className="auth-loading__content" aria-labelledby="auth-loading-title">
      <div className="auth-loading__illustration" aria-hidden="true">
        <div className="auth-loading__property-card auth-loading__property-card--left">
          <House size={21} strokeWidth={1.8} />
          <span>Nhà phù hợp</span>
        </div>
        <div className="auth-loading__property-card auth-loading__property-card--right">
          <Building2 size={21} strokeWidth={1.8} />
          <span>Tổ ấm mới</span>
          <Heart className="auth-loading__heart" size={13} fill="currentColor" />
        </div>
        <span className="auth-loading__spark auth-loading__spark--one"><Zap size={15} fill="currentColor" /></span>
        <span className="auth-loading__spark auth-loading__spark--two"><Zap size={11} fill="currentColor" /></span>
        <Mascot
          directions="/mascots/otter-builder-directions.webp"
          reactions="/mascots/otter-builder-reactions.webp"
          size={168}
          label="rái cá Swipe Nest"
          className="auth-loading__mascot"
        />
      </div>

      <p className="auth-loading__eyebrow">SWIPE NEST ĐANG CHUẨN BỊ</p>
      <h1 className="auth-loading__title" id="auth-loading-title">Đang xác thực...</h1>
      <p className="auth-loading__description" role="status" aria-live="polite">
        Vui lòng đợi trong giây lát, chúng tôi đang kiểm tra thông tin tài khoản của bạn.
      </p>

      <div className="auth-loading__progress" role="progressbar" aria-label="Đang xác thực tài khoản">
        <span />
      </div>

      <div className="auth-loading__features" aria-label="Quy trình xác thực an toàn">
        <span><ShieldCheck size={15} /> Bảo mật thông tin</span>
        <span><Zap size={14} fill="currentColor" /> Xác thực nhanh</span>
        <span><LockKeyhole size={14} /> Tự động chuyển hướng</span>
      </div>
    </section>
  </main>
);

export default AuthLoading;
