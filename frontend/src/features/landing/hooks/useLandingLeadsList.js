import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  downloadLandingLeadsAdminExportXlsx,
  fetchLandingLeadsAdminGroups,
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
 * Hook danh sách khách landing theo THẺ TỪNG LANDING:
 * - Nhóm (cards) tải theo bộ lọc chung (ngày/nghề/lĩnh vực/custom), BỎ QUA slug.
 * - Danh sách chi tiết tải theo landing đang chọn (ép landingLeadsSlugs = [selectedSlug]).
 * - Export Excel/CSV cũng ép theo landing đang chọn (phạm vi từng Landing).
 */
export default function useLandingLeadsList() {
  const [draftFilters, setDraftFilters] = useState(() => cloneFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => cloneFilters());
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedSlug, setSelectedSlug] = useState(null);

  const [groups, setGroups] = useState([]);
  const [groupDefs, setGroupDefs] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState('');

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

  // Bộ lọc ép theo thẻ đang chọn (ghi đè slug drawer cũ).
  const effectiveFilters = useMemo(() => {
    const base = cloneFilters(appliedFilters);
    base.landingLeadsSlugs = selectedSlug ? [selectedSlug] : [];
    return base;
  }, [appliedFilters, selectedSlug]);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError('');
    try {
      const data = await fetchLandingLeadsAdminGroups(appliedFilters);
      const list = Array.isArray(data.groups) ? data.groups : [];
      setGroups(list);
      setGroupDefs(Array.isArray(data.customDefs) ? data.customDefs : []);
      // Tự chọn thẻ đầu tiên nếu chưa chọn hoặc thẻ đã chọn không còn tồn tại.
      setSelectedSlug((prev) => {
        if (prev && list.some((g) => g.slug === prev)) return prev;
        return list.length > 0 ? list[0].slug : null;
      });
    } catch (e) {
      setGroupsError(e?.response?.data?.message || e?.message || 'Không tải được nhóm');
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const load = useCallback(async () => {
    // Chưa có nhóm nào thì không gọi list (tránh bảng "tất cả" sai phạm vi từng Landing).
    if (selectedSlug == null) {
      setItems([]);
      setPagination({ total: 0, page: 1, pageSize, totalPages: 1 });
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchLandingLeadsAdminList({
        ...effectiveFilters,
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
  }, [effectiveFilters, page, pageSize, selectedSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const selectSlug = useCallback((slug) => {
    setSelectedSlug(slug);
    setPage(1);
  }, []);

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
    loadGroups();
    load();
  }, [load, loadGroups]);

  const exportExcel = useCallback(async () => {
    setIsExporting(true);
    try {
      return await downloadLandingLeadsAdminExportXlsx(effectiveFilters);
    } finally {
      setIsExporting(false);
    }
  }, [effectiveFilters]);

  return {
    draftFilters,
    setDraftFilters,
    appliedFilters,
    effectiveFilters,
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
    groups,
    groupDefs,
    groupsLoading,
    groupsError,
    selectedSlug,
    selectSlug,
    reloadGroups: loadGroups,
  };
}
