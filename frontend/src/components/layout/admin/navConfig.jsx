import {
  HiOutlineHome,
  HiOutlineLightningBolt,
  HiOutlineUsers,
  HiOutlineCog,
  HiOutlineMail,
  HiOutlineTemplate,
  HiOutlineViewList,
  HiOutlinePlus,
  HiOutlineAcademicCap,
  HiOutlineCube,
  HiOutlinePlusCircle,
  HiOutlineUserGroup,
  HiOutlineStar,
  HiOutlineGlobeAlt,
  HiOutlineCurrencyDollar,
  HiOutlineTicket,
  HiOutlineShieldCheck,
  HiOutlineOfficeBuilding,
  HiOutlineInbox,
  HiOutlinePhotograph,
  HiOutlineSparkles,
  HiOutlineServer,
  HiOutlineClipboard,
  HiOutlineClipboardList,
  HiOutlineMailOpen,
  HiOutlinePencil,
  HiOutlineDocumentText,
  HiOutlineQuestionMarkCircle,
  HiOutlineBell,
  HiOutlineFilter,
  HiOutlineShoppingCart,
  HiOutlineCollection,
} from 'react-icons/hi';

/**
 * Sidebar nav data — pulled out of Sidebar.jsx so the layout component
 * stays focused on rendering and the menu tree is easier to scan /
 * reorganise. Keys inside `name` / `section` come from the i18n catalog
 * (see src/i18n/*.js → nav.*). Permissions are checked against the active
 * employee context in the consumer.
 *
 * Each item accepts:
 *   name      — display label (i18n key resolved by caller)
 *   path      — react-router destination
 *   icon      — heroicon component
 *   end       — exact match only (NavLink)
 *   section   — group label for the super-admin sidebar
 *   children  — nested menu (collapsed by default)
 *   permission  — any-of permission keys for employee context
 *   ownerOnly   — hide entirely for employee context
 *   flag        — env var name; hide unless flag === 'true'
 *   action      — named action handled by SubmenuPanel (no path)
 *   hideInProd  — hide in production builds
 */

export const superAdminMenuItems = (t) => [
  { key: 'dashboard', name: t('nav.dashboard'), defaultCategory: 'overview', path: '/admin', icon: HiOutlineHome, end: true },
  { key: 'member_management', name: t('nav.memberManagement'), defaultCategory: 'business', path: '/admin/members', icon: HiOutlineShieldCheck },
  { key: 'plan_management', name: t('nav.planManagement'), defaultCategory: 'business', path: '/admin/plans', icon: HiOutlineCurrencyDollar },
  { key: 'voucher_management', name: t('nav.voucherManagement'), defaultCategory: 'business', path: '/admin/vouchers', icon: HiOutlineTicket },
  { key: 'orders', name: t('nav.orders'), defaultCategory: 'business', path: '/admin/orders', icon: HiOutlineClipboardList },
  { key: 'einvoices', name: t('nav.einvoices'), defaultCategory: 'business', path: '/admin/einvoices', icon: HiOutlineDocumentText },
  { key: 'affiliate_management', name: t('nav.affiliateManagement'), defaultCategory: 'business', path: '/admin/affiliate', icon: HiOutlineCurrencyDollar },
  { key: 'server_monitoring', name: t('nav.serverMonitoring'), defaultCategory: 'monitoring', path: '/admin/health/system', icon: HiOutlineServer },
  { key: 'alert_center', name: t('nav.alertCenter'), defaultCategory: 'monitoring', path: '/admin/alerts', icon: HiOutlineBell },
  { key: 'activation_funnel', name: t('nav.activationFunnel'), defaultCategory: 'overview', path: '/admin/funnel', icon: HiOutlineFilter },
  { key: 'ai_usage_analytics', name: t('nav.aiUsageAnalytics'), defaultCategory: 'messaging', path: '/admin/ai-ops/usage', icon: HiOutlineSparkles },
  { key: 'ai_models', name: t('nav.aiModels'), defaultCategory: 'messaging', path: '/admin/ai-models', icon: HiOutlineCog },
  { key: 'notification_center', name: t('nav.notificationCenter'), defaultCategory: 'messaging', path: '/admin/notification-center', icon: HiOutlineMailOpen },
  { key: 'help_articles', name: t('nav.helpArticles'), defaultCategory: 'messaging', path: '/admin/help-articles', icon: HiOutlineDocumentText },
  { key: 'help_unanswered', name: t('nav.helpUnanswered'), defaultCategory: 'messaging', path: '/admin/ai-ops/unanswered', icon: HiOutlineQuestionMarkCircle },
  { key: 'system_audit_logs', name: t('nav.systemAuditLogs'), defaultCategory: 'monitoring', path: '/admin/audit-logs', icon: HiOutlineClipboard },
  { key: 'landing_customizer', name: t('nav.landingCustomizer'), defaultCategory: 'monitoring', path: '/admin/landing-customizer', icon: HiOutlinePencil },
  { key: 'menu_categories', name: t('nav.menuCategories'), defaultCategory: 'monitoring', path: '/admin/menu-categories', icon: HiOutlineCollection },
  { key: 'marketplace_management', name: t('nav.marketplaceManagement'), defaultCategory: 'marketplace', path: '/app/admin/marketplace', icon: HiOutlineShoppingCart },
  { key: 'marketplace_analytics', name: t('nav.marketplaceAnalytics'), defaultCategory: 'marketplace', path: '/app/admin/marketplace/analytics', icon: HiOutlineFilter },
];

