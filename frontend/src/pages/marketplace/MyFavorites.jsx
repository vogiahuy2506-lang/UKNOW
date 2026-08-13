import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineHeart, HiOutlineEye } from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import Pagination from '../../components/common/Pagination';
import ListingCard from '../../components/marketplace/ListingCard';
import { useMarketplaceModal } from '../../contexts/useMarketplaceModal';
import { useI18n } from '../../i18n';

const MyFavorites = () => {
  const { showListing } = useMarketplaceModal();
  const t = useI18n('marketplace');
  const [favorites, setFavorites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  const fetchFavorites = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await marketplaceService.getMyFavorites({
        page: pagination.page,
        limit: 20,
      });
      const payload = response?.data?.data;
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
      setFavorites(rows);
      if (response?.data?.pagination) {
        setPagination((prev) => ({
          ...prev,
          ...response.data.pagination,
          page: response.data.pagination.page ?? prev.page,
        }));
      }
    } catch (error) {
      toast.error(t('favorites.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, t]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  useEffect(() => {
    if (!isLoading && pagination.totalPages > 0 && pagination.page > pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [pagination.page, pagination.totalPages, isLoading]);

  const handleRemoveFavorite = async (listingId, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await marketplaceService.removeFavorite(listingId);
      toast.success(t('favorites.removeSuccess'));
      setFavorites((prev) => prev.filter((f) => f.id !== listingId));
      setPagination((prev) => {
        const newTotal = Math.max(0, (prev.total ?? 0) - 1);
        const newTotalPages = prev.limit > 0 ? Math.ceil(newTotal / prev.limit) : 1;
        return { ...prev, total: newTotal, totalPages: newTotalPages };
      });
    } catch (error) {
      toast.error(t('favorites.removeError'));
    }
  };

  const handleListingClick = (id) => {
    showListing(id, 'favorites');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('favorites.title')}</h1>
          <p className="text-gray-500 mt-1">{t('favorites.subtitle')}</p>
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="card">
          <div className="flex items-center justify-center h-64">
            <div className="spinner w-8 h-8"></div>
          </div>
        </div>
      ) : favorites.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HiOutlineHeart className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('favorites.emptyTitle')}</h3>
          <p className="text-sm text-gray-500 mb-5">{t('favorites.emptyDesc')}</p>
          <Link to="/app/marketplace" className="btn btn-primary">
            <HiOutlineEye className="w-4 h-4 mr-1.5" />
            Khám phá marketplace
          </Link>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {favorites.map((listing) => (
              <div key={listing.id} className="relative">
                <ListingCard
                  listing={listing}
                  view="grid"
                  onClick={handleListingClick}
                  labels={{
                    free: t('favorites.free'),
                    creditsShort: 'credits',
                    favoriteAria: t('favorites.removeTitle'),
                    noDescription: t('common.noDescription'),
                  }}
                />
                {/* Remove button */}
                <button
                  onClick={(e) => handleRemoveFavorite(listing.id, e)}
                  className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-sm text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors z-10"
                  title={t('favorites.removeTitle')}
                >
                  <HiOutlineHeart className="w-5 h-5 fill-red-500" />
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyFavorites;