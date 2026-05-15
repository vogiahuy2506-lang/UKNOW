import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LuChevronRight, LuChevronDown, LuMenu, LuX, LuLayoutDashboard, LuLogOut } from 'react-icons/lu';
import { useAuthStore } from '../../../stores/authStore';
import founderaiLogo from '../../../assets/icons/founderai-logo.png';

const NAV_LINKS = [
  { label: 'Trang chủ', to: '/' },
  { label: 'Bảng giá', to: '/pricing' },
  { label: 'Liên hệ', to: '/contact' },
];

const AVATAR_STYLES = {
  admin: 'from-purple-500 to-violet-600',
  super_admin: 'from-purple-500 to-violet-600',
  user: 'from-orange-500 to-red-500',
};

function UserMenu({ user, logout }) {
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

  const dashboardPath = user?.role === 'admin' || user?.role === 'super_admin' ? '/admin' : '/app';
  const avatarGradient = AVATAR_STYLES[user?.role] || AVATAR_STYLES['user'];
  const initial = (user?.fullName?.[0] || user?.username?.[0] || 'U').toUpperCase();
  const displayName = user?.fullName || user?.username || 'Tài khoản';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-neutral-100 transition-colors"
      >
        <div className={`w-7 h-7 bg-gradient-to-br ${avatarGradient} rounded-full flex items-center justify-center flex-shrink-0`}>
          <span className="text-white font-bold text-[11px]">{initial}</span>
        </div>
        <span className="text-neutral-700 font-medium text-[13px] max-w-[100px] truncate hidden sm:block">{displayName}</span>
        <LuChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform hidden sm:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">Tài khoản:</p>
            <p className="text-[13px] font-semibold text-gray-800 truncate">{user?.email || displayName}</p>
          </div>
          <Link
            to={dashboardPath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <LuLayoutDashboard className="w-4 h-4 text-gray-400" />
            Trang quản trị
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
          >
            <LuLogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export default function HeroNavbar() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuthStore();
  const { pathname } = useLocation();

  const isActive = (to) => to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <div className="flex justify-center pt-4 sm:pt-6 px-3 sm:px-4">
      <div className="bg-white rounded-full shadow-sm border border-neutral-200 pl-3 pr-2 py-2 w-full max-w-[760px] relative">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <Link to="/" className="shrink-0 flex items-center gap-2">
            <img src={founderaiLogo} alt="Founder AI" className="w-8 h-8 object-contain" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6 flex-1">
            {NAV_LINKS.map(({ label, to }) => (
              <Link
                key={label}
                to={to}
                className={`text-[14px] font-medium transition-colors ${
                  isActive(to)
                    ? 'text-orange-500 font-semibold'
                    : 'text-neutral-700 hover:text-neutral-900'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Right cluster */}
          <div className="ml-auto flex items-center gap-2">
            {isAuthenticated ? (
              <div className="hidden md:block">
                <UserMenu user={user} logout={logout} />
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-1.5">
                <Link
                  to="/login"
                  className="text-[13px] font-medium text-neutral-700 hover:text-neutral-900 transition-colors px-3 py-2"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-white rounded-full px-4 py-2"
                  style={{ backgroundColor: '#ef4d23' }}
                >
                  Đăng ký
                  <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                    <LuChevronRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
            )}

            {/* Hamburger */}
            <button
              className="md:hidden p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
              onClick={() => setOpen(!open)}
            >
              {open ? <LuX className="w-5 h-5" /> : <LuMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="absolute top-full left-2 right-2 mt-2 bg-white rounded-2xl shadow-lg border border-neutral-200 p-3 z-20">
            {NAV_LINKS.map(({ label, to }) => (
              <Link
                key={label}
                to={to}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 text-[14px] font-medium rounded-xl transition-colors ${
                  isActive(to)
                    ? 'text-orange-500 bg-orange-50 font-semibold'
                    : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-50'
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="border-t border-neutral-100 mt-2 pt-2 flex flex-col gap-1">
              {isAuthenticated ? (
                <Link
                  to="/app"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-[14px] font-medium text-neutral-700 hover:bg-neutral-50 rounded-xl transition-colors"
                >
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: '#ef4d23' }}>
                    {(user?.fullName?.[0] || user?.username?.[0] || 'U').toUpperCase()}
                  </div>
                  {user?.username || user?.email}
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-[14px] font-medium text-neutral-700 hover:bg-neutral-50 rounded-xl transition-colors"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-[14px] font-semibold text-white rounded-xl transition-colors text-center"
                    style={{ backgroundColor: '#ef4d23' }}
                  >
                    Đăng ký
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
