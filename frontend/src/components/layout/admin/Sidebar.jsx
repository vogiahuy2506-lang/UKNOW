import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { useScrollPersistence } from '../../../hooks/useScrollPersistence';
import { useI18n } from '../../../i18n';
import {
  HiOutlineCollection,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineX,
} from 'react-icons/hi';
import {
  superAdminMenuItems,
  userMenuItems,
  AVATAR_STYLES,
} from './navConfig';
import { groupSuperAdminMenuItems, groupAppMenuItems, buildAppLinkMenuItems } from './adminMenuLayout';
import adminMenuApiService, {
  ADMIN_MENU_LAYOUT_UPDATED_EVENT,
} from '../../../features/admin/services/adminMenuApi.service';

// Menu khách /app nay luôn có `key` ổn định trên mọi mục sau khi làm phẳng (PR-1,
// PLAN_MENU_CHUYEN_MUC_APP_2026-09-12, navConfig.jsx:userMenuItems) — `|| item.path ||
// item.name` chỉ còn là lưới an toàn, không phải đường chính.
/** Màn của MỘT chiến dịch đã có: tab Sơ đồ khối (`/builder`) hoặc Từng bước (`/simple`) — cùng highlight mục Chiến dịch. */
const CAMPAIGN_DETAIL_PATH = /^\/app\/campaigns\/[^/]+\/(builder|simple)(\/|$)/;

const getMenuItemKey = (item) => item.key || item.path || item.name;

// ── Floating Submenu Panel (for collapsed sidebar) ──────────────────────────

