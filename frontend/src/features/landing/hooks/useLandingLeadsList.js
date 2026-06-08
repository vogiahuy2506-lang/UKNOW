import { useCallback, useEffect, useState } from 'react';
import {
  fetchLandingLeadsAdminList,
} from '../services/landingLeadsAdminApi.service.js';

/**
 * Hook quản lý danh sách khách landing page.
 */
export default function useLandingLeadsList() {
  const [search, setSearch] = useState('');
  const [selectedSlug, setSelectedSlug] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [items, setItems] = useState([]);
  const [availableSlugs, setAvailableSlugs] = useState([]);
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
      const params = {
        page,
        pageSize,
      };
      if (search.trim()) {
        params.search = search.trim();
      }
      if (selectedSlug) {
        params.landingPageSlug = selectedSlug;
      }
      const data = await fetchLandingLeadsAdminList(params);
      setItems(Array.isArray(data.items) ? data.items : []);
      setPagination(data.pagination || { total: 0, page, pageSize, totalPages: 1 });
      // Extract unique slugs for filter dropdown
      if (Array.isArray(data.items)) {
        const slugs = [...new Set(data.items.map(item => item.landingPageSlug).filter(Boolean))];
        setAvailableSlugs(slugs);
      }
    } catch (e) {
      const msg =
        e?.response?.data?.message || e?.message || 'Cannot load list';
      setErrorMessage(msg);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, selectedSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => {
    setPage(1);
    load();
  }, [load]);

  return {
    search,
    setSearch,
    selectedSlug,
    setSelectedSlug,
    availableSlugs,
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
