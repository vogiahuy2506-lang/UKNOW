import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineShoppingCart,
  HiOutlineEye,
  HiOutlineClock,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import { useI18n } from '../../i18n';
import Pagination from '../../components/common/Pagination';
import { useMarketplaceModal } from '../../contexts/MarketplaceModalContext';

const MyPurchases = () => {
  const { t } = useI18n();
  const { showListing } = useMarketplaceModal();
  const [purchases, setPurchases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  useEffect(() => {
    fetchPurchases();
  }, [pagination.page]);

  const fetchPurchases = async () => {
    setIsLoading(true);
    try {
      const response = await marketplaceService.getMyPurchases({
        page: pagination.page,
        limit: 20,
      });
      setPurchases(response.data.data);
      if (response.data.pagination) {
        setPagination(prev => ({ ...prev, ...response.data.pagination }));
      }
    } catch (error) {
      toast.error('Không thể tải danh sách mua hàng');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Template đã mua</h1>
          <p className="text-gray-500 mt-1">
            Các template bạn đã mua có thể sử dụng ngay
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
      ) : purchases.length === 0 ? (
        /* Empty state */
        <div className="card py-16">
          <div className="empty-state">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <HiOutlineShoppingCart className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Chưa mua template nào</h3>
            <p className="text-gray-500 mt-1">Khám phá marketplace để tìm template phù hợp</p>
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
          {/* Table */}
          <div className="card">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Loại</th>
                    <th>Người bán</th>
                    <th>Đã mua lúc</th>
                    <th>Credits đã trả</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(purchase => (
                    <tr key={purchase.id}>
                      <td>
                        <button
                          onClick={() => showListing(purchase.listing_id, 'purchases')}
                          className="font-medium text-primary-600 hover:text-primary-700 text-left"
                        >
                          {purchase.title || `Template #${purchase.listing_id}`}
                        </button>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {purchase.description || 'Không có mô tả'}
                        </p>
                      </td>
                      <td>
                        <span className={`badge ${
                          purchase.cloned_resource_type === 'campaign' ? 'badge-info' : 'badge-purple'
                        }`}>
                          {purchase.cloned_resource_type === 'campaign' ? 'Chiến dịch' : 'Chatbot'}
                        </span>
                      </td>
                      <td className="text-gray-600">
                        {purchase.seller_name || 'Người dùng'}
                      </td>
                      <td className="text-gray-500">
                        <div className="flex items-center gap-1">
                          <HiOutlineClock className="w-4 h-4" />
                          {formatDate(purchase.purchased_at)}
                        </div>
                      </td>
                      <td>
                        {purchase.credits_spent > 0 ? (
                          <span className="text-amber-600 font-medium">{purchase.credits_spent} credits</span>
                        ) : (
                          <span className="text-green-600 font-medium">Miễn phí</span>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => showListing(purchase.listing_id, 'purchases')}
                          className="btn btn-sm btn-outline"
                        >
                          <HiOutlineEye className="w-4 h-4 mr-1" />
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="border-t border-gray-200 px-4 py-3">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={(page) => setPagination(prev => ({ ...prev, page }))}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MyPurchases;
