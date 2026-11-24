import { Link } from 'react-router-dom';
import { BriefcaseBusiness, FileText, Info, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import SwipeNestMark from '../../components/SwipeNestMark';
import './HomeFooter.css';

const linkGroups = [
  { title: 'Dịch vụ', items: [
    { label: 'Thuê', Icon: KeyRound, to: '/search?listing=RENT' },
  ] },
  { title: 'Công ty', items: [
    { label: 'Về Chúng Tôi', Icon: Info },
    { label: 'Tuyển Dụng', Icon: BriefcaseBusiness },
    { label: 'Liên Hệ', Icon: Mail, href: 'mailto:swipenestllc@gmail.com' },
  ] },
  { title: 'Pháp lý', items: [
    { label: 'Chính Sách Bảo Mật', Icon: ShieldCheck, href: '/privacy.html' },
    { label: 'Điều Khoản Sử Dụng', Icon: FileText, href: '/terms.html' },
  ] },
];

const socialMarks = [
  ['Facebook', 'M14 21v-8h2.7l.4-3H14V8.2c0-.9.3-1.5 1.6-1.5h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H8v3h2.6v8z'],
  ['TikTok', 'M14 3h2.5c.4 2 1.5 3.2 3.5 3.5V9a7.5 7.5 0 0 1-3.5-1.1v7.6a5.5 5.5 0 1 1-5.5-5.5h.7v2.7a2.8 2.8 0 1 0 2.3 2.8z'],
];

export default function HomeFooter() {
  return (
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
              {items.map(({ label, Icon, to, href }) => {
                const content = <><Icon aria-hidden="true" size={14} />{label}</>;
                return (
                  <li key={label}>
                    {to ? <Link to={to}>{content}</Link> : href ? <a href={href}>{content}</a> : <span>{content}</span>}
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
  );
}
