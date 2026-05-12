import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import {
  HiOutlineMenu,
  HiOutlineLockClosed,
  HiOutlineLogout,
} from 'react-icons/hi';
import logoIcon from '../../../assets/icons/cropped-founder-1-32x32.png';
import ChangePasswordModal from '../../../features/auth/components/ChangePasswordModal';

const Header = ({ onToggleSidebar }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
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
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Mở menu"
        >
          <HiOutlineMenu className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex items-center gap-2">
          <img src={logoIcon} alt="Founder AI Logo" className="w-7 h-7 object-contain" />
          <span className="text-sm font-bold text-gray-900">Founder AI</span>
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
            <span className="text-white font-medium text-sm">
              {user?.fullName?.[0] || user?.username?.[0] || 'U'}
            </span>
          </div>
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">{user?.fullName || user?.username}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <div className="p-2">
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowChangePassword(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600 rounded-lg transition-colors"
              >
                <HiOutlineLockClosed className="w-5 h-5" />
                Đổi mật khẩu
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <HiOutlineLogout className="w-5 h-5" />
                Đăng xuất
              </button>
            </div>
          </div>
        )}
      </div>

      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
      />
    </header>
  );
};

export default Header;