function SubmenuPanel({ item, onClose }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const isBuilderPage = CAMPAIGN_DETAIL_PATH.test(location.pathname);

  const getActiveChild = (child) => {
    if (child.external || !child.path) return false;
    const [childBasePath, childQuery] = child.path.split('?');
    if (child.path === '/app/campaigns/new') {
      return isBuilderPage || location.pathname === '/app/campaigns/new';
    }
    if (childQuery) {
      return location.pathname === childBasePath && location.search.includes(childQuery);
    }
    if (childBasePath === '/app/billing') {
      return location.pathname === '/app/billing' && !location.search.includes('tab=orders');
    }
    if (child.end) return location.pathname === childBasePath;
    return location.pathname === childBasePath || location.pathname.startsWith(childBasePath + '/');
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
    <div className="fixed left-[44px] w-56 bg-white dark:bg-dk-surface shadow-2xl z-50 flex flex-col rounded-r-2xl border border-gray-200 dark:border-dk-border border-l-0"
      style={{ top: 44, height: 'calc(100vh - 44px)' }}>
      <div className="h-12 flex items-center px-4 shrink-0 border-b border-gray-100 dark:border-dk-border">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors mr-2 -ml-2">
          <HiOutlineChevronRight className="w-4 h-4 text-gray-400 rotate-180" />
        </button>
        <span className="text-[13px] font-bold text-gray-900 dark:text-dk-text">{item.name}</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2">
        <div className="flex flex-col gap-1">
          {item.children.map((child) => {
            const isActive = getActiveChild(child);
            const displayName = child.path === '/app/campaigns/new' && isBuilderPage && location.pathname !== '/app/campaigns/new'
              ? t('sidebar.editCampaign')
              : child.name;
            const baseClass = `w-full flex items-center gap-2 pl-3 pr-2 py-1.5 text-[12px] rounded-lg transition-all ${
              isActive ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold' : 'text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised/80'
            }`;

            if (child.action) {
              return (
                <button key={child.key || child.path} type="button" onClick={() => handleAction(child)} className={baseClass}>
                  {child.icon && <child.icon className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span>{displayName}</span>
                </button>
              );
            }

            if (child.external) {
              return (
                <a
                  key={child.key || child.path}
                  href={child.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className={baseClass}
                >
                  {child.icon && <child.icon className="w-4 h-4 text-gray-400 shrink-0" />}
                  <span>{displayName}</span>
                </a>
              );
            }

            return (
              <NavLink
                key={child.key || child.path}
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
  const { t, locale } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  useScrollPersistence('founder_sidebar_scroll', navRef);

  const { user, activeContext } = useAuthStore();
  const isSuperAdmin = user?.role === 'admin';
  const [adminMenuCategories, setAdminMenuCategories] = useState(null);
  const [appMenuLinks, setAppMenuLinks] = useState([]);
  const menuItems = isSuperAdmin
    ? groupSuperAdminMenuItems(
      superAdminMenuItems(t),
      locale,
      adminMenuCategories,
      HiOutlineCollection
    )
    : groupAppMenuItems(
      [...userMenuItems(t), ...buildAppLinkMenuItems(appMenuLinks, locale)],
      locale,
      adminMenuCategories,
      HiOutlineCollection
    );
  const isEmployeeCtx = activeContext?.type === 'employee';
  const ctxPermissions = activeContext?.permissions || {};

  const [floatingItem, setFloatingItem] = useState(null);

  const filterItem = (item) => {
    if (item.hideInProd && import.meta.env.MODE === 'production') return false;
    if (item.flag && import.meta.env[item.flag] !== 'true') return false;
    if (item.ownerOnly && isEmployeeCtx) return false;
    if (item.permission && isEmployeeCtx) {
      return item.permission.some((p) => ctxPermissions[p] === true);
    }
    return true;
  };

  const isParentActive = (item) => {
    if (!item.children) return false;
    return item.children.some((child) => {
      if (child.external || !child.path) return false;
      const [childBasePath, childQuery] = child.path.split('?');
      if (childQuery) {
        return location.pathname === childBasePath && location.search.includes(childQuery);
      }
      if (childBasePath === '/app/billing') {
        return location.pathname === '/app/billing' && !location.search.includes('tab=orders');
      }
      if (child.end) return location.pathname === childBasePath;
      return location.pathname === childBasePath || location.pathname.startsWith(childBasePath + '/');
    })
      // PR-1 (PLAN_MENU_CHUYEN_MUC_APP_2026-09-12, việc 4) — so theo `key` chuyên mục thay vì
      // tên đã dịch: super admin đổi tên "Chiến dịch" (PR-2) không còn làm hỏng highlight khi
      // ở /app/campaigns/:id/builder (route không nằm trong children vì :id động).
      || (item.key === 'app-category-campaigns' && CAMPAIGN_DETAIL_PATH.test(location.pathname));
  };

  const applyLayoutCategories = (rawCats, rawLinks) => {
    const cats = Array.isArray(rawCats) ? rawCats : [];
    const linksList = Array.isArray(rawLinks) ? rawLinks : [];
    setAdminMenuCategories(cats);
    setAppMenuLinks(linksList);
    const items = isSuperAdmin
      ? groupSuperAdminMenuItems(superAdminMenuItems(t), locale, cats, HiOutlineCollection)
      : groupAppMenuItems(
        [...userMenuItems(t), ...buildAppLinkMenuItems(linksList, locale)],
        locale,
        cats,
        HiOutlineCollection
      );
    const visible = items
      .map((item) => {
        if (!item.children) return item;
        return { ...item, children: item.children.filter(filterItem) };
      })
      .filter((item) => filterItem(item) && (!item.children || item.children.length > 0));
    const activeParent = visible.find((item) => item.children && isParentActive(item));
    if (activeParent) {
      const activeKey = getMenuItemKey(activeParent);
      setExpandedGroupKeys((prev) => {
        if (prev.has(activeKey)) return prev;
        const next = new Set(prev);
        next.add(activeKey);
        return next;
      });
    }
  };

  const applyLayoutCategoriesRef = useRef(applyLayoutCategories);
  applyLayoutCategoriesRef.current = applyLayoutCategories;

  useEffect(() => {
    let isMounted = true;
    if (isSuperAdmin) {
      adminMenuApiService.getLayout()
        .then((response) => {
          if (isMounted) applyLayoutCategoriesRef.current(response.data?.data?.categories || [], []);
        })
        .catch((error) => {
          // Sidebar must remain usable while a new backend migration is rolling
          // out or if the layout endpoint is temporarily unavailable.
          console.warn('[Sidebar] Falling back to default admin menu:', error?.message);
        });

      const handleLayoutUpdated = (event) => {
        if (Array.isArray(event.detail?.categories)) {
          setFloatingItem(null);
          // Review Claude 13/09: tính lại nhóm đang mở theo route hiện tại thay vì đóng hết —
          // super admin vừa lưu bố cục xong không bị mất dấu mình đang đứng ở nhóm nào (cùng
          // luật với PR-3: nhóm chứa trang đang mở luôn mở).
          applyLayoutCategoriesRef.current(event.detail.categories, []);
        }
      };
      window.addEventListener(ADMIN_MENU_LAYOUT_UPDATED_EVENT, handleLayoutUpdated);
      return () => {
        isMounted = false;
        window.removeEventListener(ADMIN_MENU_LAYOUT_UPDATED_EVENT, handleLayoutUpdated);
      };
    }

    // PR-2: Đọc cấu hình menu app của khách qua GET /api/users/app-menu-layout lúc mount.
    // Giữ .catch() fallback về mặc định; không phát / lắng nghe sự kiện live update cho khách.
    adminMenuApiService.getUserAppMenuLayout()
      .then((response) => {
        if (isMounted) {
          applyLayoutCategoriesRef.current(response.data?.data?.categories || [], response.data?.data?.links || []);
        }
      })
      .catch((error) => {
        console.warn('[Sidebar] Falling back to default app menu:', error?.message);
      });

    return () => {
      isMounted = false;
    };
  }, [isSuperAdmin]);

  const handleNavClose = () => {
    setFloatingItem(null);
    if (isMobile && onClose) onClose();
  };

  const isDesktopExpanded = !isMobile && isOpen;

  const visibleMenuItems = menuItems
    .map((item) => {
      if (!item.children) return item;
      return { ...item, children: item.children.filter(filterItem) };
    })
    .filter((item) => filterItem(item) && (!item.children || item.children.length > 0));

  const [expandedGroupKeys, setExpandedGroupKeys] = useState(() => {
    const activeParent = visibleMenuItems.find((item) => item.children && isParentActive(item));
    return new Set(activeParent ? [getMenuItemKey(activeParent)] : []);
  });

  useEffect(() => {
    setFloatingItem(null);
    const activeParent = visibleMenuItems.find((item) => item.children && isParentActive(item));
    if (activeParent) {
      const activeKey = getMenuItemKey(activeParent);
      setExpandedGroupKeys((prev) => {
        if (prev.has(activeKey)) return prev;
        const next = new Set(prev);
        next.add(activeKey);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const handleParentClick = (item) => {
    const itemKey = getMenuItemKey(item);
    if (isDesktopExpanded || isMobile) {
      if (item.children) {
        setExpandedGroupKeys((prev) => {
          const next = new Set(prev);
          if (next.has(itemKey)) {
            next.delete(itemKey);
          } else {
            next.add(itemKey);
          }
          return next;
        });
      } else {
        navigate(item.path);
        handleNavClose();
      }
    } else {
      if (item.children) {
        setFloatingItem((prev) => (prev && getMenuItemKey(prev) === itemKey ? null : item));
      } else {
        navigate(item.path);
      }
    }
  };

  const avatarGradient = AVATAR_STYLES[user?.role] || AVATAR_STYLES['user'];
  const avatarInitial = (user?.fullName?.[0] || user?.username?.[0] || 'U').toUpperCase();

  const renderChildItems = (children) => {
    return children.map((child) => {
      const isBuilderPage = CAMPAIGN_DETAIL_PATH.test(location.pathname);
      const [childBasePath, childQuery] = (child.path || '').split('?');
      let isActiveChild = false;
      if (!child.external && child.path) {
        if (child.path === '/app/campaigns/new') {
          isActiveChild = isBuilderPage || location.pathname === '/app/campaigns/new';
        } else if (childQuery) {
          isActiveChild = location.pathname === childBasePath && location.search.includes(childQuery);
        } else if (childBasePath === '/app/billing') {
          isActiveChild = location.pathname === '/app/billing' && !location.search.includes('tab=orders');
        } else if (child.end) {
          isActiveChild = location.pathname === childBasePath;
        } else {
          isActiveChild = location.pathname === childBasePath || location.pathname.startsWith(childBasePath + '/');
        }
      }
      const displayName = child.path === '/app/campaigns/new' && isBuilderPage && location.pathname !== '/app/campaigns/new'
        ? t('sidebar.editCampaign')
        : child.name;
      const baseClassName = `w-[calc(100%-18px)] flex items-center gap-2 py-1.5 pl-3 pr-2 text-[13px] ml-[18px] border-l-2 rounded-r-lg transition-colors ${
        isActiveChild
          ? 'border-l-orange-500 text-orange-600 dark:text-orange-400 font-medium bg-orange-50 dark:bg-orange-950/40'
          : 'border-l-gray-200 dark:border-l-slate-800 text-gray-600 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised/40 hover:border-l-gray-300 dark:hover:border-l-slate-700'
      }`;

      if (child.action === 'openCreateCampaignModal') {
        return (
          <button
            key={child.key || child.path}
            type="button"
            data-menu-level="item"
            onClick={() => { navigate('/app/campaigns', { state: { openCreateCampaignModal: true } }); handleNavClose(); }}
            className={`${baseClassName} text-left`}
          >
            {child.icon && <child.icon className={`w-4 h-4 shrink-0 ${isActiveChild ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-dk-muted'}`} />}
            <span>{displayName}</span>
          </button>
        );
      }
      if (child.action === 'openCreateEmployeeModal') {
        return (
          <button
            key={child.key || child.path}
            type="button"
            data-menu-level="item"
            onClick={() => { navigate('/app/settings/employees', { state: { openCreateEmployeeModal: true } }); handleNavClose(); }}
            className={`${baseClassName} text-left`}
          >
            {child.icon && <child.icon className={`w-4 h-4 shrink-0 ${isActiveChild ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-dk-muted'}`} />}
            <span>{displayName}</span>
          </button>
        );
      }

      if (child.external) {
        return (
          <a
            key={child.key || child.path}
            href={child.url}
            target="_blank"
            rel="noopener noreferrer"
            data-menu-level="item"
            onClick={handleNavClose}
            className={baseClassName}
          >
            {child.icon && <child.icon className="w-4 h-4 shrink-0 text-gray-400 dark:text-dk-muted" />}
            <span>{displayName}</span>
          </a>
        );
      }

      return (
        <NavLink
          key={child.key || child.path}
          to={child.path}
          end={child.end}
          data-menu-level="item"
          aria-current={isActiveChild ? 'page' : undefined}
          onClick={handleNavClose}
          className={() => baseClassName}
        >
          {child.icon && <child.icon className={`w-4 h-4 shrink-0 ${isActiveChild ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-dk-muted'}`} />}
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
      {floatingItem && (
        <div className="fixed inset-0 z-40" onClick={() => setFloatingItem(null)} />
      )}

      {/* Floating submenu panel (for collapsed sidebar) */}
      {floatingItem && !isDesktopExpanded && (
        <SubmenuPanel item={floatingItem} onClose={() => setFloatingItem(null)} />
      )}

      <aside
        className={`fixed left-0 h-full bg-white dark:bg-dk-bg border-r border-gray-200 dark:border-dk-border z-50 flex flex-col transition-all duration-300 ${isMobile ? 'top-0' : ''} ${mobileHidden ? '-translate-x-full' : 'translate-x-0'}`}
        style={{
          width: sidebarWidth,
          top: isMobile ? 0 : topOffset,
          height: isMobile ? '100%' : `calc(100vh - ${topOffset}px)`,
        }}
      >
        {/* Mobile: show close button only */}
        {isMobile && (
          <div className="h-12 flex items-center px-4 shrink-0">
            <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors shrink-0" aria-label={t('sidebar.closeMenu')}>
              <HiOutlineX className="w-5 h-5 text-gray-500 dark:text-dk-text2" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav ref={navRef} className={`flex-1 overflow-y-auto py-3 min-h-0 ${isOpen || isMobile ? 'px-3' : 'px-2'}`}>
          <div className="flex flex-col gap-1">
            {visibleMenuItems.map((item) => {
              const itemKey = getMenuItemKey(item);

              if (!isOpen && !isMobile) {
                const isItemActive = item.external
                  ? false
                  : item.children
                  ? isParentActive(item)
                  : (item.end ? location.pathname === item.path : (location.pathname === item.path || location.pathname.startsWith(item.path + '/')));
                const isFloatingOpen = floatingItem && getMenuItemKey(floatingItem) === itemKey;
                const iconButtonClassName = `w-full flex items-center justify-center rounded-xl py-2.5 transition-all ${
                  isFloatingOpen
                    ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400'
                    : isItemActive
                    ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                    : 'text-gray-400 dark:text-dk-text2 hover:bg-gray-50 dark:hover:bg-dk-raised/60 hover:text-gray-900 dark:hover:text-dk-text'
                }`;

                if (item.external) {
                  return (
                    <div key={itemKey}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.name} className={iconButtonClassName}>
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                      </a>
                    </div>
                  );
                }

                return (
                  <div key={itemKey}>
                    <button
                      type="button"
                      onClick={() => handleParentClick(item)}
                      title={item.name}
                      className={iconButtonClassName}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                    </button>
                  </div>
                );
              }

              if (item.children) {
                const isGroupActive = isParentActive(item);
                const isExpanded = expandedGroupKeys.has(itemKey);

                return (
                  <div key={itemKey}>
                    <button
                      type="button"
                      onClick={() => handleParentClick(item)}
                      title={item.name}
                      data-menu-level="group"
                      data-active={isGroupActive ? 'true' : 'false'}
                      aria-expanded={isExpanded}
                      className={`w-full flex items-center rounded-xl py-2 px-3 transition-all relative text-[11px] font-semibold uppercase tracking-wider ${
                        isGroupActive
                          ? 'text-gray-900 dark:text-dk-text before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-orange-500 before:rounded-r'
                          : 'text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised/50'
                      }`}
                    >
                      <item.icon className={`w-4 h-4 flex-shrink-0 mr-2.5 ${isGroupActive ? 'text-orange-500 dark:text-orange-400' : 'text-gray-400 dark:text-dk-muted'}`} />
                      <span className="truncate flex-1 text-left">{item.name}</span>
                      <HiOutlineChevronRight
                        className={`w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0 ml-auto transition-transform duration-200 ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {/* Inline submenu (expanded sidebar or mobile) */}
                    {isExpanded && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {renderChildItems(item.children)}
                      </div>
                    )}
                  </div>
                );
              }

              const isLeafActive = item.external
                ? false
                : item.end
                ? location.pathname === item.path
                : (location.pathname === item.path || location.pathname.startsWith(item.path + '/'));

              if (item.external) {
                return (
                  <div key={itemKey}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={item.name}
                      data-menu-level="item"
                      className="w-full flex items-center rounded-xl py-2 px-3 text-[13px] transition-colors text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised/50"
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0 mr-2.5 text-gray-400 dark:text-dk-muted" />
                      <span className="flex-1 text-left truncate">{item.name}</span>
                    </a>
                  </div>
                );
              }

              return (
                <div key={itemKey}>
                  <button
                    type="button"
                    onClick={() => handleParentClick(item)}
                    title={item.name}
                    data-menu-level="item"
                    aria-current={isLeafActive ? 'page' : undefined}
                    className={`w-full flex items-center rounded-xl py-2 px-3 text-[13px] transition-colors ${
                      isLeafActive
                        ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-medium'
                        : 'text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised/50'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 mr-2.5 ${isLeafActive ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-dk-muted'}`} />
                    <span className="flex-1 text-left truncate">{item.name}</span>
                  </button>
                </div>
              );
            })}
            {visibleMenuItems.length === 0 && (
              <div className={`py-8 text-center text-gray-400 dark:text-dk-muted text-xs ${isOpen || isMobile ? 'px-2' : 'hidden'}`}>
                {t('employee.noPermissionsAssigned')}
              </div>
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-2 shrink-0">
          {isMobile ? (
            <NavLink
              to={isSuperAdmin ? '/admin' : '/app/settings/ai-profile'}
              className={({ isActive }) =>
                `flex items-center rounded-xl py-2 px-3 transition-colors ${isActive ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-dk-text2 hover:bg-gray-50 dark:hover:bg-dk-raised/50 hover:text-gray-900 dark:hover:text-dk-text'}`
              }
              onClick={handleNavClose}
            >
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center shrink-0 shadow-sm`}>
                <span className="text-white font-bold text-[11px] leading-none">{avatarInitial}</span>
              </div>
              <div className="ml-2.5 flex flex-col min-w-0">
                <span className="text-[13px] font-semibold text-gray-900 dark:text-dk-text truncate">{user?.fullName || user?.username}</span>
                <span className="text-[11px] text-gray-400 dark:text-dk-text2 capitalize">{isSuperAdmin ? t('sidebar.superAdmin') : activeContext?.type === 'employee' ? t('sidebar.employee') : t('sidebar.owner')}</span>
              </div>
            </NavLink>
          ) : (
            <button
              onClick={onToggle}
              title={isOpen ? t('sidebar.collapseMenu') : t('sidebar.expandMenu')}
              className="w-full flex items-center justify-center rounded-xl py-2.5 text-gray-400 dark:text-dk-text2 hover:bg-gray-50 dark:hover:bg-dk-raised/50 hover:text-gray-900 dark:hover:text-dk-text transition-colors"
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
