import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n';
import founderaiLogo from '../../../assets/icons/founderai-logo.png';

export default function PublicFooter() {
  const { t } = useI18n();

  return (
    <footer className="bg-slate-900 dark:bg-dk-inset dark:border-t dark:border-dk-border text-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12">
          {/* Brand & Company Info */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-4 w-fit group">
              <img src={founderaiLogo} alt="Founder AI" className="w-10 h-10 object-contain drop-shadow-sm" />
              <span className="text-xl font-bold tracking-tight text-white group-hover:text-orange-400 transition-colors">
                Founder AI
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mb-4">
              {t('footer.publicBrandDesc')}
            </p>
            <div className="space-y-1 text-sm text-slate-400">
              <p className="font-medium text-slate-300">{t('footer.companyName')}</p>
              <p>{t('footer.companyAddress')}</p>
              <p>{t('footer.companyRep')}</p>
              <p>{t('footer.companyLicense')}</p>
              <p>{t('footer.companyPhone')}</p>
              <p><a href="mailto:info@digiso.vn" className="hover:text-orange-400 transition-colors">info@digiso.vn</a></p>
            </div>
            <div className="flex items-center gap-4 mt-6">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-orange-500 transition-colors">
                <span className="text-sm">f</span>
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-orange-500 transition-colors">
                <span className="text-sm">in</span>
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-orange-500 transition-colors">
                <span className="text-sm">▶</span>
              </a>
            </div>
          </div>

          {/* Policies */}
          <div>
            <h4 className="font-semibold mb-4 text-white">{t('footer.policies')}</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="/privacy-policy" className="hover:text-orange-400 transition-colors">{t('footer.privacyPolicy')}</a></li>
              <li><a href="/public-dpa" className="hover:text-orange-400 transition-colors">{t('footer.dpaPolicy')}</a></li>
              <li><a href="/complaint-policy" className="hover:text-orange-400 transition-colors">{t('footer.complaintPolicy')}</a></li>
              <li><a href="/pricing-policy" className="hover:text-orange-400 transition-colors">{t('footer.pricingPolicy')}</a></li>
              <li><a href="/payment-policy" className="hover:text-orange-400 transition-colors">{t('footer.paymentPolicy')}</a></li>
              <li><a href="/service-terms" className="hover:text-orange-400 transition-colors">{t('footer.serviceTerms')}</a></li>
              <li><a href="/service-delivery-policy" className="hover:text-orange-400 transition-colors">{t('footer.serviceDeliveryPolicy')}</a></li>
              <li><a href="/refund-policy" className="hover:text-orange-400 transition-colors">{t('footer.refundPolicy')}</a></li>
              <li><a href="/rights-and-duties" className="hover:text-orange-400 transition-colors">{t('footer.rightsAndDuties')}</a></li>
              <li><a href="/terms" className="hover:text-orange-400 transition-colors">{t('footer.termsOfService')}</a></li>
              <li><a href="/support" className="hover:text-orange-400 transition-colors">{t('footer.supportPolicy')}</a></li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold mb-4 text-white">{t('footer.quickLinks')}</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><a href="/pricing" className="hover:text-orange-400 transition-colors">{t('footer.pricing')}</a></li>
              <li><a href="/contact" className="hover:text-orange-400 transition-colors">{t('footer.contact')}</a></li>
              <li><a href="/register" className="hover:text-orange-400 transition-colors">{t('footer.register')}</a></li>
              <li><a href="/login" className="hover:text-orange-400 transition-colors">{t('footer.login')}</a></li>
            </ul>
            <div className="mt-6">
              <a
                href="https://online.gov.vn/nen-tang/145bbf19-7882-4268-8ec1-3af7e73ae5b5"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block hover:opacity-90 transition-opacity"
                title="Đã thông báo với Bộ Công Thương"
              >
                <img
                  src="/logo-bct.png"
                  alt="Đã thông báo Bộ Công Thương"
                  className="h-10 w-auto object-contain"
                />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 dark:border-dk-border">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
            <p>{t('footer.publicBottomCopyright')}</p>
            <div className="flex items-center gap-6">
              <a href="/privacy-policy" className="hover:text-white transition-colors">{t('footer.publicPrivacyLink')}</a>
              <a href="/public-dpa" className="hover:text-white transition-colors">{t('footer.publicDpaLink')}</a>
              <a href="/terms" className="hover:text-white transition-colors">{t('footer.publicTermsLink')}</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
