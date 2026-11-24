import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, Info, KeyRound, Mail, ShieldCheck, X } from 'lucide-react';
import SwipeNestMark from '../../components/SwipeNestMark';
import './HomeFooter.css';

const linkGroups = [
  { title: 'Dịch vụ', items: [
    { label: 'Thuê', Icon: KeyRound, to: '/search?listing=RENT' },
  ] },
  { title: 'Công ty', items: [
    { label: 'Về Chúng Tôi', Icon: Info, action: 'about' },
    { label: 'Liên Hệ', Icon: Mail, href: 'mailto:swipenestllc@gmail.com' },
  ] },
  { title: 'Pháp lý', items: [
    { label: 'Chính Sách Bảo Mật', Icon: ShieldCheck, href: '/privacy.html' },
    { label: 'Điều Khoản Sử Dụng', Icon: FileText, href: '/terms.html' },
  ] },
];

const aboutHighlights = [
  'Khám phá bất động sản trực quan kiểu quẹt thẻ và lọc nhanh theo khu vực, ngân sách, loại hình.',
  'Gợi ý cá nhân hóa theo phong cách sống và lưu danh sách yêu thích để so sánh thuận tiện.',
  'Kết nối trực tiếp với môi giới đã xác minh danh tính (KYC) cùng nguồn hàng độc quyền Swipe Nest Plus.'
];

const socialMarks = [
  ['Facebook', 'M14 21v-8h2.7l.4-3H14V8.2c0-.9.3-1.5 1.6-1.5h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H8v3h2.6v8z'],
  ['TikTok', 'M14 3h2.5c.4 2 1.5 3.2 3.5 3.5V9a7.5 7.5 0 0 1-3.5-1.1v7.6a5.5 5.5 0 1 1-5.5-5.5h.7v2.7a2.8 2.8 0 1 0 2.3 2.8z'],
];

export default function HomeFooter() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (aboutOpen && !dialog.open) {
      dialog.showModal();
    } else if (!aboutOpen && dialog.open) {
      dialog.close();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [aboutOpen]);

  return (
    <>
    <footer className="home-footer">
      <div className="home-footer-grid">
        <div className="home-footer-brand-col">
          <Link className="home-footer-brand" to="/" aria-label="Trang chủ SwipeNest">
            <SwipeNestMark />
            <span>SwipeNest</span>
          </Link>
          <p>Nâng tầm trải nghiệm bất động sản qua lăng kính của sự tinh tế và chuyên nghiệp.</p>
        </div>

        {linkGroups.map(({ title, items }) => (
          <section key={title}>
            <h2>{title}</h2>
            <ul>
              {items.map(({ label, Icon, to, href, action }) => {
                const content = <><Icon aria-hidden="true" size={14} />{label}</>;
                return (
                  <li key={label}>
                    {to ? (
                      <Link to={to}>{content}</Link>
                    ) : href ? (
                      <a href={href}>{content}</a>
                    ) : action === 'about' ? (
                      <button type="button" className="home-footer-action" onClick={() => setAboutOpen(true)}>
                        {content}
                      </button>
                    ) : (
                      <span>{content}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="home-footer-social-col">
          <h2>Kết nối với chúng tôi</h2>
          <ul className="home-footer-socials">
            {socialMarks.map(([name, path]) => (
              <li key={name}>
                <svg role="img" aria-label={name} viewBox="0 0 24 24" fill="currentColor" focusable="false">
                  <path d={path} />
                </svg>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="home-footer-bottom">© 2026 Swipe Nest. All rights reserved.</div>
    </footer>

    <dialog
        ref={dialogRef}
        className="home-footer-about-dialog"
        aria-labelledby="home-footer-about-title"
        onCancel={(event) => { event.preventDefault(); setAboutOpen(false); }}
        onClick={(event) => { if (event.target === dialogRef.current) setAboutOpen(false); }}
      >
        {aboutOpen && (
          <div className="home-footer-about-card">
            <div className="home-footer-about-header">
              <div className="home-footer-about-brand">
                <SwipeNestMark />
                <div>
                  <h3 id="home-footer-about-title">Về Swipe Nest</h3>
                  <p>Nền tảng tìm kiếm bất động sản thông minh</p>
                </div>
              </div>
              <button
                type="button"
                className="home-footer-about-close"
                aria-label="Đóng giới thiệu"
                onClick={() => setAboutOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <p className="home-footer-about-lead">
              <strong>Swipe Nest</strong> giúp người tìm nhà rút ngắn hành trình chọn nơi ở phù hợp thông qua trải nghiệm trực quan, thông tin minh bạch và kết nối nhanh chóng với đội ngũ môi giới uy tín.
            </p>

            <ul className="home-footer-about-list">
              {aboutHighlights.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="home-footer-about-footer">
              <a href="mailto:swipenestllc@gmail.com" className="home-footer-about-mail">
                <Mail size={14} aria-hidden="true" /> swipenestllc@gmail.com
              </a>
              <button type="button" className="home-footer-about-done" onClick={() => setAboutOpen(false)}>
                Đóng
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
