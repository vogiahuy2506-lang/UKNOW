import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { isPrimaryAppHostname } from './utils/isPrimaryAppHost.js';
import { useI18n } from './i18n';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import CheckoutLayout from './layouts/CheckoutLayout';
import LandingLayout from './layouts/LandingLayout';
import PublicLayout from './layouts/PublicLayout';

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
import InboxOutboxPage from './pages/settings/InboxOutboxPage';
import ChatbotStudioPage from './pages/studio/ChatbotStudioPage';
import ChannelTemplates from './pages/templates/ChannelTemplates';
import Courses from './pages/courses/Courses';
import Orders from './pages/orders/Orders';
import LandingLeadsListPage from './pages/landing-leads/LandingLeadsListPage';
import PublicDataPolicyPage from './pages/public/PublicDataPolicyPage';
import HeroPage from './pages/public/HeroPage';
import PricingPage from './pages/public/PricingPage';
import ContactPage from './pages/public/ContactPage';
import LpRendererPage from './pages/public/LpRendererPage';
import LpRendererByHost from './pages/public/LpRendererByHost.jsx';
import EmbedLeadFormPage from './pages/public/EmbedLeadFormPage';
import PublicChatbotPage from './pages/public/PublicChatbotPage';
import LearningPage from './pages/learning/LearningPage';
import CheckoutPage from './pages/checkout/CheckoutPage';
import PaymentSuccessPage from './pages/checkout/PaymentSuccess';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminMembersPage from './pages/admin/AdminMembersPage';
import AdminPlansPage from './pages/admin/AdminPlansPage';
import AdminOrdersPage from './pages/admin/AdminOrdersPage';
import AdminVouchersPage from './pages/admin/AdminVouchersPage';
import AdminSystemPage from './pages/admin/AdminSystemPage';
import AdminDeliveryMonitorPage from './pages/admin/AdminDeliveryMonitorPage';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage';
import AuditLogsPage from './pages/settings/AuditLogsPage';
import UserDeliveryMonitorPage from './pages/campaigns/UserDeliveryMonitorPage';
import UnauthorizedScreen from './pages/auth/UnauthorizedScreen';
import ActivatePage from './pages/auth/ActivatePage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import { getPostAuthPath } from './utils/authRedirect';

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

// Bảo vệ /app/* — yêu cầu đăng nhập + có gói
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user, activeContext } = useAuthStore();

  useEffect(() => {
    if (isLoading) {
      const timeout = setTimeout(() => {
        useAuthStore.setState({ isLoading: false, isAuthenticated: false });
      }, 15000);
      return () => clearTimeout(timeout);
    }
  }, [isLoading]);

  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  // Employee context: plan check dựa vào owner's plan (middleware đã xử lý server-side)
  // Frontend chỉ cần kiểm tra self context
  if (activeContext?.type === 'self' && !user?.active_plan_id) {
    return <Navigate to="/" replace />;
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

// Redirect nếu đã đăng nhập: super_admin → /admin, user có gói/employee → /app, user chưa có gói → /
const PublicRoute = ({ children }) => {
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
  if (isAuthenticated) {
    return <Navigate to={getPostAuthPath(user, activeContext)} replace />;
  }

  return children;
};

function App() {
  const toaster = (
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
  );

  if (typeof window !== 'undefined' && !isPrimaryAppHostname(window.location.hostname)) {
    return (
      <>
        {toaster}
        <LpRendererByHost />
        {createPortal(<div id="modal-root"></div>, document.body)}
      </>
    );
  }

  return (
    <>
      <Router>
        {toaster}
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

          {/* Trang chủ — fullscreen hero, không dùng LandingLayout */}
          <Route path="/" element={<HeroPage />} />

          {/* Public pages — dùng video background + HeroNavbar */}
          <Route element={<PublicLayout />}>
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/contact" element={<ContactPage />} />
          </Route>

          {/* Thanh toán — video background, không có navbar/footer */}
          <Route path="/checkout" element={<CheckoutLayout><CheckoutPage /></CheckoutLayout>} />
          <Route path="/payment-success" element={<CheckoutLayout><PaymentSuccessPage /></CheckoutLayout>} />

          {/* Landing Routes — legacy pages */}
          <Route element={<LandingLayout />}>
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
          <Route path="/chat/:chatbotId" element={<PublicChatbotPage />} />
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
            <Route path="delivery-monitor" element={<UserDeliveryMonitorPage />} />

            {/* Customers */}
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:campaignId" element={<CampaignCustomers />} />
            <Route path="customers/:campaignId/:customerId" element={<CampaignCustomers />} />

            {/* Settings — owner only */}
            <Route path="settings/channels" element={<PermissionRoute permission={['email_settings', 'zalo_settings']}><ChannelSettings /></PermissionRoute>} />
            <Route path="settings/employees" element={<OwnerRoute><EmployeeManagement /></OwnerRoute>} />
            <Route path="settings/audit-logs" element={<OwnerRoute><AuditLogsPage /></OwnerRoute>} />
            <Route path="settings/landing-featured-courses" element={<OwnerRoute><LandingFeaturedCoursesPage /></OwnerRoute>} />
            <Route path="settings/landing-testimonials" element={<OwnerRoute><LandingTestimonialsPage /></OwnerRoute>} />
            <Route path="settings/landing-pages" element={<OwnerRoute><LandingPagesAdminPage /></OwnerRoute>} />
            <Route path="settings/ai-profile" element={<OwnerRoute><BusinessProfilePage /></OwnerRoute>} />
            <Route path="chatbot-studio" element={<OwnerRoute><ChatbotStudioPage /></OwnerRoute>} />
            <Route path="settings/inbox" element={<OwnerRoute><InboxOutboxPage /></OwnerRoute>} />

            {/* Settings — permission based (employee có thể vào nếu được cấp quyền) */}
            <Route path="settings/templates" element={<ChannelTemplates />} />

            {/* Redirect các route cũ */}
            <Route path="settings/email" element={<Navigate to="/app/settings/channels" replace />} />
            <Route path="settings/zalo" element={<Navigate to="/app/settings/channels" replace />} />
            <Route path="settings/email-templates" element={<Navigate to="/app/settings/templates" replace />} />
            <Route path="settings/zalo-templates" element={<Navigate to="/app/settings/templates" replace />} />
            <Route path="settings/knowledge-base" element={<Navigate to="/app/chatbot-studio" replace />} />
            <Route path="settings/sub-assistants" element={<Navigate to="/app/chatbot-studio" replace />} />
            <Route path="settings/chatbot-widget" element={<Navigate to="/app/chatbot-studio" replace />} />
            <Route path="settings/chatbot-channels" element={<Navigate to="/app/chatbot-studio" replace />} />

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
            <Route path="vouchers" element={<AdminVouchersPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="system" element={<AdminSystemPage />} />
            <Route path="delivery-monitor" element={<AdminDeliveryMonitorPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
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
