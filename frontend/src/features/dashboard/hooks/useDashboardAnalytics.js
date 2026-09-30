import { useCallback, useEffect, useMemo, useState } from 'react';
import dashboardApiService from '../services/dashboardApi.service';
import { campaignApiService } from '../../campaigns/services/campaignApi.service';

const EMPTY_ORDERS_DATA = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

/**
 * Chuỗi theo ngày rỗng — chỉ dùng cho tới khi có dữ liệu thật hoặc khi API lỗi; các khối biểu đồ tự hiện trạng thái trống.
 */
const EMPTY_ANALYTICS = { dailySent: [], ordersTimeline: [] };

/**
 * Chuyển Date thành chuỗi YYYY-MM-DD theo giờ local.
 * Dùng hàm này để tránh lệch ngày do UTC.
 *
 * @param {Date} value
 * @returns {string}
 */
const toLocalDateString = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Build default date range (last 3 months: from 1st of 2 months ago to today).
 * Mirrors the "3 tháng" quick-range logic in DashboardFilterPanel.
 *
 * @returns {{ startDate: string, endDate: string }}
 */
const buildDefaultDateRange = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 3 months = first day of (currentMonth - 2)
  const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
  return {
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
  };
};

/**
 * Build query params for dashboard API.
 *
 * @param {{ startDate: string, endDate: string, campaignType: string, campaignIds: number[] }} filters
 * @returns {object}
 */
const buildDashboardQueryParams = (filters) => ({
  startDate: filters.startDate,
  endDate: filters.endDate,
  campaignType: filters.campaignType,
  campaignIds: Array.isArray(filters.campaignIds) ? filters.campaignIds.join(',') : '',
});

/**
 * Dashboard ("Báo cáo") state and data loader.
 *
 * @param {object} [options]
 * @param {boolean} [options.includeOrders=true] Danh sách đơn (có SĐT/email khách) chỉ chủ xem được: route
 *   `/dashboard/orders` có requireSelfContext. Nhân viên truyền `false` để khỏi gọi (và khỏi nhận 403).
 * @returns {object}
 */
export const useDashboardAnalytics = ({ includeOrders = true } = {}) => {
  const defaultRange = useMemo(() => buildDefaultDateRange(), []);

  const [campaignOptions, setCampaignOptions] = useState([]);

  const [filters, setFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    campaignType: 'all',
    campaignIds: [],
  });
  const [draftFilters, setDraftFilters] = useState(filters);

  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [campaignsData, setCampaignsData] = useState([]);
  const [ordersData, setOrdersData] = useState(EMPTY_ORDERS_DATA);
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('all');

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadCampaignOptions = useCallback(async () => {
    try {
      const response = await campaignApiService.getCampaigns({
        page: 1,
        limit: 200,
      });
      const items = response?.data?.data?.items || [];
      setCampaignOptions(
        items.map((item) => ({
          id: Number(item.id),
          label: item.campaignName,
          campaignType: item.campaignType,
        }))
      );
    } catch (error) {
      console.error('Load campaign options error:', error);
    }
  }, []);

  const loadMainData = useCallback(async (nextFilters) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = buildDashboardQueryParams(nextFilters);
      const [overviewRes, analyticsRes, campaignsRes, ordersRes] = await Promise.all([
        dashboardApiService.getOverview(params),
        dashboardApiService.getAnalytics(params),
        dashboardApiService.getCampaigns({ ...params, limit: 10 }),
        // Lỗi riêng của danh sách đơn (vd 403 với nhân viên có reports_view, khách thật 233 có 2 nhân viên như vậy,
        // đo 30/09) KHÔNG được kéo cả trang Báo cáo về 0 — nên chỉ làm trống bảng đơn.
        includeOrders
          ? dashboardApiService
            .getOrders({ ...params, orderStatus: 'all', page: 1, limit: 20 })
            .catch(() => null)
          : Promise.resolve(null),
      ]);
      setOverview(overviewRes?.data?.data || null);
      setAnalytics(analyticsRes?.data?.data || EMPTY_ANALYTICS);
      setCampaignsData(campaignsRes?.data?.data?.items || []);
      setOrdersData(ordersRes?.data?.data || EMPTY_ORDERS_DATA);
    } catch (error) {
      console.error('Load dashboard data error:', error);
      setErrorMessage('Không thể tải dữ liệu dashboard. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [includeOrders]);

  /**
   * Load a specific page of orders, optionally changing the status filter.
   *
   * @param {number} page
   * @param {'all'|'pending'|'completed'} [statusOverride]
   */
  const loadOrdersPage = useCallback(async (page, statusOverride) => {
    setIsLoadingOrders(true);
    const effectiveStatus = statusOverride !== undefined ? statusOverride : ordersStatusFilter;
    if (statusOverride !== undefined) setOrdersStatusFilter(statusOverride);
    try {
      const params = buildDashboardQueryParams(filters);
      const ordersRes = await dashboardApiService.getOrders({
        ...params,
        orderStatus: effectiveStatus,
        page,
        limit: ordersData?.pagination?.limit || 20,
      });
      setOrdersData(ordersRes?.data?.data || EMPTY_ORDERS_DATA);
    } catch (error) {
      console.error('Load dashboard orders page error:', error);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [filters, ordersData?.pagination?.limit, ordersStatusFilter]);

  const applyFilters = useCallback(() => {
    setFilters(draftFilters);
  }, [draftFilters]);

  useEffect(() => {
    loadCampaignOptions();
  }, [loadCampaignOptions]);

  useEffect(() => {
    loadMainData(filters);
  }, [filters, loadMainData]);

  return {
    overview,
    analytics,
    campaignsData,
    ordersData,
    ordersStatusFilter,
    campaignOptions,
    filters,
    draftFilters,
    setDraftFilters,
    applyFilters,
    isLoading,
    isLoadingOrders,
    errorMessage,
    loadOrdersPage,
  };
};

export default useDashboardAnalytics;
