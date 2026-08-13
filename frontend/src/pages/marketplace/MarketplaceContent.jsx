import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineSearch,
  HiOutlineX,
  HiOutlineViewGrid,
  HiOutlineViewList,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineFilter,
  HiOutlineChevronDown,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import ListingCard from '../../components/marketplace/ListingCard';
import { useI18n } from '../../i18n';

const MarketplaceContent = ({ onClose, activeTab, onTabChange, onSelectListing, onSelectMyListing, onShowCreateForm }) => {
  const t = useI18n('marketplace');

  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  const [currentTab, setCurrentTab] = useState(activeTab || 'browse');
  const [filters, setFilters] = useState({ category: '', sort: 'rating', search: '' });
  const [viewMode, setViewMode] = useState('grid');
  const [favorites, setFavorites] = useState(new Set());

  const TABS = [
    { id: 'browse', label: t('browse.tabBrowse') || 'Khám phá' },
    { id: 'my', label: t('browse.tabMine') || 'Của tôi' },
  ];

  const SORT_OPTIONS = [
    { value: 'rating', label: t('browse.sortRating') || 'Đánh giá cao nhất' },
    { value: 'newest', label: t('browse.sortNewest') || 'Mới nhất' },
    { value: 'popular', label: t('browse.sortPopular') || 'Phổ biến nhất' },
    { value: 'price_asc', label: t('browse.sortPriceAsc') || 'Giá thấp → cao' },
    { value: 'price_desc', label: t('browse.sortPriceDesc') || 'Giá cao → thấp' },
  ];

  const CATEGORIES = [
    { value: '', label: t('browse.categoryAll') || 'Tất cả' },
    { value: 'email', label: 'Email' },
    { value: 'zalo_personal', label: 'Zalo cá nhân' },
    { value: 'zalo_group', label: 'Zalo nhóm' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'sms', label: 'SMS' },
  ];

  const filterTimeoutRef = useRef(null);
  const userFavoritesLoadedRef = useRef(false);
  const sentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);

  const currentTabRef = useRef(currentTab);
  const filtersRef = useRef(filters);

  useEffect(() => { currentTabRef.current = currentTab; }, [currentTab]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    if (activeTab && activeTab !== currentTab) {
      setCurrentTab(activeTab);
      setFilters({ category: '', sort: 'rating', search: '' });
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [activeTab]);

  const fetchListings = useCallback(
    async (tab, filterState, page, { append = false } = {}) => {
      if (append) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const params = {
          page,
          limit: 12,
          ...(filterState.category && { category: filterState.category }),
          ...(filterState.sort && { sort: filterState.sort }),
          ...(filterState.search && { search: filterState.search }),
        };

        let response;
        switch (tab) {
          case 'my':
            response = await marketplaceService.getMyListings(params);
            break;
          default:
            response = await marketplaceService.browse(params);
        }

        const payload = response?.data?.data;
        const rows = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.items)
            ? payload.items
            : [];

        setListings((prev) => (append ? [...prev, ...rows] : rows));
        if (response?.data?.pagination) {
          setPagination((prev) => ({
            ...prev,
            ...response.data.pagination,
            page: response.data.pagination.page ?? page,
          }));
        }
      } catch (error) {
        toast.error(t('common.loadError'));
      } finally {
        if (append) {
          setIsLoadingMore(false);
          loadingMoreRef.current = false;
        } else {
          setIsLoading(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
    filterTimeoutRef.current = setTimeout(() => {
      fetchListings(currentTabRef.current, filtersRef.current, 1, { append: false });
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(filterTimeoutRef.current);
  }, [currentTab, filters.category, filters.sort, filters.search]);

  useEffect(() => {
    if (currentTab === 'browse' && !userFavoritesLoadedRef.current) {
      userFavoritesLoadedRef.current = true;
      marketplaceService
        .getMyFavorites({ limit: 100 })
        .then((res) => {
          const payload = res.data.data;
          const rows = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
              ? payload.items
              : [];
          setFavorites(new Set(rows.map((l) => l.id)));
        })
        .catch(() => {});
    }
  }, [currentTab]);

  useEffect(() => {
    if (!sentinelRef.current) return undefined;
    if (pagination.page >= pagination.totalPages) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !isLoading && !isLoadingMore) {
          const nextPage = pagination.page + 1;
          fetchListings(currentTabRef.current, filtersRef.current, nextPage, { append: true });
          setPagination((prev) => ({ ...prev, page: nextPage }));
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [pagination.page, pagination.totalPages, isLoading, isLoadingMore]);

  const handleFavorite = async (listingId, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      if (favorites.has(listingId)) {
        await marketplaceService.removeFavorite(listingId);
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
      } else {
        await marketplaceService.addFavorite(listingId);
        setFavorites((prev) => new Set([...prev, listingId]));
      }
    } catch (error) {
      toast.error(t('common.updateError'));
    }
  };

  const handleListingClick = (id, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    // Tab "Khám phá" → mở chi tiết public
    // Tab "Của tôi" → mở settings
    if (currentTab === 'my') {
      onSelectMyListing?.(id);
    } else {
      onSelectListing?.(id);
    }
  };

  const handleTabChange = (tabId) => {
    setCurrentTab(tabId);
    onTabChange?.(tabId);
  };

  const handleCreateListing = () => {
    onShowCreateForm?.();
  };

  const clearFilters = () => {
    setFilters({ category: '', sort: 'rating', search: '' });
  };

  const hasActiveFilters = filters.search || filters.category || filters.sort !== 'rating';

  const showEndOfList =
    !isLoading && !isLoadingMore && listings.length > 0 && pagination.page >= pagination.totalPages;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200">
        <div className="px-6 pt-5 pb-3">
          {/* Top row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
                <HiOutlineSparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">
                  {t('browse.headerTitle') || 'Marketplace'}
                </h1>
                <p className="text-xs text-gray-500 leading-tight">
                  {t('browse.headerSubtitle') || 'Khám phá và chia sẻ template'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCreateListing} className="btn btn-primary">
                <HiOutlinePlus className="w-4 h-4 mr-1.5" />
                {t('browse.postListing') || 'Chia sẻ template'}
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                  aria-label={t('browse.close') || 'Đóng'}
                >
                  <HiOutlineX className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  currentTab === tab.id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-5">
          {/* Search & Filters Bar */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              {/* Search */}
              <div className="flex-1 relative">
                <HiOutlineSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('browse.searchPlaceholder') || 'Tìm template...'}
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  className="h-10 w-full pl-9 pr-9 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 focus:outline-none transition-all"
                />
                {filters.search && (
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                    aria-label={t('browse.clearSearch') || 'Xóa'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    <HiOutlineX className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>

              {/* Filter toggles */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="relative">
                  <select
                    value={filters.category}
                    onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                    className="h-10 pl-3 pr-9 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 focus:outline-none transition-all appearance-none cursor-pointer min-w-[150px]"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  <HiOutlineChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>

                <div className="relative">
                  <select
                    value={filters.sort}
                    onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value }))}
                    className="h-10 pl-3 pr-9 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 focus:outline-none transition-all appearance-none cursor-pointer min-w-[190px]"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <HiOutlineChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>

                <div className="flex items-center gap-0.5 p-1 bg-gray-100 rounded-lg flex-shrink-0">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition-all ${
                      viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    aria-label={t('browse.viewGrid') || 'Lưới'}
                  >
                    <HiOutlineViewGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`h-8 w-8 inline-flex items-center justify-center rounded-md transition-all ${
                      viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    aria-label={t('browse.viewList') || 'Danh sách'}
                  >
                    <HiOutlineViewList className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Active filters */}
            {hasActiveFilters && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <HiOutlineFilter className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">Đang lọc:</span>
                {filters.search && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs font-medium">
                    "{filters.search}"
                    <button onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}>
                      <HiOutlineX className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filters.category && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                    {CATEGORIES.find(c => c.value === filters.category)?.label}
                    <button onClick={() => setFilters((prev) => ({ ...prev, category: '' }))}>
                      <HiOutlineX className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  onClick={clearFilters}
                  className="text-sm text-orange-600 hover:text-orange-700 font-medium ml-auto"
                >
                  Xóa tất cả
                </button>
              </div>
            )}
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-900">{pagination.total || 0}</span> template
            </p>
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-2'
            }>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse border border-gray-100">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex gap-2">
                        <div className="h-5 w-20 bg-gray-100 rounded" />
                        <div className="h-5 w-16 bg-gray-100 rounded" />
                      </div>
                      <div className="h-7 w-7 bg-gray-100 rounded" />
                    </div>
                    <div className="h-5 bg-gray-100 rounded w-3/4 mb-3" />
                    <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && listings.length === 0 && (
            <div className="bg-white rounded-xl p-12 text-center border border-gray-100">
              <div className="w-16 h-16 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <HiOutlineSparkles className="w-8 h-8 text-orange-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {filters.search || filters.category ? 'Không tìm thấy kết quả' : 'Chưa có template nào'}
              </h3>
              <p className="text-gray-500 mb-5 max-w-sm mx-auto text-sm">
                {filters.search || filters.category
                  ? 'Thử tìm kiếm với từ khóa khác hoặc xóa bộ lọc'
                  : 'Hãy là người đầu tiên chia sẻ template của bạn'}
              </p>
              {!(filters.search || filters.category) ? (
                <button onClick={handleCreateListing} className="btn btn-primary">
                  <HiOutlinePlus className="w-4 h-4 mr-2" />
                  Tạo template đầu tiên
                </button>
              ) : (
                <button onClick={clearFilters} className="btn btn-secondary">
                  Xóa bộ lọc
                </button>
              )}
            </div>
          )}

          {/* Grid view */}
          {!isLoading && listings.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {listings.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  view="grid"
                  isFavorited={favorites.has(listing.id)}
                  onFavorite={handleFavorite}
                  onClick={handleListingClick}
                  labels={{
                    free: t('browse.priceFree') || 'Miễn phí',
                    creditsShort: t('browse.priceCreditsShort') || 'credits',
                    favoriteAria: t('browse.favoritesAdd') || 'Yêu thích',
                    viewLabel: t('common.view') || 'Xem',
                  }}
                />
              ))}
            </div>
          )}

          {/* List view */}
          {!isLoading && listings.length > 0 && viewMode === 'list' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              {listings.map((listing, index) => (
                <div key={listing.id} className={index !== listings.length - 1 ? 'border-b border-gray-100' : ''}>
                  <ListingCard
                    listing={listing}
                    view="list"
                    isFavorited={favorites.has(listing.id)}
                    onFavorite={handleFavorite}
                    onClick={handleListingClick}
                    labels={{
                      free: t('browse.priceFree') || 'Miễn phí',
                      creditsShort: t('browse.priceCreditsShort') || 'credits',
                      favoriteAria: t('browse.favoritesAdd') || 'Yêu thích',
                      viewLabel: t('common.view') || 'Xem',
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Loading more */}
          {!isLoading && listings.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="spinner w-4 h-4" />
                  Đang tải thêm...
                </div>
              )}
              {showEndOfList && (
                <p className="text-sm text-gray-400">
                  Đã hiển thị tất cả {listings.length} template
                </p>
              )}
              <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketplaceContent;