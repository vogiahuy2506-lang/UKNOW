import { useNavigate } from 'react-router-dom';
import { HiOutlineShieldExclamation, HiOutlineLogout, HiOutlineHome } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';

const UnauthorizedScreen = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <Navbar />

      <div className="flex-1 flex items-center justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <HiOutlineShieldExclamation className="w-8 h-8 text-red-500" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">Không có quyền truy cập</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Trang này chỉ dành cho quản trị viên hệ thống (Super Admin).
          </p>

          {user && (
            <p className="text-xs text-gray-400 mt-3">
              Đăng nhập với tài khoản <strong>{user.email}</strong>
            </p>
          )}

          <div className="flex flex-col gap-2 mt-8">
            <button onClick={() => navigate('/app')} className="btn btn-primary w-full">
              <HiOutlineHome className="w-4 h-4 mr-2" />
              Về trang của tôi
            </button>
            <button onClick={handleLogout} className="btn btn-secondary w-full">
              <HiOutlineLogout className="w-4 h-4 mr-2" />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default UnauthorizedScreen;
