import { Link } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';

export default function Navbar() {
  const { user, isAuthenticated } = useAuthStore();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30">
              <span className="text-white font-black text-2xl">U</span>
            </div>
            <span className="ml-3 text-2xl font-bold bg-gradient-to-r from-orange-600 to-red-500 bg-clip-text text-transparent">
              UKNOW
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">Tính năng</a>
            <a href="#pricing" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">Bảng giá</a>
            <a href="#how-it-works" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">Cách hoạt động</a>
            <a href="#testimonials" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">Đánh giá</a>

            {isAuthenticated ? (
              // Đã đăng nhập
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-md">
                  <span className="text-white font-bold text-sm">
                    {user?.fullName?.[0] || user?.username?.[0] || 'U'}
                  </span>
                </div>
                <Link
                  to="/dashboard"
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all transform hover:scale-105"
                >
                  Vào Dashboard
                </Link>
              </div>
            ) : (
              // Chưa đăng nhập
              <>
                <Link
                  to="/login"
                  className="px-5 py-2.5 border-2 border-orange-500 text-orange-500 rounded-full font-semibold hover:bg-orange-50 transition-all"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all transform hover:scale-105"
                >
                  Đăng ký
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}