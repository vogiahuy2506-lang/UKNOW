import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  HiOutlineMenu,
  HiOutlineLockClosed,
  HiOutlineLogout,
} from 'react-icons/hi';
import logoIcon from '../../assets/icons/cropped-founder-1-32x32.png';
import ChangePasswordModal from '../../features/auth/components/ChangePasswordModal';

/**
 * Mobile top header bar.
 *
 * Displayed only on mobile viewports. Shows the app logo, a hamburger button
 * to open the sidebar drawer, and a user avatar with dropdown menu for account actions.
 *
 * @param {function} onToggleSidebar - Callback to open/close the sidebar drawer
 */
const Header = ({ onToggleSidebar }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const userMenuRef = useRef(null);

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

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-30">
      {/* Left side: hamburger + logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Mở menu"
        >
          <HiOutlineMenu className="w-6 h-6 text-gray-600" />
        </button>

        <div className="flex items-center gap-2">
          <img src={logoIcon} alt="Founder AI Logo" className="w-8 h-8 object-contain" />
          <span className="text-base font-bold text-gray-900">Founder AI</span>
        </div>
      </div>

      {/* Right side: user */}
      <div className="flex items-center gap-2">
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
              <span className="text-white font-medium text-sm">
                {user?.fullName?.[0] || user?.username?.[0] || 'U'}
              </span>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.fullName || user?.username}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>

              <div className="py-1">
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
              </div>

              <div className="border-t border-gray-100 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <HiOutlineLogout className="w-4 h-4 mr-3" />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </header>
  );
};

export default Header;
