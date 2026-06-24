import { useState, useRef, useEffect } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { useLocalStorageState } from '../../../hooks/useLocalStorageState';
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
  HiOutlinePlusCircle,
  HiOutlineLogout,
  HiOutlineLockClosed,
  HiOutlineUserCircle,
  HiOutlineAcademicCap,
  HiOutlineCube,
  HiOutlineX,
  HiOutlineClipboardList,
  HiOutlineUserGroup,
  HiOutlinePhotograph,
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
  HiOutlineTag,
  HiOutlinePhone,
  HiOutlineMailOpen,
} from 'react-icons/hi';
import logoIcon from '../../../assets/icons/founderai-logo.png';

import ChangePasswordModal from '../../../features/auth/components/ChangePasswordModal';
import AccountProfileModal from '../../../features/auth/components/AccountProfileModal';
import ContextSwitcher from '../../ContextSwitcher';

// Menu dành cho super_admin — quản trị hệ thống
const superAdminMenuItems = (t) => [
  {
    name: t('nav.dashboard'),
    section: t('nav.adminNavOverview'),
    path: '/admin',
    icon: HiOutlineHome,
    end: true,
  },
  {
    name: t('nav.memberManagement'),
    section: t('nav.adminNavBusiness'),
    path: '/admin/members',
    icon: HiOutlineShieldCheck,
  },
  {
    name: t('nav.planManagement'),
    section: t('nav.adminNavBusiness'),
    path: '/admin/plans',
    icon: HiOutlineCurrencyDollar,
  },
  {
    name: t('nav.voucherManagement'),
    section: t('nav.adminNavBusiness'),
    path: '/admin/vouchers',
    icon: HiOutlineTicket,
  },
  {
    name: t('nav.orders'),
    section: t('nav.adminNavBusiness'),
    path: '/admin/orders',
    icon: HiOutlineClipboardList,
  },
  {
    name: t('nav.serverMonitoring'),
    section: t('nav.adminNavMonitoring'),
    path: '/admin/system',
    icon: HiOutlineServer,
  },
  {
    name: t('nav.deliveryMonitoring'),
    section: t('nav.adminNavMonitoring'),
    path: '/admin/delivery-monitor',
    icon: HiOutlineLightningBolt,
  },
  {
    name: t('nav.aiUsageAnalytics'),
    section: t('nav.adminNavMessaging'),
    path: '/admin/ai-usage',
    icon: HiOutlineSparkles,
  },
  {
    name: t('nav.bulkNotification'),
    section: t('nav.adminNavMessaging'),
    path: '/admin/bulk-notification',
    icon: HiOutlineMailOpen,
  },
  {
    name: t('nav.systemAuditLogs'),
    section: t('nav.adminNavMonitoring'),
    path: '/admin/audit-logs',
    icon: HiOutlineClipboard,
  },
  {
    name: t('nav.diagnosticTool'),
    section: t('nav.adminNavMonitoring'),
    path: '/admin/diagnostic',
    icon: HiOutlinePhone,
  },
];

