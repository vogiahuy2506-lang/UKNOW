import { Link } from 'react-router-dom';
import { FaFacebookF, FaLinkedinIn, FaYoutube, FaTwitter } from 'react-icons/fa';
import founderaiLogo from '../../../assets/icons/founderai-logo.png';
import { useI18n } from '../../../i18n';

/**
 * Footer - Refactored với Impeccable design principles:
 * - Modern gradient background
 * - Clear typography hierarchy
 * - Strategic color usage
 * - Social icons with hover effects
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
  { icon: FaTwitter, href: 'https://twitter.com', label: 'Twitter' },
];

export default function Footer() {
  const { t } = useI18n();

  return (
    <footer 
      className="relative"
      style={{
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
      }}
    >
      {/* Decorative gradient accent */}
      <div 
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, #f97316 0%, #ef4444 50%, #f97316 100%)'
        }}
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-12 lg:gap-16">
          
          {/* Brand column */}
          <div className="flex flex-col gap-6">
            <Link to="/" className="w-fit">
              <img 
                src={founderaiLogo} 
                alt="Founder AI" 
                className="h-10 w-auto object-contain" 
              />
            </Link>
            <p className="text-[15px] leading-relaxed text-slate-600 max-w-xs">
              {t('footer.description')}
            </p>
            
            {/* Newsletter */}
            <div className="mt-2">
              <p className="text-sm font-semibold text-slate-800 mb-3">Đăng ký nhận tin</p>
              <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
                <input 
                  type="email" 
                  placeholder="email@example.com"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 transition-all"
                />
                <button 
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all text-sm"
                >
                  Đăng ký
                </button>
              </form>
            </div>

            {/* Social links */}
            <div className="flex items-center gap-3 mt-2">
              {SOCIAL_LINKS.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:border-orange-400 hover:text-orange-500 hover:bg-orange-50 transition-all duration-200"
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
        <div className="mt-16 pt-8 border-t border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="text-[13px] text-slate-500">{t('footer.copyright')}</span>
            <div className="flex items-center gap-6 text-[13px]">
              <a href="/privacy-policy" className="text-slate-600 hover:text-orange-500 transition-colors font-medium">
                {t('footer.privacy')}
              </a>
              <span className="text-slate-300">|</span>
              <a href="/public-dpa" className="text-slate-600 hover:text-orange-500 transition-colors font-medium">
                {t('footer.publicDPA')}
              </a>
              <span className="text-slate-300">|</span>
              <a href="/terms" className="text-slate-600 hover:text-orange-500 transition-colors font-medium">
                {t('footer.termsOfUse')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
