import { useNavigate } from 'react-router-dom';
import { HiOutlineArrowRight, HiOutlineHome, HiOutlineLogout, HiOutlineShieldExclamation } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';
import { useI18n } from '../../i18n';
import { getPostAuthPath } from '../../utils/authRedirect';

/**
 * UnauthorizedScreen - Refactored với Impeccable design principles
 */
const UnauthorizedScreen = () => {
  const { t } = useI18n();
  const { user, logout, activeContext } = useAuthStore();
  const navigate = useNavigate();
  const homePath = getPostAuthPath(user, activeContext);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Gradient background */}
      <div 
        className="fixed inset-0"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',
          zIndex: -1
        }}
      />
      
      {/* Grid pattern */}
      <div 
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          zIndex: -1
        }}
      />

      {/* Ambient glow */}
      <div 
        className="fixed w-[500px] h-[500px] rounded-full opacity-20 blur-[100px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, transparent 70%)',
          bottom: '-150px',
          left: '-100px',
          zIndex: -1
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        <Navbar />

        <main className="flex-1 flex items-center justify-center px-4 py-14 sm:py-20">
          <section 
            className="w-full max-w-lg rounded-3xl border border-white/10 p-8 sm:p-10 text-center shadow-2xl"
            style={{
              background: 'rgba(255,255,255,0.98)',
              backdropFilter: 'blur(20px)'
            }}
          >
            {/* Icon */}
            <div 
              className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
              style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(239,68,68,0.2) 100%)' }}
            >
              <HiOutlineShieldExclamation className="w-10 h-10 text-red-500" />
            </div>

            <p className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-2">
              {t('unauthorized.badge')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {t('unauthorized.title')}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              {t('unauthorized.description')}
            </p>

            {/* User info */}
            {user && (
              <div 
                className="mt-6 rounded-2xl px-5 py-4 text-left"
                style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', border: '1px solid #e2e8f0' }}
              >
                <p className="text-xs text-slate-500 mb-1">{t('unauthorized.loginWith')}</p>
                <p className="text-sm font-bold text-slate-800 truncate">
                  {user.email || user.username}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate(homePath)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                }}
              >
                <HiOutlineHome className="w-4 h-4" />
                {t('unauthorized.goToMyPage')}
                <HiOutlineArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <HiOutlineLogout className="w-4 h-4" />
                {t('unauthorized.logout')}
              </button>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default UnauthorizedScreen;
