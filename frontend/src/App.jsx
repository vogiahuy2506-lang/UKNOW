import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import { Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { isPrimaryAppHostname } from './utils/isPrimaryAppHost.js';
import { lazyWithRetry } from './utils/lazyWithRetry.js';
import { useI18n, I18nProvider } from './i18n';
import RouteAnalytics from './components/RouteAnalytics';
import ReferralCapture from './components/ReferralCapture';
import PostAuthGateModals from './features/auth/components/PostAuthGateModals';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import CheckoutLayout from './layouts/CheckoutLayout';
import { PublicLayoutLite } from './layouts/PublicLayout';
import PolicyLayout from './layouts/PolicyLayout';
import HelpDocsRoute from './layouts/HelpDocsRoute';

// Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
const AiHomePage = lazyWithRetry(() => import('./pages/AiHomePage'));
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Campaigns = lazyWithRetry(() => import('./pages/campaigns/Campaigns'));
const CampaignBuilder = lazyWithRetry(() => import('./pages/campaigns/CampaignBuilder'));
const QuickSend = lazyWithRetry(() => import('./pages/campaigns/QuickSend'));
const Customers = lazyWithRetry(() => import('./pages/customers/Customers'));
const CampaignCustomers = lazyWithRetry(() => import('./pages/customers/CampaignCustomers'));
const ChannelSettings = lazyWithRetry(() => import('./pages/settings/ChannelSettings'));
const EmployeeManagement = lazyWithRetry(() => import('./pages/settings/EmployeeManagement'));
const LandingFeaturedCoursesPage = lazyWithRetry(() => import('./pages/settings/LandingFeaturedCoursesPage'));
const LandingTestimonialsPage = lazyWithRetry(() => import('./pages/settings/LandingTestimonialsPage'));
const LandingPagesAdminPage = lazyWithRetry(() => import('./pages/settings/LandingPagesAdminPage'));
const LandingCanvasPage = lazyWithRetry(() => import('./features/landing-canvas/pages/LandingCanvasPage.jsx'));
const BusinessProfilePage = lazyWithRetry(() => import('./pages/settings/BusinessProfilePage'));
const InboxOutboxPage = lazyWithRetry(() => import('./pages/settings/InboxOutboxPage'));
const MediaLibraryPage = lazyWithRetry(() => import('./pages/settings/MediaLibraryPage'));
const ChatbotStudioPage = lazyWithRetry(() => import('./pages/studio/ChatbotStudioPage'));
const ChannelTemplates = lazyWithRetry(() => import('./pages/templates/ChannelTemplates'));
const Courses = lazyWithRetry(() => import('./pages/courses/Courses'));
const Products = lazyWithRetry(() => import('./pages/products/Products'));
const Orders = lazyWithRetry(() => import('./pages/orders/Orders'));
const TopupPage = lazyWithRetry(() => import('./pages/billing/TopupPage'));
const BillingHubPage = lazyWithRetry(() => import('./pages/billing/BillingHubPage'));
const LandingLeadsListPage = lazyWithRetry(() => import('./pages/landing-leads/LandingLeadsListPage'));
const PublicDataPolicyPage = lazyWithRetry(() => import('./pages/public/PublicDataPolicyPage'));
const PublicDPA = lazyWithRetry(() => import('./pages/public/PublicDPA'));
const TermsOfService = lazyWithRetry(() => import('./pages/public/TermsOfService'));
const PricingPolicy = lazyWithRetry(() => import('./pages/public/PricingPolicy'));
const PaymentPolicy = lazyWithRetry(() => import('./pages/public/PaymentPolicy'));
const ComplaintPolicy = lazyWithRetry(() => import('./pages/public/ComplaintPolicy'));
const RefundPolicy = lazyWithRetry(() => import('./pages/public/RefundPolicy'));
const ServiceTerms = lazyWithRetry(() => import('./pages/public/ServiceTerms'));
const ServiceDeliveryPolicy = lazyWithRetry(() => import('./pages/public/ServiceDeliveryPolicy'));
const Support = lazyWithRetry(() => import('./pages/public/Support'));
const RightsAndDuties = lazyWithRetry(() => import('./pages/public/RightsAndDuties'));
import PolicyArchivedVersionPage from './pages/public/PolicyArchivedVersionPage';
const TrialDemoPage = lazyWithRetry(() => import('./pages/public/TrialDemoPage'));
const HeroPage = lazyWithRetry(() => import('./pages/public/HeroPage'));
const PricingPage = lazyWithRetry(() => import('./pages/public/PricingPage'));
const ContactPage = lazyWithRetry(() => import('./pages/public/ContactPage'));
const HelpIndexPage = lazyWithRetry(() => import('./pages/docs/HelpIndexPage'));
const HelpArticlePage = lazyWithRetry(() => import('./pages/docs/HelpArticlePage'));
import LandingHtmlModeGate from './features/landing-customizer/components/LandingHtmlModeGate.jsx';
const LpRendererPage = lazyWithRetry(() => import('./pages/public/LpRendererPage'));
const LpRendererByHost = lazyWithRetry(() => import('./pages/public/LpRendererByHost.jsx'));
// @deprecated Lớp tương thích cho landing page CŨ còn <iframe src="/embed/lead-form?...">
// (khôi phục từ 50c05cd2 sau khi 3c514bc8 xoá — trang mới dùng founderai-capture.js). Gỡ
// sau khi các trang cũ được lưu lại.
const EmbedLeadFormPage = lazyWithRetry(() => import('./pages/public/EmbedLeadFormPage'));
const PublicChatbotPage = lazyWithRetry(() => import('./pages/public/PublicChatbotPage'));
const PublicFormPage = lazyWithRetry(() => import('./features/forms/pages/PublicFormPage'));
const FormSubmissionStatusPage = lazyWithRetry(() => import('./features/forms/pages/FormSubmissionStatusPage'));
const FormsListPage = lazyWithRetry(() => import('./features/forms/pages/FormsListPage'));
const FormEditorPage = lazyWithRetry(() => import('./features/forms/pages/FormEditorPage'));
const FormSubmissionsPage = lazyWithRetry(() => import('./features/forms/pages/FormSubmissionsPage'));
const LearningPage = lazyWithRetry(() => import('./pages/learning/LearningPage'));
const CheckoutPage = lazyWithRetry(() => import('./pages/checkout/CheckoutPage'));
const PaymentSuccessPage = lazyWithRetry(() => import('./pages/checkout/PaymentSuccess'));
const InvoicePage = lazyWithRetry(() => import('./pages/invoices/InvoicePage'));
const AdminDashboard = lazyWithRetry(() => import('./pages/admin/AdminDashboard'));
const AdminMembersPage = lazyWithRetry(() => import('./pages/admin/AdminMembersPage'));
const AdminPlansPage = lazyWithRetry(() => import('./pages/admin/AdminPlansPage'));
const AdminOrdersPage = lazyWithRetry(() => import('./pages/admin/AdminOrdersPage'));
const AdminFormsPage = lazyWithRetry(() => import('./pages/admin/AdminFormsPage'));
const AdminEinvoicesPage = lazyWithRetry(() => import('./pages/admin/AdminEinvoicesPage'));
const AdminVouchersPage = lazyWithRetry(() => import('./pages/admin/AdminVouchersPage'));
const AdminSystemPage = lazyWithRetry(() => import('./pages/admin/AdminSystemPage'));
const AdminDeliveryMonitorPage = lazyWithRetry(() => import('./pages/admin/AdminDeliveryMonitorPage'));
const AdminAiUsagePage = lazyWithRetry(() => import('./pages/admin/AdminAiUsagePage'));
const AdminAiModelsPage = lazyWithRetry(() => import('./pages/admin/AdminAiModelsPage'));
const AdminHelpArticlesPage = lazyWithRetry(() => import('./pages/admin/AdminHelpArticlesPage'));
const AdminHelpArticleEditPage = lazyWithRetry(() => import('./pages/admin/AdminHelpArticleEditPage'));
const AdminHelpUnansweredPage = lazyWithRetry(() => import('./pages/admin/AdminHelpUnansweredPage'));
const AdminMenuCategoriesPage = lazyWithRetry(() => import('./pages/admin/AdminMenuCategoriesPage'));
const AdminWelcomeEmailPage = lazyWithRetry(() => import('./pages/admin/AdminWelcomeEmailPage'));
const AdminAlertsPage = lazyWithRetry(() => import('./pages/admin/AdminAlertsPage'));
const AdminFunnelPage = lazyWithRetry(() => import('./pages/admin/AdminFunnelPage'));
const AdminSystemHealthPage = lazyWithRetry(() => import('./pages/admin/AdminSystemHealthPage'));
const AdminCronStatusPanel = lazyWithRetry(() => import('./pages/admin/AdminCronStatusPanel'));
const AdminAiOpsPage = lazyWithRetry(() => import('./pages/admin/AdminAiOpsPage'));
const DiagnosticPage = lazyWithRetry(() => import('./pages/admin/DiagnosticPage'));
const NotificationCenter = lazyWithRetry(() => import('./pages/admin/NotificationCenter'));
const AdminAuditLogsPage = lazyWithRetry(() => import('./pages/admin/AdminAuditLogsPage'));
const LandingPageCustomizer = lazyWithRetry(() => import('./pages/superadmin/LandingPageCustomizer'));
const AuditLogsPage = lazyWithRetry(() => import('./pages/settings/AuditLogsPage'));
const UserDeliveryMonitorPage = lazyWithRetry(() => import('./pages/campaigns/UserDeliveryMonitorPage'));
const NotificationsPage = lazyWithRetry(() => import('./pages/notifications/NotificationsPage'));
const NotificationPreferencesPage = lazyWithRetry(() => import('./pages/settings/NotificationPreferencesPage'));
import UnauthorizedScreen from './pages/auth/UnauthorizedScreen';
import LoadingScreen from './components/LoadingScreen';
import ProtectedRoute from './components/routes/ProtectedRoute';
import PermissionRoute from './components/routes/PermissionRoute';
const ActivatePage = lazyWithRetry(() => import('./pages/auth/ActivatePage'));
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazyWithRetry(() => import('./pages/auth/ResetPasswordPage'));
const Marketplace = lazyWithRetry(() => import('./pages/marketplace/Marketplace'));
import { MarketplaceModalProvider } from './contexts/MarketplaceModalProvider';
import { useMarketplaceModal } from './contexts/useMarketplaceModal';
import MarketplaceModal from './components/marketplace/MarketplaceModal';
const MarketplaceListingRedirect = lazyWithRetry(() => import('./pages/marketplace/MarketplaceListingRedirect'));
const MarketplaceCreateRedirect = lazyWithRetry(() => import('./pages/marketplace/MarketplaceCreateRedirect'));
const AdminMarketplace = lazyWithRetry(() => import('./pages/marketplace/AdminMarketplace'));
const MarketplaceAnalytics = lazyWithRetry(() => import('./pages/marketplace/MarketplaceAnalytics'));
const ListingSettings = lazyWithRetry(() => import('./pages/marketplace/ListingSettings'));
const SellerDashboard = lazyWithRetry(() => import('./pages/marketplace/SellerDashboard'));
const AffiliatePage = lazyWithRetry(() => import('./pages/affiliate/AffiliatePage'));
const AdminAffiliatePage = lazyWithRetry(() => import('./pages/admin/AdminAffiliatePage'));
import { getPostAuthPath } from './utils/authRedirect';

// Chỉ self context (user_admin) được vào — employee context thấy màn hình unauthorized
const OwnerRoute = ({ children }) => {
  const { activeContext } = useAuthStore();
  if (activeContext?.type === 'employee') return <UnauthorizedScreen />;
  return children;
};

// Gác route bằng cờ tính năng (Feature flag)
const FeatureFlagRoute = ({ flag, children }) => {
  if (import.meta.env[flag] !== 'true') return <UnauthorizedScreen />;
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

// Modal phải nằm trong <Router> để MarketplaceContent (dùng useNavigate) hoạt động.
const MarketplaceModalRoot = () => {
  const {
    open,
    selectedListingId,
    selectedMyListingId,
    activeTab,
    hideMarketplace,
    onSelectListing,
    onSelectMyListing,
    onTabChange,
    showCreateForm,
    onCreateSuccess,
    showCreateListingForm,
  } = useMarketplaceModal();
  return (
    <MarketplaceModal
      open={open}
      onClose={hideMarketplace}
      // Tab "Khám phá" - chi tiết public
      selectedListingId={selectedListingId}
      onSelectListing={onSelectListing}
      // Tab "Của tôi" - settings template
      selectedMyListingId={selectedMyListingId}
      onSelectMyListing={onSelectMyListing}
      activeTab={activeTab}
      onTabChange={onTabChange}
      showCreateForm={showCreateForm}
      onCreateSuccess={onCreateSuccess}
      onShowCreateForm={showCreateListingForm}
    />
  );
};

function AppContent() {
  const { t } = useI18n();
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
        <Suspense fallback={<LoadingScreen />}>
          <LpRendererByHost />
        </Suspense>
        {createPortal(<div id="modal-root"></div>, document.body)}
      </>
    );
  }

  return (
    <>
      <MarketplaceModalProvider>
        <Router>
          <RouteAnalytics />
          <ReferralCapture />
          <PostAuthGateModals />
          {toaster}
          {/* Một Suspense bọc toàn bộ route lazy; trong khung app MainLayout có Suspense riêng ở chỗ
              <Outlet /> để đổi trang không nháy mất sidebar/header. */}
          <Suspense fallback={<LoadingScreen />}>
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
          <Route
            path="/"
            element={(
              <LandingHtmlModeGate page="hero" title="Founder AI">
                <HeroPage />
              </LandingHtmlModeGate>
            )}
          />

          {/* Trial Demo Page — standalone page, no layout */}
          <Route path="/trial-demo" element={<TrialDemoPage />} />

          {/* Public pages — pricing dùng video bg, contact dùng lite */}
          <Route element={<PublicLayoutLite />}>
            <Route
              path="/pricing"
              element={(
                <LandingHtmlModeGate page="pricing" title={t('app.pageTitle.pricing')}>
                  <PricingPage />
                </LandingHtmlModeGate>
              )}
            />
            <Route
              path="/contact"
              element={(
                <LandingHtmlModeGate page="contact" title={t('app.pageTitle.contact')}>
                  <ContactPage />
                </LandingHtmlModeGate>
              )}
            />
          </Route>

          {/* Trung tâm hướng dẫn — đã đăng nhập thì chạy trong khung app (giữ menu chính),
              chưa đăng nhập thì layout công khai như cũ. Xem HelpDocsRoute.jsx. */}
          <Route path="/huong-dan" element={<HelpDocsRoute />}>
            <Route index element={<HelpIndexPage />} />
            <Route path=":slug" element={<HelpArticlePage />} />
          </Route>

          {/* Thanh toán — video background, không có navbar/footer */}
          <Route path="/checkout" element={<CheckoutLayout><CheckoutPage /></CheckoutLayout>} />
          <Route path="/payment-success" element={<CheckoutLayout><PaymentSuccessPage /></CheckoutLayout>} />
          <Route
            path="/invoices/:orderCode"
            element={(
              <ProtectedRoute>
                <CheckoutLayout><InvoicePage /></CheckoutLayout>
              </ProtectedRoute>
            )}
          />

          {/* Policy Routes — không có Navbar, có header tự thiết kế */}
          <Route element={<PolicyLayout />}>
            <Route path="/privacy-policy" element={<PublicDataPolicyPage />} />
            <Route path="/privacy-policy/" element={<PublicDataPolicyPage />} />
            <Route path="/public-dpa" element={<PublicDPA />} />
            <Route path="/public-dpa/" element={<PublicDPA />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/terms/" element={<TermsOfService />} />
            <Route path="/pricing-policy" element={<PricingPolicy />} />
            <Route path="/pricing-policy/" element={<PricingPolicy />} />
            <Route path="/payment-policy" element={<PaymentPolicy />} />
            <Route path="/payment-policy/" element={<PaymentPolicy />} />
            <Route path="/complaint-policy" element={<ComplaintPolicy />} />
            <Route path="/complaint-policy/" element={<ComplaintPolicy />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/refund-policy/" element={<RefundPolicy />} />
            <Route path="/service-terms" element={<ServiceTerms />} />
            <Route path="/service-terms/" element={<ServiceTerms />} />
            <Route path="/service-delivery-policy" element={<ServiceDeliveryPolicy />} />
            <Route path="/service-delivery-policy/" element={<ServiceDeliveryPolicy />} />
            <Route path="/rights-and-duties" element={<RightsAndDuties />} />
            <Route path="/rights-and-duties/" element={<RightsAndDuties />} />
            <Route path="/support" element={<Support />} />
            <Route path="/support/" element={<Support />} />
            <Route path="/policy-versions/:slug/:date" element={<PolicyArchivedVersionPage />} />
          </Route>

          {/* Kích hoạt tài khoản nhân viên qua link email */}
          <Route path="/activate" element={<AuthLayout><ActivatePage /></AuthLayout>} />

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
          {/* @deprecated compat cho trang cũ còn iframe /embed/lead-form — gỡ sau khi trang cũ được lưu lại */}
          <Route path="/embed/lead-form" element={<EmbedLeadFormPage />} />
          <Route path="/chat/:chatbotId" element={<PublicChatbotPage />} />
          <Route path="/f/:publicKey" element={<PublicFormPage />} />
          <Route path="/f/:publicKey/s/:accessToken" element={<FormSubmissionStatusPage />} />
          <Route path="/learning" element={<LearningPage />} />

          {/* Protected Routes - prefix /app */}
          <Route path="/app" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<AiHomePage />} />
            <Route path="reports" element={<PermissionRoute permission="reports_view"><Dashboard /></PermissionRoute>} />

            {/* Campaigns */}
            <Route path="campaigns" element={<PermissionRoute permission="campaigns_view"><Campaigns /></PermissionRoute>} />
            <Route path="campaigns/:id" element={<Navigate to="builder" replace />} />
            <Route path="campaigns/:id/builder" element={<PermissionRoute permission="campaigns_create"><CampaignBuilder /></PermissionRoute>} />
            <Route path="campaigns/new" element={<PermissionRoute permission="campaigns_create"><CampaignBuilder /></PermissionRoute>} />
            <Route path="campaign-run" element={<Navigate to="/app/campaigns?tab=schedules" replace />} />
            <Route path="quick-send" element={<PermissionRoute permission="campaigns_create"><QuickSend /></PermissionRoute>} />
            <Route path="delivery-monitor" element={<PermissionRoute permission="campaigns_view"><UserDeliveryMonitorPage /></PermissionRoute>} />

            {/* Customers */}
            <Route path="customers" element={<PermissionRoute permission="customers"><Customers /></PermissionRoute>} />
            <Route path="customers/:campaignId" element={<PermissionRoute permission="customers"><CampaignCustomers /></PermissionRoute>} />
            <Route path="customers/:campaignId/:customerId" element={<PermissionRoute permission="customers"><CampaignCustomers /></PermissionRoute>} />

            {/* Thông báo của CHÍNH người đăng nhập — mọi vai trò (kể cả nhân viên) vào được: KHÔNG bọc OwnerRoute/PermissionRoute */}
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings/notifications" element={<NotificationPreferencesPage />} />

            {/* Settings — owner only */}
            <Route path="settings/channels" element={<PermissionRoute permission={['email_settings', 'zalo_settings', 'chatbot_channels_manage']}><ChannelSettings /></PermissionRoute>} />
            <Route path="settings/employees" element={<OwnerRoute><EmployeeManagement /></OwnerRoute>} />
            <Route path="settings/audit-logs" element={<OwnerRoute><AuditLogsPage /></OwnerRoute>} />
            {/* Admin-only cluster: gác bằng cờ tính năng độc lập */}
            <Route path="settings/landing-featured-courses" element={<FeatureFlagRoute flag="VITE_FEATURE_LANDING_CMS"><OwnerRoute><LandingFeaturedCoursesPage /></OwnerRoute></FeatureFlagRoute>} />
            <Route path="settings/landing-testimonials" element={<FeatureFlagRoute flag="VITE_FEATURE_LANDING_CMS"><OwnerRoute><LandingTestimonialsPage /></OwnerRoute></FeatureFlagRoute>} />
            <Route path="settings/landing-pages" element={<PermissionRoute permission="landing_pages"><LandingPagesAdminPage /></PermissionRoute>} />
            <Route path="settings/landing-pages/new" element={<PermissionRoute permission="landing_pages"><LandingCanvasPage /></PermissionRoute>} />
            <Route path="settings/landing-pages/:id/edit" element={<PermissionRoute permission="landing_pages"><LandingCanvasPage /></PermissionRoute>} />
            <Route path="settings/ai-profile" element={<OwnerRoute><BusinessProfilePage /></OwnerRoute>} />
            <Route path="chatbot-studio" element={<PermissionRoute permission="chatbots_manage"><ChatbotStudioPage /></PermissionRoute>} />
            <Route path="settings/inbox" element={<PermissionRoute permission="inbox_view"><InboxOutboxPage /></PermissionRoute>} />
            <Route path="settings/media-library" element={<PermissionRoute permission="media_library_view"><MediaLibraryPage /></PermissionRoute>} />
            <Route path="orders" element={<FeatureFlagRoute flag="VITE_FEATURE_ORDERS"><OwnerRoute><Orders /></OwnerRoute></FeatureFlagRoute>} />
            <Route path="billing" element={<OwnerRoute><BillingHubPage /></OwnerRoute>} />
            <Route path="topup" element={<OwnerRoute><TopupPage /></OwnerRoute>} />
            <Route path="affiliate" element={<OwnerRoute><AffiliatePage /></OwnerRoute>} />

            {/* Settings — permission based (employee có thể vào nếu được cấp quyền) */}
            <Route path="settings/templates" element={<PermissionRoute permission={['email_templates', 'zalo_templates']}><ChannelTemplates /></PermissionRoute>} />

            {/* Redirect các route cũ */}
            <Route path="settings/email" element={<Navigate to="/app/settings/channels" replace />} />
            <Route path="settings/zalo" element={<Navigate to="/app/settings/channels" replace />} />
            <Route path="settings/email-templates" element={<Navigate to="/app/settings/templates" replace />} />
            <Route path="settings/zalo-templates" element={<Navigate to="/app/settings/templates" replace />} />
            <Route path="settings/knowledge-base" element={<Navigate to="/app/chatbot-studio" replace />} />
            <Route path="settings/sub-assistants" element={<Navigate to="/app/chatbot-studio" replace />} />
            <Route path="settings/chatbot-widget" element={<Navigate to="/app/chatbot-studio" replace />} />
            <Route path="settings/chatbot-channels" element={<Navigate to="/app/chatbot-studio" replace />} />

            {/* Courses */}
            <Route path="courses" element={<FeatureFlagRoute flag="VITE_FEATURE_COURSES"><PermissionRoute permission="courses"><Courses /></PermissionRoute></FeatureFlagRoute>} />
            <Route path="products" element={<FeatureFlagRoute flag="VITE_FEATURE_PRODUCTS"><PermissionRoute permission="courses"><Products /></PermissionRoute></FeatureFlagRoute>} />
            <Route path="landing-leads" element={<PermissionRoute permission="leads"><LandingLeadsListPage /></PermissionRoute>} />

            {/* Forms */}
            <Route path="forms" element={<PermissionRoute permission="forms"><FormsListPage /></PermissionRoute>} />
            <Route path="forms/new" element={<PermissionRoute permission="forms"><FormEditorPage /></PermissionRoute>} />
            <Route path="forms/:id/edit" element={<PermissionRoute permission="forms"><FormEditorPage /></PermissionRoute>} />
            <Route path="forms/:id/submissions" element={<PermissionRoute permission="forms"><FormSubmissionsPage /></PermissionRoute>} />

            {/* Marketplace - unified page with tabs */}
            <Route path="marketplace" element={<Marketplace />} />
            <Route path="marketplace/my" element={<Marketplace />} />
            <Route path="marketplace/my-purchases" element={<Marketplace />} />
            <Route path="marketplace/my-favorites" element={<Marketplace />} />
            <Route path="marketplace/create" element={<MarketplaceCreateRedirect />} />
            <Route path="marketplace/:id" element={<MarketplaceListingRedirect />} />
            <Route path="marketplace/listing/:id/settings" element={<ListingSettings />} />
            <Route path="marketplace/seller-dashboard" element={<SellerDashboard />} />
            <Route path="admin/marketplace" element={<AdminMarketplace />} />
            <Route path="admin/marketplace/analytics" element={<MarketplaceAnalytics />} />
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
            <Route path="forms" element={<AdminFormsPage />} />
            <Route path="einvoices" element={<AdminEinvoicesPage />} />
            <Route path="affiliate" element={<AdminAffiliatePage />} />
            <Route path="alerts" element={<AdminAlertsPage />} />
            <Route path="funnel" element={<AdminFunnelPage />} />
            <Route path="health" element={<AdminSystemHealthPage />}>
              <Route path="system" element={<AdminSystemPage />} />
              <Route path="delivery" element={<AdminDeliveryMonitorPage />} />
              <Route path="diagnostic" element={<DiagnosticPage />} />
              <Route path="cron" element={<AdminCronStatusPanel />} />
            </Route>
            <Route path="ai-ops" element={<AdminAiOpsPage />}>
              <Route path="usage" element={<AdminAiUsagePage />} />
              <Route path="unanswered" element={<AdminHelpUnansweredPage />} />
            </Route>
            <Route path="system" element={<Navigate to="/admin/health/system" replace />} />
            <Route path="delivery-monitor" element={<Navigate to="/admin/health/delivery" replace />} />
            <Route path="diagnostic" element={<Navigate to="/admin/health/diagnostic" replace />} />
            <Route path="ai-usage" element={<Navigate to="/admin/ai-ops/usage" replace />} />
            <Route path="help-unanswered" element={<Navigate to="/admin/ai-ops/unanswered" replace />} />
            <Route path="ai-models" element={<AdminAiModelsPage />} />
            <Route path="help-articles" element={<AdminHelpArticlesPage />} />
            <Route path="help-articles/:id" element={<AdminHelpArticleEditPage />} />
            <Route path="menu-categories" element={<AdminMenuCategoriesPage />} />
            <Route path="welcome-email" element={<AdminWelcomeEmailPage />} />
            <Route path="audit-logs" element={<AdminAuditLogsPage />} />
            <Route path="notification-center" element={<NotificationCenter />} />
            {/* Chuông thông báo của super admin: ProtectedRoute đá admin khỏi /app/*, nên cặp trang này có bản /admin riêng */}
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings/notifications" element={<NotificationPreferencesPage />} />
            <Route path="landing-customizer" element={<LandingPageCustomizer />} />
          </Route>

          {/* 404 - Nếu gõ sai thì quay về trang chủ Landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
          </Suspense>
        <MarketplaceModalRoot />
        </Router>
      </MarketplaceModalProvider>
      {createPortal(<div id="modal-root"></div>, document.body)}
    </>
  );
}

function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

export default App;
