import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initAnalytics, trackPageView } from '../utils/analytics';

/**
 * Bắn page_view mỗi lần đổi route. Đặt bên trong `<Router>` của App —
 * nhánh custom domain return trước `<Router>` nên component này không bao giờ
 * chạy trên landing của khách.
 */
const RouteAnalytics = () => {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
};

export default RouteAnalytics;
