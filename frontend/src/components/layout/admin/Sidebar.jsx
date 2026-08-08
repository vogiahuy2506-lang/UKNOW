import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { useScrollPersistence } from '../../../hooks/useScrollPersistence';
import { useI18n } from '../../../i18n';
import {
  HiOutlineHome,
  HiOutlineLightningBolt,
  HiOutlineUsers,
  HiOutlineCog,
  HiOutlineMail,
  HiOutlineTemplate,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineViewList,
  HiOutlinePlus,
  HiOutlineAcademicCap,
  HiOutlineCube,
  HiOutlineX,
  HiOutlineClipboardList,
  HiOutlineUserGroup,
  HiOutlineStar,
  HiOutlineGlobeAlt,
  HiOutlineCurrencyDollar,
  HiOutlineTicket,
  HiOutlineShieldCheck,
  HiOutlineOfficeBuilding,
  HiOutlineInbox,
  HiOutlineSparkles,
  HiOutlineServer,
  HiOutlineClipboard,
  HiOutlineMailOpen,
  HiOutlinePencil,
  HiOutlineDocumentText,
  HiOutlineQuestionMarkCircle,
  HiOutlineBell,
  HiOutlineFilter,
  HiOutlineShoppingCart,
} from 'react-icons/hi';

const AVATAR_STYLES = {
  admin: 'from-purple-500 to-violet-600',
  super_admin: 'from-purple-500 to-violet-600',
  user: 'from-orange-500 to-red-500',
};

// ── Menu data ────────────────────────────────────────────────────────────────

const superAdminMenuItems = (t) => [
  { name: t('nav.dashboard'), section: t('nav.adminNavOverview'), path: '/admin', icon: HiOutlineHome, end: true },
  { name: t('nav.memberManagement'), section: t('nav.adminNavBusiness'), path: '/admin/members', icon: HiOutlineShieldCheck },
  { name: t('nav.planManagement'), section: t('nav.adminNavBusiness'), path: '/admin/plans', icon: HiOutlineCurrencyDollar },
  { name: t('nav.voucherManagement'), section: t('nav.adminNavBusiness'), path: '/admin/vouchers', icon: HiOutlineTicket },
  { name: t('nav.orders'), section: t('nav.adminNavBusiness'), path: '/admin/orders', icon: HiOutlineClipboardList },
  { name: t('nav.serverMonitoring'), section: t('nav.adminNavMonitoring'), path: '/admin/health/system', icon: HiOutlineServer },
  { name: t('nav.alertCenter'), section: t('nav.adminNavMonitoring'), path: '/admin/alerts', icon: HiOutlineBell },
  { name: t('nav.activationFunnel'), section: t('nav.adminNavOverview'), path: '/admin/funnel', icon: HiOutlineFilter },
  { name: t('nav.aiUsageAnalytics'), section: t('nav.adminNavMessaging'), path: '/admin/ai-ops/usage', icon: HiOutlineSparkles },
  { name: t('nav.aiModels'), section: t('nav.adminNavMessaging'), path: '/admin/ai-models', icon: HiOutlineCog },
  { name: t('nav.notificationCenter'), section: t('nav.adminNavMessaging'), path: '/admin/notification-center', icon: HiOutlineMailOpen },
  { name: t('nav.helpArticles'), section: t('nav.adminNavMessaging'), path: '/admin/help-articles', icon: HiOutlineDocumentText },
  { name: t('nav.helpUnanswered'), section: t('nav.adminNavMessaging'), path: '/admin/ai-ops/unanswered', icon: HiOutlineQuestionMarkCircle },
  { name: t('nav.systemAuditLogs'), section: t('nav.adminNavMonitoring'), path: '/admin/audit-logs', icon: HiOutlineClipboard },
  { name: t('nav.landingCustomizer'), section: t('nav.adminNavMonitoring'), path: '/admin/landing-customizer', icon: HiOutlinePencil },
  { name: t('nav.marketplaceManagement'), section: t('nav.adminNavMarketplace'), path: '/app/admin/marketplace', icon: HiOutlineShoppingCart },
  { name: t('nav.marketplaceAnalytics'), section: t('nav.adminNavMarketplace'), path: '/app/admin/marketplace/analytics', icon: HiOutlineFilter },
];

const userMenuItems = (t) => [
  { name: t('nav.aiAssistant'), path: '/app', icon: HiOutlineSparkles, end: true },
  { name: t('nav.dashboard'), path: '/app/reports', icon: HiOutlineHome },
  {
    name: t('nav.aiChatbot'), icon: HiOutlineInbox,
    children: [
      { name: t('nav.chatbotStudio'), path: '/app/chatbot-studio', icon: HiOutlinePlus },
      { name: t('nav.inbox'), path: '/app/settings/inbox', icon: HiOutlineInbox },
    ],
  },
  {
    name: t('nav.campaigns'), icon: HiOutlineLightningBolt,
    permission: ['campaigns_view', 'campaigns_create', 'campaigns_run', 'customers', 'email_settings', 'zalo_settings', 'email_templates', 'zalo_templates'],
    children: [
      { name: t('nav.quickSend'), path: '/app/quick-send', icon: HiOutlineMail, permission: ['campaigns_create'] },
      { name: t('nav.channelManagement'), path: '/app/settings/channels', icon: HiOutlineMail, permission: ['email_settings', 'zalo_settings'] },
      { name: t('nav.messageTemplates'), path: '/app/settings/templates', icon: HiOutlineTemplate, permission: ['email_templates', 'zalo_templates'] },
      { name: t('nav.campaignManagement'), path: '/app/campaigns', end: true, icon: HiOutlineViewList, permission: ['campaigns_view'] },
      { name: t('nav.runCampaign'), path: '/app/campaign-run', icon: HiOutlineLightningBolt, permission: ['campaigns_run'] },
      { name: t('nav.deliveryMonitor'), path: '/app/delivery-monitor', icon: HiOutlineServer, permission: ['campaigns_view'] },
      { name: t('nav.customers'), path: '/app/customers', icon: HiOutlineUsers, permission: ['customers'] },
    ],
  },
  {
    name: t('nav.landingPage'), icon: HiOutlineGlobeAlt,
    children: [
      { name: t('nav.leadList'), path: '/app/landing-leads', icon: HiOutlineUsers, permission: ['leads'] },
      { name: t('nav.htmlPages'), path: '/app/settings/landing-pages', icon: HiOutlineGlobeAlt, permission: ['landing_pages'] },
    ],
  },
  {
    name: t('nav.adminOnlyCluster'), icon: HiOutlineCube, adminUsernameOnly: true,
    children: [
      { name: t('nav.featuredProducts'), path: '/app/settings/landing-featured-courses', icon: HiOutlineStar },
      { name: t('nav.reviews'), path: '/app/settings/landing-testimonials', icon: HiOutlineStar },
      { name: t('nav.courseManagement'), path: '/app/courses', icon: HiOutlineAcademicCap },
      { name: t('nav.orders'), path: '/app/orders', icon: HiOutlineClipboardList },
    ],
  },
  {
    name: t('nav.settings'), icon: HiOutlineCog,
    children: [
      { name: t('nav.businessProfile'), path: '/app/settings/ai-profile', icon: HiOutlineOfficeBuilding, ownerOnly: true },
      { name: t('nav.employees'), path: '/app/settings/employees', icon: HiOutlineUserGroup, ownerOnly: true },
      { name: t('nav.auditLogs'), path: '/app/settings/audit-logs', icon: HiOutlineClipboard, ownerOnly: true },
    ],
  },
];

// ── Floating Submenu Panel (for collapsed sidebar) ──────────────────────────

