import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureReferralFromUrl } from '../utils/referralStorage';

/**
 * Tự động bắt tham số ?ref= trên URL và lưu vào localStorage (hạn 30 ngày).
 * Đặt bên trong <Router> để chạy khi trang tải lần đầu và mỗi khi chuyển route.
 */
const ReferralCapture = () => {
  const location = useLocation();

  useEffect(() => {
    captureReferralFromUrl(location.search);
  }, [location.search]);

  return null;
};

export default ReferralCapture;
