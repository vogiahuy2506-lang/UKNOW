import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { HiOutlineChip } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';

const TABS = [
  { to: '/admin/ai-ops/usage', label: 'Chi phí AI' },
  { to: '/admin/ai-ops/unanswered', label: 'Câu hỏi chưa trả lời' },
];

const AdminAiOpsPage = () => {
  const location = useLocation();
  if (location.pathname === '/admin/ai-ops' || location.pathname === '/admin/ai-ops/') {
    return <Navigate to="/admin/ai-ops/usage" replace />;
  }

  return (
    <PageContainer
      title="AI & tài liệu"
      subtitle="Chi phí AI và câu hỏi trợ lý chưa trả lời được."
      icon={HiOutlineChip}
    >
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
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

export default AdminAiOpsPage;