function SubmenuPanel({ item, onClose }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const isBuilderPage = location.pathname.includes('/app/campaigns/') && location.pathname.includes('/builder');

  const getActiveChild = (child) => {
    if (child.path === '/app/campaigns/new') {
      return isBuilderPage || location.pathname === '/app/campaigns/new';
    }
    if (child.end) return location.pathname === child.path;
    return location.pathname === child.path || location.pathname.startsWith(child.path + '/');
  };

  const handleAction = (child) => {
    if (child.action === 'openCreateCampaignModal') {
      navigate('/app/campaigns', { state: { openCreateCampaignModal: true } });
    } else if (child.action === 'openCreateEmployeeModal') {
      navigate('/app/settings/employees', { state: { openCreateEmployeeModal: true } });
    } else if (child.path) {
      navigate(child.path);
    }
    onClose();
  };

  return (
    <div className="fixed left-[44px] w-56 bg-white shadow-2xl z-50 flex flex-col rounded-r-2xl border border-gray-200 border-l-0"
      style={{ top: 44, height: 'calc(100vh - 44px)' }}>
      <div className="h-12 flex items-center px-4 shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors mr-2 -ml-2">
          <HiOutlineChevronRight className="w-4 h-4 text-gray-400 rotate-180" />
        </button>
        <span className="text-[13px] font-bold text-gray-900">{item.name}</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2">
        <div className="flex flex-col gap-1">
          {item.children.map((child) => {
            const isActive = getActiveChild(child);
            const displayName = child.path === '/app/campaigns/new' && isBuilderPage && location.pathname !== '/app/campaigns/new'
              ? t('sidebar.editCampaign')
              : child.name;
            const baseClass = `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all ${
              isActive ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`;

            if (child.action) {
              return (
                <button key={child.path} type="button" onClick={() => handleAction(child)} className={baseClass}>
                  {child.icon && <child.icon className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span>{displayName}</span>
                </button>
              );
            }

            return (
              <NavLink
                key={child.path}
                to={child.path}
                end={child.end}
                onClick={onClose}
                className={() => baseClass}
              >
                {child.icon && <child.icon className="w-4 h-4 text-gray-400 shrink-0" />}
                <span>{displayName}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ── Sidebar Component ───────────────────────────────────────────────────────

const Sidebar = ({ isOpen, isMobile, onClose, onToggle, topOffset = 0 }) => {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  useScrollPersistence('founder_sidebar_scroll', navRef);

  const { user, activeContext } = useAuthStore();
  const isSuperAdmin = user?.role === 'admin';
  const isAdminUsername = user?.username?.toLowerCase() === 'admin';
  const menuItems = isSuperAdmin ? superAdminMenuItems(t) : userMenuItems(t);
  const isEmployeeCtx = activeContext?.type === 'employee';
  const ctxPermissions = activeContext?.permissions || {};

  const [activeSubmenu, setActiveSubmenu] = useState(null);

  useEffect(() => { setActiveSubmenu(null); }, [location.pathname]);

  const handleNavClose = () => {
    setActiveSubmenu(null);
    if (isMobile && onClose) onClose();
  };

  const isDesktopExpanded = !isMobile && isOpen;

  const filterItem = (item) => {
    if (item.hideInProd && import.meta.env.MODE === 'production') return false;
    if (item.ownerOnly && isEmployeeCtx) return false;
    if (item.adminUsernameOnly) {
      if (isAdminUsername) return true;
      const ownerUsername = activeContext?.owner?.username?.toLowerCase();
      return ownerUsername === 'admin';
    }
    if (item.permission && isEmployeeCtx) {
      return item.permission.some((p) => ctxPermissions[p] === true);
    }
    return true;
  };

  const visibleMenuItems = menuItems
    .map((item) => {
      if (!item.children) return item;
      return { ...item, children: item.children.filter(filterItem) };
    })
    .filter((item) => filterItem(item) && (!item.children || item.children.length > 0));

  const isParentActive = (item) => {
    if (!item.children) return false;
    return item.children.some((child) => {
      if (child.end) return location.pathname === child.path;
      return location.pathname === child.path || location.pathname.startsWith(child.path + '/');
    }) || (item.name === t('nav.campaigns') && location.pathname.includes('/app/campaigns/') && location.pathname.includes('/builder'));
  };

  const handleParentClick = (item) => {
    if (!item.children) {
      navigate(item.path);
      handleNavClose();
      return;
    }
    setActiveSubmenu(activeSubmenu?.name === item.name ? null : item);
  };

  const avatarGradient = AVATAR_STYLES[user?.role] || AVATAR_STYLES['user'];
  const avatarInitial = (user?.fullName?.[0] || user?.username?.[0] || 'U').toUpperCase();

  const renderChildItems = (children) => {
    return children.map((child) => {
      const isBuilderPage = location.pathname.includes('/app/campaigns/') && location.pathname.includes('/builder');
      const isActiveChild = child.path === '/app/campaigns/new'
        ? isBuilderPage || location.pathname === '/app/campaigns/new'
        : (child.end ? location.pathname === child.path : location.pathname === child.path || location.pathname.startsWith(child.path + '/'));
      const displayName = child.path === '/app/campaigns/new' && isBuilderPage && location.pathname !== '/app/campaigns/new'
        ? t('sidebar.editCampaign')
        : child.name;
      const baseClassName = `flex items-center gap-2 py-1.5 px-2 text-[13px] rounded-xl transition-colors ${
        isActiveChild ? 'text-orange-600 font-semibold bg-orange-50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
      }`;

      if (child.action === 'openCreateCampaignModal') {
        return (
          <button
            key={child.path}
            type="button"
            onClick={() => { navigate('/app/campaigns', { state: { openCreateCampaignModal: true } }); handleNavClose(); }}
            className={`${baseClassName} w-full text-left`}
          >
            {child.icon && <child.icon className="w-4 h-4 text-gray-400 shrink-0" />}
            <span>{displayName}</span>
          </button>
        );
      }
      if (child.action === 'openCreateEmployeeModal') {
        return (
          <button
            key={child.path}
            type="button"
            onClick={() => { navigate('/app/settings/employees', { state: { openCreateEmployeeModal: true } }); handleNavClose(); }}
            className={`${baseClassName} w-full text-left`}
          >
            {child.icon && <child.icon className="w-4 h-4 text-gray-400 shrink-0" />}
            <span>{displayName}</span>
          </button>
        );
      }

      return (
        <NavLink
          key={child.path}
          to={child.path}
          end={child.end}
          onClick={handleNavClose}
          className={() => baseClassName}
        >
          {child.icon && <child.icon className="w-4 h-4 text-gray-400 shrink-0" />}
          <span>{displayName}</span>
        </NavLink>
      );
    });
  };

  const sidebarWidth = isMobile ? 280 : (isOpen ? 220 : 44);
  const mobileHidden = isMobile && !isOpen;

  return (
    <>
      {/* Backdrop */}
      {activeSubmenu && (
        <div className="fixed inset-0 z-40" onClick={() => setActiveSubmenu(null)} />
      )}

      {/* Floating submenu panel (for collapsed sidebar) */}
      {activeSubmenu && !isDesktopExpanded && (
        <SubmenuPanel item={activeSubmenu} onClose={() => setActiveSubmenu(null)} />
      )}

      <aside
        className={`fixed left-0 h-full bg-white border-r border-gray-200 z-50 flex flex-col transition-all duration-300 ${isMobile ? 'top-0' : ''} ${mobileHidden ? '-translate-x-full' : 'translate-x-0'}`}
        style={{
          width: sidebarWidth,
          top: isMobile ? 0 : topOffset,
          height: isMobile ? '100%' : `calc(100vh - ${topOffset}px)`,
        }}
      >
        {/* Mobile: show close button only */}
        {isMobile && (
          <div className="h-12 flex items-center px-4 shrink-0">
            <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0" aria-label={t('sidebar.closeMenu')}>
              <HiOutlineX className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav ref={navRef} className={`flex-1 overflow-y-auto py-3 min-h-0 ${isOpen || isMobile ? 'px-3' : 'px-2'}`}>
          <div className="flex flex-col gap-1">
            {visibleMenuItems.map((item) => {
              const active = item.children ? isParentActive(item) : (item.end ? location.pathname === item.path : location.pathname.startsWith(item.path + '/'));
              const isSubmenuOpen = activeSubmenu?.name === item.name;

              return (
                <div key={item.name}>
                  <button
                    onClick={() => handleParentClick(item)}
                    title={item.name}
                    className={`w-full flex items-center rounded-xl py-2.5 transition-all ${
                      isSubmenuOpen ? 'bg-orange-100 text-orange-600' : active ? 'bg-orange-50 text-orange-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-900'
                    } ${isOpen || isMobile ? 'px-3' : 'justify-center'}`}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {(isOpen || isMobile) && (
                      <>
                        <span className="ml-2.5 text-[13px] font-medium flex-1 text-left">{item.name}</span>
                        {item.children && (
                          <HiOutlineChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isSubmenuOpen ? 'rotate-90' : ''}`} />
                        )}
                      </>
                    )}
                  </button>

                  {/* Inline submenu (expanded sidebar or mobile) */}
                  {item.children && (isOpen || isMobile) && isSubmenuOpen && (
                    <div className="mt-1 ml-0 pl-0 border-l-0 flex flex-col gap-1">
                      {renderChildItems(item.children)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-2 shrink-0">
          {isMobile ? (
            <NavLink
              to={isSuperAdmin ? '/admin' : '/app/settings/ai-profile'}
              className={({ isActive }) =>
                `flex items-center rounded-xl py-2 px-3 transition-colors ${isActive ? 'bg-purple-50 text-purple-600' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-900'}`
              }
              onClick={handleNavClose}
            >
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center shrink-0 shadow-sm`}>
                <span className="text-white font-bold text-[11px] leading-none">{avatarInitial}</span>
              </div>
              <div className="ml-2.5 flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-gray-900 truncate">{user?.fullName || user?.username}</span>
                <span className="text-[11px] text-gray-400 capitalize">{isSuperAdmin ? t('sidebar.superAdmin') : activeContext?.type === 'employee' ? t('sidebar.employee') : t('sidebar.owner')}</span>
              </div>
            </NavLink>
          ) : (
            <button
              onClick={onToggle}
              title={isOpen ? t('sidebar.collapseMenu') : t('sidebar.expandMenu')}
              className="w-full flex items-center justify-center rounded-xl py-2.5 text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              {isOpen
                ? <HiOutlineChevronRight className="w-5 h-5" />
                : <HiOutlineChevronDown className="w-5 h-5 -rotate-90" />
              }
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
