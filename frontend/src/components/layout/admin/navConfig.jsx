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
  { name: t('nav.dashboard'),         section: t('nav.adminNavOverview'),    path: '/admin', icon: HiOutlineHome, end: true },
  { name: t('nav.memberManagement'),  section: t('nav.adminNavBusiness'),   path: '/admin/members', icon: HiOutlineShieldCheck },
  { name: t('nav.planManagement'),    section: t('nav.adminNavBusiness'),   path: '/admin/plans', icon: HiOutlineCurrencyDollar },
  { name: t('nav.voucherManagement'), section: t('nav.adminNavBusiness'),   path: '/admin/vouchers', icon: HiOutlineTicket },
  { name: t('nav.orders'),            section: t('nav.adminNavBusiness'),   path: '/admin/orders', icon: HiOutlineClipboardList },
  { name: t('nav.einvoices'),         section: t('nav.adminNavBusiness'),   path: '/admin/einvoices', icon: HiOutlineDocumentText },
  { name: t('nav.serverMonitoring'),  section: t('nav.adminNavMonitoring'), path: '/admin/health/system', icon: HiOutlineServer },
  { name: t('nav.alertCenter'),       section: t('nav.adminNavMonitoring'), path: '/admin/alerts', icon: HiOutlineBell },
  { name: t('nav.activationFunnel'),  section: t('nav.adminNavOverview'),    path: '/admin/funnel', icon: HiOutlineFilter },
  { name: t('nav.aiUsageAnalytics'),  section: t('nav.adminNavMessaging'),  path: '/admin/ai-ops/usage', icon: HiOutlineSparkles },
  { name: t('nav.aiModels'),          section: t('nav.adminNavMessaging'),  path: '/admin/ai-models', icon: HiOutlineCog },
  { name: t('nav.notificationCenter'), section: t('nav.adminNavMessaging'), path: '/admin/notification-center', icon: HiOutlineMailOpen },
  { name: t('nav.helpArticles'),      section: t('nav.adminNavMessaging'),  path: '/admin/help-articles', icon: HiOutlineDocumentText },
  { name: t('nav.helpUnanswered'),    section: t('nav.adminNavMessaging'),  path: '/admin/ai-ops/unanswered', icon: HiOutlineQuestionMarkCircle },
  { name: t('nav.systemAuditLogs'),   section: t('nav.adminNavMonitoring'), path: '/admin/audit-logs', icon: HiOutlineClipboard },
  { name: t('nav.landingCustomizer'), section: t('nav.adminNavMonitoring'), path: '/admin/landing-customizer', icon: HiOutlinePencil },
  { name: t('nav.marketplaceManagement'), section: t('nav.adminNavMarketplace'), path: '/app/admin/marketplace', icon: HiOutlineShoppingCart },
  { name: t('nav.marketplaceAnalytics'),  section: t('nav.adminNavMarketplace'), path: '/app/admin/marketplace/analytics', icon: HiOutlineFilter },
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
