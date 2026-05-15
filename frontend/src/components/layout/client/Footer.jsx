import { Link } from 'react-router-dom';
import { FaFacebookF, FaLinkedinIn, FaYoutube } from 'react-icons/fa';
import founderaiLogo from '../../../assets/icons/founderai-logo.png';

const COLUMNS = [
  {
    title: 'Sản phẩm',
    links: [
      { label: 'Tính năng', to: '/#features' },
      { label: 'Landing Page', to: '/#features' },
      { label: 'Bảng giá', to: '/pricing' },
      { label: 'Cập nhật', to: '/about' },
    ],
  },
  {
    title: 'Nền tảng',
    links: [
      { label: 'Email Marketing', to: '/#features' },
      { label: 'Zalo Automation', to: '/#features' },
      { label: 'CRM & Lead', to: '/#features' },
      { label: 'Báo cáo', to: '/#features' },
    ],
  },
  {
    title: 'Công ty',
    links: [
      { label: 'Giới thiệu', to: '/about' },
      { label: 'Liên hệ', to: '/contact' },
      { label: 'Chính sách', href: '/privacy-policy' },
    ],
  },
];

const SOCIAL_LINKS = [
  { icon: FaLinkedinIn, href: 'https://linkedin.com', label: 'LinkedIn' },
  { icon: FaFacebookF, href: 'https://facebook.com', label: 'Facebook' },
  { icon: FaYoutube, href: 'https://youtube.com', label: 'YouTube' },
];

export default function Footer() {
  return (
    <footer className="px-4 sm:px-6 pt-6 pb-5 relative">
      <div className="absolute inset-0 bg-white/40 backdrop-blur-md" />
      {/* Card trắng */}
      <div className="relative bg-white/80 backdrop-blur-sm rounded-3xl px-8 sm:px-12 py-10">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-10">

          {/* Brand */}
          <div className="flex flex-col gap-5">
            <Link to="/">
              <img src={founderaiLogo} alt="Founder AI" className="h-9 w-auto object-contain" />
            </Link>
            <p className="text-[14px] leading-relaxed text-slate-500 max-w-[260px]">
              Nền tảng automation marketing all-in-one — xây dựng Landing Page,
              quản lý Lead và tự động hóa Email / Zalo cho doanh nghiệp Việt Nam.
            </p>
            <div className="flex items-center gap-2 mt-1">
              {SOCIAL_LINKS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-10 h-10 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-500 hover:border-orange-400 hover:text-orange-500 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-4">
              <h4 className="text-[13px] font-medium text-neutral-400">{col.title}</h4>
              <ul className="flex flex-col gap-3">
                {col.links.map(({ label, to, href }) => (
                  <li key={label}>
                    {to ? (
                      <Link
                        to={to}
                        className="text-[15px] font-medium text-neutral-800 hover:text-orange-500 transition-colors"
                      >
                        {label}
                      </Link>
                    ) : (
                      <a
                        href={href}
                        className="text-[15px] font-medium text-neutral-800 hover:text-orange-500 transition-colors"
                      >
                        {label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar — ngoài card */}
      <div className="relative flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 px-2">
        <span className="text-[13px] text-neutral-500">© 2026 Founder AI. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <a href="/privacy-policy" className="text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors">
            Chính sách bảo mật
          </a>
          <span className="text-neutral-300">|</span>
          <Link to="/contact" className="text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors">
            Điều khoản sử dụng
          </Link>
        </div>
      </div>
    </footer>
  );
}
