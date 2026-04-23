import DashboardKpiCards from './DashboardKpiCards';
import DashboardInsightOverview from './DashboardInsightOverview';
import DashboardOrdersChart from './DashboardOrdersChart';
import DashboardChannelTabs from './DashboardChannelTabs';
import DashboardChannelBreakdownCharts from './DashboardChannelBreakdownCharts';
import { DashboardTopChartsPrintSection } from './DashboardTopCharts';
import LandingPagesAdminStatsCharts from '../../landing-pages/components/LandingPagesAdminStatsCharts.jsx';
import {
  getChannelEngagementInsightForChannel,
  getOrdersTrendInsightForMode,
} from '../utils/dashboardInsightStorage.util';

/** Thứ tự tab kênh trùng UI dashboard — mỗi mục một trang khi in PDF */
const PRINT_CHANNEL_SEQUENCE = [
  { id: 'all', label: 'Tất cả' },
  { id: 'email', label: 'Email' },
  { id: 'zalo', label: 'Zalo' },
  { id: 'zalo_group', label: 'Zalo Group' },
];

/**
 * Bố cục chỉ dùng cho in/PDF: mỗi khối biểu đồ (+ insight) một trang; Top landing + insight là trang cuối.
 *
 * Luồng trang:
 * 1. KPI + tiêu đề khoảng thời gian (trang mở giống tổng quan).
 * 2. Tổng quan insight (Gemini).
 * 3. Đơn hàng — Tổng hợp + insight riêng.
 * 4. Đơn hàng — So sánh kênh + insight riêng.
 * 5. Bốn trang «Tương tác theo kênh» — mỗi trang một tab + insight riêng.
 * 6. Donut cơ cấu kênh (click / đã mua / chờ).
 * 7. Top lists (khóa học, chiến dịch).
 * 8. Top landing (xem, tracking, form) + insight.
 *
 * @param {object} props — cùng dữ liệu đang hiển thị trên Dashboard
 */
const DashboardPrintLayout = ({
  filters,
  overview,
  insights,
  isGeneratingInsights,
  insightError,
  timeline,
  isMonthlyView,
  analytics,
  topListsData,
  landingPageStats,
}) => {
  const fmt = (d) => {
    if (!d) return '—';
    const [y, m, day] = String(d).split('-');
    return `${day}/${m}/${y}`;
  };

  /** In PDF: tab cố định theo từng trang, không đổi state */
  const noop = () => {};

  return (
    <div className="bg-white text-gray-900 text-[13px] leading-normal">
      {/* Trang 1: KPI + tiêu đề (ưu tiên giống màn hình tổng quan) */}
      <div className="pdf-print-page space-y-4">
        <p className="text-sm font-semibold text-gray-800">
          Campaign Dashboard — in báo cáo — {fmt(filters?.startDate)} — {fmt(filters?.endDate)}
        </p>
        <DashboardKpiCards overview={overview} />
      </div>

      <div className="pdf-print-page">
        <div className="card p-5 md:p-6">
          <h3 className="text-base font-semibold text-gray-900">Tổng quan insight</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Phân tích theo bộ lọc và (nếu có) insight Gemini đang hiển thị trên màn hình
          </p>
          <div className="mt-4">
            <DashboardInsightOverview insights={insights} isLoading={isGeneratingInsights} error={insightError} />
          </div>
        </div>
      </div>

      <div className="pdf-print-page space-y-4">
        <p className="text-xs text-gray-500">
          Bản in — Đơn hàng theo thời gian:{' '}
          <span className="font-semibold text-gray-700">Tổng hợp</span>
        </p>
        <DashboardOrdersChart
          timeline={timeline}
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
          timeline={timeline}
          isMonthlyView={isMonthlyView}
          lockedViewMode="compare"
          insightText={getOrdersTrendInsightForMode(insights?.charts, 'compare')}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
      </div>

      {PRINT_CHANNEL_SEQUENCE.map((ch) => (
        <div key={ch.id} className="pdf-print-page space-y-4">
          <p className="text-xs text-gray-500">
            Bản in — biểu đồ tương tác kênh: <span className="font-semibold text-gray-700">{ch.label}</span>
          </p>
          <DashboardChannelTabs
            activeChannel={ch.id}
            onChangeChannel={noop}
            analytics={analytics}
            isMonthlyView={isMonthlyView}
            insightText={getChannelEngagementInsightForChannel(insights?.charts, ch.id, { forPrint: true })}
            isInsightLoading={isGeneratingInsights}
            insightError={insightError}
          />
        </div>
      ))}

      <div className="pdf-print-page space-y-4">
        <DashboardChannelBreakdownCharts
          onlyBreakdownKey="click"
          overview={overview}
          insights={insights}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
      </div>
      <div className="pdf-print-page space-y-4">
        <DashboardChannelBreakdownCharts
          onlyBreakdownKey="completed"
          overview={overview}
          insights={insights}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
      </div>
      <div className="pdf-print-page space-y-4">
        <DashboardChannelBreakdownCharts
          onlyBreakdownKey="pending"
          overview={overview}
          insights={insights}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
      </div>

      <DashboardTopChartsPrintSection
        topListsData={topListsData}
        insights={insights}
        isInsightLoading={isGeneratingInsights}
        insightError={insightError}
      />

      {/* Trang cuối: Top landing + insight */}
      <div className="pdf-print-page space-y-4">
        <LandingPagesAdminStatsCharts
          rows={landingPageStats?.rows}
          topN={10}
          scopeAllTime
          showInsight
          insightText={insights?.charts?.landingTopPages || ''}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
      </div>
    </div>
  );
};

export default DashboardPrintLayout;
