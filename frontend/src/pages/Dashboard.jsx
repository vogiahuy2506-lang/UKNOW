import { useState } from 'react';
import DashboardHeader from '../features/dashboard/components/DashboardHeader';
import DashboardFilterPanel from '../features/dashboard/components/DashboardFilterPanel';
import DashboardKpiCards from '../features/dashboard/components/DashboardKpiCards';
import DashboardOrdersChart from '../features/dashboard/components/DashboardOrdersChart';
import DashboardChannelTabs from '../features/dashboard/components/DashboardChannelTabs';
import DashboardRunsTable from '../features/dashboard/components/DashboardRunsTable';
import DashboardOrdersListTable from '../features/dashboard/components/DashboardOrdersListTable';
import DashboardTopCharts from '../features/dashboard/components/DashboardTopCharts';
import DashboardChannelBreakdownCharts from '../features/dashboard/components/DashboardChannelBreakdownCharts';
import { useDashboardAnalytics } from '../features/dashboard/hooks/useDashboardAnalytics';

/** Skeleton placeholder block */
const Skeleton = ({ className = '' }) => (
  <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />
);

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
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

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
  } = useDashboardAnalytics();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const timeline = analytics?.timeline || [];
  const isMonthlyView = activeQuickKey?.endsWith('m') ?? false;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <DashboardHeader
        filters={filters}
        onOpenFilter={() => setIsFilterPanelOpen(true)}
        isLoading={isLoading}
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

      {/* KPI Cards — 6 cards, 3 columns */}
      <DashboardKpiCards overview={overview} />

      {/* Charts row — Orders chart + Channel engagement chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DashboardOrdersChart timeline={timeline} isMonthlyView={isMonthlyView} />
        <DashboardChannelTabs
          activeChannel={activeChannel}
          onChangeChannel={setActiveChannel}
          analytics={analytics}
          isMonthlyView={isMonthlyView}
        />
      </div>

      {/* Channel breakdown donut charts — click / completed orders / pending orders by channel */}
      <DashboardChannelBreakdownCharts overview={overview} />

      {/* Top charts — top courses and campaigns by orders/clicks */}
      <DashboardTopCharts topListsData={topListsData} />

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
  );
};

export default Dashboard;
