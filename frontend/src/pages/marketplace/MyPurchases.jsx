import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineShoppingCart,
  HiOutlineEye,
  HiOutlineClock,
  HiOutlineSparkles,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import Pagination from '../../components/common/Pagination';
import { useMarketplaceModal } from '../../contexts/useMarketplaceModal';
import { useI18n } from '../../i18n';

const MyPurchases = () => {
  const { showListing } = useMarketplaceModal();
  const t = useI18n('marketplace');
  const [purchases, setPurchases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  const fetchPurchases = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await marketplaceService.getMyPurchases({
        page: pagination.page,
        limit: 20,
      });
      const payload = response?.data?.data;
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : [];
      setPurchases(rows);
      if (response?.data?.pagination) {
        setPagination((prev) => ({
          ...prev,
          ...response.data.pagination,
          page: response.data.pagination.page ?? prev.page,
        }));
      }
    } catch (error) {
      toast.error(t('purchases.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, t]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  useEffect(() => {
    if (!isLoading && pagination.totalPages > 0 && pagination.page > pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [pagination.page, pagination.totalPages, isLoading]);

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
          <h1 className="text-2xl font-bold text-gray-900">{t('purchases.title')}</h1>
          <p className="text-gray-500 mt-1">{t('purchases.subtitle')}</p>
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
        <div className="card py-16 text-center">
          <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HiOutlineShoppingCart className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('purchases.emptyTitle')}</h3>
          <p className="text-sm text-gray-500 mb-5">{t('purchases.emptyDesc')}</p>
          <Link to="/app/marketplace" className="btn btn-primary">
            <HiOutlineSparkles className="w-4 h-4 mr-1.5" />
            Khám phá marketplace
          </Link>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="card overflow-hidden">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Loại</th>
                    <th>Người bán</th>
                    <th>Ngày mua</th>
                    <th>Credits đã trả</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>
                        <button
                          onClick={() => showListing(purchase.listing_id, 'purchases')}
                          className="font-semibold text-gray-900 hover:text-orange-600 text-left block"
                        >
                          {purchase.title || `Template #${purchase.listing_id}`}
                        </button>
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                          {purchase.description || 'Không có mô tả'}
                        </p>
                      </td>
                      <td>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {purchase.cloned_resource_type === 'campaign' ? 'Chiến dịch' : 'Chatbot'}
                        </span>
                      </td>
                      <td className="text-gray-600">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center text-xs font-medium">
                            {(purchase.seller_name || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm">{purchase.seller_name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 text-gray-500 text-sm">
                          <HiOutlineClock className="w-4 h-4" />
                          {formatDate(purchase.purchased_at)}
                        </div>
                      </td>
                      <td>
                        {purchase.credits_spent > 0 ? (
                          <span className="text-amber-600 font-medium">
                            {purchase.credits_spent} credits
                          </span>
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
                  onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
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