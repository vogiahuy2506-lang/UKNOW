import { useCallback, useEffect, useMemo, useState } from 'react';
import dashboardApiService from '../services/dashboardApi.service';
import { campaignApiService } from '../../campaigns/services/campaignApi.service';

const EMPTY_ORDERS_DATA = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

const EMPTY_TOP_LISTS = {
  topCourses: [],
  topCampaignsByOrders: [],
  topCampaignsByClicks: [],
};

const DEFAULT_CHANNEL = 'all';

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
 * Dashboard analytics state and data loader.
 *
 * @returns {object}
 */
export const useDashboardAnalytics = () => {
  const defaultRange = useMemo(() => buildDefaultDateRange(), []);

  const [campaignOptions, setCampaignOptions] = useState([]);
  const [activeChannel, setActiveChannel] = useState(DEFAULT_CHANNEL);

  const [filters, setFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    campaignType: 'all',
    campaignIds: [],
  });
  const [draftFilters, setDraftFilters] = useState(filters);

  const [overview, setOverview] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [runsData, setRunsData] = useState({
    items: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  });
  const [ordersData, setOrdersData] = useState(EMPTY_ORDERS_DATA);
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('all');
  const [topListsData, setTopListsData] = useState(EMPTY_TOP_LISTS);
  const [landingPageStats, setLandingPageStats] = useState({ filters: null, rows: [] });

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
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
      const [overviewRes, analyticsRes, runsRes, ordersRes, topListsRes, lpStatsRes] = await Promise.all([
        dashboardApiService.getOverview(params),
        dashboardApiService.getAnalytics(params),
        dashboardApiService.getRuns({ ...params, page: 1, limit: 20 }),
        dashboardApiService.getOrders({ ...params, orderStatus: 'all', page: 1, limit: 20 }),
        dashboardApiService.getTopLists({ ...params, limit: 5 }),
        /** Thống kê landing: toàn thời gian, không phụ thuộc bộ lọc ngày dashboard. */
        dashboardApiService.getLandingPageStats({ allTime: 1 }),
      ]);
      setOverview(overviewRes?.data?.data || null);
      setAnalytics(analyticsRes?.data?.data || null);
      setRunsData(runsRes?.data?.data || { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
      setOrdersData(ordersRes?.data?.data || EMPTY_ORDERS_DATA);
      setTopListsData(topListsRes?.data?.data || EMPTY_TOP_LISTS);
      setLandingPageStats(lpStatsRes?.data?.data || { filters: null, rows: [] });
    } catch (error) {
      console.error('Load dashboard data error:', error);
      setErrorMessage('Không thể tải dữ liệu dashboard. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRunsPage = useCallback(async (page) => {
    setIsLoadingRuns(true);
    try {
      const params = buildDashboardQueryParams(filters);
      const runsRes = await dashboardApiService.getRuns({
        ...params,
        page,
        limit: runsData?.pagination?.limit || 20,
      });
      setRunsData(runsRes?.data?.data || { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    } catch (error) {
      console.error('Load dashboard runs page error:', error);
    } finally {
      setIsLoadingRuns(false);
    }
  }, [filters, runsData?.pagination?.limit]);

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
    runsData,
    ordersData,
    ordersStatusFilter,
    topListsData,
    landingPageStats,
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
  };
};

export default useDashboardAnalytics;
