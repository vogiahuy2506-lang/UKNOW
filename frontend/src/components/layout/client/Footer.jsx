import { Link } from 'react-router-dom';
import { FaFacebookF, FaLinkedinIn, FaYoutube } from 'react-icons/fa';
import founderaiLogo from '../../../assets/icons/founderai-logo.png';
import { useI18n } from '../../../i18n';

const COLUMNS = (t) => [
  {
    title: t('footer.product'),
    links: [
      { label: t('footer.features'), to: '/#features' },
      { label: t('footer.landingPage'), to: '/#features' },
      { label: t('footer.pricing'), to: '/pricing' },
      { label: t('footer.updates'), to: '/about' },
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
      { label: t('footer.about'), to: '/about' },
      { label: t('footer.contact'), to: '/contact' },
      { label: t('footer.privacyPolicy'), href: '/privacy-policy' },
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
              {t('footer.description')}
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
          {COLUMNS(t).map((col) => (
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
        <span className="text-[13px] text-slate-600">{t('footer.copyright')}</span>
        <div className="flex items-center gap-4">
          <a href="/privacy-policy" className="text-[13px] text-slate-600 hover:text-slate-800 transition-colors">
            {t('footer.privacy')}
          </a>
          <span className="text-neutral-400">|</span>
          <Link to="/contact" className="text-[13px] text-slate-600 hover:text-slate-800 transition-colors">
            {t('footer.termsOfUse')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
