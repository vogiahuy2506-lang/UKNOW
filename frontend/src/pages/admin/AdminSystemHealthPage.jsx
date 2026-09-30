import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { HiOutlineHeart } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
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
    <PageContainer
      title={t('adminHealth.title')}
      subtitle={t('adminHealth.subtitle')}
      icon={HiOutlineHeart}
    >
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
    </PageContainer>
  );
};

export default AdminSystemHealthPage;
