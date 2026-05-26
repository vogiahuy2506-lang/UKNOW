import { useState, useEffect, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useI18n } from '../i18n';
import DashboardHeader from '../features/dashboard/components/DashboardHeader';
import DashboardFilterPanel from '../features/dashboard/components/DashboardFilterPanel';
import DashboardKpiCards from '../features/dashboard/components/DashboardKpiCards';
import DashboardOrdersChart from '../features/dashboard/components/DashboardOrdersChart';
import DashboardChannelTabs from '../features/dashboard/components/DashboardChannelTabs';
import DashboardRunsTable from '../features/dashboard/components/DashboardRunsTable';
import DashboardOrdersListTable from '../features/dashboard/components/DashboardOrdersListTable';
import DashboardTopCharts from '../features/dashboard/components/DashboardTopCharts';
import DashboardChannelBreakdownCharts from '../features/dashboard/components/DashboardChannelBreakdownCharts';
import DashboardPrintLayout from '../features/dashboard/components/DashboardPrintLayout';
import DashboardLandingPagesStats from '../features/dashboard/components/DashboardLandingPagesStats';
import LandingPagesAdminStatsCharts from '../features/landing-pages/components/LandingPagesAdminStatsCharts.jsx';
import { useDashboardAnalytics } from '../features/dashboard/hooks/useDashboardAnalytics';
import dashboardApiService from '../features/dashboard/services/dashboardApi.service';
import DashboardInsightOverview from '../features/dashboard/components/DashboardInsightOverview';
import {
  normalizeDashboardInsightForUi,
  extractInsightFromDashboardInsightsResponse,
  isInsightPayloadUsable,
  getChannelEngagementInsightForChannel,
  getOrdersTrendInsightForMode,
} from '../features/dashboard/utils/dashboardInsightStorage.util';

/** Skeleton placeholder block */
const Skeleton = ({ className = '' }) => (
  <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />
);

/**
 * Format thời gian lưu insight (hiển thị cho người dùng).
 *
 * @param {string} iso - Chuỗi ISO (từ DB)
 * @returns {string}
 */
function formatInsightSavedAt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch {
    return '';
  }
}

/** Full-page skeleton while initial data loads */
const DashboardSkeleton = () => (
  <div className="space-y-6">
    {/* Header skeleton */}
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-2.5">
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    </div>

    {/* KPI cards skeleton */}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="w-9 h-9 rounded-lg" />
          </div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-44" />
        </div>
      ))}
    </div>

    {/* Charts skeleton */}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-7 w-24 rounded-lg" />
            <Skeleton className="h-7 w-24 rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-64" />
      </div>
      <div className="card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-8 w-48 rounded-xl" />
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>

    {/* Table skeleton */}
    <div className="card">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  </div>
);

/**
 * Dashboard page shell.
 *
 * Composes all dashboard feature components.
 * Manages filter panel open/close state at page level.
 * All data loading and business state is delegated to useDashboardAnalytics hook.
 *
 * @returns {JSX.Element}
 */
