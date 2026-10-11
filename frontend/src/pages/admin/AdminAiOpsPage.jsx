import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { HiOutlineChip } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import { useI18n } from '../../i18n';

const AdminAiOpsPage = () => {
  const { t } = useI18n();
  const location = useLocation();
  if (location.pathname === '/admin/ai-ops' || location.pathname === '/admin/ai-ops/') {
    return <Navigate to="/admin/ai-ops/usage" replace />;
  }

  const tabs = [
    { to: '/admin/ai-ops/usage', label: t('adminAiOps.tabs.usage', 'Chi phí AI') },
    { to: '/admin/ai-ops/unanswered', label: t('adminAiOps.tabs.unanswered', 'Câu hỏi chưa trả lời') },
  ];

  return (
    <PageContainer
      title={t('adminAiOps.title', 'AI & tài liệu')}
      subtitle={t('adminAiOps.subtitle', 'Chi phí AI và câu hỏi trợ lý chưa trả lời được.')}
      icon={HiOutlineChip}
    >
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2 dark:border-dk-border">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium ${
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-dk-text2 dark:hover:bg-dk-raised dark:hover:text-dk-text'
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

export default AdminAiOpsPage;
