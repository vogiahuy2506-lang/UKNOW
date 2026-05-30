import { useNavigate } from 'react-router-dom';
import { HiOutlineArrowRight, HiOutlineHome, HiOutlineLogout, HiOutlineShieldExclamation } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import HeroNavbar from '../public/components/HeroNavbar';
import Footer from '../../components/layout/client/Footer';
import { useI18n } from '../../i18n';
import { getPostAuthPath } from '../../utils/authRedirect';

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
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }} className="relative min-h-screen overflow-x-hidden">
      <video
        className="fixed inset-0 w-full h-full object-cover pointer-events-none"
        style={{ zIndex: -1 }}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
      <div className="fixed inset-0 bg-black/50 pointer-events-none" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <HeroNavbar />

        <main className="flex-1 flex items-center justify-center px-4 py-14 sm:py-20">
          <section className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-white/90 backdrop-blur-xl p-7 sm:p-10 text-center shadow-2xl">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
              <HiOutlineShieldExclamation className="w-8 h-8 text-red-500" />
            </div>

            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-orange-600">
              {t('unauthorized.badge')}
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-black text-slate-950">
              {t('unauthorized.title')}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              {t('unauthorized.description')}
            </p>

            {user && (
              <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
                <p className="text-xs text-slate-400">{t('unauthorized.loginWith')}</p>
                <p className="mt-1 text-sm font-bold text-slate-800 truncate">
                  {user.email || user.username}
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate(homePath)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/15 transition hover:-translate-y-0.5"
                style={{ backgroundColor: '#ef4d23' }}
              >
                <HiOutlineHome className="w-4 h-4" />
                {t('unauthorized.goToMyPage')}
                <HiOutlineArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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
