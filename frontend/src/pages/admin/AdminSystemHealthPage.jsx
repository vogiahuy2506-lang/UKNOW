import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n';

const AdminSystemHealthPage = () => {
  const { t } = useI18n();
  const location = useLocation();
  if (location.pathname === '/admin/health' || location.pathname === '/admin/health/') {
    return <Navigate to="/admin/health/system" replace />;
  }

  const tabs = [
    { to: '/admin/health/system', label: t('adminHealth.tabServer'), end: true },
    { to: '/admin/health/delivery', label: t('adminHealth.tabDelivery') },
    { to: '/admin/health/diagnostic', label: t('adminHealth.tabDiagnostic') },
    { to: '/admin/health/cron', label: t('adminHealth.tabCron') },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('adminHealth.title')}</h1>
        <p className="text-gray-500 mt-1">{t('adminHealth.subtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium ${
                isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
};

export default AdminSystemHealthPage;
