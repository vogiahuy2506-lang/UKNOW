import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { HiOutlineLogout, HiOutlineChevronDown, HiOutlineViewGrid, HiMenu, HiX } from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';
import { useI18n } from '../../../i18n';
import founderaiLogo from '../../../assets/icons/founderai-logo.png';

/**
 * Navbar - Refactored với Impeccable design principles:
 * - Modern glassmorphism effect
 * - Smooth transitions
 * - Better mobile experience
 * - Clear visual hierarchy
 */

const NAV_LINKS = [
  { kind: 'route', to: '/',        labelKey: 'header.home', matchPaths: ['/'] },
  { kind: 'route', to: '/pricing', labelKey: 'header.pricing', matchPaths: ['/pricing'] },
  { kind: 'route', to: '/contact', labelKey: 'header.contact', matchPaths: ['/contact'] },
];

const AVATAR_STYLES = {
  admin: 'from-purple-500 to-violet-600',
  employee: 'from-blue-500 to-cyan-500',
  'user': 'from-orange-500 to-red-500',
};

function UserMenu({ user, logout }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    navigate('/login');
  };

  const dashboardPath = user?.role === 'admin' ? '/admin' : '/app';
  const avatarGradient = AVATAR_STYLES[user?.role] || AVATAR_STYLES['user'];
  const initial = (user?.fullName?.[0] || user?.username?.[0] || 'U').toUpperCase();
  const displayName = user?.fullName || user?.username || t('navbar.account');

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-full hover:bg-slate-100 transition-all duration-200"
      >
        <div 
          className={`w-9 h-9 bg-gradient-to-br ${avatarGradient} rounded-full flex items-center justify-center shadow-md flex-shrink-0 ring-2 ring-white/50`}
        >
          <span className="text-white font-bold text-sm">{initial}</span>
        </div>
        <span className="text-slate-700 font-medium text-sm max-w-[120px] truncate">{displayName}</span>
        <HiOutlineChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div 
          className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 z-50 opacity-0 scale-95 animate-fadeIn"
          style={{ animation: 'scaleIn 0.2s ease forwards' }}
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs text-slate-400 leading-none mb-0.5">{t('navbar.account')}</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{user?.email || displayName}</p>
          </div>
          <Link
            to={dashboardPath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <HiOutlineViewGrid className="w-4 h-4 text-slate-500" />
            {t('navbar.adminDashboard')}
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <HiOutlineLogout className="w-4 h-4" />
            {t('common.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

function MobileMenu({ isOpen, onClose }) {
  const { t } = useI18n();
  const { user, isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] lg:hidden"
      style={{ animation: 'fadeIn 0.2s ease' }}
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div 
        className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl p-6"
        style={{ animation: 'slideInRight 0.3s ease' }}
      >
        <div className="flex items-center justify-between mb-8">
          <Link to="/" onClick={onClose} className="flex items-center gap-2">
            <img src={founderaiLogo} alt="Founder AI" className="h-8 w-auto" />
            <span className="text-lg font-bold">
              <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Founder</span>
              <span className="text-slate-800">AI</span>
            </span>
          </Link>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <HiX className="w-5 h-5" />
          </button>
        </div>

        <nav className="space-y-1">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className="block px-4 py-3 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="mt-8 pt-6 border-t border-slate-100">
          {isAuthenticated ? (
            <div className="space-y-1">
              <div className="px-4 py-2 text-sm text-slate-500">
                Xin chào, <span className="font-semibold text-slate-700">{user?.fullName || user?.username}</span>
              </div>
              <Link
                to={user?.role === 'admin' ? '/admin' : '/app'}
                onClick={onClose}
                className="flex items-center gap-2 px-4 py-2.5 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <HiOutlineViewGrid className="w-5 h-5" />
                Dashboard
              </Link>
              <button
                onClick={async () => { await logout(); onClose(); navigate('/login'); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <HiOutlineLogout className="w-5 h-5" />
                Đăng xuất
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <Link
                to="/login"
                onClick={onClose}
                className="block w-full text-center px-5 py-3 border-2 border-orange-500 text-orange-600 rounded-xl font-bold hover:bg-orange-50 transition-all"
              >
                Đăng nhập
              </Link>
              <Link
                to="/register"
                onClick={onClose}
                className="block w-full text-center px-5 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-orange-500/30 transition-all"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { t } = useI18n();
  const { user, isAuthenticated, logout } = useAuthStore();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (item) => item.matchPaths?.includes(location.pathname);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px]">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <img
                src={founderaiLogo}
                alt="Founder AI Logo"
                className="h-10 w-auto object-contain transition-transform duration-200 group-hover:scale-105"
              />
              <span className="text-xl font-black tracking-tight hidden sm:block">
                <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Founder</span>
                <span className="text-slate-800 ml-1">AI</span>
              </span>
            </Link>

            {/* Desktop Menu */}
            <div className="hidden lg:flex items-center justify-center gap-12">
              {NAV_LINKS.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`font-semibold transition-all duration-200 relative group ${
                      active ? 'text-orange-600' : 'text-slate-600 hover:text-orange-600'
                    }`}
                  >
                    {t(item.labelKey)}
                    <span 
                      className={`absolute -bottom-1 left-0 h-0.5 bg-orange-500 transition-all duration-200 ${
                        active ? 'w-full' : 'w-0 group-hover:w-full'
                      }`}
                    />
                  </Link>
                );
              })}
            </div>

            {/* Desktop Actions */}
            <div className="hidden lg:flex items-center gap-4">
              {isAuthenticated ? (
                <UserMenu user={user} logout={logout} />
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-5 py-2.5 border-2 border-orange-500 text-orange-600 rounded-full font-bold hover:bg-orange-50 transition-all duration-200"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    to="/register"
                    className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-bold hover:shadow-lg hover:shadow-orange-500/30 transition-all duration-200 active:scale-[0.98]"
                  >
                    Đăng ký
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <HiMenu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      <style>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
