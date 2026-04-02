import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import {
  HiOutlineLightningBolt,
  HiOutlineUsers,
  HiOutlineSearch,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
} from 'react-icons/hi';
import { getCampaignTypeMeta } from '../../utils/campaignTypeDisplay';
import { formatDateOnly } from '../../features/customers/utils/customerDisplay.helpers';

const STATUS_MAP = {
  active: { label: 'Đang hoạt động', cls: 'badge-success' },
  draft: { label: 'Nháp', cls: 'badge-gray' },
  paused: { label: 'Tạm dừng', cls: 'badge-warning' },
  completed: { label: 'Hoàn thành', cls: 'badge-info' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || { label: status || '--', cls: 'badge-gray' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
};

const Customers = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search]);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: 20,
        ...(search && { search }),
      });
      const res = await api.get(`/campaigns?${params}`);
      const data = res.data?.data || {};
      const visibleCampaigns = (data.items || []).filter(
        (item) => String(item?.status || '').toLowerCase() !== 'draft'
      );
      setCampaigns(visibleCampaigns);
      setPagination((p) => ({
        ...p,
        total: visibleCampaigns.length,
        totalPages: Math.max(1, Math.ceil(visibleCampaigns.length / 20)),
      }));
    } catch {
      toast.error('Không thể tải danh sách chiến dịch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(pendingSearch);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Khách hàng</h1>
        <p className="mt-1 text-gray-500">
          Chọn chiến dịch để xem danh sách khách hàng tham gia
        </p>
      </div>

      {/* Search */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex items-center flex-1 min-w-0 rounded-lg border border-gray-300 bg-white transition-base focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <span className="pl-3 pr-2 text-gray-400 pointer-events-none shrink-0">
              <HiOutlineSearch className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder="Tìm kiếm chiến dịch..."
              className="w-full py-2 pr-3 text-sm bg-transparent border-0 rounded-lg focus:outline-none"
            />
          </div>
          <button type="submit" className="btn btn-secondary shrink-0">
            Tìm kiếm
          </button>
        </form>
      </div>

      {/* Campaign list */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="spinner w-8 h-8" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
            <HiOutlineLightningBolt className="w-10 h-10" />
            <p>Không có chiến dịch nào</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/customers/${c.id}`)}
                className="w-full flex items-center px-6 py-4 hover:bg-gray-50 transition-colors text-left group"
              >
                {/* Icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 shrink-0 mr-4">
                  <HiOutlineLightningBolt className="w-5 h-5 text-primary-600" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">
                      {c.campaignName}
                    </span>
                    <StatusBadge status={c.status} />
                    {(() => {
                      const typeMeta = getCampaignTypeMeta(c.campaignType);
                      return (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${typeMeta.className}`}>
                          {typeMeta.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    <span>Tạo lúc {formatDateOnly(c.createdAt)}</span>
                    <span>Người tạo: {c?.createdBy?.name || c?.creatorName || 'Không xác định'}</span>
                    <span className="flex items-center gap-1">
                      <HiOutlineUsers className="w-4 h-4" />
                      {c.totalSent ?? 0} đã gửi
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <HiOutlineChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary-500 shrink-0 ml-3 transition-colors" />
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">Tổng: {pagination.total} chiến dịch</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page === 1}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                <HiOutlineChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm px-1 text-gray-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="btn btn-secondary btn-sm disabled:opacity-50"
              >
                <HiOutlineChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Customers;
