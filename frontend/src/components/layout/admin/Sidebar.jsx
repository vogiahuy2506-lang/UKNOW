import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { useLocalStorageState } from '../../../hooks/useLocalStorageState';
import { useScrollPersistence } from '../../../hooks/useScrollPersistence';
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
  HiOutlineX,
  HiOutlineClipboardList,
  HiOutlineUserGroup,
  HiOutlinePhotograph,
  HiOutlineStar,
  HiOutlineGlobeAlt,
  HiOutlineCurrencyDollar,
  HiOutlineShieldCheck,
  HiOutlineOfficeBuilding,
} from 'react-icons/hi';
import logoIcon from '../../../assets/icons/founderai-logo.png';

import ChangePasswordModal from '../../../features/auth/components/ChangePasswordModal';
import AccountProfileModal from '../../../features/auth/components/AccountProfileModal';
import ContextSwitcher from '../../ContextSwitcher';

// Menu dành cho super_admin — quản trị hệ thống
const superAdminMenuItems = [
  {
    name: 'Dashboard',
    path: '/admin',
    icon: HiOutlineHome,
    end: true,
  },
  {
    name: 'Quản lý thành viên',
    path: '/admin/members',
    icon: HiOutlineShieldCheck,
  },
  {
    name: 'Quản lý gói dịch vụ',
    path: '/admin/plans',
    icon: HiOutlineCurrencyDollar,
  },
  {
    name: 'Đơn hàng',
    path: '/admin/orders',
    icon: HiOutlineClipboardList,
  },
];

// Menu dành cho user_admin và employee — vận hành marketing
// ownerOnly: true  → chỉ user_admin thấy
// permission: [...]  → employee thấy nếu có ÍT NHẤT 1 trong các permission này
const userMenuItems = [
  {
    name: 'Dashboard',
    path: '/app',
    icon: HiOutlineHome,
    end: true,
  },
  {
    name: 'Thiết lập',
    icon: HiOutlineCog,
    children: [
      { name: 'Hồ sơ doanh nghiệp', path: '/app/settings/ai-profile', icon: HiOutlineOfficeBuilding, ownerOnly: true },
      { name: 'Quản lý kênh gửi', path: '/app/settings/channels', icon: HiOutlineMail, permission: ['email_settings', 'zalo_settings'] },
      { name: 'Mẫu tin nhắn', path: '/app/settings/templates', icon: HiOutlineTemplate, permission: ['email_templates', 'zalo_templates'] },
      { name: 'Quản lý sản phẩm', path: '/app/courses', icon: HiOutlineAcademicCap, permission: ['courses'] },
    ],
  },
  {
    name: 'Landing page',
    icon: HiOutlineGlobeAlt,
    children: [
      { name: 'Sản phẩm nổi bật', path: '/app/settings/landing-featured-courses', icon: HiOutlinePhotograph, ownerOnly: true },
      { name: 'Đánh giá', path: '/app/settings/landing-testimonials', icon: HiOutlineStar, ownerOnly: true },
      { name: 'Trang HTML (/lp)', path: '/app/settings/landing-pages', icon: HiOutlineGlobeAlt, permission: ['landing_pages'] },
      { name: 'Tên miền riêng', path: '/app/settings/custom-domains', icon: HiOutlineGlobeAlt, ownerOnly: true },
      { name: 'Danh sách khách', path: '/app/landing-leads', icon: HiOutlineUsers, permission: ['leads'] },
    ],
  },
  {
    name: 'Chiến dịch',
    icon: HiOutlineLightningBolt,
    permission: ['campaigns_view', 'campaigns_create', 'campaigns_run'],
    children: [
      { name: 'Quản lý chiến dịch', path: '/app/campaigns', end: true, icon: HiOutlineViewList, permission: ['campaigns_view'] },
      { name: 'Tạo chiến dịch mới', path: '/app/campaigns/new', icon: HiOutlinePlusCircle, action: 'openCreateCampaignModal', permission: ['campaigns_create'] },
      { name: 'Chạy chiến dịch', path: '/app/campaign-run', icon: HiOutlineLightningBolt, permission: ['campaigns_run'] },
    ],
  },
  {
    name: 'Khách hàng',
    path: '/app/customers',
    icon: HiOutlineUsers,
    permission: ['customers'],
  },
  {
    name: 'Đơn hàng',
    path: '/app/orders',
    icon: HiOutlineClipboardList,
    ownerOnly: true,
  },
  {
    name: 'Nhân viên',
    path: '/app/settings/employees',
    icon: HiOutlineUserGroup,
    ownerOnly: true,
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
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useLocalStorageState('founder_sidebar_menus', ['Thiết lập', 'Chiến dịch']);
  const { user, logout, activeContext } = useAuthStore();
  const isSuperAdmin = user?.role === 'admin';
  const menuItems = isSuperAdmin ? superAdminMenuItems : userMenuItems;
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
        (item.name === 'Chiến dịch' && (location.pathname.includes('/app/campaigns/') && location.pathname.includes('/builder')));
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
  const filterItem = (item) => {
    if (item.ownerOnly && isEmployeeCtx) return false;
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

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-40 sidebar-transition flex flex-col transition-transform duration-300 ease-in-out ${sidebarTransformClass}`}
      style={sidebarStyle}
    >
      {/* Logo row — includes close button on mobile */}
      <div className={`h-16 flex items-center border-b border-gray-200 px-4 ${showLabels ? 'justify-between' : 'justify-center'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={logoIcon}
            alt="Founder AI"
            className="w-8 h-8 object-contain shrink-0"
          />
          {showLabels && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">Founder AI</p>
              <p className="text-[11px] text-gray-400 leading-tight truncate">
                {isSuperAdmin ? 'System Admin' : 'Campaign Management'}
              </p>
            </div>
          )}
        </div>

        {/* Close button — only on mobile */}
        {isMobile && showLabels && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Đóng menu"
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
        {visibleMenuItems.map((item) => (
          <div key={item.name}>
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
                        ? 'Chỉnh sửa chiến dịch'
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
              Thông tin tài khoản
            </button>
            <button
              onClick={() => {
                setShowUserMenu(false);
                setShowChangePassword(true);
              }}
              className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <HiOutlineLockClosed className="w-4 h-4 mr-3" />
              Đổi mật khẩu
            </button>
            <div className="border-t border-gray-100 my-1"></div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <HiOutlineLogout className="w-4 h-4 mr-3" />
              Đăng xuất
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
