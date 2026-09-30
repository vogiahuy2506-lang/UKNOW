import DashboardKpiCards from './DashboardKpiCards';
import DashboardInsightOverview from './DashboardInsightOverview';
import DashboardOrdersChart from './DashboardOrdersChart';
import DashboardSentChart from './DashboardSentChart';
import DashboardCampaignsTable from './DashboardCampaignsTable';
import {
  getChannelEngagementInsightForChannel,
  getOrdersTrendInsightForMode,
} from '../utils/dashboardInsightStorage.util';

/**
 * Bố cục chỉ dùng cho in/PDF: mỗi khối biểu đồ (+ insight) một trang; cùng số liệu với màn hình.
 *
 * Luồng trang:
 * 1. KPI + tiêu đề khoảng thời gian (trang mở giống màn hình).
 * 2. Tổng quan insight (Gemini).
 * 3. «Đã gửi mỗi ngày» + insight riêng.
 * 4. «Chiến dịch trong kỳ».
 * 5. Chủ tài khoản: «Đơn hàng theo thời gian» — Tổng hợp rồi So sánh kênh, mỗi tab một trang + insight riêng.
 *
 * @param {object} props — cùng dữ liệu đang hiển thị trên Dashboard
 * @param {boolean} [props.showOrders=true] — nhân viên không có trang đơn hàng
 */
const DashboardPrintLayout = ({
  filters,
  overview,
  insights,
  isGeneratingInsights,
  insightError,
  dailySent,
  ordersTimeline,
  campaigns,
  isMonthlyView,
  showOrders = true,
}) => {
  const fmt = (d) => {
    if (!d) return '—';
    const [y, m, day] = String(d).split('-');
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="bg-white text-gray-900 text-[13px] leading-normal">
      {/* Trang 1: KPI + tiêu đề (ưu tiên giống màn hình Báo cáo) */}
      <div className="pdf-print-page space-y-4">
        <p className="text-sm font-semibold text-gray-800">
          Báo cáo — {fmt(filters?.startDate)} — {fmt(filters?.endDate)}
        </p>
        <DashboardKpiCards overview={overview} />
      </div>

      <div className="pdf-print-page">
        <div className="card p-5 md:p-6">
          <h3 className="text-base font-semibold text-gray-900">Tổng quan insight</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Phân tích theo bộ lọc và (nếu có) insight AI đang hiển thị trên màn hình
          </p>
          <div className="mt-4">
            <DashboardInsightOverview insights={insights} isLoading={isGeneratingInsights} error={insightError} />
          </div>
        </div>
      </div>

      <div className="pdf-print-page space-y-4">
        <DashboardSentChart
          dailySent={dailySent}
          isMonthlyView={isMonthlyView}
          insightText={getChannelEngagementInsightForChannel(insights?.charts, 'all', { forPrint: true })}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
      </div>

      <div className="pdf-print-page space-y-4">
        <DashboardCampaignsTable campaigns={campaigns} />
      </div>

      {showOrders && (
        <>
          <div className="pdf-print-page space-y-4">
            <p className="text-xs text-gray-500">
              Bản in — Đơn hàng theo thời gian:{' '}
              <span className="font-semibold text-gray-700">Tổng hợp</span>
            </p>
            <DashboardOrdersChart
              timeline={ordersTimeline}
              isMonthlyView={isMonthlyView}
              lockedViewMode="summary"
              insightText={getOrdersTrendInsightForMode(insights?.charts, 'summary')}
              isInsightLoading={isGeneratingInsights}
              insightError={insightError}
            />
          </div>

          <div className="pdf-print-page space-y-4">
            <p className="text-xs text-gray-500">
              Bản in — Đơn hàng theo thời gian:{' '}
              <span className="font-semibold text-gray-700">So sánh kênh</span>
            </p>
            <DashboardOrdersChart
              timeline={ordersTimeline}
              isMonthlyView={isMonthlyView}
              lockedViewMode="compare"
              insightText={getOrdersTrendInsightForMode(insights?.charts, 'compare')}
              isInsightLoading={isGeneratingInsights}
              insightError={insightError}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPrintLayout;
