import { useState } from 'react';
import DashboardHeader from '../../features/dashboard/components/DashboardHeader';
import DashboardFilterPanel from '../../features/dashboard/components/DashboardFilterPanel';
import DashboardOrdersListTable from '../../features/dashboard/components/DashboardOrdersListTable';
import useOrdersList from '../../features/orders/hooks/useOrdersList';

// ─── Page skeleton ─────────────────────────────────────────────────────────────

const Skeleton = ({ className = '' }) => (
  <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} />
);

const OrdersSkeleton = () => (
  <div className="space-y-6">
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
    <div className="card">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────

/**
 * Trang danh sách đơn hàng.
 *
 * Luồng hoạt động:
 * 1. Dùng chung Header + FilterPanel của Dashboard để đồng nhất UX.
 * 2. Header hiển thị dải ngày đã áp dụng và ngày hiện tại.
 * 3. Bảng đơn hàng tái dụng DashboardOrdersListTable có đầy đủ:
 *    - Filter tabs: Tất cả / Đơn chờ / Đã hoàn thành
 *    - Filter cột kênh và trạng thái
 *    - Search text
 *    - Sort
 *    - Phân trang server-side
 *    - Drawer chi tiết đơn hàng + hành trình chiến dịch
 *
 * @returns {JSX.Element}
 */
const Orders = () => {
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const {
    ordersData,
    ordersStatusFilter,
    filters,
    campaignOptions,
    draftFilters,
    setDraftFilters,
    applyFilters,
    isLoadingOrders,
    errorMessage,
    loadOrdersPage,
    dateMode,
    setDateMode,
    activeQuickKey,
    setActiveQuickKey,
  } = useOrdersList();

  const currentDateLabel = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Hiển thị skeleton chỉ khi lần đầu tải trang (chưa có data và đang loading)
  const isInitialLoading = isLoadingOrders && ordersData.items.length === 0 && !errorMessage;

  if (isInitialLoading) {
    return <OrdersSkeleton />;
  }

  const extraActions = (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 shadow-sm">
      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <span className="font-medium">Hôm nay: {currentDateLabel}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header + bộ lọc dashboard dùng lại cho trang đơn hàng */}
      <DashboardHeader
        filters={filters}
        onOpenFilter={() => setIsFilterPanelOpen(true)}
        isLoading={isLoadingOrders}
        title="Đơn hàng"
        description="Theo dõi đơn hàng theo thời gian, kênh và chiến dịch"
        filterButtonLabel="Bộ lọc"
        extraActions={extraActions}
      />

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
        panelTitle="Bộ lọc đơn hàng"
        panelDescription="Tùy chỉnh phạm vi đơn hàng hiển thị"
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

      {/* Bảng đơn hàng — tái dụng component từ dashboard */}
      <DashboardOrdersListTable
        ordersData={ordersData}
        isLoadingOrders={isLoadingOrders}
        ordersStatusFilter={ordersStatusFilter}
        onChangePage={loadOrdersPage}
      />
    </div>
  );
};

export default Orders;
