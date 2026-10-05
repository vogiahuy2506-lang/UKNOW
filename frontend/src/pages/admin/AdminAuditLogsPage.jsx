import { useState, useEffect, useCallback } from 'react';
import { HiOutlineRefresh, HiOutlineSearch, HiOutlineClipboardList } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import adminAuditLogsApiService from '../../features/admin/services/adminAuditLogsApi.service';
import { useI18n } from '../../i18n';
import { formatAuditDetails } from '../../utils/auditLogDetails';
import { auditLabel } from '../settings/auditLogLabels';

const ACTION_LABELS = {
  PLAN_CREATED: 'Tạo gói dịch vụ',
  PLAN_UPDATED: 'Cập nhật gói dịch vụ',
  PLAN_DELETED: 'Xóa gói dịch vụ',
  VOUCHER_CREATED: 'Tạo voucher',
  VOUCHER_UPDATED: 'Cập nhật voucher',
  VOUCHER_DELETED: 'Xóa voucher',
  USER_REGISTERED: 'Người dùng đăng ký mới',
  USER_PLAN_CHANGED: 'Thay đổi gói người dùng',
  USER_ROLE_CHANGED: 'Thay đổi vai trò người dùng',
  WIZARD_DEAD_END: 'AI wizard kẹt vòng lặp',
  WIZARD_STATE_NOOP: 'AI wizard: nút không có tác dụng',
  AI_TURN_FAILED: 'Lượt trợ lý AI bị lỗi',
};

const ENTITY_LABELS = {
  plan: 'Gói dịch vụ',
  voucher: 'Voucher',
  user: 'Người dùng',
  ai_session: 'Phiên chat AI',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function ActionBadge({ action, t }) {
  const isDelete = action?.includes('DELETED');
  const isCreate = action?.includes('CREATED') || action?.includes('REGISTERED');
  const color = isDelete
    ? 'bg-red-100 text-red-700'
    : isCreate
    ? 'bg-green-100 text-green-700'
    : 'bg-blue-100 text-blue-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {ACTION_LABELS[action] || auditLabel(t, 'actions', action)}
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
      title="Nhật ký hệ thống"
      subtitle="Theo dõi các thay đổi cấp hệ thống: gói dịch vụ, voucher, đăng ký mới"
      icon={HiOutlineClipboardList}
      actions={
        <button type="button" onClick={() => fetchLogs(page)} disabled={loading} className="btn btn-secondary">
          <HiOutlineRefresh className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      }
    >

      {/* Filters */}
      <form onSubmit={handleFilter} className="card p-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Hành động</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Tất cả</option>
              {Object.entries(ACTION_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Loại đối tượng</label>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Tất cả</option>
              {Object.entries(ENTITY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Từ ngày</label>
            <input type="date" value={filters.startDate} onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Đến ngày</label>
            <input type="date" value={filters.endDate} onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
          </div>
          <button type="submit" className="btn btn-primary">
            <HiOutlineSearch className="mr-2 h-4 w-4" /> Lọc
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="card p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Thời gian</th>
                <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Người thực hiện</th>
                <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Hành động</th>
                <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Đối tượng</th>
                <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Chi tiết</th>
                <th className="pb-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">Đang tải...</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">Chưa có nhật ký nào</td></tr>
              )}
              {!loading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-900">
                      {log.actor_name || log.actor_username || t('auditLogs.systemActor')}
                    </div>
                    {log.actor_email && <div className="text-xs text-gray-400">{log.actor_email}</div>}
                  </td>
                  <td className="py-3 pr-4"><ActionBadge action={log.action} t={t} /></td>
                  <td className="py-3 pr-4 text-gray-600">
                    {ENTITY_LABELS[log.entity_type] || log.entity_type || '—'}
                    {log.entity_id ? <span className="text-gray-400 ml-1">#{log.entity_id}</span> : null}
                  </td>
                  <td className="py-3 pr-4 text-gray-600 text-xs max-w-md break-words">
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
                  <td className="py-3 text-gray-400 text-xs font-mono">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Tổng {pagination.total?.toLocaleString('vi-VN')} bản ghi
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-secondary py-1 px-3 text-sm disabled:opacity-40">
                ← Trước
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">{page} / {pagination.pages}</span>
              <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages} className="btn btn-secondary py-1 px-3 text-sm disabled:opacity-40">
                Sau →
              </button>
            </div>
          </div>
        )}
      </div>
      {rawLog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRawLog(null)} aria-hidden="true" />
          <div role="dialog" aria-label={t('auditLogs.rawTitle')} className="relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">{t('auditLogs.rawTitle')}</h3>
            <p className="mt-1 text-xs text-gray-500">{rawLog.action}</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800">{JSON.stringify(rawLog.details, null, 2)}</pre>
            <div className="mt-4 flex justify-end">
              <button type="button" className="btn btn-secondary" onClick={() => setRawLog(null)}>{t('auditLogs.rawClose')}</button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
