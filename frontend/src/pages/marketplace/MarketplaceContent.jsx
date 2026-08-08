import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineSearch,
  HiOutlineX,
  HiOutlineViewGrid,
  HiOutlineViewList,
  HiOutlineStar,
  HiOutlineEye,
  HiOutlineShoppingCart,
  HiOutlineHeart,
  HiOutlinePlus,
  HiOutlineSparkles,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import Pagination from '../../components/common/Pagination';

const TABS = [
  { id: 'browse', label: 'Khám phá' },
  { id: 'my', label: 'Của tôi' },
  { id: 'purchases', label: 'Đã mua' },
  { id: 'favorites', label: 'Yêu thích' },
];

const CATEGORIES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'automation', label: 'Automation' },
  { value: 'support', label: 'Hỗ trợ' },
  { value: 'sales', label: 'Bán hàng' },
  { value: 'onboarding', label: 'Onboarding' },
];

const SORT_OPTIONS = [
  { value: 'rating', label: 'Đánh giá cao nhất' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'popular', label: 'Phổ biến nhất' },
  { value: 'price_asc', label: 'Giá thấp → cao' },
  { value: 'price_desc', label: 'Giá cao → thấp' },
];

const MarketplaceContent = ({ onClose, activeTab, onTabChange, onSelectListing }) => {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  const [currentTab, setCurrentTab] = useState(activeTab || 'browse');
  const [filters, setFilters] = useState({ category: '', sort: 'rating', search: '' });
  const [viewMode, setViewMode] = useState('grid');
  const [favorites, setFavorites] = useState(new Set());

  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (activeTab && activeTab !== currentTab) {
      setCurrentTab(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchListings = async (tab, filterState, page) => {
    setIsLoading(true);
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
        case 'purchases':
          response = await marketplaceService.getMyPurchases(params);
          break;
        case 'favorites':
          response = await marketplaceService.getMyFavorites(params);
          break;
        default:
          response = await marketplaceService.browse(params);
      }

      setListings(Array.isArray(response.data.data) ? response.data.data : []);
      if (response.data.pagination) {
        setPagination(prev => ({ ...prev, ...response.data.pagination, page }));
      }
    } catch (error) {
      toast.error('Không thể tải danh sách');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchListings(currentTab, filters, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, filters.category, filters.sort]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setPagination(prev => ({ ...prev, page: 1 }));
      fetchListings(currentTab, filters, 1);
    }, 350);
    return () => clearTimeout(searchTimeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  useEffect(() => {
    if (pagination.page > 1) fetchListings(currentTab, filters, pagination.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

  const handleFavorite = async (listingId, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      if (favorites.has(listingId)) {
        await marketplaceService.removeFavorite(listingId);
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
      } else {
        await marketplaceService.addFavorite(listingId);
        setFavorites(prev => new Set([...prev, listingId]));
      }
    } catch (error) {
      toast.error('Không thể cập nhật');
    }
  };

  const handleListingClick = (id, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    onSelectListing?.(id);
  };

  const handleTabChange = (tabId) => {
    setCurrentTab(tabId);
    onTabChange?.(tabId);
  };

  const handleCreateListing = () => {
    onClose?.();
    navigate('/app/marketplace/create');
  };

  const renderStars = (rating) => (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <HiOutlineStar
          key={star}
          className={`w-3.5 h-3.5 ${
            star <= (rating || 0) ? 'text-orange-500 fill-orange-500' : 'text-gray-200'
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-100 bg-white">
        <div className="px-6 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center">
              <HiOutlineSparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">Marketplace</h1>
              <p className="text-xs text-gray-500 leading-tight">Template & workflow cộng đồng</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateListing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <HiOutlinePlus className="w-4 h-4" />
              Đăng bán
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                aria-label="Đóng"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex items-center gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                currentTab === tab.id
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Search & filters */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm template..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10"
              />
              {filters.search && (
                <button
                  onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                >
                  <HiOutlineX className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>

            <select
              value={filters.sort}
              onChange={(e) => setFilters(prev => ({ ...prev, sort: e.target.value }))}
              className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-orange-400"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <div className="hidden md:flex items-center bg-white border border-gray-200 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
                aria-label="Grid view"
              >
                <HiOutlineViewGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
                aria-label="List view"
              >
                <HiOutlineViewList className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-4">
            <button
              onClick={() => setFilters(prev => ({ ...prev, category: '' }))}
              className={`flex-shrink-0 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors ${
                !filters.category
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              Tất cả
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setFilters(prev => ({ ...prev, category: cat.value }))}
                className={`flex-shrink-0 px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  filters.category === cat.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-900">{pagination.total || 0}</span> kết quả
            </p>
            {(filters.search || filters.category) && (
              <button
                onClick={() => setFilters(prev => ({ ...prev, search: '', category: '' }))}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'space-y-2'
            }>
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden animate-pulse">
                  <div className={`bg-gray-100 ${viewMode === 'grid' ? 'h-32' : 'h-12 w-12 rounded-lg'}`} />
                  <div className="p-4 space-y-2">
                    <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!isLoading && listings.length === 0 && (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
              <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <HiOutlineSparkles className="w-7 h-7 text-orange-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                {filters.search || filters.category ? 'Không tìm thấy kết quả' : 'Chưa có template nào'}
              </h3>
              <p className="text-sm text-gray-500 mb-5">
                {filters.search || filters.category ? 'Thử thay đổi bộ lọc' : 'Hãy là người đầu tiên đăng bán'}
              </p>
              {!(filters.search || filters.category) && (
                <button
                  onClick={handleCreateListing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg"
                >
                  <HiOutlinePlus className="w-4 h-4" />
                  Tạo listing
                </button>
              )}
            </div>
          )}

          {/* Grid */}
          {!isLoading && listings.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {listings.map(listing => {
                const isFav = favorites.has(listing.id);
                return (
                  <div
                    key={listing.id}
                    onClick={() => handleListingClick(listing.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' ? handleListingClick(listing.id) : null)}
                    className="group bg-white rounded-xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <div className="relative h-32 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
                      <button
                        onClick={(e) => handleFavorite(listing.id, e)}
                        className={`absolute top-2.5 right-2.5 p-1.5 rounded-md transition-colors ${
                          isFav ? 'bg-orange-600 text-white' : 'bg-white/80 text-gray-400 hover:text-orange-600'
                        }`}
                        aria-label="Yêu thích"
                      >
                        <HiOutlineHeart className={`w-3.5 h-3.5 ${isFav ? 'fill-white' : ''}`} />
                      </button>
                      <div className="absolute bottom-3 left-3 right-12 flex items-end justify-between">
                        <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center text-lg shadow-sm">
                          {listing.resource_type === 'campaign' ? '📧' : '🤖'}
                        </div>
                        {listing.price_credits > 0 ? (
                          <span className="text-xs font-semibold text-orange-600 bg-white/90 px-2 py-0.5 rounded">
                            {listing.price_credits} cr
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-green-600 bg-white/90 px-2 py-0.5 rounded">
                            Free
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium text-gray-900 text-sm line-clamp-1 group-hover:text-orange-600">
                        {listing.title}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-1 min-h-[2rem]">
                        {listing.description || 'Không có mô tả'}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {renderStars(listing.rating_avg)}
                          <span className="text-xs text-gray-400">({listing.rating_count || 0})</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="inline-flex items-center gap-0.5"><HiOutlineEye className="w-3 h-3" />{listing.view_count || 0}</span>
                          <span className="inline-flex items-center gap-0.5"><HiOutlineShoppingCart className="w-3 h-3" />{listing.purchase_count || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* List */}
          {!isLoading && listings.length > 0 && viewMode === 'list' && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <div className="col-span-5">Template</div>
                <div className="col-span-2">Danh mục</div>
                <div className="col-span-2">Đánh giá</div>
                <div className="col-span-2">Giá</div>
                <div className="col-span-1"></div>
              </div>
              {listings.map((listing, idx) => {
                const isFav = favorites.has(listing.id);
                return (
                  <div
                    key={listing.id}
                    className={`grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50 ${
                      idx !== listings.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                  >
                    <div className="col-span-5">
                      <div
                        onClick={() => handleListingClick(listing.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === 'Enter' ? handleListingClick(listing.id) : null)}
                        className="flex items-center gap-3 group cursor-pointer"
                      >
                        <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-base">
                          {listing.resource_type === 'campaign' ? '📧' : '🤖'}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm text-gray-900 line-clamp-1 group-hover:text-orange-600">{listing.title}</h3>
                          <p className="text-xs text-gray-500 line-clamp-1">{listing.seller_name}</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 text-xs text-gray-600 capitalize">{listing.category || '—'}</div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      {renderStars(listing.rating_avg)}
                      <span className="text-xs text-gray-500">({listing.rating_count || 0})</span>
                    </div>
                    <div className="col-span-2">
                      {listing.price_credits > 0 ? (
                        <span className="text-sm font-semibold text-orange-600">{listing.price_credits} credits</span>
                      ) : (
                        <span className="text-xs font-medium text-green-600">Miễn phí</span>
                      )}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={(e) => handleFavorite(listing.id, e)}
                        className={`p-1.5 rounded-md ${isFav ? 'text-orange-600' : 'text-gray-400 hover:text-orange-600'}`}
                      >
                        <HiOutlineHeart className={`w-4 h-4 ${isFav ? 'fill-orange-600' : ''}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && listings.length > 0 && pagination.totalPages > 1 && (
            <div className="mt-6">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(page) => {
                  setPagination(prev => ({ ...prev, page }));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketplaceContent;
