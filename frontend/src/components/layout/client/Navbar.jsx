import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HiOutlineLogout, HiOutlineChevronDown, HiOutlineViewGrid } from 'react-icons/hi';
import { useAuthStore } from '../../../stores/authStore';

const AVATAR_STYLES = {
  super_admin: 'from-purple-500 to-violet-600',
  employee: 'from-blue-500 to-cyan-500',
  user_admin: 'from-orange-500 to-red-500',
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

  const dashboardPath = user?.role === 'super_admin' ? '/admin' : '/app';
  const avatarGradient = AVATAR_STYLES[user?.role] || AVATAR_STYLES.user_admin;
  const initial = (user?.fullName?.[0] || user?.username?.[0] || 'U').toUpperCase();
  const displayName = user?.fullName || user?.username || 'Tài khoản';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <div className={`w-9 h-9 bg-gradient-to-br ${avatarGradient} rounded-full flex items-center justify-center shadow-md flex-shrink-0`}>
          <span className="text-white font-bold text-sm">{initial}</span>
        </div>
        <span className="text-gray-700 font-medium text-sm max-w-[120px] truncate">{displayName}</span>
        <HiOutlineChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 z-50">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <p className="text-xs text-gray-400 leading-none mb-0.5">Tài khoản:</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{user?.email || displayName}</p>
          </div>
          <Link
            to={dashboardPath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <HiOutlineViewGrid className="w-4 h-4 text-gray-500" />
            Trang quản trị
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <HiOutlineLogout className="w-4 h-4" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuthStore();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
              <span className="text-white font-black text-xl">U</span>
            </div>
            <span className="ml-3 text-2xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tight">
              KNOW
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-slate-600 hover:text-orange-600 font-bold transition-colors">Tính năng</a>
            <a href="#pricing" className="text-slate-600 hover:text-orange-600 font-bold transition-colors">Bảng giá</a>
            <a href="#how-it-works" className="text-slate-600 hover:text-orange-600 font-bold transition-colors">Cách hoạt động</a>
            <a href="#testimonials" className="text-slate-600 hover:text-orange-600 font-bold transition-colors">Đánh giá</a>

            {isAuthenticated ? (
              <UserMenu user={user} logout={logout} />
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-5 py-2.5 border-2 border-orange-500 text-orange-600 rounded-full font-bold hover:bg-orange-50 transition-all"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-bold hover:shadow-lg hover:shadow-orange-500/30 transition-all transform hover:-translate-y-0.5"
                >
                  Đăng ký miễn phí
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}