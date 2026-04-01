import { useCallback, useEffect, useState } from 'react';
import { fetchLandingLeadsAdminList } from '../services/landingLeadsAdminApi.service.js';

const defaultDraft = () => ({
  landingLeadsUseDateRange: false,
  landingLeadsDateFrom: '',
  landingLeadsDateTo: '',
  landingLeadsOccupations: [],
  landingLeadsInterests: [],
});

/**
 * Trang danh sách lead landing: tải dữ liệu phân trang + bộ lọc (đồng bộ tham số API `/api/leads`).
 *
 * Luồng hoạt động:
 * 1. Giữ `draftFilters` cho form; `appliedFilters` là bộ đã áp dụng khi bấm «Áp dụng bộ lọc».
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
    errorMessage,
    applyFilters,
    resetFilters,
    reload: load,
  };
}
