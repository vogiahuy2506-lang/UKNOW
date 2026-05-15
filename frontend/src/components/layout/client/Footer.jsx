import { Link } from 'react-router-dom';
import { FaFacebookF, FaLinkedinIn, FaYoutube } from 'react-icons/fa';
import founderaiLogo from '../../../assets/icons/founderai-logo.png';

const PRODUCT_LINKS = [
  { label: 'Tính năng', to: '/#features' },
  { label: 'Bảng giá', to: '/pricing' },
  { label: 'Đăng ký miễn phí', to: '/register' },
];

const COMPANY_LINKS = [
  { label: 'Trang chủ', to: '/' },
  { label: 'Liên hệ', to: '/contact' },
  { label: 'Chính sách bảo mật', href: '/privacy-policy' },
];

const SOCIAL_LINKS = [
  { icon: FaFacebookF, href: 'https://facebook.com', label: 'Facebook' },
  { icon: FaLinkedinIn, href: 'https://linkedin.com', label: 'LinkedIn' },
  { icon: FaYoutube, href: 'https://youtube.com', label: 'YouTube' },
];

export default function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-12">

          {/* Cột 1 — Brand */}
          <div className="flex flex-col gap-5">
            <Link to="/">
              <img
                src={founderaiLogo}
                alt="Founder AI Logo"
                className="h-10 w-auto object-contain"
              />
            </Link>
            <p className="text-sm leading-relaxed text-slate-400 max-w-xs">
              Nền tảng automation marketing all-in-one — xây dựng Landing Page,
              quản lý Lead và tự động hóa Email / Zalo cho doanh nghiệp Việt Nam.
            </p>
            <div className="flex items-center gap-3 mt-1">
              {SOCIAL_LINKS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-full border border-slate-700 flex items-center justify-center text-slate-400 hover:border-orange-500 hover:text-orange-500 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Cột 2 — Sản phẩm */}
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
              Sản phẩm
            </h4>
            <ul className="flex flex-col gap-3">
              {PRODUCT_LINKS.map(({ label, to }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="text-sm hover:text-orange-500 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Cột 3 — Công ty */}
          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
              Công ty
            </h4>
            <ul className="flex flex-col gap-3">
              {COMPANY_LINKS.map(({ label, to, href }) => (
                <li key={label}>
                  {to ? (
                    <Link to={to} className="text-sm hover:text-orange-500 transition-colors">
                      {label}
                    </Link>
                  ) : (
                    <a href={href} className="text-sm hover:text-orange-500 transition-colors">
                      {label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <span>© 2026 Founder AI Marketing Platform. All rights reserved.</span>
          <span>Made with ❤️ in Vietnam</span>
        </div>
      </div>
    </footer>
  );
}
