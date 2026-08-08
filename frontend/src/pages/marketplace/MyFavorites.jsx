import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlineHeart, HiOutlineEye } from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import Pagination from '../../components/common/Pagination';
import { useMarketplaceModal } from '../../contexts/useMarketplaceModal';

const MyFavorites = () => {
  const { showListing } = useMarketplaceModal();
  const [favorites, setFavorites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  useEffect(() => {
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page]);

  const fetchFavorites = async () => {
    setIsLoading(true);
    try {
      const response = await marketplaceService.getMyFavorites({
        page: pagination.page,
        limit: 20,
      });
      setFavorites(response.data.data);
      if (response.data.pagination) {
        setPagination(prev => ({ ...prev, ...response.data.pagination }));
      }
    } catch (error) {
      toast.error('Không thể tải danh sách yêu thích');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFavorite = async (listingId, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await marketplaceService.removeFavorite(listingId);
      toast.success('Đã xóa khỏi yêu thích');
      setFavorites(prev => prev.filter(f => f.id !== listingId));
    } catch (error) {
      toast.error('Không thể xóa khỏi yêu thích');
    }
  };

  const getCategoryBadgeClass = (category) => {
    const classes = {
      marketing: 'bg-orange-100 text-orange-700',
      automation: 'bg-blue-100 text-blue-700',
      support: 'bg-purple-100 text-purple-700',
    };
    return classes[category] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Yêu thích</h1>
          <p className="text-gray-500 mt-1">
            Các template bạn đã lưu để xem sau
          </p>
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
        /* Empty state */
        <div className="card py-16">
          <div className="empty-state">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <HiOutlineHeart className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Chưa có template yêu thích</h3>
            <p className="text-gray-500 mt-1">Lưu lại những template bạn thích để xem sau</p>
            <Link
              to="/app/marketplace"
              className="btn btn-primary mt-4"
            >
              <HiOutlineEye className="w-5 h-5 mr-2" />
              Khám phá Marketplace
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {favorites.map(listing => (
              <div key={listing.id} className="card hover:shadow-md transition-shadow relative">
                {/* Remove button */}
                <button
                  onClick={(e) => handleRemoveFavorite(listing.id, e)}
                  className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-sm text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors z-10"
                  title="Xóa khỏi yêu thích"
                >
                  <HiOutlineHeart className="w-5 h-5 fill-red-500" />
                </button>

                <div className="p-4">
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getCategoryBadgeClass(listing.category)}`}>
                      {listing.category === 'marketing' ? 'Marketing' :
                       listing.category === 'automation' ? 'Automation' :
                       listing.category === 'support' ? 'Hỗ trợ' : 'Khác'}
                    </span>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      listing.resource_type === 'campaign'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {listing.resource_type === 'campaign' ? 'Chiến dịch' : 'Chatbot'}
                    </span>
                  </div>

                  {/* Title */}
                  <button
                    onClick={() => showListing(listing.id, 'favorites')}
                    className="block font-semibold text-gray-900 hover:text-primary-600 line-clamp-2 mb-2 text-left"
                  >
                    {listing.title}
                  </button>

                  {/* Description */}
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                    {listing.description || 'Không có mô tả'}
                  </p>

                  {/* Price & Seller */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div>
                      {listing.price_credits > 0 ? (
                        <span className="text-amber-600 font-semibold">{listing.price_credits} credits</span>
                      ) : (
                        <span className="text-green-600 font-semibold">Miễn phí</span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">{listing.seller_name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MyFavorites;
