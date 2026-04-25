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
  HiOutlineChat,
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
} from 'react-icons/hi';
import logoIcon from '../../../assets/icons/cropped-uknow-1-32x32.png';
import ChangePasswordModal from '../../../features/auth/components/ChangePasswordModal';
import AccountProfileModal from '../../../features/auth/components/AccountProfileModal';

const menuItems = [
  {
    name: 'Dashboard',
    path: '/',
    icon: HiOutlineHome,
  },
  {
    name: 'Thiết lập',
    icon: HiOutlineCog,
    children: [
      { name: 'Quản lý Email', path: '/settings/email', icon: HiOutlineMail },
      { name: 'Mẫu Email', path: '/settings/email-templates', icon: HiOutlineTemplate },
      { name: 'Quản lý Zalo', path: '/settings/zalo', icon: HiOutlineChat },
      { name: 'Mẫu Zalo', path: '/settings/zalo-templates', icon: HiOutlineTemplate },
      { name: 'Khóa học', path: '/courses', icon: HiOutlineAcademicCap },
      {
        name: 'Landing — khóa học nổi bật',
        path: '/settings/landing-featured-courses',
        icon: HiOutlinePhotograph,
        adminOnly: true,
      },
      {
        name: 'Landing — đánh giá',
        path: '/settings/landing-testimonials',
        icon: HiOutlineStar,
        adminOnly: true,
      },
      {
        name: 'Landing — trang HTML (/lp)',
        path: '/settings/landing-pages',
        icon: HiOutlineGlobeAlt,
      },
    ],
  },
  {
    name: 'Chiến dịch',
    icon: HiOutlineLightningBolt,
    children: [
      { name: 'Quản lý chiến dịch', path: '/campaigns', end: true, icon: HiOutlineViewList },
      { name: 'Tạo chiến dịch mới', path: '/campaigns/new', icon: HiOutlinePlusCircle, action: 'openCreateCampaignModal' },
      { name: 'Chạy chiến dịch', path: '/campaign-run', icon: HiOutlineLightningBolt },
    ],
  },
  {
    name: 'Khách hàng',
    path: '/customers',
    icon: HiOutlineUsers,
  },
  {
    name: 'Đơn hàng',
    path: '/orders',
    icon: HiOutlineClipboardList,
  },
  {
    name: 'Danh sách khách landing page',
    path: '/landing-leads',
    icon: HiOutlineGlobeAlt,
  },
  {
    name: 'Quản lý nhân viên',
    path: '/settings/employees',
    icon: HiOutlineUserGroup,
    adminOnly: true,
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
  const [expandedMenus, setExpandedMenus] = useLocalStorageState('uknow_sidebar_menus', ['Thiết lập', 'Chiến dịch']);
  const { user, logout } = useAuthStore();
  const isAdmin = String(user?.roleCode || '').trim().toLowerCase() === 'admin';
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAccountProfile, setShowAccountProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const userMenuRef = useRef(null);
  const navRef = useRef(null);
  useScrollPersistence('uknow_sidebar_scroll', navRef);

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
        (item.name === 'Chiến dịch' && (location.pathname.includes('/campaigns/') && location.pathname.includes('/builder')));
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

  const visibleMenuItems = menuItems
    .map((item) => {
      if (!item.children) return item;
      return {
        ...item,
        children: item.children.filter((child) => !child.adminOnly || isAdmin),
      };
    })
    .filter((item) => (!item.adminOnly || isAdmin) && (!item.children || item.children.length > 0));

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-40 sidebar-transition flex flex-col transition-transform duration-300 ease-in-out ${sidebarTransformClass}`}
      style={sidebarStyle}
    >
      {/* Logo row — includes close button on mobile */}
      <div className={`h-16 flex items-center border-b border-gray-200 ${showLabels ? 'px-4' : 'justify-center'}`}>
        <div className={`flex items-center flex-1 ${!showLabels ? 'justify-center' : ''}`}>
          <img
            src={logoIcon}
            alt="UKNOW Logo"
            className={`${showLabels ? 'w-10 h-10' : 'w-12 h-12'} object-contain transition-all duration-300`}
          />
          {showLabels && (
            <div className="ml-3">
              <h1 className="text-lg font-bold text-gray-900">UKNOW</h1>
              <p className="text-xs text-gray-500">Campaign Management</p>
            </div>
          )}
        </div>

        {/* Close button — only on mobile */}
        {isMobile && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors ml-2 flex-shrink-0"
            aria-label="Đóng menu"
          >
            <HiOutlineX className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

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
                      const isBuilderPage = location.pathname.includes('/campaigns/') && location.pathname.includes('/builder');
                      const isActiveChild = child.path === '/campaigns/new'
                        ? isBuilderPage || location.pathname === '/campaigns/new'
                        : (child.end
                          ? location.pathname === child.path
                          : location.pathname === child.path || location.pathname.startsWith(child.path + '/'));

                      const displayName = child.path === '/campaigns/new' && isBuilderPage && location.pathname !== '/campaigns/new'
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
                              navigate('/campaigns', { state: { openCreateCampaignModal: true } });
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