// Menu dành cho user_admin và employee — vận hành marketing
// ownerOnly: true  → chỉ user_admin thấy
// permission: [...]  → employee thấy nếu có ÍT NHẤT 1 trong các permission này
const userMenuItems = (t) => [
  {
    name: t('nav.dashboard'),
    path: '/app',
    icon: HiOutlineHome,
    end: true,
  },
  {
    name: t('nav.aiChatbot'),
    icon: HiOutlineSparkles,
    children: [
      { name: t('nav.chatbotStudio'), path: '/app/chatbot-studio', icon: HiOutlineSparkles, ownerOnly: true },
      { name: t('nav.inbox'), path: '/app/settings/inbox', icon: HiOutlineInbox, ownerOnly: true },
    ],
  },
  {
    name: t('nav.landingPage'),
    icon: HiOutlineGlobeAlt,
    children: [
      { name: t('nav.featuredProducts'), path: '/app/settings/landing-featured-courses', icon: HiOutlinePhotograph, adminUsernameOnly: true },
      { name: t('nav.reviews'), path: '/app/settings/landing-testimonials', icon: HiOutlineStar, adminUsernameOnly: true },
      { name: t('nav.htmlPages'), path: '/app/settings/landing-pages', icon: HiOutlineGlobeAlt, permission: ['landing_pages'] },
      { name: t('nav.leadList'), path: '/app/landing-leads', icon: HiOutlineUsers, permission: ['leads'] },
    ],
  },
  {
    name: t('nav.campaigns'),
    icon: HiOutlineLightningBolt,
    permission: ['campaigns_view', 'campaigns_create', 'campaigns_run', 'customers', 'email_settings', 'zalo_settings', 'email_templates', 'zalo_templates'],
    children: [
      { name: t('nav.channelManagement'), path: '/app/settings/channels', icon: HiOutlineMail, permission: ['email_settings', 'zalo_settings'] },
      { name: t('nav.messageTemplates'), path: '/app/settings/templates', icon: HiOutlineTemplate, permission: ['email_templates', 'zalo_templates'] },
      { name: t('nav.createCampaign'), path: '/app/campaigns/new', icon: HiOutlinePlusCircle, action: 'openCreateCampaignModal', permission: ['campaigns_create'] },
      { name: t('nav.campaignManagement'), path: '/app/campaigns', end: true, icon: HiOutlineViewList, permission: ['campaigns_view'] },
      { name: t('nav.runCampaign'), path: '/app/campaign-run', icon: HiOutlineLightningBolt, permission: ['campaigns_run'] },
      { name: t('nav.deliveryMonitor'), path: '/app/delivery-monitor', icon: HiOutlineServer, permission: ['campaigns_view'] },
      { name: t('nav.customers'), path: '/app/customers', icon: HiOutlineUsers, permission: ['customers'] },
    ],
  },
  {
    name: t('nav.settings'),
    icon: HiOutlineCog,
    children: [
      { name: t('nav.businessProfile'), path: '/app/settings/ai-profile', icon: HiOutlineOfficeBuilding, ownerOnly: true },
      { name: t('nav.employees'), path: '/app/settings/employees', icon: HiOutlineUserGroup, ownerOnly: true },
      { name: t('nav.auditLogs'), path: '/app/settings/audit-logs', icon: HiOutlineClipboard, ownerOnly: true },
      { name: t('nav.myProducts'), path: '/app/products', icon: HiOutlineCube, ownerOnly: true, hideInProd: true },
      { name: t('nav.courseManagement'), path: '/app/courses', icon: HiOutlineAcademicCap, adminUsernameOnly: true },
    ],
  },
  {
    name: t('nav.orders'),
    path: '/app/orders',
    icon: HiOutlineClipboardList,
    adminUsernameOnly: true,
  },
];

/**
 * Sidebar navigation component.
 *
 * Supports two display modes:
 * - Desktop: fixed sidebar on the left, collapsible to icon-only mode.
 * - Mobile: overlay drawer that slides in from the left.
 *
 * @param {boolean} isOpen - Whether sidebar is expanded (desktop) or visible (mobile)
 * @param {number} width - Sidebar pixel width (desktop only)
 * @param {boolean} isMobile - Whether the viewport is mobile-sized
 * @param {function} onClose - Callback to close sidebar (mobile only)
 */
