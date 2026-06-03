import { useState, useEffect, useCallback } from 'react';
import { HiOutlineRefresh, HiOutlineSearch } from 'react-icons/hi';
import api from '../../services/api';

const ACTION_LABELS = {
  EMPLOYEE_ADDED: 'Thêm nhân viên',
  EMPLOYEE_REMOVED: 'Xóa nhân viên',
  EMPLOYEE_LIMITS_UPDATED: 'Cập nhật giới hạn gửi',
  EMPLOYEE_PERMISSIONS_UPDATED: 'Cập nhật quyền hạn',
  EMPLOYEE_STATUS_UPDATED: 'Thay đổi trạng thái nhân viên',
  EMPLOYEE_PASSWORD_RESET: 'Reset mật khẩu nhân viên',
  CAMPAIGN_CREATED: 'Tạo chiến dịch',
  CAMPAIGN_UPDATED: 'Cập nhật chiến dịch',
  CAMPAIGN_DELETED: 'Xóa chiến dịch',
  CAMPAIGN_RUN_STARTED: 'Bắt đầu chạy chiến dịch',
  CAMPAIGN_PAUSED: 'Tạm dừng chiến dịch',
  EMAIL_TEMPLATE_CREATED: 'Tạo mẫu email',
  EMAIL_TEMPLATE_UPDATED: 'Cập nhật mẫu email',
  EMAIL_TEMPLATE_DELETED: 'Xóa mẫu email',
  ZALO_TEMPLATE_CREATED: 'Tạo mẫu Zalo',
  ZALO_TEMPLATE_UPDATED: 'Cập nhật mẫu Zalo',
  ZALO_TEMPLATE_DELETED: 'Xóa mẫu Zalo',
};

const ENTITY_LABELS = {
  employee: 'Nhân viên',
  campaign: 'Chiến dịch',
  email_template: 'Mẫu email',
  zalo_template: 'Mẫu Zalo',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

function ActionBadge({ action }) {
  const isDelete = action?.includes('DELETED') || action?.includes('REMOVED');
  const isCreate = action?.includes('CREATED') || action?.includes('ADDED');
  const color = isDelete
    ? 'bg-red-100 text-red-700'
    : isCreate
    ? 'bg-green-100 text-green-700'
    : 'bg-blue-100 text-blue-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {ACTION_LABELS[action] || action}
    </span>
  );
}

export default function AuditLogsPage() {
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
      const res = await api.get('/audit-logs', { params });
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhật ký hoạt động</h1>
          <p className="mt-1 text-sm text-gray-500">Theo dõi mọi thay đổi trong tổ chức của bạn</p>
        </div>
        <button type="button" onClick={() => fetchLogs(page)} disabled={loading} className="btn btn-secondary">
          <HiOutlineRefresh className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">Đang tải...</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400">Chưa có nhật ký nào</td></tr>
              )}
              {!loading && logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="py-3 pr-4 text-gray-500 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-900">{log.actor_name || log.actor_username || '—'}</div>
                    {log.actor_username && log.actor_name && (
                      <div className="text-xs text-gray-400">@{log.actor_username}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4"><ActionBadge action={log.action} /></td>
                  <td className="py-3 pr-4 text-gray-600">
                    {ENTITY_LABELS[log.entity_type] || log.entity_type || '—'}
                    {log.entity_id ? <span className="text-gray-400 ml-1">#{log.entity_id}</span> : null}
                  </td>
                  <td className="py-3 text-gray-500 text-xs max-w-xs truncate">
                    {log.details && Object.keys(log.details).length > 0
                      ? Object.entries(log.details).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')
                      : '—'}
                  </td>
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
    </div>
  );
}