export const userMenuItems = (t) => [
  { name: t('nav.aiAssistant'), path: '/app', icon: HiOutlineSparkles, end: true },
  { name: t('nav.dashboard'), path: '/app/reports', icon: HiOutlineHome },
  {
    name: t('nav.aiChatbot'),
    icon: HiOutlineInbox,
    children: [
      { name: t('nav.chatbotStudio'), path: '/app/chatbot-studio', icon: HiOutlinePlus, ownerOnly: true },
      { name: t('nav.inbox'),          path: '/app/settings/inbox', icon: HiOutlineInbox, ownerOnly: true },
      { name: t('nav.mediaLibrary'),   path: '/app/settings/media-library', icon: HiOutlinePhotograph, ownerOnly: true },
    ],
  },
  {
    name: t('nav.campaigns'),
    icon: HiOutlineLightningBolt,
    permission: ['campaigns_view', 'campaigns_create', 'campaigns_run', 'customers', 'email_settings', 'zalo_settings', 'email_templates', 'zalo_templates'],
    children: [
      { name: t('nav.quickSend'),          path: '/app/quick-send',           icon: HiOutlineMail,         permission: ['campaigns_create'] },
      { name: t('nav.channelManagement'),  path: '/app/settings/channels',    icon: HiOutlineMail,         permission: ['email_settings', 'zalo_settings'] },
      { name: t('nav.messageTemplates'),   path: '/app/settings/templates',   icon: HiOutlineTemplate,     permission: ['email_templates', 'zalo_templates'] },
      { name: t('nav.campaignManagement'), path: '/app/campaigns',            icon: HiOutlineViewList,     permission: ['campaigns_view'], end: true },
      { name: t('nav.runCampaign'),        path: '/app/campaign-run',         icon: HiOutlineLightningBolt, permission: ['campaigns_run'] },
      { name: t('nav.deliveryMonitor'),    path: '/app/delivery-monitor',     icon: HiOutlineServer,       permission: ['campaigns_view'] },
      { name: t('nav.customers'),          path: '/app/customers',            icon: HiOutlineUsers,        permission: ['customers'] },
    ],
  },
  {
    name: t('nav.landingPage'),
    icon: HiOutlineGlobeAlt,
    children: [
      { name: t('nav.leadList'),   path: '/app/landing-leads',          icon: HiOutlineUsers,   permission: ['leads'] },
      { name: t('nav.htmlPages'),  path: '/app/settings/landing-pages', icon: HiOutlineGlobeAlt, permission: ['landing_pages'] },
    ],
  },
  {
    name: t('nav.adminOnlyCluster'),
    icon: HiOutlineCube,
    children: [
      { name: t('nav.featuredCourses'), path: '/app/settings/landing-featured-courses', icon: HiOutlineStar,         flag: 'VITE_FEATURE_LANDING_CMS', ownerOnly: true },
      { name: t('nav.reviews'),         path: '/app/settings/landing-testimonials',    icon: HiOutlineStar,         flag: 'VITE_FEATURE_LANDING_CMS', ownerOnly: true },
      { name: t('nav.courseManagement'), path: '/app/courses',                          icon: HiOutlineAcademicCap,  flag: 'VITE_FEATURE_COURSES' },
      { name: t('nav.orders'),          path: '/app/orders',                            icon: HiOutlineClipboardList, flag: 'VITE_FEATURE_ORDERS', ownerOnly: true },
    ],
  },
  {
    name: t('nav.billing'),
    icon: HiOutlineCurrencyDollar,
    children: [
      { name: t('nav.billingOverview'), path: '/app/billing', icon: HiOutlineClipboardList, ownerOnly: true },
      { name: t('nav.buyTopup'),        path: '/app/topup',   icon: HiOutlinePlusCircle,    ownerOnly: true },
    ],
  },
  {
    name: t('nav.affiliateProgram'),
    path: '/app/affiliate',
    icon: HiOutlineCurrencyDollar,
    ownerOnly: true,
  },
  {
    name: t('nav.settings'),
    icon: HiOutlineCog,
    children: [
      { name: t('nav.businessProfile'), path: '/app/settings/ai-profile',   icon: HiOutlineOfficeBuilding, ownerOnly: true },
      { name: t('nav.employees'),       path: '/app/settings/employees',    icon: HiOutlineUserGroup,       ownerOnly: true },
      { name: t('nav.auditLogs'),       path: '/app/settings/audit-logs',   icon: HiOutlineClipboard,       ownerOnly: true },
    ],
  },
];

export const AVATAR_STYLES = {
  admin: 'from-purple-500 to-violet-600',
  super_admin: 'from-purple-500 to-violet-600',
  user: 'from-orange-500 to-red-500',
};
