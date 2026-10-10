import { useState, useEffect, useCallback } from 'react';
import { HiOutlineRefresh, HiOutlineSearch, HiOutlineClipboardList } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import adminAuditLogsApiService from '../../features/admin/services/adminAuditLogsApi.service';
import { useI18n } from '../../i18n';
import { formatAuditDetails } from '../../utils/auditLogDetails';
import { auditLabel } from '../settings/auditLogLabels';

const SYSTEM_AUDIT_ACTION_KEYS = [
  'PLAN_CREATED',
  'PLAN_UPDATED',
  'PLAN_DELETED',
  'VOUCHER_CREATED',
  'VOUCHER_UPDATED',
  'VOUCHER_DELETED',
  'USER_REGISTERED',
  'USER_PLAN_CHANGED',
  'USER_ROLE_CHANGED',
  'WIZARD_DEAD_END',
  'WIZARD_STATE_NOOP',
  'AI_TURN_FAILED',
];

const SYSTEM_AUDIT_ENTITY_KEYS = [
  'plan',
  'voucher',
  'user',
  'ai_session',
];

function fmtDate(d, locale) {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function ActionBadge({ action, t }) {
  const isDelete = action?.includes('DELETED');
  const isCreate = action?.includes('CREATED') || action?.includes('REGISTERED');
  const color = isDelete
    ? 'bg-red-100 text-red-700 dark:bg-rose-950/50 dark:text-rose-300'
    : isCreate
    ? 'bg-green-100 text-green-700 dark:bg-emerald-950/50 dark:text-emerald-300'
    : 'bg-blue-100 text-blue-700 dark:bg-sky-950/50 dark:text-sky-300';
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {auditLabel(t, 'actions', action)}
    </span>
  );
}

export default function AdminAuditLogsPage() {
  const { t, locale } = useI18n();
  const [rawLog, setRawLog] = useState(null);
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
      const res = await adminAuditLogsApiService.getAuditLogs(params);
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
    <PageContainer
      title={t('adminAuditLogs.title')}
      subtitle={t('adminAuditLogs.subtitle')}
      icon={HiOutlineClipboardList}
      actions={
        <button type="button" onClick={() => fetchLogs(page)} disabled={loading} className="btn btn-secondary">
          <HiOutlineRefresh className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'Làm mới')}
        </button>
      }
    >

      {/* Filters */}
      <form onSubmit={handleFilter} className="card p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-dk-text mb-1">{t('adminAuditLogs.filterAction')}</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className="w-full border border-gray-300 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('common.all', 'Tất cả')}</option>
              {SYSTEM_AUDIT_ACTION_KEYS.map((key) => (
                <option key={key} value={key}>{auditLabel(t, 'actions', key)}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-600 dark:text-dk-text mb-1">{t('adminAuditLogs.filterEntityType')}</label>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
              className="w-full border border-gray-300 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('common.all', 'Tất cả')}</option>
              {SYSTEM_AUDIT_ENTITY_KEYS.map((key) => (
                <option key={key} value={key}>{auditLabel(t, 'entities', key)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-dk-text mb-1">{t('adminAuditLogs.filterStartDate')}</label>
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="border border-gray-300 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-dk-text mb-1">{t('adminAuditLogs.filterEndDate')}</label>
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="border border-gray-300 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <button type="submit" className="btn btn-primary">
            <HiOutlineSearch className="mr-2 h-4 w-4" /> {t('common.filter', 'Lọc')}
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-dk-border">
                <th className="w-px whitespace-nowrap pr-4 pb-3 text-left text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('adminAuditLogs.colTime')}</th>
                <th className="w-px whitespace-nowrap pr-4 pb-3 text-left text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('adminAuditLogs.colActor')}</th>
                <th className="w-px whitespace-nowrap pr-4 pb-3 text-left text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('adminAuditLogs.colAction')}</th>
                <th className="w-px whitespace-nowrap pr-4 pb-3 text-left text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('adminAuditLogs.colEntity')}</th>
                <th className="min-w-[260px] pr-4 pb-3 text-left text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('adminAuditLogs.colDetails')}</th>
                <th className="w-px whitespace-nowrap pb-3 text-left text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide">{t('adminAuditLogs.colIp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-dk-border">
              {loading && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 dark:text-dk-muted">{t('common.loading')}</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 dark:text-dk-muted">{t('adminAuditLogs.noLogs')}</td></tr>
              )}
              {!loading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/60 dark:hover:bg-dk-raised/40 transition-colors">
                  <td className="py-3 pr-4 w-px text-gray-500 dark:text-dk-text2 whitespace-nowrap">{fmtDate(log.created_at, locale)}</td>
                  <td className="py-3 pr-4 w-px">
                    <div
                      className="max-w-[200px] truncate font-medium text-gray-900 dark:text-dk-text"
                      title={log.actor_name || log.actor_username || t('auditLogs.systemActor')}
                    >
                      {log.actor_name || log.actor_username || t('auditLogs.systemActor')}
                    </div>
                    {log.actor_email && (
                      <div className="max-w-[200px] truncate text-xs text-gray-400 dark:text-dk-text2" title={log.actor_email}>{log.actor_email}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 w-px whitespace-nowrap"><ActionBadge action={log.action} t={t} /></td>
                  <td className="py-3 pr-4 w-px whitespace-nowrap text-gray-600 dark:text-dk-text">
                    {auditLabel(t, 'entities', log.entity_type)}
                    {log.entity_id ? <span className="text-gray-400 dark:text-dk-text2 ml-1">#{log.entity_id}</span> : null}
                  </td>
                  <td className="py-3 pr-4 min-w-[260px] text-gray-600 dark:text-dk-text text-xs break-words">
                    <div>{formatAuditDetails(log.action, log.details, t, locale)}</div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setRawLog(log)}
                        title={JSON.stringify(log.details)}
                        className="mt-1 text-primary-600 hover:underline"
                      >
                        {t('auditLogs.viewRaw')}
                      </button>
                    )}
                  </td>
                  {/* IPv6 dài tới 39 ký tự đẩy bảng tràn ngang (đo 1470px, menu mở: bảng 1251px trong khung 1170px) → cắt + title. */}
                  <td className="py-3 w-px whitespace-nowrap text-gray-400 dark:text-dk-text2 text-xs font-mono">
                    <span className="block max-w-[120px] truncate" title={log.ip_address || undefined}>{log.ip_address || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-100 dark:border-dk-border">
            <span className="text-sm text-gray-500 dark:text-dk-text2">
              {t('adminAuditLogs.totalRecords', { total: pagination.total?.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') })}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-secondary py-1 px-3 text-sm disabled:opacity-40">
                ← {t('common.previous', 'Trước')}
              </button>
              <span className="px-3 py-1 text-sm text-gray-600 dark:text-dk-text">{page} / {pagination.pages}</span>
              <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages} className="btn btn-secondary py-1 px-3 text-sm disabled:opacity-40">
                {t('common.next', 'Sau')} →
              </button>
            </div>
          </div>
        )}
      </div>
      {rawLog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRawLog(null)} aria-hidden="true" />
          <div role="dialog" aria-label={t('auditLogs.rawTitle')} className="relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:border dark:border-dk-border dark:bg-dk-surface">
            <h3 className="text-base font-semibold text-gray-900 dark:text-dk-text">{t('auditLogs.rawTitle')}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-dk-text2">{rawLog.action}</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800 dark:border dark:border-dk-border dark:bg-dk-inset dark:text-dk-text">{JSON.stringify(rawLog.details, null, 2)}</pre>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn btn-secondary" onClick={() => setRawLog(null)}>{t('auditLogs.rawClose')}</button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
