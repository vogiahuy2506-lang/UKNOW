import { Link } from 'react-router-dom';
import { useI18n } from '../../../i18n';

/**
 * Hai đường dẫn thay cho hai khối đã chuyển chỗ khỏi trang Báo cáo:
 * - bảng lượt chạy → trang "Giám sát gửi tin" (`/app/delivery-monitor`, 10 lượt gần nhất + số hôm nay);
 * - bảng thống kê landing → trang Landing page (`/app/settings/landing-pages`).
 * Mỗi link chỉ hiện khi người xem có quyền mở trang đích (nhân viên chưa được cấp thì không thấy link bấm vào bị chặn).
 *
 * @param {{ showDeliveryMonitor?: boolean, showLanding?: boolean }} props
 */
const DashboardReportLinks = ({ showDeliveryMonitor = true, showLanding = true }) => {
  const { t } = useI18n();
  if (!showDeliveryMonitor && !showLanding) return null;

  const linkClass = 'inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline';

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1" data-testid="dashboard-report-links">
      {showDeliveryMonitor && (
        <Link to="/app/delivery-monitor" className={linkClass}>
          {t('dashboardReport.links.deliveryMonitor')} →
        </Link>
      )}
      {showLanding && (
        <Link to="/app/settings/landing-pages" className={linkClass}>
          {t('dashboardReport.links.landing')} →
        </Link>
      )}
    </div>
  );
};

export default DashboardReportLinks;
