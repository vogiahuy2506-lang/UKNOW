import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';

// Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/campaigns/Campaigns';
import CampaignDetail from './pages/campaigns/CampaignDetail';
import CampaignBuilder from './pages/campaigns/CampaignBuilder';
import CampaignRun from './pages/campaigns/CampaignRun';
import Customers from './pages/customers/Customers';
import CampaignCustomers from './pages/customers/CampaignCustomers';
import EmailSettings from './pages/settings/EmailSettings';
import ZaloSettings from './pages/settings/ZaloSettings';
import EmployeeManagement from './pages/settings/EmployeeManagement';
import EmailTemplates from './pages/templates/EmailTemplates';
import ZaloTemplates from './pages/templates/ZaloTemplates';
import Courses from './pages/courses/Courses';
import Orders from './pages/orders/Orders';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    // Re-initialize if still loading after mount
    if (isLoading) {
      const timeout = setTimeout(() => {
        // Force stop loading after 5 seconds
        useAuthStore.setState({ isLoading: false, isAuthenticated: false });
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner w-10 h-10 mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

/**
 * Chặn route chỉ dành cho admin.
 */
const AdminRoute = ({ children }) => {
  const { user } = useAuthStore();
  const isAdmin = String(user?.roleCode || '').trim().toLowerCase() === 'admin';

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Public Route Component (redirect if already authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        useAuthStore.setState({ isLoading: false, isAuthenticated: false });
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="spinner w-10 h-10 mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <>
      <Router>
        <Toaster
          position="top-center"
          containerStyle={{
            zIndex: 999999,
          }}
          toastOptions={{
            duration: 3000,
            style: {
              background: '#333',
              color: '#fff',
            },
          }}
        />
        <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={
          <PublicRoute>
            <AuthLayout>
              <Login />
            </AuthLayout>
          </PublicRoute>
        } />
        <Route path="/register" element={
          <PublicRoute>
            <AuthLayout>
              <Register />
            </AuthLayout>
          </PublicRoute>
        } />

        {/* Protected Routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          
          {/* Campaigns */}
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="campaigns/:id" element={<CampaignDetail />} />
          <Route path="campaigns/:id/builder" element={<CampaignBuilder />} />
          <Route path="campaigns/new" element={<CampaignBuilder />} />
          <Route path="campaign-run" element={<CampaignRun />} />
          
          {/* Customers */}
          <Route path="customers" element={<Customers />} />
          <Route path="customers/:campaignId" element={<CampaignCustomers />} />
          <Route path="customers/:campaignId/:customerId" element={<CampaignCustomers />} />
          
          {/* Settings */}
          <Route path="settings/email" element={<EmailSettings />} />
          <Route path="settings/zalo" element={<ZaloSettings />} />
          <Route
            path="settings/employees"
            element={(
              <AdminRoute>
                <EmployeeManagement />
              </AdminRoute>
            )}
          />
          <Route path="settings/email-templates" element={<EmailTemplates />} />
          <Route path="settings/zalo-templates" element={<ZaloTemplates />} />
          
          {/* Courses */}
          <Route path="courses" element={<Courses />} />

          {/* Orders */}
          <Route path="orders" element={<Orders />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Router>
      {createPortal(<div id="modal-root"></div>, document.body)}
    </>
  );
}

export default App;
