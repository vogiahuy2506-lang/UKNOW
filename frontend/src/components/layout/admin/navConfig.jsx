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
  { key: 'welcome_email', name: t('nav.welcomeEmail'), defaultCategory: 'messaging', path: '/admin/welcome-email', icon: HiOutlineMail },
  { key: 'help_articles', name: t('nav.helpArticles'), defaultCategory: 'messaging', path: '/admin/help-articles', icon: HiOutlineDocumentText },
  { key: 'help_unanswered', name: t('nav.helpUnanswered'), defaultCategory: 'messaging', path: '/admin/ai-ops/unanswered', icon: HiOutlineQuestionMarkCircle },
  { key: 'system_audit_logs', name: t('nav.systemAuditLogs'), defaultCategory: 'monitoring', path: '/admin/audit-logs', icon: HiOutlineClipboard },
  { key: 'landing_customizer', name: t('nav.landingCustomizer'), defaultCategory: 'monitoring', path: '/admin/landing-customizer', icon: HiOutlinePencil },
  { key: 'menu_categories', name: t('nav.menuCategories'), defaultCategory: 'monitoring', path: '/admin/menu-categories', icon: HiOutlineCollection },
  { key: 'marketplace_management', name: t('nav.marketplaceManagement'), defaultCategory: 'marketplace', path: '/app/admin/marketplace', icon: HiOutlineShoppingCart },
  { key: 'marketplace_analytics', name: t('nav.marketplaceAnalytics'), defaultCategory: 'marketplace', path: '/app/admin/marketplace/analytics', icon: HiOutlineFilter },
];

// PR-1 (PLAN_MENU_CHUYEN_MUC_APP_2026-09-12) — làm phẳng từ cây hai tầng thành 24 mục lá có
// `key` ổn định + `defaultCategory`, để groupAppMenuItems (adminMenuLayout.js) dựng lại đúng
// cấu trúc nhóm hôm nay từ DEFAULT_APP_MENU_CATEGORIES. Mọi cổng permission/ownerOnly/flag/end
// giữ NGUYÊN giá trị so với cây cũ — đây là chỗ rủi ro nhất của PR (nhân viên thấy mục ngoài
// quyền nếu rơi mất một cổng).
export const userMenuItems = (t) => [
  { key: 'ai_assistant', name: t('nav.aiAssistant'), defaultCategory: 'main', path: '/app', icon: HiOutlineSparkles, end: true },
  { key: 'dashboard', name: t('nav.dashboard'), defaultCategory: 'main', path: '/app/reports', icon: HiOutlineHome },
  { key: 'chatbot_studio', name: t('nav.chatbotStudio'), defaultCategory: 'ai_chatbot', path: '/app/chatbot-studio', icon: HiOutlinePlus, ownerOnly: true },
  { key: 'inbox', name: t('nav.inbox'), defaultCategory: 'ai_chatbot', path: '/app/settings/inbox', icon: HiOutlineInbox, ownerOnly: true },
  { key: 'media_library', name: t('nav.mediaLibrary'), defaultCategory: 'ai_chatbot', path: '/app/settings/media-library', icon: HiOutlinePhotograph, ownerOnly: true },
  { key: 'quick_send', name: t('nav.quickSend'), defaultCategory: 'campaigns', path: '/app/quick-send', icon: HiOutlineMail, permission: ['campaigns_create'] },
  { key: 'channel_management', name: t('nav.channelManagement'), defaultCategory: 'campaigns', path: '/app/settings/channels', icon: HiOutlineMail, permission: ['email_settings', 'zalo_settings'] },
  { key: 'message_templates', name: t('nav.messageTemplates'), defaultCategory: 'campaigns', path: '/app/settings/templates', icon: HiOutlineTemplate, permission: ['email_templates', 'zalo_templates'] },
  { key: 'campaign_management', name: t('nav.campaignManagement'), defaultCategory: 'campaigns', path: '/app/campaigns', icon: HiOutlineViewList, permission: ['campaigns_view'], end: true },
  { key: 'run_campaign', name: t('nav.runCampaign'), defaultCategory: 'campaigns', path: '/app/campaign-run', icon: HiOutlineLightningBolt, permission: ['campaigns_run'] },
  { key: 'delivery_monitor', name: t('nav.deliveryMonitor'), defaultCategory: 'campaigns', path: '/app/delivery-monitor', icon: HiOutlineServer, permission: ['campaigns_view'] },
  { key: 'customers', name: t('nav.customers'), defaultCategory: 'campaigns', path: '/app/customers', icon: HiOutlineUsers, permission: ['customers'] },
  { key: 'lead_list', name: t('nav.leadList'), defaultCategory: 'landing_page', path: '/app/landing-leads', icon: HiOutlineUsers, permission: ['leads'] },
  { key: 'html_pages', name: t('nav.htmlPages'), defaultCategory: 'landing_page', path: '/app/settings/landing-pages', icon: HiOutlineGlobeAlt, permission: ['landing_pages'] },
  { key: 'featured_courses', name: t('nav.featuredCourses'), defaultCategory: 'admin_cluster', path: '/app/settings/landing-featured-courses', icon: HiOutlineStar, flag: 'VITE_FEATURE_LANDING_CMS', ownerOnly: true },
  { key: 'reviews', name: t('nav.reviews'), defaultCategory: 'admin_cluster', path: '/app/settings/landing-testimonials', icon: HiOutlineStar, flag: 'VITE_FEATURE_LANDING_CMS', ownerOnly: true },
  { key: 'course_management', name: t('nav.courseManagement'), defaultCategory: 'admin_cluster', path: '/app/courses', icon: HiOutlineAcademicCap, flag: 'VITE_FEATURE_COURSES' },
  { key: 'orders', name: t('nav.orders'), defaultCategory: 'admin_cluster', path: '/app/orders', icon: HiOutlineClipboardList, flag: 'VITE_FEATURE_ORDERS', ownerOnly: true },
  { key: 'billing_overview', name: t('nav.billingOverview'), defaultCategory: 'billing', path: '/app/billing', icon: HiOutlineClipboardList, ownerOnly: true },
  { key: 'buy_topup', name: t('nav.buyTopup'), defaultCategory: 'billing', path: '/app/topup', icon: HiOutlinePlusCircle, ownerOnly: true },
  { key: 'affiliate_program', name: t('nav.affiliateProgram'), defaultCategory: 'main', path: '/app/affiliate', icon: HiOutlineCurrencyDollar, ownerOnly: true },
  { key: 'business_profile', name: t('nav.businessProfile'), defaultCategory: 'settings', path: '/app/settings/ai-profile', icon: HiOutlineOfficeBuilding, ownerOnly: true },
  { key: 'employees', name: t('nav.employees'), defaultCategory: 'settings', path: '/app/settings/employees', icon: HiOutlineUserGroup, ownerOnly: true },
  { key: 'audit_logs', name: t('nav.auditLogs'), defaultCategory: 'settings', path: '/app/settings/audit-logs', icon: HiOutlineClipboard, ownerOnly: true },
];

export const AVATAR_STYLES = {
  admin: 'from-purple-500 to-violet-600',
  super_admin: 'from-purple-500 to-violet-600',
  user: 'from-orange-500 to-red-500',
};
