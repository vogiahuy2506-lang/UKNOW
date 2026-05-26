import { useNavigate } from 'react-router-dom';
import { HiOutlineRefresh, HiOutlineLogout, HiOutlineClock, HiOutlineArrowRight } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';
import { useI18n } from '../../i18n';

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
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <Navbar />

      <div className="flex-1 flex items-center justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <HiOutlineClock className="w-8 h-8 text-primary-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900">{t('renewal.title')}</h2>

          {expiredDate && (
            <p className="text-sm text-gray-400 mt-1">
              {t('renewal.expiredOn')} {expiredDate}
            </p>
          )}

          <p className="text-gray-500 mt-4 text-sm leading-relaxed">
            {t('renewal.welcomeBack')}
          </p>

          <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mt-5 text-left">
            <p className="text-xs text-orange-700 font-medium">{t('renewal.note')}</p>
            <p className="text-xs text-orange-600 mt-0.5 leading-relaxed">
              {t('renewal.noteMessage')}
            </p>
          </div>

          <div className="flex flex-col gap-3 mt-8">
            <button onClick={() => navigate('/about')} className="btn btn-primary w-full">
              <HiOutlineRefresh className="w-4 h-4 mr-2" />
              {t('renewal.renewNow')}
            </button>
            <button
              onClick={() => navigate('/about')}
              className="btn btn-secondary w-full text-sm"
            >
              {t('renewal.viewPlans')}
              <HiOutlineArrowRight className="w-4 h-4 ml-2" />
            </button>
            <button onClick={handleLogout} className="btn btn-secondary w-full text-sm text-gray-400">
              <HiOutlineLogout className="w-4 h-4 mr-2" />
              {t('renewal.logout')}
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default RenewalScreen;