const Dashboard = () => {
  const { t } = useI18n();
  const printRef = useRef(null);
  /** Giữ tiêu đề tab gốc để khôi phục sau in — giảm chữ trên chân trang PDF khi trình duyệt bật đầu/cuối trang */
  const documentTitleForPrintRef = useRef(
    typeof document !== 'undefined' ? document.title : ''
  );
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  /** Đồng bộ insight «Đơn hàng theo thời gian» với tab Tổng hợp / So sánh kênh */
  const [ordersChartViewMode, setOrdersChartViewMode] = useState('summary');

  // Lifted from DashboardFilterPanel so state survives skeleton re-mounts during data loading
  const [dateMode, setDateMode] = useState('quick');
  const [activeQuickKey, setActiveQuickKey] = useState('3m');

  const {
    overview,
    analytics,
    runsData,
    ordersData,
    ordersStatusFilter,
    topListsData,
    campaignOptions,
    activeChannel,
    setActiveChannel,
    filters,
    draftFilters,
    setDraftFilters,
    applyFilters,
    isLoading,
    isLoadingRuns,
    isLoadingOrders,
    errorMessage,
    loadRunsPage,
    loadOrdersPage,
    landingPageStats,
  } = useDashboardAnalytics();

  /**
   * In qua iframe: clone giữ nguyên `absolute left:-14000px` của vùng ẩn màn hình → preview trắng.
   * Reset vị trí chỉ trong stylesheet của iframe (pageStyle), không ảnh hưởng Ctrl+P trang chính.
   */
  /**
   * documentTitle rỗng để Chrome/Edge không chèn tên file dạng Dashboard-... vào chân trang khi bật «Đầu trang và chân trang».
   * Vẫn nên tắt tùy chọn đó trong hộp thoại in để ẩn URL, ngày, số trang.
   */
  const handlePrintDashboard = useReactToPrint({
    contentRef: printRef,
    documentTitle: () => '',
    pageStyle: `
      @page { margin: 12mm; }
      @media print {
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        .dashboard-print-root {
          position: static !important;
          left: auto !important;
          top: auto !important;
          width: 100% !important;
        }
      }
    `,
    // react-to-print v3 luôn gọi onBeforePrint().then(...); bắt buộc trả Promise, không được undefined.
    onBeforePrint: async () => {
      documentTitleForPrintRef.current = document.title;
      document.title = '';
    },
    onAfterPrint: () => {
      document.title = documentTitleForPrintRef.current || '';
    },
  });

  const [insights, setInsights] = useState(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insightError, setInsightError] = useState('');
  /** Có ít nhất một bản insight đã lưu trên DB (mỗi lần phân tích hợp lệ ghi đè). */
  const [hasStoredInsight, setHasStoredInsight] = useState(false);
  /** 'none' | 'live' | 'stored'. */
  const [insightViewSource, setInsightViewSource] = useState('none');
  const [storedInsightSavedAt, setStoredInsightSavedAt] = useState('');

  /** Chỉ tải insight đã lưu từ API một lần sau khi dữ liệu dashboard sẵn sàng. */
  const insightHydratedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (insightHydratedRef.current) return;
    insightHydratedRef.current = true;

    (async () => {
      try {
        const res = await dashboardApiService.getSavedInsight();
        const payload = res?.data?.data;
        if (payload?.insights) {
          const normalized = normalizeDashboardInsightForUi(payload.insights);
          if (normalized && isInsightPayloadUsable(normalized)) {
            setInsights(normalized);
            setInsightViewSource('stored');
            setStoredInsightSavedAt(payload.savedAt || '');
            setHasStoredInsight(true);
            return;
          }
        }
        setHasStoredInsight(false);
      } catch (e) {
        console.error('Load saved dashboard insight error:', e);
        setHasStoredInsight(false);
      }
    })();
  }, [isLoading]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const timeline = analytics?.timeline || [];
  const isMonthlyView = activeQuickKey?.endsWith('m') ?? false;

  /**
   * Gọi backend sinh insight bằng Gemini theo dữ liệu đang hiển thị (chiến lược Email / Zalo / Zalo Group).
   *
   * Luồng hoạt động:
   * 1. Khóa nút trong lúc chạy để tránh spam request.
   * 2. Gửi `overview + analytics + topListsData + landingPageStats + filters` sang backend.
   * 3. Nhận JSON insight và render dưới từng biểu đồ (backend lưu DB nếu payload đủ dùng).
   */
  const handleGenerateInsights = async () => {
    setIsGeneratingInsights(true);
    setInsightError('');
    try {
      const response = await dashboardApiService.generateInsights({
        overview,
        analytics,
        topListsData,
        landingPageStats,
        filters,
      });
      const data = extractInsightFromDashboardInsightsResponse(response);
      const normalized = normalizeDashboardInsightForUi(data);
      setInsights(normalized);
      if (normalized && isInsightPayloadUsable(normalized)) {
        setHasStoredInsight(true);
      }
      setInsightViewSource('live');
      setStoredInsightSavedAt('');
    } catch (error) {
      console.error('Generate dashboard insights error:', error);
      setInsightError(t('dashboard.insightAnalysisFailed'));
    } finally {
      setIsGeneratingInsights(false);
    }
  };

  /**
   * Tải lại insight đã lưu từ DB (đồng bộ với server).
   */
  const handleLoadStoredInsight = async () => {
    try {
      const res = await dashboardApiService.getSavedInsight();
      const payload = res?.data?.data;
      if (!payload?.insights) {
        setHasStoredInsight(false);
        return;
      }
      const normalized = normalizeDashboardInsightForUi(payload.insights);
      if (!normalized || !isInsightPayloadUsable(normalized)) {
        setHasStoredInsight(false);
        return;
      }
      setInsights(normalized);
      setInsightError('');
      setInsightViewSource('stored');
      setStoredInsightSavedAt(payload.savedAt || '');
    } catch (e) {
      console.error('Load saved dashboard insight error:', e);
      setHasStoredInsight(false);
    }
  };

  return (
    <div className="relative">
    <div className="space-y-6">
      {/* Page header */}
      <DashboardHeader
        filters={filters}
        onOpenFilter={() => setIsFilterPanelOpen(true)}
        isLoading={isLoading}
        extraActions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary flex items-center gap-2 shadow-sm"
              onClick={handleGenerateInsights}
              disabled={isLoading || isGeneratingInsights}
              title={t('dashboard.insightTooltip')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              {isGeneratingInsights ? t('dashboard.analyzing') : t('dashboard.analyzeInsight')}
            </button>
            <button
              type="button"
              className="btn btn-secondary flex items-center gap-2 shadow-sm"
              onClick={() => handlePrintDashboard()}
              disabled={isLoading}
              title={t('dashboard.printPdfTip')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              {t('dashboard.printPdf')}
            </button>
            <button
              type="button"
              className="btn btn-secondary flex items-center gap-2 shadow-sm"
              onClick={handleLoadStoredInsight}
              disabled={isLoading || !hasStoredInsight}
              title={t('dashboard.savedInsightTip')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              {t('dashboard.viewSavedInsight')}
            </button>
          </div>
        }
      />

      {/* Slide-over filter panel */}
      <DashboardFilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        draftFilters={draftFilters}
        setDraftFilters={setDraftFilters}
        campaignOptions={campaignOptions}
        onApply={applyFilters}
        dateMode={dateMode}
        setDateMode={setDateMode}
        activeQuickKey={activeQuickKey}
        setActiveQuickKey={setActiveQuickKey}
      />

      {/* Error banner */}
      {errorMessage && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorMessage}
        </div>
      )}

      {/* Nhắc khi đang xem bản insight đã lưu (có thể lệch với bộ lọc hiện tại) */}
      {insightViewSource === 'stored' && insights && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-sky-50 border border-sky-100 text-sm text-sky-900">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            {t('dashboard.storedInsight')}
            {storedInsightSavedAt ? ` (lúc ${formatInsightSavedAt(storedInsightSavedAt)})` : ''}. {t('dashboard.storedInsightSuffix')}
          </span>
        </div>
      )}

      {/* KPI Cards — 6 cards, 3 columns */}
      <DashboardKpiCards overview={overview} />

      {/* Overview insight — phân tích có cấu trúc + tóm tắt */}
      <div className="card p-5 md:p-6">
        <h3 className="text-base font-semibold text-gray-900">{t('dashboard.insightOverview')}</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {t('dashboard.insightTip')}
        </p>
        <div className="mt-4">
          <DashboardInsightOverview insights={insights} isLoading={isGeneratingInsights} error={insightError} />
        </div>
      </div>

      {/* Charts row — Orders chart + Channel engagement chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DashboardOrdersChart
          timeline={timeline}
          isMonthlyView={isMonthlyView}
          viewMode={ordersChartViewMode}
          onViewModeChange={setOrdersChartViewMode}
          insightText={getOrdersTrendInsightForMode(insights?.charts, ordersChartViewMode)}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
        <DashboardChannelTabs
          activeChannel={activeChannel}
          onChangeChannel={setActiveChannel}
          analytics={analytics}
          isMonthlyView={isMonthlyView}
          insightText={getChannelEngagementInsightForChannel(insights?.charts, activeChannel)}
          isInsightLoading={isGeneratingInsights}
          insightError={insightError}
        />
      </div>

      {/* Channel breakdown donut charts — click / completed orders / pending orders by channel */}
      <DashboardChannelBreakdownCharts
        overview={overview}
        insights={insights}
        isInsightLoading={isGeneratingInsights}
        insightError={insightError}
      />

      {/* Top charts — top courses and campaigns by orders/clicks */}
      <DashboardTopCharts
        topListsData={topListsData}
        insights={insights}
        isInsightLoading={isGeneratingInsights}
        insightError={insightError}
      />

      <LandingPagesAdminStatsCharts
        rows={landingPageStats?.rows}
        topN={10}
        scopeAllTime
        showInsight
        insightText={insights?.charts?.landingTopPages || ''}
        isInsightLoading={isGeneratingInsights}
        insightError={insightError}
      />
      <DashboardLandingPagesStats data={landingPageStats} />

      {/* Runs table */}
      <DashboardRunsTable
        runsData={runsData}
        isLoadingRuns={isLoadingRuns}
        onChangePage={loadRunsPage}
      />

      {/* Orders list table */}
      <DashboardOrdersListTable
        ordersData={ordersData}
        isLoadingOrders={isLoadingOrders}
        ordersStatusFilter={ordersStatusFilter}
        onChangePage={loadOrdersPage}
      />
    </div>

    <div
      ref={printRef}
      className="dashboard-print-root absolute left-[-14000px] top-0 w-[1180px] bg-white"
      aria-hidden
    >
      <DashboardPrintLayout
        filters={filters}
        overview={overview}
        insights={insights}
        isGeneratingInsights={isGeneratingInsights}
        insightError={insightError}
        timeline={timeline}
        isMonthlyView={isMonthlyView}
        analytics={analytics}
        topListsData={topListsData}
        landingPageStats={landingPageStats}
      />
    </div>
    </div>
  );
};

export default Dashboard;
