import { Link } from 'react-router-dom';
import { FaFacebookF, FaLinkedinIn, FaYoutube } from 'react-icons/fa';
import { useI18n } from '../../../i18n';

/**
 * Footer - Cho các trang public: HeroPage, ContactPage, PricingPage
 */

const COLUMNS = (t) => [
  {
    title: t('footer.product'),
    links: [
      { label: t('footer.features'), to: '/#features' },
      { label: t('footer.landingPage'), to: '/#features' },
      { label: t('footer.pricing'), to: '/pricing' },
    ],
  },
  {
    title: t('footer.platform'),
    links: [
      { label: t('footer.emailMarketing'), to: '/#features' },
      { label: t('footer.zaloAutomation'), to: '/#features' },
      { label: t('footer.crmLead'), to: '/#features' },
      { label: t('footer.reports'), to: '/#features' },
    ],
  },
  {
    title: t('footer.company'),
    links: [
      { label: t('footer.contact'), to: '/contact' },
      { label: t('footer.privacyPolicy'), href: '/privacy-policy' },
      { label: t('footer.publicDPA'), href: '/public-dpa' },
      { label: t('footer.termsOfUse'), href: '/terms' },
    ],
  },
];

const SOCIAL_LINKS = [
  { icon: FaLinkedinIn, href: 'https://linkedin.com', label: 'LinkedIn' },
  { icon: FaFacebookF, href: 'https://facebook.com', label: 'Facebook' },
  { icon: FaYoutube, href: 'https://youtube.com', label: 'YouTube' },
];

export default function Footer() {
  const { t } = useI18n();

  return (
    <footer className="bg-slate-900 text-white">
      {/* Decorative gradient accent */}
      <div className="h-px bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-12 lg:gap-16">
          
          {/* Brand column */}
          <div className="flex flex-col gap-6">
            <Link to="/" className="w-fit">
              <img 
                src="/logo-digiso.png" 
                alt="DIGISO" 
                className="h-10 w-auto object-contain brightness-0 invert" 
              />
            </Link>
            <p className="text-[15px] leading-relaxed text-slate-400 max-w-xs">
              Founder AI là giải pháp Marketing Automation & AI hàng đầu cho doanh nghiệp Việt Nam.
            </p>
            
            {/* Social links */}
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-orange-500 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS(t).map((col) => (
            <div key={col.title} className="flex flex-col gap-5">
              <h4 className="text-[13px] font-bold uppercase tracking-wider text-slate-400">{col.title}</h4>
              <ul className="flex flex-col gap-3">
                {col.links.map(({ label, to, href }) => (
                  <li key={label}>
                    {to ? (
                      <Link
                        to={to}
                        className="text-[15px] font-medium text-slate-700 hover:text-orange-500 transition-colors duration-200 inline-block hover:translate-x-1"
                        style={{ transition: 'all 0.2s ease' }}
                      >
                        {label}
                      </Link>
                    ) : (
                      <a
                        href={href}
                        className="text-[15px] font-medium text-slate-700 hover:text-orange-500 transition-colors duration-200 inline-block hover:translate-x-1"
                        style={{ transition: 'all 0.2s ease' }}
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

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-slate-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
            <p>© 2026 Founder AI - Đồng sáng lập cho doanh nghiệp một người</p>
            <div className="flex items-center gap-6">
              <a href="/privacy-policy" className="hover:text-white transition-colors">Chính sách bảo mật</a>
              <a href="/public-dpa" className="hover:text-white transition-colors">Thoả thuận xử lý dữ liệu</a>
              <a href="/terms" className="hover:text-white transition-colors">Điều khoản sử dụng</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
