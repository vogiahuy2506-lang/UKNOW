import { useNavigate } from 'react-router-dom';
import { HiOutlineRefresh, HiOutlineLogout, HiOutlineClock, HiOutlineArrowRight, HiOutlineCalendar } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';
import { useI18n } from '../../i18n';

/**
 * RenewalScreen - Refactored với Impeccable design principles
 */
const RenewalScreen = () => {
  const { t } = useI18n();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const expiredDate = user?.subscriptionExpiresAt
    ? new Date(user.subscriptionExpiresAt).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar />

      <div className="flex-1 flex items-center justify-center px-4 pt-20 pb-12">
        <div 
          className="rounded-3xl border border-slate-200 p-10 max-w-md w-full text-center shadow-xl"
          style={{ background: 'rgba(255,255,255,0.98)' }}
        >
          {/* Icon */}
          <div 
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.1) 0%, rgba(239,68,68,0.1) 100%)' }}
          >
            <HiOutlineCalendar className="w-10 h-10 text-orange-500" />
          </div>

          {/* Header */}
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{t('renewal.title')}</h2>

          {expiredDate && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <HiOutlineClock className="w-4 h-4 text-slate-400" />
              <p className="text-sm text-slate-500">
                {t('renewal.expiredOn')} <span className="font-semibold text-slate-700">{expiredDate}</span>
              </p>
            </div>
          )}

          <p className="text-slate-600 mt-4 text-sm leading-relaxed">
            {t('renewal.welcomeBack')}
          </p>

          {/* Note */}
          <div 
            className="rounded-2xl px-5 py-4 mt-6 text-left"
            style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', border: '1px solid #fed7aa' }}
          >
            <p className="text-sm font-semibold text-orange-800">{t('renewal.note')}</p>
            <p className="text-sm text-orange-700 mt-1 leading-relaxed">
              {t('renewal.noteMessage')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 mt-8">
            <button 
              onClick={() => navigate('/pricing')} 
              className="w-full py-4 rounded-xl text-white font-semibold transition-all hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.99]"
              style={{
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
              }}
            >
              <span className="flex items-center justify-center gap-2">
                <HiOutlineRefresh className="w-5 h-5" />
                {t('renewal.renewNow')}
              </span>
            </button>
            
            <button
              onClick={() => navigate('/pricing')}
              className="w-full py-3.5 rounded-xl border-2 border-orange-500 text-orange-600 font-semibold transition-all hover:bg-orange-50"
            >
              <span className="flex items-center justify-center gap-2">
                {t('renewal.viewPlans')}
                <HiOutlineArrowRight className="w-4 h-4" />
              </span>
            </button>
            
            <button 
              onClick={handleLogout} 
              className="w-full py-3.5 rounded-xl border border-slate-200 text-slate-500 font-medium transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <span className="flex items-center justify-center gap-2">
                <HiOutlineLogout className="w-4 h-4" />
                {t('renewal.logout')}
              </span>
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default RenewalScreen;
