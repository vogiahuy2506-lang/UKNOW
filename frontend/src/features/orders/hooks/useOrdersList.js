import { useCallback, useEffect, useMemo, useState } from 'react';
import ordersApiService from '../services/ordersApi.service';
import { campaignApiService } from '../../campaigns/services/campaignApi.service';

const EMPTY_ORDERS_DATA = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

const PAGE_LIMIT = 20;

/**
 * Chuyển Date thành chuỗi YYYY-MM-DD theo múi giờ local.
 * Tránh lệch 1 ngày khi dùng `toISOString()` (UTC).
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
 * Tạo khoảng ngày mặc định: 3 tháng gần nhất (từ ngày 1 tháng trước 2 tháng đến hôm nay).
 *
 * @returns {{ startDate: string, endDate: string }}
 */
const buildDefaultDateRange = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
  return {
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
  };
};

/**
 * Hook quản lý danh sách đơn hàng với bộ lọc và phân trang.
 *
 * Luồng hoạt động:
 * 1. Khởi tạo với khoảng ngày mặc định (3 tháng gần nhất).
 * 2. Tải danh sách chiến dịch để cung cấp cho bộ lọc.
 * 3. Tải đơn hàng mỗi khi filters được áp dụng.
 * 4. Hỗ trợ chuyển trang và thay đổi trạng thái filter (pending/completed/all).
 *
 * @returns {object} state và actions cho trang Orders
 */
const useOrdersList = () => {
  const defaultRange = useMemo(() => buildDefaultDateRange(), []);

  // Bộ lọc đang áp dụng (dùng để fetch dữ liệu)
  const [filters, setFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    campaignType: 'all',
    campaignIds: [],
  });

  // Bộ lọc đang chỉnh sửa (chưa apply)
  const [draftFilters, setDraftFilters] = useState(filters);

  const [ordersData, setOrdersData] = useState(EMPTY_ORDERS_DATA);
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('all');
  const [campaignOptions, setCampaignOptions] = useState([]);
  const [dateMode, setDateMode] = useState('quick');
  const [activeQuickKey, setActiveQuickKey] = useState('3m');

  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * Build query params từ filters hiện tại.
   */
  const buildParams = useCallback(
    (overrideFilters) => {
      const f = overrideFilters || filters;
      return {
        startDate: f.startDate,
        endDate: f.endDate,
        campaignType: f.campaignType,
        campaignIds: Array.isArray(f.campaignIds) ? f.campaignIds.join(',') : '',
      };
    },
    [filters]
  );

  /**
   * Tải danh sách chiến dịch cho dropdown bộ lọc.
   */
  const loadCampaignOptions = useCallback(async () => {
    setIsLoadingCampaigns(true);
    try {
      const response = await campaignApiService.getCampaigns({ page: 1, limit: 200 });
      const items = response?.data?.data?.items || [];
      setCampaignOptions(
        items.map((item) => ({
          id: Number(item.id),
          label: item.campaignName,
          campaignType: item.campaignType,
        }))
      );
    } catch (error) {
      console.error('Lỗi tải danh sách chiến dịch:', error);
    } finally {
      setIsLoadingCampaigns(false);
    }
  }, []);

  /**
   * Tải trang đơn hàng theo filters đang áp dụng.
   *
   * @param {number} page - Số trang
   * @param {'all'|'pending'|'completed'} [statusOverride] - Ghi đè trạng thái filter
   * @param {object} [filtersOverride] - Ghi đè toàn bộ filters (dùng khi vừa apply filter mới)
   */
  const loadOrdersPage = useCallback(
    async (page, statusOverride, filtersOverride) => {
      setIsLoadingOrders(true);
      setErrorMessage('');

      const effectiveStatus = statusOverride !== undefined ? statusOverride : ordersStatusFilter;
      if (statusOverride !== undefined) setOrdersStatusFilter(statusOverride);

      try {
        const params = buildParams(filtersOverride);
        const response = await ordersApiService.getOrders({
          ...params,
          orderStatus: effectiveStatus,
          page,
          limit: ordersData?.pagination?.limit || PAGE_LIMIT,
        });
        setOrdersData(response?.data?.data || EMPTY_ORDERS_DATA);
      } catch (error) {
        console.error('Lỗi tải danh sách đơn hàng:', error);
        setErrorMessage('Không thể tải danh sách đơn hàng. Vui lòng thử lại.');
      } finally {
        setIsLoadingOrders(false);
      }
    },
    [ordersStatusFilter, ordersData?.pagination?.limit, buildParams]
  );

  /**
   * Áp dụng bộ lọc từ draftFilters, reset về trang 1 và status 'all'.
   */
  const applyFilters = useCallback(async () => {
    setFilters(draftFilters);
    setOrdersStatusFilter('all');
    setIsLoadingOrders(true);
    setErrorMessage('');
    try {
      const params = {
        startDate: draftFilters.startDate,
        endDate: draftFilters.endDate,
        campaignType: draftFilters.campaignType,
        campaignIds: Array.isArray(draftFilters.campaignIds) ? draftFilters.campaignIds.join(',') : '',
      };
      const response = await ordersApiService.getOrders({
        ...params,
        orderStatus: 'all',
        page: 1,
        limit: PAGE_LIMIT,
      });
      setOrdersData(response?.data?.data || EMPTY_ORDERS_DATA);
    } catch (error) {
      console.error('Lỗi áp dụng bộ lọc đơn hàng:', error);
      setErrorMessage('Không thể tải danh sách đơn hàng. Vui lòng thử lại.');
    } finally {
      setIsLoadingOrders(false);
    }
  }, [draftFilters]);

  // Tải campaign options một lần khi mount
  useEffect(() => {
    loadCampaignOptions();
  }, [loadCampaignOptions]);

  // Tải đơn hàng lần đầu khi mount
  useEffect(() => {
    loadOrdersPage(1, 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ordersData,
    ordersStatusFilter,
    campaignOptions,
    dateMode,
    setDateMode,
    activeQuickKey,
    setActiveQuickKey,
    filters,
    draftFilters,
    setDraftFilters,
    applyFilters,
    isLoadingOrders,
    isLoadingCampaigns,
    errorMessage,
    loadOrdersPage,
  };
};

export default useOrdersList;
