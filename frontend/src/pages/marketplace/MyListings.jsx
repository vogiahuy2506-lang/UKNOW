import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePlay,
  HiOutlinePause,
  HiOutlineStar,
  HiOutlineTemplate,
  HiOutlineMail,
  HiOutlineChat,
  HiOutlineCog,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import Pagination from '../../components/common/Pagination';
import { useI18n } from '../../i18n';

const MyListings = () => {
  const navigate = useNavigate();
  const t = useI18n('marketplace');
  const [listings, setListings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [statusFilter]);

  useEffect(() => {
    fetchListings();
  }, [statusFilter, pagination.page]);

  const fetchListings = async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: 20,
      };
      if (statusFilter) params.status = statusFilter;
      const response = await marketplaceService.getMyListings(params);
      const payload = response.data.data;
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
        ? payload.items
        : [];
      setListings(rows);
      if (response.data.pagination) {
        setPagination((prev) => ({
          ...prev,
          ...response.data.pagination,
          page: response.data.pagination.page ?? prev.page,
        }));
      }
    } catch (error) {
      toast.error(t('myListings.loadError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async (id) => {
    try {
      await marketplaceService.publishListing(id);
      toast.success(t('myListings.publishSuccess'));
      fetchListings();
    } catch (error) {
      toast.error(t('myListings.publishError'));
    }
  };

  const handlePause = async (id) => {
    try {
      await marketplaceService.pauseListing(id);
      toast.success(t('myListings.pauseSuccess'));
      fetchListings();
    } catch (error) {
      toast.error(t('myListings.pauseError'));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa template này?')) return;
    try {
      await marketplaceService.deleteListing(id);
      toast.success(t('myListings.deleteSuccess'));
      setPagination((prev) => ({ ...prev, page: 1 }));
      fetchListings();
    } catch (error) {
      toast.error(t('myListings.deleteError'));
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-600',
      published: 'bg-emerald-100 text-emerald-700',
      paused: 'bg-amber-100 text-amber-700',
    };
    const labels = {
      draft: 'Nháp',
      published: 'Đã đăng',
      paused: 'Tạm dừng',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getStatusActions = (listing) => {
    const actions = [];
    if (listing.status === 'draft') {
      actions.push({
        label: 'Xuất bản',
        icon: HiOutlinePlay,
        onClick: () => handlePublish(listing.id),
        className: 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50',
      });
    }
    if (listing.status === 'published') {
      actions.push({
        label: 'Tạm dừng',
        icon: HiOutlinePause,
        onClick: () => handlePause(listing.id),
        className: 'text-amber-600 hover:text-amber-700 hover:bg-amber-50',
      });
    }
    if (listing.status === 'paused') {
      actions.push({
        label: 'Xuất bản lại',
        icon: HiOutlinePlay,
        onClick: () => handlePublish(listing.id),
        className: 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50',
      });
    }
    return actions;
  };

  const getTypeIcon = (resourceType) => {
    if (resourceType === 'campaign') return HiOutlineMail;
    if (resourceType === 'chatbot') return HiOutlineChat;
    return HiOutlineTemplate;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Template của tôi</h1>
          <p className="text-gray-500 mt-1">Quản lý các template đã chia sẻ trên marketplace</p>
        </div>
        <Link to="/app/marketplace/create" className="btn btn-primary">
          <HiOutlinePlus className="w-4 h-4 mr-1.5" />
          Tạo template mới
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-center">
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
          <span className="text-sm text-gray-500">
            {pagination.total} template
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : listings.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <HiOutlineTemplate className="w-8 h-8 text-orange-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Chưa có template nào</h3>
            <p className="text-sm text-gray-500 mb-5">Bắt đầu chia sẻ template đầu tiên của bạn</p>
            <Link to="/app/marketplace/create" className="btn btn-primary">
              <HiOutlinePlus className="w-4 h-4 mr-1.5" />
              Tạo template đầu tiên
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
                {listings.map(listing => {
                  const TypeIcon = getTypeIcon(listing.resource_type);
                  return (
                    <tr
                      key={listing.id}
                      onClick={() => navigate(`/app/marketplace/listing/${listing.id}/settings`)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td>
                        <span className="font-semibold text-gray-900 group-hover:text-orange-600 block">
                          {listing.title}
                        </span>
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                          {listing.description || 'Không có mô tả'}
                        </p>
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
                          listing.resource_type === 'campaign' 
                            ? 'bg-orange-50 text-orange-600' 
                            : 'bg-purple-50 text-purple-600'
                        }`}>
                          <TypeIcon className="w-3.5 h-3.5" />
                          {listing.resource_type === 'campaign' ? 'Chiến dịch' : 'Chatbot'}
                        </span>
                      </td>
                      <td>{getStatusBadge(listing.status)}</td>
                      <td>
                        {listing.price_credits > 0 ? (
                          <span className="text-orange-600 font-medium">{listing.price_credits} credits</span>
                        ) : (
                          <span className="text-emerald-600 font-medium">Miễn phí</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <HiOutlineStar className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <span>{typeof listing.rating_avg === 'number' ? listing.rating_avg.toFixed(1) : '0.0'}</span>
                          <span className="text-gray-400 text-sm">({listing.rating_count || 0})</span>
                        </div>
                      </td>
                      <td>{listing.purchase_count || 0}</td>
                      <td>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/app/marketplace/listing/${listing.id}/settings`)}
                            className="p-2 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                            title="Cài đặt"
                          >
                            <HiOutlineCog className="w-4 h-4" />
                          </button>
                          {getStatusActions(listing).map((action, idx) => (
                            <button
                              key={idx}
                              onClick={action.onClick}
                              className={`p-2 rounded-lg transition-colors ${action.className}`}
                              title={action.label}
                            >
                              <action.icon className="w-4 h-4" />
                            </button>
                          ))}
                          <button
                            onClick={() => handleDelete(listing.id)}
                            className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Xóa"
                          >
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && pagination.totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-3">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MyListings;
