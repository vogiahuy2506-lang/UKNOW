import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  downloadLandingLeadsAdminExportXlsx,
  fetchLandingLeadsAdminList,
} from '../services/landingLeadsAdminApi.service.js';

const defaultDraft = () => ({
  landingLeadsUseDateRange: false,
  landingLeadsDateFrom: '',
  landingLeadsDateTo: '',
  landingLeadsOccupations: [],
  landingLeadsInterests: [],
  landingLeadsSlugs: [],
});

/**
 * Trang danh sách lead landing: tải dữ liệu phân trang + bộ lọc (đồng bộ tham số API `/api/leads`).
 *
 * Luồng hoạt động:
 * 1. Giữ `draftFilters` cho form; `appliedFilters` là bộ đã áp dụng khi bấm «Áp dụng bộ lọc» (gồm slug landing).
 * 2. Mỗi khi `page` hoặc `appliedFilters` đổi → gọi API.
 *
 * @returns {object}
 */
export default function useLandingLeadsList() {
  const [draftFilters, setDraftFilters] = useState(defaultDraft);
  const [appliedFilters, setAppliedFilters] = useState(defaultDraft);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchLandingLeadsAdminList({
        page,
        pageSize,
        ...appliedFilters,
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      setPagination(data.pagination || { total: 0, page, pageSize, totalPages: 1 });
    } catch (e) {
      const msg =
        e?.response?.data?.message || e?.message || 'Không thể tải danh sách';
      setErrorMessage(msg);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, appliedFilters]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = useCallback(() => {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  }, [draftFilters]);

  const resetFilters = useCallback(() => {
    const empty = defaultDraft();
    setDraftFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  }, []);

  /**
   * Xuất Excel theo bộ lọc đã áp dụng (không dùng bản nháp trên form).
   */
  const exportToExcel = useCallback(async () => {
    setIsExporting(true);
    try {
      const { truncated } = await downloadLandingLeadsAdminExportXlsx(appliedFilters);
      toast.success('Đã tải file Excel.');
      if (truncated) {
        toast(
          'Kết quả lọc vượt 10.000 bản ghi — file chỉ chứa 10.000 dòng mới nhất. Hãy thu hẹp bộ lọc nếu cần đầy đủ.',
          { duration: 6000, icon: '⚠️' }
        );
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Không thể xuất Excel';
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  }, [appliedFilters]);

  return {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    page,
    setPage,
    pageSize,
    items,
    pagination,
    isLoading,
    isExporting,
    errorMessage,
    applyFilters,
    resetFilters,
    reload: load,
    exportToExcel,
  };
}
