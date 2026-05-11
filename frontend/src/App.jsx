import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LandingLayout from './layouts/LandingLayout';

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
import ChannelSettings from './pages/settings/ChannelSettings';
import EmployeeManagement from './pages/settings/EmployeeManagement';
import LandingFeaturedCoursesPage from './pages/settings/LandingFeaturedCoursesPage';
import LandingTestimonialsPage from './pages/settings/LandingTestimonialsPage';
import LandingPagesAdminPage from './pages/settings/LandingPagesAdminPage';
import BusinessProfilePage from './pages/settings/BusinessProfilePage';
import ChannelTemplates from './pages/templates/ChannelTemplates';
import Courses from './pages/courses/Courses';
import Orders from './pages/orders/Orders';
import LandingLeadsListPage from './pages/landing-leads/LandingLeadsListPage';
import PublicDataPolicyPage from './pages/public/PublicDataPolicyPage';
import AboutPage from './pages/public/AboutPage';
import PricingPage from './pages/public/PricingPage';
import ContactPage from './pages/public/ContactPage';
import LpRendererPage from './pages/public/LpRendererPage';
import EmbedLeadFormPage from './pages/public/EmbedLeadFormPage';
import LearningPage from './pages/learning/LearningPage';
import CheckoutPage from './pages/checkout/CheckoutPage';
import PaymentSuccessPage from './pages/checkout/PaymentSuccess';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminMembersPage from './pages/admin/AdminMembersPage';
import AdminPlansPage from './pages/admin/AdminPlansPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import NoPlanScreen from './pages/auth/NoPlanScreen';
import RenewalScreen from './pages/auth/RenewalScreen';
import UnauthorizedScreen from './pages/auth/UnauthorizedScreen';
import ActivatePage from './pages/auth/ActivatePage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="spinner w-10 h-10 mx-auto mb-4"></div>
      <p className="text-gray-500">Đang tải...</p>
    </div>
  </div>
);

const LockedEmployeeScreen = () => {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-5a7 7 0 110-14 7 7 0 010 14z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Tài khoản bị tạm khóa</h1>
        <p className="text-gray-500 mt-2 text-sm">
          Tài khoản của bạn đã bị quản lý tạm khóa. Vui lòng liên hệ quản lý để được hỗ trợ.
        </p>
        <button
          onClick={async () => { await logout(); navigate('/login'); }}
          className="btn btn-secondary w-full mt-8"
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
};

// Bảo vệ /app/* — yêu cầu đăng nhập + có gói
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user, activeContext } = useAuthStore();

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        useAuthStore.setState({ isLoading: false, isAuthenticated: false });
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  // Employee context: plan check dựa vào owner's plan (middleware đã xử lý server-side)
  // Frontend chỉ cần kiểm tra self context
  if (activeContext?.type === 'self' && !user?.active_plan_id) {
    return user?.isReturningCustomer ? <RenewalScreen /> : <NoPlanScreen />;
  }

  return children;
};

// Chỉ self context (user_admin) được vào — employee context thấy màn hình unauthorized
const OwnerRoute = ({ children }) => {
  const { activeContext } = useAuthStore();
  if (activeContext?.type === 'employee') return <UnauthorizedScreen />;
  return children;
};

// Self context luôn vào được; employee context chỉ vào được nếu có ít nhất 1 trong các permission
const PermissionRoute = ({ permission, children }) => {
  const { activeContext } = useAuthStore();
  if (activeContext?.type === 'employee') {
    const perms = Array.isArray(permission) ? permission : [permission];
    const hasPermission = perms.some((p) => activeContext?.permissions?.[p] === true);
    if (!hasPermission) return <UnauthorizedScreen />;
  }
  return children;
};

// Bảo vệ /admin/* — chỉ super_admin được vào, role khác thấy màn hình unauthorized
const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <UnauthorizedScreen />;

  return children;
};

// Redirect nếu đã đăng nhập: super_admin → /admin, còn lại → /app
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        useAuthStore.setState({ isLoading: false, isAuthenticated: false });
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (isLoading) return <LoadingScreen />;
  if (isAuthenticated) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/app'} replace />;
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

          {/* Landing Routes */}
          <Route element={<LandingLayout />}>
            {/* Public Landing Page - URL gốc sẽ hiện trang AboutPage */}
            <Route path="/" element={<AboutPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/payment-success" element={<PaymentSuccessPage />} />
            <Route path="/privacy-policy" element={<PublicDataPolicyPage />} />
            <Route path="/privacy-policy/" element={<PublicDataPolicyPage />} />
          </Route>

          {/* Kích hoạt tài khoản nhân viên qua link email */}
          <Route path="/activate" element={<ActivatePage />} />

          {/* Quên mật khẩu */}
          <Route path="/forgot-password" element={
            <PublicRoute>
              <AuthLayout><ForgotPasswordPage /></AuthLayout>
            </PublicRoute>
          } />
          <Route path="/reset-password" element={<AuthLayout><ResetPasswordPage /></AuthLayout>} />

          {/* Điều hướng các URL cũ hoặc sai chính tả */}
          <Route path="/l" element={<Navigate to="/" replace />} />
          <Route path="/private-policy" element={<Navigate to="/privacy-policy" replace />} />

          {/* Các route hỗ trợ khác */}
          <Route path="/lp/:slug" element={<LpRendererPage />} />
          <Route path="/embed/lead-form" element={<EmbedLeadFormPage />} />
          <Route path="/learning" element={<LearningPage />} />

          {/* Protected Routes - prefix /app */}
          <Route path="/app" element={
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

            {/* Settings — owner only */}
            <Route path="settings/channels" element={<PermissionRoute permission={['email_settings', 'zalo_settings']}><ChannelSettings /></PermissionRoute>} />
            <Route path="settings/employees" element={<OwnerRoute><EmployeeManagement /></OwnerRoute>} />
            <Route path="settings/landing-featured-courses" element={<OwnerRoute><LandingFeaturedCoursesPage /></OwnerRoute>} />
            <Route path="settings/landing-testimonials" element={<OwnerRoute><LandingTestimonialsPage /></OwnerRoute>} />
            <Route path="settings/landing-pages" element={<OwnerRoute><LandingPagesAdminPage /></OwnerRoute>} />
            <Route path="settings/ai-profile" element={<OwnerRoute><BusinessProfilePage /></OwnerRoute>} />

            {/* Settings — permission based (employee có thể vào nếu được cấp quyền) */}
            <Route path="settings/templates" element={<ChannelTemplates />} />

            {/* Redirect các route cũ */}
            <Route path="settings/email" element={<Navigate to="/app/settings/channels" replace />} />
            <Route path="settings/zalo" element={<Navigate to="/app/settings/channels" replace />} />
            <Route path="settings/email-templates" element={<Navigate to="/app/settings/templates" replace />} />
            <Route path="settings/zalo-templates" element={<Navigate to="/app/settings/templates" replace />} />

            {/* Courses & Orders — orders chỉ owner, còn lại permission based */}
            <Route path="courses" element={<Courses />} />
            <Route path="orders" element={<OwnerRoute><Orders /></OwnerRoute>} />
            <Route path="landing-leads" element={<LandingLeadsListPage />} />
          </Route>

          {/* Admin Routes - chỉ super_admin */}
          <Route path="/admin" element={
            <AdminRoute>
              <MainLayout />
            </AdminRoute>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="members" element={<AdminMembersPage />} />
            <Route path="plans" element={<AdminPlansPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
          </Route>

          {/* 404 - Nếu gõ sai thì quay về trang chủ Landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      {createPortal(<div id="modal-root"></div>, document.body)}
    </>
  );
}

export default App;
