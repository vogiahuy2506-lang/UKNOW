import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { HiOutlineRefresh, HiOutlineSearch, HiOutlineBan } from 'react-icons/hi';
import adminOrdersApiService from '../../features/admin/services/adminOrdersApi.service';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_LABEL = (t) => ({
  success: { label: t('orders.success'), cls: 'badge-green' },
  pending: { label: t('orders.pending'), cls: 'badge-yellow' },
  cancelled: { label: t('orders.cancelled'), cls: 'badge-gray' },
});

const KpiCard = ({ label, value, sub }) => (
  <div className="card p-5">
    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
  </div>
);

const StatusBadge = ({ status }) => {
  const { t } = useI18n();
  const s = STATUS_LABEL(t)[status] || { label: status, cls: 'badge-gray' };
  return <span className={`badge ${s.cls} text-xs`}>{s.label}</span>;
};

const PAGE_SIZE = 20;

const AdminOrdersPage = () => {
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [filters, setFilters] = useState({ status: '', search: '', dateFrom: '', dateTo: '' });
  const [draft, setDraft] = useState({ status: '', search: '', dateFrom: '', dateTo: '' });
  const [cancellingCode, setCancellingCode] = useState(null); // orderCode đang confirm huỷ

  const fetchOrders = useCallback(async (f, p) => {
    setIsLoading(true);
    try {
      const params = { page: p, limit: PAGE_SIZE, ...f };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const res = await adminOrdersApiService.getOrders(params);
      const { orders: rows, total: t, kpi: k } = res.data.data;
      setOrders(rows);
      setTotal(t);
      setKpi(k);
    } catch {
      toast.error(t('orders.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchOrders(filters, page); }, [filters, page, fetchOrders]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  };

  const handleReset = () => {
    const empty = { status: '', search: '', dateFrom: '', dateTo: '' };
    setDraft(empty);
    setFilters(empty);
    setPage(1);
  };

  const handleCancel = async (orderCode) => {
    try {
      await adminOrdersApiService.cancelOrder(orderCode);
      toast.success(t('orders.cancelSuccess'));
      setCancellingCode(null);
      fetchOrders(filters, page);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('orders.cancelFailed'));
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminOrders.title')}</h1>
          <p className="text-gray-500 mt-1">{t('adminOrders.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => fetchOrders(filters, page)}
          className="btn btn-secondary"
          disabled={isLoading}
        >
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {t('adminOrders.refresh')}
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label={t('adminDashboard.revenue')}
          value={kpi ? fmtVnd(kpi.totalRevenue) : '—'}
          sub={t('adminOrders.fromSuccessfulOrders')}
        />
        <KpiCard
          label={t('adminOrders.totalOrders')}
          value={kpi ? Number(kpi.totalOrders).toLocaleString() : '—'}
        />
        <KpiCard
          label={t('adminOrders.pendingOrders')}
          value={kpi ? Number(kpi.pendingCount).toLocaleString() : '—'}
        />
        <KpiCard
          label={t('adminOrders.cancelledOrders')}
          value={kpi ? Number(kpi.cancelledCount).toLocaleString() : '—'}
        />
      </div>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-[2] min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminOrders.search')}</label>
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="input pl-9 w-full"
              placeholder={t('adminOrders.searchPlaceholder')}
              value={draft.search}
              onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex-1 min-w-[130px]">
          <label className="block text-xs text-gray-500 mb-1">{t('orders.status')}</label>
          <select
            className="input w-full"
            value={draft.status}
            onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">{t('adminOrders.all')}</option>
            <option value="success">{t('adminOrders.success')}</option>
            <option value="pending">{t('adminOrders.pending')}</option>
            <option value="cancelled">{t('adminOrders.cancelled')}</option>
          </select>
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminOrders.fromDate')}</label>
          <input
            type="date"
            className="input w-full"
            value={draft.dateFrom}
            onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminOrders.toDate')}</label>
          <input
            type="date"
            className="input w-full"
            value={draft.dateTo}
            onChange={(e) => setDraft((p) => ({ ...p, dateTo: e.target.value }))}
          />
        </div>

        <div className="flex gap-2 shrink-0">
          <button type="submit" className="btn btn-primary" disabled={isLoading}>{t('common.filter')}</button>
          <button type="button" className="btn btn-secondary" onClick={handleReset}>{t('adminOrders.clearFilters')}</button>
        </div>
      </form>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[t('adminOrders.orderCode'), t('adminOrders.servicePackage'), t('adminOrders.customer'), t('adminOrders.amount'), t('adminOrders.createdAt'), t('adminOrders.status'), t('adminOrders.actions')].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    {t('adminOrders.noOrders')}
                  </td>
                </tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{o.orderCode}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-800">{o.planName || '—'}</span>
                      {o.isCustom && (
                        <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">
                          {t('adminOrders.custom')}
                        </span>
                      )}
                    </div>
                    {o.planCode && <p className="text-xs text-gray-400">#{o.planCode}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800">{o.userFullName || o.userEmail}</p>
                    {o.userFullName && <p className="text-xs text-gray-400">{o.userEmail}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                    {fmtVnd(o.amount)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {fmtDate(o.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3">
                    {o.status === 'pending' && (
                      cancellingCode === o.orderCode ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCancel(o.orderCode)}
                            className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                          >
                            {t('adminOrders.confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancellingCode(null)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            {t('adminOrders.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCancellingCode(o.orderCode)}
                          title={t('adminOrders.cancelOrderAndDisableQR')}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <HiOutlineBan className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>
              {t('adminOrders.displaying', { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total })}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                ← {t('adminOrders.previous')}
              </button>
              {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                const pg = page <= 3 ? i + 1 : page - 2 + i;
                if (pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    type="button"
                    onClick={() => setPage(pg)}
                    className={`btn px-3 py-1.5 text-xs ${pg === page ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                {t('adminOrders.next')} →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminOrdersPage;
