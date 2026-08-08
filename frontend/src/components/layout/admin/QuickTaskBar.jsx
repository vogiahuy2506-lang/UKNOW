import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineLogout,
  HiOutlineLockClosed,
  HiOutlineUserCircle,
  HiOutlineGlobeAlt,
  HiOutlineCheck,
  HiOutlineUser,
  HiOutlineUserGroup,
  HiOutlineChevronDown,
} from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { useI18n } from '../../../i18n';
import { useComingSoon } from '../../../contexts/useComingSoon';
import AccountProfileModal from '../../../features/auth/components/AccountProfileModal';
import ChangePasswordModal from '../../../features/auth/components/ChangePasswordModal';

const QuickTaskBar = ({ className = '' }) => {
  const { t, locale, changeLocale } = useI18n();
  const { user, logout, activeContext, switchContext } = useAuthStore();
  const navigate = useNavigate();
  const { showComingSoon } = useComingSoon();

  const [profileOpen, setProfileOpen] = useState(false);
  const [showAccountProfile, setShowAccountProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const quickItems = [
    { key: 'marketplace', label: 'Marketplace', accent: true, onClick: () => showComingSoon() },
    { key: 'docs', label: t('header.docs'), onClick: () => navigate('/huong-dan') },
    { key: 'home', label: t('header.home'), onClick: () => navigate('/') },
    { key: 'pricing', label: t('header.pricing'), onClick: () => navigate('/pricing') },
    { key: 'contact', label: t('header.contact'), onClick: () => navigate('/contact') },
  ];

  return (
    <>
      <div className={`sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 ${className}`}>
        <div className="flex items-center justify-end h-8 px-2 gap-1">
          {quickItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={`inline-flex items-center h-7 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                item.accent
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}

          <div className="w-px h-4 bg-gray-200 mx-0.5" />

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen(o => !o)}
              title={user?.fullName || user?.username || 'User'}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-medium text-[9px] leading-none">
                  {user?.fullName?.[0] || user?.username?.[0] || 'U'}
                </span>
              </div>
              <span className="whitespace-nowrap">{user?.fullName || user?.username || 'User'}</span>
              <HiOutlineChevronDown className={`w-3 h-3 transition-transform flex-shrink-0 ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user?.fullName || user?.username}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>

                <div className="p-2 border-b border-gray-100">
                  <p className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {t('header.activeContext')}
                  </p>
                  <button
                    onClick={() => { switchContext(null); setProfileOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      activeContext.type === 'self'
                        ? 'bg-primary-50 text-primary-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <HiOutlineUser className="w-4 h-4" />
                      {t('header.personal')}
                    </div>
                    {activeContext.type === 'self' && <HiOutlineCheck className="w-3.5 h-3.5" />}
                  </button>
                  {user?.memberships?.map((m) => (
                    <button
                      key={m.ownerId}
                      onClick={() => { switchContext(m.ownerId); setProfileOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-lg transition-colors mt-0.5 ${
                        activeContext.type === 'employee' && activeContext.ownerId === m.ownerId
                          ? 'bg-primary-50 text-primary-600 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <HiOutlineUserGroup className="w-4 h-4" />
                        <span className="truncate max-w-[140px]">{m.ownerName || m.ownerUsername}</span>
                      </div>
                      {activeContext.type === 'employee' && activeContext.ownerId === m.ownerId && (
                        <HiOutlineCheck className="w-3.5 h-3.5 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="p-1.5">
                  <button
                    onClick={() => { setShowAccountProfile(true); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <HiOutlineUserCircle className="w-4 h-4 text-gray-400" />
                    {t('sidebar.accountInfo')}
                  </button>
                  <button
                    onClick={() => { setShowChangePassword(true); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <HiOutlineLockClosed className="w-4 h-4 text-gray-400" />
                    {t('sidebar.changePassword')}
                  </button>

                  <div className="flex items-center justify-between px-3 py-1.5">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <HiOutlineGlobeAlt className="w-4 h-4" />
                      {t('sidebar.language')}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[{ code: 'vi', flag: '🇻🇳' }, { code: 'en', flag: '🇺🇸' }].map(({ code, flag }) => (
                        <button
                          key={code}
                          onClick={() => changeLocale(code)}
                          className={`text-sm px-1 py-0.5 rounded transition-opacity ${locale === code ? 'opacity-100' : 'opacity-30 hover:opacity-70'}`}
                        >
                          {flag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-1.5 border-t border-gray-100">
                  <button
                    onClick={async () => { await logout(); navigate('/login'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <HiOutlineLogout className="w-4 h-4" />
                    {t('sidebar.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AccountProfileModal isOpen={showAccountProfile} onClose={() => setShowAccountProfile(false)} />
      <ChangePasswordModal isOpen={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </>
  );
};

export default QuickTaskBar;