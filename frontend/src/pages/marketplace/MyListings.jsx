import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlinePlay,
  HiOutlinePause,
  HiOutlineStar,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import { useMarketplaceModal } from '../../contexts/useMarketplaceModal';

const MyListings = () => {
  const { showListing } = useMarketplaceModal();
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const fetchListings = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const response = await marketplaceService.getMyListings(params);
      setListings(response.data.data.items || []);
    } catch (error) {
      toast.error('Không thể tải danh sách');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async (id) => {
    try {
      await marketplaceService.publishListing(id);
      toast.success('Đã đăng listing');
      fetchListings();
    } catch (error) {
      toast.error('Không thể đăng listing');
    }
  };

  const handlePause = async (id) => {
    try {
      await marketplaceService.pauseListing(id);
      toast.success('Đã tạm dừng listing');
      fetchListings();
    } catch (error) {
      toast.error('Không thể tạm dừng');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa listing này?')) return;
    try {
      await marketplaceService.deleteListing(id);
      toast.success('Đã xóa listing');
      fetchListings();
    } catch (error) {
      toast.error('Không thể xóa listing');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'badge-gray',
      published: 'badge-success',
      paused: 'badge-warning',
    };
    const labels = {
      draft: 'Nháp',
      published: 'Đã đăng',
      paused: 'Tạm dừng',
    };
    return (
      <span className={`badge ${styles[status] || 'badge-gray'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getStatusActions = (listing) => {
    const actions = [];

    if (listing.status === 'draft') {
      actions.push({
        label: 'Đăng',
        icon: HiOutlinePlay,
        onClick: () => handlePublish(listing.id),
        className: 'text-green-600 hover:text-green-700',
      });
    }

    if (listing.status === 'published') {
      actions.push({
        label: 'Tạm dừng',
        icon: HiOutlinePause,
        onClick: () => handlePause(listing.id),
        className: 'text-yellow-600 hover:text-yellow-700',
      });
    }

    actions.push({
      label: 'Xóa',
      icon: HiOutlineTrash,
      onClick: () => handleDelete(listing.id),
      className: 'text-red-600 hover:text-red-700',
    });

    return actions;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Listing của tôi</h1>
          <p className="text-gray-500 mt-1">
            Quản lý các template bạn đã đăng trên marketplace
          </p>
        </div>
        <Link
          to="/app/marketplace/create"
          className="btn btn-primary"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Tạo listing mới
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="draft">Nháp</option>
            <option value="published">Đã đăng</option>
            <option value="paused">Tạm dừng</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : listings.length === 0 ? (
          <div className="empty-state py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <HiOutlinePlus className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Chưa có listing nào</h3>
            <p className="text-gray-500 mt-1">Bắt đầu chia sẻ template đầu tiên của bạn</p>
            <Link
              to="/app/marketplace/create"
              className="btn btn-primary mt-4"
            >
              <HiOutlinePlus className="w-5 h-5 mr-2" />
              Tạo listing đầu tiên
            </Link>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th>Giá</th>
                  <th>Đánh giá</th>
                  <th>Lượt mua</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listings.map(listing => (
                  <tr key={listing.id}>
                    <td>
                      <button
                        onClick={() => showListing(listing.id, 'my')}
                        className="font-medium text-primary-600 hover:text-primary-700 text-left"
                      >
                        {listing.title}
                      </button>
                      <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                        {listing.description || 'Không có mô tả'}
                      </p>
                    </td>
                    <td>
                      <span className={`badge ${
                        listing.resource_type === 'campaign' ? 'badge-info' : 'badge-purple'
                      }`}>
                        {listing.resource_type === 'campaign' ? 'Chiến dịch' : 'Chatbot'}
                      </span>
                    </td>
                    <td>{getStatusBadge(listing.status)}</td>
                    <td>
                      {listing.price_credits > 0 ? (
                        <span className="text-amber-600 font-medium">{listing.price_credits} credits</span>
                      ) : (
                        <span className="text-green-600 font-medium">Miễn phí</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <HiOutlineStar className="w-4 h-4 text-amber-400" />
                        <span>{typeof listing.rating_avg === 'number' ? listing.rating_avg.toFixed(1) : '0.0'}</span>
                        <span className="text-gray-400 text-sm">({listing.rating_count || 0})</span>
                      </div>
                    </td>
                    <td>{listing.purchase_count || 0}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => showListing(listing.id, 'my')}
                          className="btn btn-sm btn-ghost"
                          title="Xem"
                        >
                          <HiOutlineEye className="w-4 h-4" />
                        </button>
                        {getStatusActions(listing).map((action, idx) => (
                          <button
                            key={idx}
                            onClick={action.onClick}
                            className={`btn btn-sm btn-ghost ${action.className}`}
                            title={action.label}
                          >
                            <action.icon className="w-4 h-4" />
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyListings;
