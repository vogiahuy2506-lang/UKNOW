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
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';
import { useI18n } from '../../i18n';

/**
 * NoPlanScreen - Refactored với Impeccable design principles
 */
const NoPlanScreen = () => {
  const { t } = useI18n();
  const { logout, user, switchContext } = useAuthStore();
  const navigate   = useNavigate();
  const memberships = user?.memberships || [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleEnterWorkspace = async (ownerId) => {
    await switchContext(ownerId);
    navigate('/app');
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
        className="fixed w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(249,115,22,0.4) 0%, transparent 70%)',
          top: '-200px',
          right: '-100px',
          zIndex: -1
        }}
      />

      <div className="relative z-10 min-h-screen flex flex-col">
        <Navbar />

        <main className="flex-1 flex items-center px-4 py-14 sm:py-20">
          <div className="w-full max-w-5xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-5 lg:gap-8 items-stretch">
            
            {/* Left: Main content */}
            <section 
              className="rounded-3xl border border-white/10 p-8 sm:p-10 text-white shadow-2xl"
              style={{
                background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.98) 100%)',
                backdropFilter: 'blur(20px)'
              }}
            >
              <div 
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold"
                style={{ background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.3)' }}
              >
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                {t('noPlan.accountReady')}
              </div>

              <div 
                className="mt-8 w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(249,115,22,0.2)' }}
              >
                <HiOutlineLockClosed className="w-8 h-8 text-orange-400" />
              </div>

              <h1 className="mt-6 text-3xl sm:text-5xl font-black leading-tight tracking-tight">
                {t('noPlan.title')}
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-slate-400 max-w-2xl">
                {t('noPlan.description')}
                {memberships.length > 0
                  ? t('noPlan.descriptionWithMembership')
                  : t('noPlan.descriptionWithoutMembership')}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => navigate('/pricing')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                  }}
                >
                  {t('noPlan.viewPlans')}
                  <HiOutlineArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-white/20"
                >
                  <HiOutlineHome className="w-4 h-4" />
                  {t('noPlan.goHome')}
                </button>
              </div>
            </section>

            {/* Right: User info */}
            <aside 
              className="rounded-3xl border border-slate-200/50 bg-white/95 p-6 sm:p-7 shadow-xl backdrop-blur-sm"
              style={{ backdropFilter: 'blur(20px)' }}
            >
              <div className="flex items-start gap-4">
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(239,68,68,0.1) 100%)' }}
                >
                  <HiOutlineSparkles className="w-7 h-7 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                    {t('noPlan.signedInAs')}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 truncate">
                    {user?.fullName || user?.username || user?.email}
                  </h2>
                  {user?.email && (
                    <p className="mt-1 text-sm text-slate-500 truncate">{user.email}</p>
                  )}
                </div>
              </div>

              {memberships.length > 0 ? (
                <div className="mt-7 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {t('noPlan.enterWorkspace')}
                  </p>
                  {memberships.map((m) => (
                    <button
                      key={m.ownerId}
                      onClick={() => handleEnterWorkspace(m.ownerId)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl border border-orange-100 bg-orange-50/50 hover:bg-orange-50 transition-all text-left group"
                    >
                      <div 
                        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                      >
                        {(m.ownerName || m.ownerUsername || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {m.ownerName || m.ownerUsername}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <HiOutlineOfficeBuilding className="w-3 h-3" />
                          {t('noPlan.employee')}
                        </p>
                      </div>
                      <HiOutlineArrowRight className="w-4 h-4 text-orange-500 group-hover:translate-x-1 transition-transform" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-7 rounded-2xl bg-slate-50 border border-slate-100 p-5">
                  <p className="text-sm leading-relaxed text-slate-600">
                    {t('noPlan.homeHint')}
                  </p>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="mt-7 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
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
