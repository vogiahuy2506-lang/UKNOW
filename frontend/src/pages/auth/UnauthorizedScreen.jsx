import { useNavigate } from 'react-router-dom';
import { HiOutlineShieldExclamation, HiOutlineLogout, HiOutlineHome } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import AuthLayout from '../../layouts/AuthLayout';
import { useI18n } from '../../i18n';

const UnauthorizedScreen = () => {
  const { t } = useI18n();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <AuthLayout>
      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mb-5">
          <HiOutlineShieldExclamation className="w-7 h-7 text-red-500" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-900">{t('unauthorized.title')}</h1>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xs">
          {t('unauthorized.description')}
        </p>

        {/* Logged-in user info */}
        {user && (
          <p className="text-xs text-slate-400 mt-3">
            {t('unauthorized.loginWith')}{' '}
            <strong className="text-slate-600">{user.email}</strong>
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2.5 mt-8 w-full">
          <button
            onClick={() => navigate('/app')}
            className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-[0.98] text-sm flex items-center justify-center gap-2"
          >
            <HiOutlineHome className="w-4 h-4" />
            {t('unauthorized.goToMyPage')}
          </button>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all text-sm flex items-center justify-center gap-2"
          >
            <HiOutlineLogout className="w-4 h-4" />
            {t('unauthorized.logout')}
          </button>
        </div>
      </div>
    </AuthLayout>
  );
};

export default UnauthorizedScreen;
