import { Link } from 'react-router-dom';
import { FaCheckCircle } from 'react-icons/fa';
import founderaiLogo from '../assets/icons/founderai-logo.png';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useI18n } from '../i18n';

/**
 * Auth Layout - Refactored với Impeccable design principles:
 * - Strong visual hierarchy
 * - Strategic color usage
 * - Purposeful motion (no bounce/elastic)
 * - Generous whitespace
 * - Clear typography scale
 */
const AuthLayout = ({ children }) => {
  const { t } = useI18n();
  const features = t('authLayout.features');

  return (
    <div className="min-h-screen relative overflow-hidden font-sans selection:bg-orange-500 selection:text-white">
      {/* Video background */}
      <video
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: 0 }}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4"
        autoPlay loop muted playsInline preload="auto"
      />
      
      {/* Dark overlay */}
      <div 
        className="fixed inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.75) 50%, rgba(15,23,42,0.85) 100%)',
          zIndex: 1
        }}
      />
      
      {/* Subtle grid pattern overlay */}
      <div 
        className="fixed inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          zIndex: 2
        }}
      />

      {/* Ambient glow orbs - subtle, not overwhelming */}
      <div 
        className="fixed w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 70%)',
          top: '-200px',
          right: '-100px',
          zIndex: 3
        }}
      />
      <div 
        className="fixed w-[500px] h-[500px] rounded-full opacity-15 blur-[100px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%)',
          bottom: '-150px',
          left: '-100px',
          zIndex: 3
        }}
      />

      {/* Main container */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-[1000px] items-stretch">

          {/* Left panel: Branding (desktop only) */}
          <div
            className="hidden lg:flex flex-1 flex-col justify-between rounded-l-2xl p-10 xl:p-12"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(15,23,42,0.8) 100%)',
              backdropFilter: 'blur(20px)',
              borderRight: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            {/* Logo + language toggle */}
            <div className="flex items-center justify-between">
              <Link 
                to="/" 
                className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200 w-fit"
              >
                <img 
                  src={founderaiLogo} 
                  alt="Founder AI" 
                  className="w-10 h-10 object-contain" 
                />
                <span className="text-white font-bold text-xl tracking-tight">Founder AI</span>
              </Link>
              <LanguageSwitcher variant="dark" />
            </div>

            {/* Headline & features */}
            <div className="my-auto py-8">
              <h2 className="text-3xl xl:text-4xl font-bold text-white leading-[1.15] tracking-tight mb-4">
                {t('authLayout.headline')}
                <br />
                <span 
                  className="block mt-2 text-3xl xl:text-4xl font-bold"
                  style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  {t('authLayout.subheadline')}
                </span>
              </h2>
              
              <p className="text-base text-slate-400 leading-relaxed mb-8 max-w-md">
                {t('authLayout.description')}
              </p>

              {/* Feature bullets */}
              <div className="space-y-4">
                {(Array.isArray(features) ? features : []).map((text, i) => (
                  <div 
                    key={i} 
                    className="flex items-center gap-3 opacity-0 animate-fadeInUp"
                    style={{ 
                      animationDelay: `${0.3 + i * 0.1}s`,
                      animation: 'fadeInUp 0.5s ease forwards'
                    }}
                  >
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(249,115,22,0.15)' }}
                    >
                      <FaCheckCircle className="text-orange-400 w-4 h-4" />
                    </div>
                    <span className="text-sm text-slate-300 font-medium">{text}</span>
                  </div>
                ))}
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-1 mt-10 pt-1 border-t border-white/10">
                
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-6 text-xs font-medium text-slate-500">
              <span>© 2026 Founder AI Marketing</span>
              <div className="flex items-center gap-4">
                <Link to="/privacy-policy" className="hover:text-orange-400 transition-colors duration-200">{t('authLayout.footer.privacy')}</Link>
                <a href="mailto:hotro.digibook@gmail.com" className="hover:text-orange-400 transition-colors duration-200">{t('authLayout.footer.support')}</a>
              </div>
            </div>
          </div>

          {/* Right panel: Form */}
          <div
            className="flex-1 rounded-r-2xl lg:rounded-l-none rounded-l-2xl p-8 sm:p-10 xl:p-12 flex flex-col justify-center overflow-y-auto max-h-[calc(100vh-3rem)]"
            style={{
              background: 'rgba(255,255,255,0.98)',
              backdropFilter: 'blur(20px)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}
          >
            {/* Mobile top bar: logo + language toggle */}
            <div className="lg:hidden flex items-center justify-between mb-8">
              <Link 
                to="/" 
                className="flex items-center gap-2.5 hover:opacity-70 transition-opacity duration-200 w-fit"
              >
                <img 
                  src={founderaiLogo} 
                  alt="Founder AI" 
                  className="w-8 h-8 object-contain" 
                />
                <span className="text-slate-800 font-bold text-[17px] tracking-tight">Founder AI</span>
              </Link>
              <LanguageSwitcher />
            </div>

            {children}
          </div>

        </div>
      </div>

      {/* Keyframe animations - subtle, purposeful */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default AuthLayout;
