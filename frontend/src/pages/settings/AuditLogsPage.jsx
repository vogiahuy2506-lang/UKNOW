import { useState, useEffect, useCallback } from 'react';
import {
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineClipboard,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import auditLogsApiService from '../../features/settings/services/auditLogsApi.service';
import { useI18n } from '../../i18n';
import { WORKSPACE_AUDIT_ACTIONS, WORKSPACE_AUDIT_ENTITIES, auditLabel } from './auditLogLabels';
import { formatAuditDetails } from '../../utils/auditLogDetails';

function fmtDate(d, locale) {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function ActionBadge({ action, t }) {
  const isDelete = action?.includes('DELETED') || action?.includes('REMOVED');
  const isCreate = action?.includes('CREATED') || action?.includes('ADDED');
  const config = isDelete
    ? { cls: 'bg-red-50 text-red-700 border-red-200/80', dot: 'bg-red-500' }
    : isCreate
    ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/80', dot: 'bg-emerald-500' }
    : { cls: 'bg-blue-50 text-blue-700 border-blue-200/80', dot: 'bg-blue-500' };
  const label = auditLabel(t, 'actions', action);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-2xs ${config.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {label}
    </span>
  );
}

export default function AuditLogsPage() {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ action: '', entityType: '', startDate: '', endDate: '' });
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async (currentPage = 1) => {
    setLoading(true);
    try {
      const params = { page: currentPage, limit: 50, ...filters };
      Object.keys(params).forEach((k) => !params[k] && delete params[k]);
      const res = await auditLogsApiService.getAuditLogs(params);
      setLogs(res.data.data || []);
      setPagination(res.data.pagination || { total: 0, page: 1, pages: 1 });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs(page);
  }, [fetchLogs, page]);

  const handleFilter = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={HiOutlineClipboard}
        title={t('auditLogs.title') || 'Nhật ký hoạt động'}
        subtitle={t('auditLogs.subtitle') || 'Theo dõi mọi thay đổi trong tổ chức của bạn'}
        actions={
          <button
            type="button"
            onClick={() => fetchLogs(page)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs disabled:opacity-50"
          >
            <HiOutlineRefresh className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh') || 'Làm mới'}
          </button>
        }
      />

      {/* Filters */}
      <form onSubmit={handleFilter} className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('auditLogs.action') || 'Hành động'}</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 focus:bg-white px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
            >
              <option value="">{t('common.all') || 'Tất cả'}</option>
              {WORKSPACE_AUDIT_ACTIONS.map((val) => (
                <option key={val} value={val}>
                  {auditLabel(t, 'actions', val)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('auditLogs.entity') || 'Loại đối tượng'}</label>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 focus:bg-white px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
            >
              <option value="">{t('common.all') || 'Tất cả'}</option>
              {WORKSPACE_AUDIT_ENTITIES.map((val) => (
                <option key={val} value={val}>
                  {auditLabel(t, 'entities', val)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('auditLogs.startDate') || 'Từ ngày'}</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 focus:bg-white px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('auditLogs.endDate') || 'Đến ngày'}</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 focus:bg-white px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-700"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all duration-150"
          >
            <HiOutlineSearch className="h-4 w-4" />
            {t('common.filter') || 'Lọc'}
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('auditLogs.colTime') || 'Thời gian'}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('auditLogs.colUser') || 'Người thực hiện'}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('auditLogs.colAction') || 'Hành động'}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('auditLogs.colEntity') || 'Đối tượng'}</th>
                <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('auditLogs.colDetails') || 'Chi tiết'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <span className="inline-block w-4 h-4 mr-2 align-[-2px] border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
                    {t('common.loading') || 'Đang tải...'}
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400 text-sm">
                    {t('auditLogs.emptyTitle') || 'Chưa có nhật ký nào'}
                  </td>
                </tr>
              )}
              {!loading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-4 text-slate-500 whitespace-nowrap text-xs">{fmtDate(log.created_at, locale)}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">
                      {log.actor_name || log.actor_username || t('auditLogs.systemActor')}
                    </div>
                    {log.actor_username && log.actor_name && (
                      <div className="text-xs text-slate-400">@{log.actor_username}</div>
                    )}
                  </td>
                  <td className="px-6 py-4"><ActionBadge action={log.action} t={t} /></td>
                  <td className="px-6 py-4 text-slate-600 font-medium">
                    {auditLabel(t, 'entities', log.entity_type)}
                    {log.entity_id ? <span className="text-slate-400 ml-1 font-mono text-xs">#{log.entity_id}</span> : null}
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-xs max-w-md break-words">
                    {formatAuditDetails(log.action, log.details, t, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <span className="text-xs sm:text-sm text-slate-500 font-medium">
              {(t && t('auditLogs.totalRecords', { total: pagination.total?.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') })) || `Tổng ${pagination.total?.toLocaleString('vi-VN')} bản ghi`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors shadow-2xs"
              >
                <HiOutlineChevronLeft className="w-4 h-4" />
                {t('common.previous') || 'Trước'}
              </button>
              <span className="px-1.5 text-xs sm:text-sm font-semibold text-slate-700">{page} / {pagination.pages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors shadow-2xs"
              >
                {t('common.next') || 'Sau'}
                <HiOutlineChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
