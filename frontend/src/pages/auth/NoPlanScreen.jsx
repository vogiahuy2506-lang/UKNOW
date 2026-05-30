import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowRight,
  HiOutlineHome,
  HiOutlineLockClosed,
  HiOutlineLogout,
  HiOutlineOfficeBuilding,
  HiOutlineSparkles,
} from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import HeroNavbar from '../public/components/HeroNavbar';
import Footer from '../../components/layout/client/Footer';
import { useI18n } from '../../i18n';

const NoPlanScreen = () => {
  const { t } = useI18n();
  const { logout, user, switchContext } = useAuthStore();
  const navigate   = useNavigate();
  const memberships = user?.memberships || [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleEnterWorkspace = (ownerId) => {
    switchContext(ownerId);
    navigate('/app');
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
      <div className="fixed inset-0 bg-black/45 pointer-events-none" />

      <div className="relative z-10 min-h-screen flex flex-col">
        <HeroNavbar />

        <main className="flex-1 flex items-center px-4 py-14 sm:py-20">
          <div className="w-full max-w-5xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-5 lg:gap-8 items-stretch">
            <section className="rounded-[2rem] border border-white/20 bg-white/15 backdrop-blur-xl p-7 sm:p-10 text-white shadow-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-semibold">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                {t('noPlan.accountReady')}
              </div>

              <div className="mt-8 w-16 h-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center">
                <HiOutlineLockClosed className="w-8 h-8 text-orange-300" />
              </div>

              <h1 className="mt-6 text-3xl sm:text-5xl font-black leading-tight">
                {t('noPlan.title')}
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/75 max-w-2xl">
                {t('noPlan.description')}
                {memberships.length > 0
                  ? t('noPlan.descriptionWithMembership')
                  : t('noPlan.descriptionWithoutMembership')}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate('/pricing')}
                  className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/20 transition hover:-translate-y-0.5"
                  style={{ backgroundColor: '#ef4d23' }}
                >
                  {t('noPlan.viewPlans')}
                  <HiOutlineArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  <HiOutlineHome className="w-4 h-4" />
                  {t('noPlan.goHome')}
                </button>
              </div>
            </section>

            <aside className="rounded-[2rem] border border-white/20 bg-white/90 backdrop-blur-xl p-6 sm:p-7 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
                  <HiOutlineSparkles className="w-6 h-6 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
                    {t('noPlan.signedInAs')}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950 truncate">
                    {user?.fullName || user?.username || user?.email}
                  </h2>
                  {user?.email && (
                    <p className="mt-1 text-sm text-slate-500 truncate">{user.email}</p>
                  )}
                </div>
              </div>

              {memberships.length > 0 ? (
                <div className="mt-7 space-y-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    {t('noPlan.enterWorkspace')}
                  </p>
                  {memberships.map((m) => (
                    <button
                      key={m.ownerId}
                      onClick={() => handleEnterWorkspace(m.ownerId)}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl border border-orange-100 bg-orange-50 hover:bg-orange-100 transition group text-left"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(m.ownerName || m.ownerUsername || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-950 truncate">
                          {m.ownerName || m.ownerUsername}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <HiOutlineOfficeBuilding className="w-3 h-3" />
                          {t('noPlan.employee')}
                        </p>
                      </div>
                      <HiOutlineArrowRight className="w-4 h-4 text-orange-600 group-hover:translate-x-0.5 transition" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-7 rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-sm leading-relaxed text-slate-600">
                    {t('noPlan.homeHint')}
                  </p>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="mt-7 w-full inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <HiOutlineLogout className="w-4 h-4" />
                {t('noPlan.logout')}
              </button>
            </aside>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default NoPlanScreen;
