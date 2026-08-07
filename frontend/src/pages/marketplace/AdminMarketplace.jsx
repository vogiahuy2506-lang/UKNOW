import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineCheck,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlineShoppingBag,
  HiOutlineCurrencyDollar,
} from 'react-icons/hi';
import api from '../../services/api';
import { useI18n } from '../../i18n';
import Pagination from '../../components/common/Pagination';
import { useMarketplaceModal } from '../../contexts/MarketplaceModalContext';

const AdminMarketplace = () => {
  const { t } = useI18n();
  const { showListing } = useMarketplaceModal();
  const [stats, setStats] = useState(null);
  const [listings, setListings] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', type: '', search: '' });
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchListings();
  }, [pagination.page, filters]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/admin/marketplace/stats');
      setStats(response.data.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchListings = async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: 20,
        ...(filters.status && { status: filters.status }),
        ...(filters.type && { type: filters.type }),
        ...(filters.search && { search: filters.search }),
      };
      const response = await api.get('/admin/marketplace/listings', { params });
      setListings(response.data.data);
      if (response.data.pagination) {
        setPagination(prev => ({ ...prev, ...response.data.pagination }));
      }
    } catch (error) {
      toast.error('Không thể tải danh sách');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/admin/marketplace/listings/${id}/status`, { status });
      toast.success('Đã cập nhật trạng thái');
      fetchListings();
      fetchStats();
    } catch (error) {
      toast.error('Không thể cập nhật trạng thái');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc muốn xóa listing này?')) return;

    try {
      await api.delete(`/admin/marketplace/listings/${id}`);
      toast.success('Đã xóa listing');
      fetchListings();
      fetchStats();
    } catch (error) {
      toast.error('Không thể xóa listing');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một listing');
      return;
    }

    try {
      await Promise.all(
        selectedIds.map(id => api.put(`/admin/marketplace/listings/${id}/status`, { status: action }))
      );
      toast.success(`Đã cập nhật ${selectedIds.length} listing`);
      setSelectedIds([]);
      fetchListings();
      fetchStats();
    } catch (error) {
      toast.error('Không thể thực hiện thao tác');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === listings.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(listings.map(l => l.id));
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
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
      <span className={`badge ${badges[status] || 'badge-gray'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Marketplace</h1>
          <p className="text-gray-500 mt-1">
            Kiểm duyệt và quản lý các listing trên marketplace
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <HiOutlineShoppingBag className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalListings || 0}</p>
                <p className="text-sm text-gray-500">Tổng listings</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <HiOutlineCheck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.byStatus?.published || 0}</p>
                <p className="text-sm text-gray-500">Đã đăng</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <HiOutlineFilter className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.byStatus?.draft || 0}</p>
                <p className="text-sm text-gray-500">Nháp</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-lg">
                <HiOutlineCurrencyDollar className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalRevenue || 0}</p>
                <p className="text-sm text-gray-500">Tổng credits</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <HiOutlineSearch className="w-5 h-5" />
            </span>
            <input
              type="text"
              placeholder="Tìm kiếm theo tên, mô tả..."
              value={filters.search}
              onChange={(e) => {
                setFilters(prev => ({ ...prev, search: e.target.value }));
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="input pl-10 w-full"
            />
          </div>

          <select
            value={filters.status}
            onChange={(e) => {
              setFilters(prev => ({ ...prev, status: e.target.value }));
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="input w-auto"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="draft">Nháp</option>
            <option value="published">Đã đăng</option>
            <option value="paused">Tạm dừng</option>
          </select>

          <select
            value={filters.type}
            onChange={(e) => {
              setFilters(prev => ({ ...prev, type: e.target.value }));
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="input w-auto"
          >
            <option value="">Tất cả loại</option>
            <option value="campaign">Chiến dịch</option>
            <option value="chatbot">Chatbot</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between">
            <span className="font-medium text-blue-700">
              Đã chọn {selectedIds.length} listing
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkAction('published')}
                className="btn btn-sm btn-success"
              >
                <HiOutlineCheck className="w-4 h-4 mr-1" />
                Đăng tất cả
              </button>
              <button
                onClick={() => handleBulkAction('paused')}
                className="btn btn-sm btn-warning"
              >
                <HiOutlineFilter className="w-4 h-4 mr-1" />
                Tạm dừng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="spinner w-8 h-8"></div>
          </div>
        ) : listings.length === 0 ? (
          <div className="empty-state py-16">
            <h3 className="text-lg font-medium text-gray-900">Không có listing nào</h3>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === listings.length && listings.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th>Template</th>
                  <th>Loại</th>
                  <th>Trạng thái</th>
                  <th>Giá</th>
                  <th>Người bán</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(listing.id)}
                        onChange={() => toggleSelect(listing.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td>
                      <button
                        onClick={() => showListing(listing.id, 'browse')}
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
                      <div>
                        <p className="font-medium">{listing.seller_name}</p>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => showListing(listing.id, 'browse')}
                          className="btn btn-sm btn-ghost"
                          title="Xem chi tiết"
                        >
                          <HiOutlineEye className="w-4 h-4" />
                        </button>
                        {listing.status === 'draft' && (
                          <button
                            onClick={() => handleStatusChange(listing.id, 'published')}
                            className="btn btn-sm btn-ghost text-green-600 hover:text-green-700"
                            title="Đăng listing"
                          >
                            <HiOutlineCheck className="w-4 h-4" />
                          </button>
                        )}
                        {listing.status === 'published' && (
                          <button
                            onClick={() => handleStatusChange(listing.id, 'paused')}
                            className="btn btn-sm btn-ghost text-yellow-600 hover:text-yellow-700"
                            title="Tạm dừng"
                          >
                            <HiOutlineFilter className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(listing.id)}
                          className="btn btn-sm btn-ghost text-red-600 hover:text-red-700"
                          title="Xóa"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
    </div>
  );
};

export default AdminMarketplace;
