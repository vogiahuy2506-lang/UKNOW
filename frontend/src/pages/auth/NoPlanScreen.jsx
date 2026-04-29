import { useNavigate } from 'react-router-dom';
import { HiOutlineLockClosed, HiOutlineLogout, HiOutlineArrowRight } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';

const NoPlanScreen = () => {
  const { logout } = useAuthStore();
  const navigate   = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <Navbar />

      {/* pt-20 để tránh bị Navbar fixed che */}
      <div className="flex-1 flex items-center justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <HiOutlineLockClosed className="w-8 h-8 text-primary-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900">Bạn chưa có gói dịch vụ</h2>
          <p className="text-gray-500 mt-3 text-sm leading-relaxed">
            Để truy cập trang quản trị và sử dụng các tính năng, bạn cần đăng ký một gói dịch vụ phù hợp.
          </p>

          <div className="flex flex-col gap-3 mt-8">
            <button onClick={() => navigate('/about')} className="btn btn-primary w-full">
              Xem các gói dịch vụ
              <HiOutlineArrowRight className="w-4 h-4 ml-2" />
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

export default NoPlanScreen;
