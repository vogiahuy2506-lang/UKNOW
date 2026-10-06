import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import PageHeader from '../../components/common/PageHeader';
import {
  HiOutlineLightningBolt,
  HiOutlineUsers,
  HiOutlineSearch,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlineX,
} from 'react-icons/hi';
import { getCampaignTypeMeta } from '../../utils/campaignTypeDisplay';
import { formatDateOnly } from '../../features/customers/utils/customerDisplay.helpers';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';

const StatusBadge = ({ status, t }) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {t('campaigns.active')}
      </span>
    );
  }
  if (normalized === 'paused') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {t('campaigns.paused')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      {t(`campaigns.${normalized}`) || status || '--'}
    </span>
  );
};

const Customers = () => {
  const { t } = useI18n();
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
      // Bản nháp bị loại NGAY Ở API (excludeDraft) rồi dùng `pagination` của API. Trước đây API cắt 20 dòng
      // trước, trình duyệt lọc nháp sau và tự gán totalPages = 1 → chiến dịch thứ 21 trở đi không mở được.
      const params = {
        page: pagination.page,
        limit: 20,
        excludeDraft: 1,
        ...(search && { search }),
      };
      const res = await campaignApiService.getCampaigns(params);
      const data = res.data?.data || {};
      const items = data.items || [];
      const apiPagination = data.pagination || {};
      setCampaigns(items);
      setPagination((p) => ({
        ...p,
        total: Number.isFinite(Number(apiPagination.total)) ? Number(apiPagination.total) : items.length,
        totalPages: Math.max(1, Number(apiPagination.totalPages) || 1),
      }));
    } catch {
      toast.error(t('customers.loadFailed'));
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
      <PageHeader
        icon={HiOutlineUsers}
        title={t('customers.title')}
        subtitle={t('customers.selectCampaign')}
      />

      {/* Search Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <HiOutlineSearch className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder={t('customers.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
            />
            {pendingSearch && (
              <button
                type="button"
                onClick={() => {
                  setPendingSearch('');
                  setSearch('');
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs shrink-0"
          >
            {t('common.search')}
          </button>
        </form>
      </div>

      {/* Campaign list */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Đang tải danh sách chiến dịch…</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-400 mb-3 shadow-xs">
              <HiOutlineLightningBolt className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-slate-700">{t('campaigns.noCampaigns')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/app/customers/${c.id}`)}
                className="w-full flex items-center px-6 py-4 hover:bg-slate-50/70 transition-colors text-left group"
              >
                {/* Icon */}
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-orange-500/5 border border-orange-200/60 text-orange-600 shrink-0 mr-4 shadow-2xs">
                  <HiOutlineLightningBolt className="w-5 h-5" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900 group-hover:text-orange-600 transition-colors truncate">
                      {c.campaignName}
                    </span>
                    <StatusBadge status={c.status} t={t} />
                    {(() => {
                      const typeMeta = getCampaignTypeMeta(c.campaignType);
                      return (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeMeta.className}`}>
                          {typeMeta.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 flex-wrap">
                    <span>{t('customers.createdAt')} {formatDateOnly(c.createdAt)}</span>
                    <span>{t('customers.creator')}: {c?.createdBy?.name || c?.creatorName || t('customers.unknownCreator')}</span>
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <HiOutlineUsers className="w-3.5 h-3.5 text-slate-400" />
                      {t('customers.sentCount', { count: c.totalSent ?? 0 })}
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <HiOutlineChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 shrink-0 ml-3 transition-all" />
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-500 font-medium">{t('customers.total', { total: pagination.total })}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page <= 1}
                className="btn btn-secondary btn-sm p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <HiOutlineChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold text-slate-700">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="btn btn-secondary btn-sm p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
