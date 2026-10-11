import { useState, useEffect, useCallback } from 'react';
import { FaTimes, FaEnvelope, FaCheck, FaEnvelopeOpen, FaTimesCircle, FaSync, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import adminNotificationApiService from '../services/adminNotificationApi.service';
import { useI18n } from '../../../i18n';

const STATUS_CONFIG = {
  pending: { color: '#6b7280', bgColor: '#f3f4f6', icon: FaEnvelope, label: 'Chờ' },
  sent: { color: '#2563eb', bgColor: '#eff6ff', icon: FaEnvelope, label: 'Đã gửi' },
  delivered: { color: '#22c55e', bgColor: '#f0fdf4', icon: FaCheck, label: 'Đã nhận' },
  opened: { color: '#7c3aed', bgColor: '#f5f3ff', icon: FaEnvelopeOpen, label: 'Đã mở' },
  bounced: { color: '#dc2626', bgColor: '#fef2f2', icon: FaTimesCircle, label: 'Bounce' },
  failed: { color: '#dc2626', bgColor: '#fef2f2', icon: FaTimes, label: 'Thất bại' }
};

export default function EmailLogsModal({ isOpen, onClose, notificationId, notificationTitle }) {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [stats, setStats] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit
      };
      if (filterStatus) {
        params.status = filterStatus;
      }

      const [logsResponse, statsResponse] = await Promise.all([
        adminNotificationApiService.getEmailLogs(notificationId, params),
        adminNotificationApiService.getNotificationStats(notificationId)
      ]);

      if (logsResponse.data?.success) {
        setLogs(logsResponse.data.data.data);
        setPagination(logsResponse.data.data.pagination);
      }

      if (statsResponse.data?.success) {
        setStats(statsResponse.data.data);
      }
    } catch (error) {
      console.error('Error loading email logs:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filterStatus, notificationId]);

  useEffect(() => {
    if (isOpen && notificationId) {
      loadLogs();
    }
  }, [isOpen, notificationId, loadLogs]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusLabel = (key) => t(`notificationCenter.logsModal.${key}`, STATUS_CONFIG[key]?.label || key);

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col dark:bg-dk-surface dark:border dark:border-dk-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dk-border">
          <div className="flex items-center gap-3">
            <FaEnvelope className="text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text">
                {t('notificationCenter.logsModal.title')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-dk-text2">{notificationTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dk-raised rounded-lg transition-colors"
          >
            <FaTimes className="text-gray-500 dark:text-dk-text2" />
          </button>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 dark:bg-dk-raised dark:border-dk-border">
            <div className="grid grid-cols-6 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-dk-text">{stats.email_stats?.total || 0}</p>
                <p className="text-xs text-gray-500 dark:text-dk-text2">{t('notificationCenter.logsModal.total')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-600 dark:text-dk-text">{stats.email_stats?.sent || 0}</p>
                <p className="text-xs text-gray-500 dark:text-dk-text2">{t('notificationCenter.logsModal.sent')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-emerald-400">{stats.email_stats?.delivered || 0}</p>
                <p className="text-xs text-gray-500 dark:text-dk-text2">{t('notificationCenter.logsModal.delivered')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-violet-400">{stats.email_stats?.opened || 0}</p>
                <p className="text-xs text-gray-500 dark:text-dk-text2">{t('notificationCenter.logsModal.opened')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-rose-400">{stats.email_stats?.bounced || 0}</p>
                <p className="text-xs text-gray-500 dark:text-dk-text2">{t('notificationCenter.logsModal.bounced')}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-rose-400">{stats.email_stats?.failed || 0}</p>
                <p className="text-xs text-gray-500 dark:text-dk-text2">{t('notificationCenter.logsModal.failed')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-dk-border flex items-center gap-4">
          <span className="text-sm text-gray-600 dark:text-dk-text">
            {t('notificationCenter.logsModal.filterStatus')}
          </span>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
          >
            <option value="">{t('notificationCenter.logsModal.all')}</option>
            {Object.entries(STATUS_CONFIG).map(([value]) => (
              <option key={value} value={value}>{getStatusLabel(value)}</option>
            ))}
          </select>
          <button
            onClick={loadLogs}
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-dk-raised rounded-lg transition-colors"
            title={t('notificationCenter.logsModal.refresh')}
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Logs Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 dark:bg-dk-raised dark:border-dk-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase">{t('notificationCenter.logsModal.colStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase">{t('notificationCenter.logsModal.colEmail')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase">{t('notificationCenter.logsModal.colUser')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase">{t('notificationCenter.logsModal.colSent')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase">{t('notificationCenter.logsModal.colDelivered')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase">{t('notificationCenter.logsModal.colOpened')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dk-text2 uppercase">{t('notificationCenter.logsModal.colError')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dk-border">
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 dark:bg-dk-raised rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500 dark:text-dk-text2">
                    {t('notificationCenter.logsModal.empty')}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const statusConfig = STATUS_CONFIG[log.status] || STATUS_CONFIG.pending;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-dk-raised/40">
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                          style={{
                            backgroundColor: statusConfig.bgColor,
                            color: statusConfig.color
                          }}
                        >
                          <StatusIcon size={12} />
                          {getStatusLabel(log.status)}
                        </span>
                        {log.retry_count > 0 && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-dk-muted">
                            (retry: {log.retry_count})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900 dark:text-dk-text">{log.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900 dark:text-dk-text">{log.full_name || log.username || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600 dark:text-dk-text">{formatDate(log.sent_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600 dark:text-dk-text">{formatDate(log.delivered_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600 dark:text-dk-text">{formatDate(log.opened_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {log.error_message ? (
                          <p className="text-sm text-red-600 dark:text-rose-400 max-w-xs truncate" title={log.error_message}>
                            {log.error_message}
                          </p>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-dk-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dk-border flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-dk-text2">
              {t('notificationCenter.logsModal.page')} {pagination.page} {t('notificationCenter.logsModal.of')} {pagination.totalPages}
              <span className="ml-2">({pagination.total} {t('notificationCenter.logsModal.emails')})</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 border border-gray-300 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaChevronLeft />
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 border border-gray-300 dark:border-dk-border dark:bg-dk-inset dark:text-dk-text rounded hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
