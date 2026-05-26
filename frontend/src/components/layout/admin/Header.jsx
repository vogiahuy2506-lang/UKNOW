import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import {
  HiOutlineMenu,
  HiOutlineLockClosed,
  HiOutlineLogout,
  HiOutlineUser,
  HiOutlineUserGroup,
  HiCheck,
} from 'react-icons/hi';
import logoIcon from '../../../assets/icons/founderai-logo.png';
import ChangePasswordModal from '../../../features/auth/components/ChangePasswordModal';
import LanguageSwitcher from '../../LanguageSwitcher';
import { useI18n } from '../../../i18n';

const Header = ({ onToggleSidebar }) => {
  const { t } = useI18n();
  const { user, logout, activeContext, switchContext } = useAuthStore();
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
          aria-label={t('header.openMenu')}
        >
          <HiOutlineMenu className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex items-center gap-2">
          <img src={logoIcon} alt="Founder AI Logo" className="h-7 w-auto object-contain" />
          {activeContext.type === 'employee' && (
            <span className="text-sm text-primary-600 font-medium opacity-80">
              / {activeContext.ownerName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />

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
              <div className="p-2 border-b border-gray-100">
                <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {t('header.activeContext')}
                </p>
                <button
                  onClick={() => {
                    switchContext(null);
                    setShowMenu(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                    activeContext.type === 'self'
                      ? 'bg-primary-50 text-primary-600 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HiOutlineUser className="w-4 h-4" />
                    {t('header.personal')}
                  </div>
                  {activeContext.type === 'self' && <HiCheck className="w-4 h-4" />}
                </button>

                {user?.memberships?.map((m) => (
                  <button
                    key={m.ownerId}
                    onClick={() => {
                      switchContext(m.ownerId);
                      setShowMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors mt-1 ${
                      activeContext.type === 'employee' && activeContext.ownerId === m.ownerId
                        ? 'bg-primary-50 text-primary-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <HiOutlineUserGroup className="w-4 h-4" />
                      <span className="truncate max-w-[140px]">
                        {m.ownerName || m.ownerUsername}
                      </span>
                    </div>
                    {activeContext.type === 'employee' && activeContext.ownerId === m.ownerId && (
                      <HiCheck className="w-4 h-4" />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-2">
                <button
                  onClick={() => {
                    setShowMenu(false);
                    setShowChangePassword(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <HiOutlineLockClosed className="w-4 h-4" />
                  {t('header.changePassword')}
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <HiOutlineLogout className="w-5 h-5" />
                  {t('header.logout')}
                </button>
              </div>
            </div>
          )}
        </div>

        <ChangePasswordModal
          isOpen={showChangePassword}
          onClose={() => setShowChangePassword(false)}
        />
      </div>
    </header>
  );
};

export default Header;
