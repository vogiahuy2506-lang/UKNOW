import { useNavigate } from 'react-router-dom';
import { HiOutlineRefresh, HiOutlineLogout, HiOutlineClock, HiOutlineArrowRight } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import Navbar from '../../components/layout/client/Navbar';
import Footer from '../../components/layout/client/Footer';

const RenewalScreen = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const expiredDate = user?.subscriptionExpiresAt
    ? new Date(user.subscriptionExpiresAt).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : null;

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <Navbar />

      <div className="flex-1 flex items-center justify-center px-4 pt-20">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <HiOutlineClock className="w-8 h-8 text-primary-600" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900">Gói của bạn đã hết hạn</h2>

          {expiredDate && (
            <p className="text-sm text-gray-400 mt-1">
              Hết hạn ngày {expiredDate}
            </p>
          )}

          <p className="text-gray-500 mt-4 text-sm leading-relaxed">
            Chào mừng bạn trở lại! Gia hạn gói để tiếp tục sử dụng tất cả tính năng —
            dữ liệu chiến dịch, khách hàng và landing page của bạn vẫn được giữ nguyên.
          </p>

          <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mt-5 text-left">
            <p className="text-xs text-orange-700 font-medium">Lưu ý</p>
            <p className="text-xs text-orange-600 mt-0.5 leading-relaxed">
              Trong thời gian chờ gia hạn, bạn không thể gửi email và Zalo mới.
              Dữ liệu hiện có không bị xóa.
            </p>
          </div>

          <div className="flex flex-col gap-3 mt-8">
            <button onClick={() => navigate('/about')} className="btn btn-primary w-full">
              <HiOutlineRefresh className="w-4 h-4 mr-2" />
              Gia hạn ngay
            </button>
            <button
              onClick={() => navigate('/about')}
              className="btn btn-secondary w-full text-sm"
            >
              Xem các gói dịch vụ
              <HiOutlineArrowRight className="w-4 h-4 ml-2" />
            </button>
            <button onClick={handleLogout} className="btn btn-secondary w-full text-sm text-gray-400">
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

export default RenewalScreen;