const Sidebar = ({ isOpen, width, isMobile, onClose }) => {
  const { t, locale, changeLocale } = useI18n();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useLocalStorageState('founder_sidebar_menus', [t('nav.aiChatbot'), t('nav.campaigns'), t('nav.settings')]);
  const { user, logout, activeContext } = useAuthStore();
  const isSuperAdmin = user?.role === 'admin';
  const isAdminUsername = user?.username?.toLowerCase() === 'admin';
  const menuItems = isSuperAdmin ? superAdminMenuItems(t) : userMenuItems(t);
  // Context-aware filtering: employee context dùng permissions do owner cấp,
  // self context (chủ tài khoản) thấy hết.
  const isEmployeeCtx = activeContext?.type === 'employee';
  const ctxPermissions = activeContext?.permissions || {};
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAccountProfile, setShowAccountProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const userMenuRef = useRef(null);
  const navRef = useRef(null);
  useScrollPersistence('founder_sidebar_scroll', navRef);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleMenu = (menuName) => {
    setExpandedMenus((prev) =>
      prev.includes(menuName)
        ? prev.filter((name) => name !== menuName)
        : [...prev, menuName]
    );
  };

  const isActiveParent = (item) => {
    if (item.children) {
      return item.children.some((child) => {
        if (child.end) {
          return location.pathname === child.path;
        }
        return location.pathname === child.path || location.pathname.startsWith(child.path + '/');
      }) ||
        (item.name === t('nav.campaigns') && (location.pathname.includes('/app/campaigns/') && location.pathname.includes('/builder')));
    }
    return false;
  };

  /** Close the sidebar on mobile after navigating to a new route */
  const handleNavClose = () => {
    if (isMobile && onClose) onClose();
  };

  // On mobile: drawer slides in/out via transform; on desktop: fixed with given width
  const sidebarStyle = isMobile ? { width: '280px' } : { width: `${width}px` };
  const sidebarTransformClass = isMobile
    ? isOpen
      ? 'translate-x-0'
      : '-translate-x-full'
    : '';

  // On mobile the sidebar is always "open" layout (full labels shown), never icon-only
  const showLabels = isMobile ? true : isOpen;

  // Lọc menu item theo ngữ cảnh hoạt động.
  // - ownerOnly: chỉ hiện khi đang ở context cá nhân (chủ tài khoản).
  // - permission: trong employee context phải có ít nhất 1 quyền tương ứng.
  // - adminUsernameOnly: chỉ hiện cho tài khoản có username = "admin" hoặc nhân viên của account đó.
  const filterItem = (item) => {
    if (item.hideInProd && import.meta.env.MODE === 'production') return false;
    if (item.ownerOnly && isEmployeeCtx) return false;
    if (item.adminUsernameOnly) {
      // Chỉ hiện cho username = "admin" hoặc nhân viên của account admin
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

  const shouldShowSectionHeader = (item, index) => (
    showLabels &&
    isSuperAdmin &&
    item.section &&
    visibleMenuItems[index - 1]?.section !== item.section
  );

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-40 sidebar-transition flex flex-col transition-transform duration-300 ease-in-out ${sidebarTransformClass}`}
      style={sidebarStyle}
    >
      {/* Logo row — includes close button on mobile */}
      <div className={`h-16 flex items-center border-b border-gray-200 px-4 ${showLabels ? 'justify-between' : 'justify-center'}`}>
        <Link to="/" className="flex items-center gap-2.5 min-w-0 hover:opacity-75 transition-opacity">
          <img
            src={logoIcon}
            alt="Founder AI"
            className="w-8 h-8 object-contain shrink-0"
          />
          {showLabels && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">{t('common.appName')}</p>
              <p className="text-[11px] text-gray-400 leading-tight truncate">
                {isSuperAdmin ? t('sidebar.systemAdmin') : t('sidebar.campaignManagement')}
              </p>
            </div>
          )}
        </Link>

        {/* Close button — only on mobile */}
        {isMobile && showLabels && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            aria-label={t('sidebar.closeMenu')}
          >
            <HiOutlineX className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* Context Switcher — chuyển giữa tài khoản cá nhân và các tổ chức */}
      {!isSuperAdmin && (
        <div className="px-2 pt-2">
          <ContextSwitcher showLabels={showLabels} />
        </div>
      )}

      {/* Navigation */}
      <nav ref={navRef} className={`p-2 space-y-1 overflow-y-auto flex-1 min-h-0 ${!showLabels ? 'px-2' : ''}`}>
        {visibleMenuItems.map((item, index) => (
          <div
            key={item.name}
            className={shouldShowSectionHeader(item, index) && index > 0 ? 'pt-3' : ''}
          >
            {shouldShowSectionHeader(item, index) && (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {item.section}
              </p>
            )}
            {item.children ? (
              <div>
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={`w-full flex items-center rounded-lg py-2 transition-all duration-200 ${!showLabels ? 'justify-center px-0' : 'px-2'
                    } ${isActiveParent(item) ? 'bg-primary-50 text-primary-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                  title={!showLabels ? item.name : ''}
                >
                  <item.icon className={`${showLabels ? 'w-5 h-5' : 'w-6 h-6'} transition-all duration-200`} />
                  {showLabels && (
                    <>
                      <span className="flex-1 text-left ml-2 text-sm font-medium">{item.name}</span>
                      {expandedMenus.includes(item.name) ? (
                        <HiOutlineChevronDown className="w-4 h-4" />
                      ) : (
                        <HiOutlineChevronRight className="w-4 h-4" />
                      )}
                    </>
                  )}
                </button>
                {showLabels && expandedMenus.includes(item.name) && (
                  <div className="mt-1 space-y-0.5 ml-4 pl-2 border-l border-gray-200">
                    {item.children.map((child) => {
                      const isBuilderPage = location.pathname.includes('/app/campaigns/') && location.pathname.includes('/builder');
                      const isActiveChild = child.path === '/app/campaigns/new'
                        ? isBuilderPage || location.pathname === '/app/campaigns/new'
                        : (child.end
                          ? location.pathname === child.path
                          : location.pathname === child.path || location.pathname.startsWith(child.path + '/'));

                      const displayName = child.path === '/app/campaigns/new' && isBuilderPage && location.pathname !== '/app/campaigns/new'
                        ? t('sidebar.editCampaign')
                        : child.name;

                      const baseClassName = `flex items-center px-2 py-2 text-sm transition-all duration-200 ${isActiveChild
                        ? 'text-primary-600 font-medium bg-primary-50 border-l-2 border-primary-500 -ml-[13px] pl-[22px]'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`;

                      if (child.action === 'openCreateCampaignModal') {
                        return (
                          <button
                            key={child.path}
                            onClick={() => {
                              navigate('/app/campaigns', { state: { openCreateCampaignModal: true } });
                              handleNavClose();
                            }}
                            className={`${baseClassName} w-full text-left`}
                            type="button"
                          >
                            {child.icon && <child.icon className="w-4 h-4 mr-2 text-gray-400" />}
                            <span>{displayName}</span>
                          </button>
                        );
                      }

                      if (child.action === 'openCreateEmployeeModal') {
                        return (
                          <button
                            key={child.path}
                            onClick={() => {
                              navigate('/app/settings/employees', { state: { openCreateEmployeeModal: true } });
                              handleNavClose();
                            }}
                            className={`${baseClassName} w-full text-left`}
                            type="button"
                          >
                            {child.icon && <child.icon className="w-4 h-4 mr-2 text-gray-400" />}
                            <span>{displayName}</span>
                          </button>
                        );
                      }

                      return (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          end={child.end}
                          className={() => baseClassName}
                          onClick={handleNavClose}
                        >
                          {child.icon && <child.icon className="w-4 h-4 mr-2 text-gray-400" />}
                          <span>{displayName}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center rounded-lg py-2 transition-all duration-200 ${!showLabels ? 'justify-center px-0' : 'px-2'
                  } ${isActive
                    ? 'bg-primary-50 text-primary-600 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                  }`
                }
                title={!showLabels ? item.name : ''}
                onClick={handleNavClose}
              >
                <item.icon className={`${showLabels ? 'w-5 h-5' : 'w-6 h-6'} transition-all duration-200`} />
                {showLabels && <span className="ml-2 text-sm font-medium">{item.name}</span>}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      {/* Public website links — chỉ hiển thị cho workspace users */}
      {!isSuperAdmin && (
        <div className={`border-t border-gray-100 py-2 ${showLabels ? 'px-3' : 'px-2'}`}>
          {showLabels && (
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
              {t('nav.website')}
            </p>
          )}
          <div className="space-y-0.5">
            {[
              { name: t('nav.siteHome'), path: '/', icon: HiOutlineHome },
              { name: t('nav.sitePricing'), path: '/pricing', icon: HiOutlineTag },
              { name: t('nav.siteContact'), path: '/contact', icon: HiOutlinePhone },
            ].map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center rounded-lg py-1.5 transition-all text-gray-500 hover:text-gray-700 hover:bg-gray-50 ${!showLabels ? 'justify-center px-0' : 'px-2'}`}
                title={!showLabels ? item.name : ''}
                onClick={handleNavClose}
              >
                <item.icon className={`${showLabels ? 'w-4 h-4' : 'w-5 h-5'} transition-all shrink-0`} />
                {showLabels && <span className="ml-2 text-xs">{item.name}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* User section */}
      <div
        className={`border-t border-gray-200 p-2 ${showLabels ? 'px-4' : 'px-2'} relative`}
        ref={userMenuRef}
      >
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className={`w-full flex items-center rounded-lg hover:bg-gray-100 transition-colors ${showLabels ? 'px-2 py-2' : 'p-1 justify-center'
            }`}
        >
          <div className={`${showLabels ? 'w-10 h-10' : 'w-9 h-9'} bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-medium text-sm">
              {user?.fullName?.[0] || user?.username?.[0] || 'U'}
            </span>
          </div>
          {showLabels && (
            <div className="ml-3 text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.fullName || user?.username || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
            </div>
          )}
        </button>

        {showUserMenu && (
          <div className={`absolute ${showLabels ? 'left-4 right-4' : 'left-2 right-2'} bottom-16 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50`}>
            <button
              onClick={() => {
                setShowUserMenu(false);
                setShowAccountProfile(true);
              }}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <HiOutlineUserCircle className="w-4 h-4 mr-3" />
              {t('sidebar.accountInfo')}
            </button>
            <button
              onClick={() => {
                setShowUserMenu(false);
                setShowChangePassword(true);
              }}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <HiOutlineLockClosed className="w-4 h-4 mr-3" />
              {t('sidebar.changePassword')}
            </button>
            <div className="border-t border-gray-100 my-1" />
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <HiOutlineGlobeAlt className="w-4 h-4" />
                {t('sidebar.language')}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => changeLocale('vi')}
                  className={`text-base px-1 py-0.5 rounded transition-opacity ${locale === 'vi' ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}
                  title="Tiếng Việt"
                >
                  🇻🇳
                </button>
                <button
                  onClick={() => changeLocale('en')}
                  className={`text-base px-1 py-0.5 rounded transition-opacity ${locale === 'en' ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}
                  title="English"
                >
                  🇺🇸
                </button>
              </div>
            </div>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <HiOutlineLogout className="w-4 h-4 mr-3" />
              {t('sidebar.logout')}
            </button>
          </div>
        )}
      </div>

      <AccountProfileModal
        isOpen={showAccountProfile}
        onClose={() => setShowAccountProfile(false)}
      />
      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </aside>
  );
};

export default Sidebar;
