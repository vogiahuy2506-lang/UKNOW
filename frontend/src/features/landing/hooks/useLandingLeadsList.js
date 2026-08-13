import { useCallback, useEffect, useState } from 'react';
import {
  downloadLandingLeadsAdminExportXlsx,
  fetchLandingLeadsAdminList,
} from '../services/landingLeadsAdminApi.service.js';

const EMPTY_FILTERS = {
  landingLeadsUseDateRange: false,
  landingLeadsDateFrom: '',
  landingLeadsDateTo: '',
  landingLeadsOccupations: [],
  landingLeadsInterests: [],
  landingLeadsSlugs: [],
  landingLeadsCustomFilters: [],
};

function cloneFilters(src = EMPTY_FILTERS) {
  return {
    landingLeadsUseDateRange: Boolean(src.landingLeadsUseDateRange),
    landingLeadsDateFrom: src.landingLeadsDateFrom || '',
    landingLeadsDateTo: src.landingLeadsDateTo || '',
    landingLeadsOccupations: Array.isArray(src.landingLeadsOccupations) ? [...src.landingLeadsOccupations] : [],
    landingLeadsInterests: Array.isArray(src.landingLeadsInterests) ? [...src.landingLeadsInterests] : [],
    landingLeadsSlugs: Array.isArray(src.landingLeadsSlugs) ? [...src.landingLeadsSlugs] : [],
    landingLeadsCustomFilters: Array.isArray(src.landingLeadsCustomFilters)
      ? src.landingLeadsCustomFilters.map((f) => ({ ...f }))
      : [],
  };
}

/**
 * Hook danh sách khách landing: lọc thật (ngày/slug/nghề/lĩnh vực/custom) + phân trang + export Excel.
 */
export default function useLandingLeadsList() {
  const [draftFilters, setDraftFilters] = useState(() => cloneFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => cloneFilters());
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
        ...appliedFilters,
        page,
        pageSize,
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      setPagination(data.pagination || { total: 0, page, pageSize, totalPages: 1 });
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Cannot load list';
      setErrorMessage(msg);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = useCallback(() => {
    setAppliedFilters(cloneFilters(draftFilters));
    setPage(1);
  }, [draftFilters]);

  const resetFilters = useCallback(() => {
    const empty = cloneFilters();
    setDraftFilters(empty);
    setAppliedFilters(cloneFilters());
    setPage(1);
  }, []);

  const reload = useCallback(() => {
    load();
  }, [load]);

  const exportExcel = useCallback(async () => {
    setIsExporting(true);
    try {
      return await downloadLandingLeadsAdminExportXlsx(appliedFilters);
    } finally {
      setIsExporting(false);
    }
  }, [appliedFilters]);

  return {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    applyFilters,
    resetFilters,
    exportExcel,
    isExporting,
    page,
    setPage,
    pageSize,
    items,
    pagination,
    isLoading,
    errorMessage,
    reload,
  };
}
