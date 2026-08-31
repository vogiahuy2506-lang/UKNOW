import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HiOutlineLogout,
  HiOutlineLockClosed,
  HiOutlineUserCircle,
  HiOutlineGlobeAlt,
  HiOutlineCheck,
  HiOutlineUser,
  HiOutlineUserGroup,
  HiOutlineChevronDown,
  HiOutlineShoppingCart,
  HiOutlineSparkles,
} from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { useI18n } from '../../../i18n';
import { useMarketplaceModal } from '../../../contexts/useMarketplaceModal';
import AccountProfileModal from '../../../features/auth/components/AccountProfileModal';
import ChangePasswordModal from '../../../features/auth/components/ChangePasswordModal';
import logoIcon from '../../../assets/icons/founderai-logo.png';

const AVATAR_STYLES = {
  admin: 'from-purple-500 to-violet-600',
  super_admin: 'from-purple-500 to-violet-600',
  user: 'from-orange-500 to-red-500',
};

const Header = () => {
  const { t, locale, changeLocale } = useI18n();
  const { user, logout, activeContext, switchContext } = useAuthStore();
  const navigate = useNavigate();
  const { showMarketplace } = useMarketplaceModal();

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
    { key: 'marketplace', label: 'Marketplace', accent: true, onClick: () => showMarketplace() },
    { key: 'docs', label: t('header.docs'), onClick: () => navigate('/huong-dan') },
    { key: 'home', label: t('header.home'), onClick: () => navigate('/') },
    { key: 'upgrade', label: t('header.upgrade'), accent: 'primary', onClick: () => navigate('/pricing') },
    { key: 'contact', label: t('header.contact'), onClick: () => navigate('/contact') },
  ];

  const avatarGradient = AVATAR_STYLES[user?.role] || AVATAR_STYLES['user'];
  const avatarInitial = (user?.fullName?.[0] || user?.username?.[0] || 'U').toUpperCase();
  const displayName = user?.fullName || user?.username || 'User';

  return (
    <>
      <header className="w-full h-[44px] bg-white flex items-center pl-3 pr-3 border-b border-gray-200">
        {/* Left: Logo + Brand — icon's left edge aligned with sidebar icons */}
        <Link to="/" className="flex items-center gap-2 shrink-0 group">
          <span className="w-7 h-7 flex items-center justify-center shrink-0">
            <img src={logoIcon} alt="Founder AI" className="w-7 h-7 object-contain" />
          </span>
          <span className="text-[16px] font-bold text-gray-900 tracking-tight hidden sm:inline leading-none">
            Founder AI
          </span>
        </Link>

        {/* Spacer */}
        <div className="flex-1 min-w-[16px]" />

        {/* Center: quick nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {quickItems.map((item) => {
            const accentClass =
              item.accent === 'primary'
                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-sm hover:shadow-md'
                : item.accent
                ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100';
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={`inline-flex items-center h-7 px-2 rounded-md text-[12px] font-medium whitespace-nowrap transition-all ${accentClass}`}
              >
                {item.key === 'marketplace' && <HiOutlineShoppingCart className="w-3.5 h-3.5 mr-1.5" />}
                {item.key === 'upgrade' && <HiOutlineSparkles className="w-3.5 h-3.5 mr-1.5" />}
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile: compact marketplace icon */}
        <button
          type="button"
          onClick={() => showMarketplace()}
          className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-lg bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition-colors"
          aria-label="Marketplace"
        >
          <HiOutlineShoppingCart className="w-4 h-4" />
        </button>

        {/* Right: profile dropdown */}
        <div className="relative shrink-0" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-1.5 h-8 px-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div
              className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarGradient} flex items-center justify-center shrink-0 shadow-sm`}
            >
              <span className="text-white font-bold text-[11px] leading-none">{avatarInitial}</span>
            </div>
            <div className="hidden lg:flex flex-col items-start flex-1 min-w-0">
              <span className="text-[13px] font-semibold text-gray-900 leading-tight truncate">{displayName}</span>
              <span className="text-[10px] text-gray-400 leading-tight capitalize">
                {activeContext?.type === 'employee' ? t('sidebar.employee') : t('sidebar.owner')}
              </span>
            </div>
            <HiOutlineChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50">
              <div className="px-4 py-3.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <p className="text-[13px] font-bold text-gray-900 truncate">{user?.fullName || user?.username}</p>
                <p className="text-[12px] text-gray-500 truncate mt-0.5">{user?.email}</p>
              </div>

              {/* Context switcher */}
              <div className="p-2 border-b border-gray-100">
                <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {t('header.activeContext')}
                </p>
                <button
                  onClick={async () => { setProfileOpen(false); await switchContext(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-xl transition-colors ${
                    activeContext.type === 'self'
                      ? 'bg-orange-50 text-orange-600 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <HiOutlineUser className="w-4 h-4" />
                    {t('header.personal')}
                  </div>
                  {activeContext.type === 'self' && <HiOutlineCheck className="w-4 h-4" />}
                </button>
                {user?.memberships?.map((m) => (
                  <button
                    key={m.ownerId}
                    onClick={async () => { setProfileOpen(false); await switchContext(m.ownerId); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-[13px] rounded-xl transition-colors mt-1 ${

                      activeContext.type === 'employee' && activeContext.ownerId === m.ownerId
                        ? 'bg-orange-50 text-orange-600 font-semibold'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <HiOutlineUserGroup className="w-4 h-4" />
                      <span className="truncate max-w-[140px]">{m.ownerName || m.ownerUsername}</span>
                    </div>
                    {activeContext.type === 'employee' && activeContext.ownerId === m.ownerId && (
                      <HiOutlineCheck className="w-4 h-4 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Settings */}
              <div className="p-1.5">
                <button
                  onClick={() => { setShowAccountProfile(true); setProfileOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <HiOutlineUserCircle className="w-4 h-4 text-gray-400" />
                  {t('sidebar.accountInfo')}
                </button>
                <button
                  onClick={() => { setShowChangePassword(true); setProfileOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <HiOutlineLockClosed className="w-4 h-4 text-gray-400" />
                  {t('sidebar.changePassword')}
                </button>
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 text-[13px] text-gray-500">
                    <HiOutlineGlobeAlt className="w-4 h-4" />
                    {t('sidebar.language')}
                  </div>
                  <div className="flex items-center gap-0.5">
                    {[{ code: 'vi', flag: '🇻🇳' }, { code: 'en', flag: '🇺🇸' }].map(({ code, flag }) => (
                      <button
                        key={code}
                        onClick={() => changeLocale(code)}
                        className={`text-[15px] px-1.5 py-1 rounded-lg transition-all ${
                          locale === code ? 'bg-gray-100 opacity-100' : 'opacity-40 hover:opacity-80'
                        }`}
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
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <HiOutlineLogout className="w-4 h-4" />
                  {t('sidebar.logout')}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <AccountProfileModal isOpen={showAccountProfile} onClose={() => setShowAccountProfile(false)} />
      <ChangePasswordModal isOpen={showChangePassword} onClose={() => setShowChangePassword(false)} />
    </>
  );
};

export default Header;
