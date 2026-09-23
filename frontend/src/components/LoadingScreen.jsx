import { useI18n } from '../i18n';

/**
 * Màn chờ dùng chung cho các cổng route (ProtectedRoute, AdminRoute, PublicRoute).
 * Tách khỏi App.jsx cùng lúc với ProtectedRoute để cổng đó test được mà không phải nạp cả App.
 */
const LoadingScreen = () => {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="spinner w-10 h-10 mx-auto mb-4"></div>
        <p className="text-gray-500">{t('app.loading')}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
