import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/admin/health/system', label: 'Máy chủ', end: true },
  { to: '/admin/health/delivery', label: 'Gửi tin' },
  { to: '/admin/health/diagnostic', label: 'Diagnostic' },
  { to: '/admin/health/cron', label: 'Cron' },
];

const AdminSystemHealthPage = () => {
  const location = useLocation();
  if (location.pathname === '/admin/health' || location.pathname === '/admin/health/') {
    return <Navigate to="/admin/health/system" replace />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sức khoẻ hệ thống</h1>
        <p className="text-gray-500 mt-1">Máy chủ, gửi tin, diagnostic và trạng thái cron — một chỗ.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {TABS.map((tab) => (
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
