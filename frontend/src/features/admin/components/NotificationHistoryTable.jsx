import { useState } from 'react';
import { FaTrash, FaEye, FaPaperPlane, FaClock, FaFilter, FaEnvelope, FaCopy, FaRedo, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { HiOutlineMail, HiOutlineBell, HiOutlineClock, HiOutlineCheck, HiOutlineX } from 'react-icons/hi';
import { TYPE_CONFIG } from './NotificationTypeSelector';

const STATUS_CONFIG = {
  draft: { color: '#6b7280', bg: 'bg-gray-100', label: 'Nháp', icon: HiOutlineClock },
  scheduled: { color: '#f97316', bg: 'bg-orange-100', label: 'Đã hẹn', icon: HiOutlineClock },
  sending: { color: '#2563eb', bg: 'bg-blue-100', label: 'Đang gửi', icon: HiOutlineMail },
  sent: { color: '#22c55e', bg: 'bg-green-100', label: 'Đã gửi', icon: HiOutlineCheck },
  failed: { color: '#dc2626', bg: 'bg-red-100', label: 'Thất bại', icon: HiOutlineX },
  cancelled: { color: '#991b1b', bg: 'bg-red-50', label: 'Đã hủy', icon: HiOutlineX }
};

export default function NotificationHistoryTable({
  notifications,
  loading,
  pagination,
  onPageChange,
  onView,
  onPreview,
  onLogs,
  onCopy,
  onResend,
  onSend,
  onSchedule,
  onDelete
}) {
  const [filterStatus, setFilterStatus] = useState('');

  const filteredNotifications = filterStatus
    ? notifications?.filter(n => n.status === filterStatus)
    : notifications;

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG.announcement;

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <FaFilter className="w-4 h-4" />
            <span>Lọc:</span>
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm bg-white hover:border-orange-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition-all"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-500">
          {filteredNotifications?.length || 0} thông báo
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-50 to-orange-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Loại
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Tiêu đề
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Người nhận
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Ngày tạo
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-5 bg-gray-100 rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredNotifications?.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                        <HiOutlineBell className="w-8 h-8 text-gray-300" />
                      </div>
                      <p className="text-gray-500 font-medium">Chưa có thông báo nào</p>
                      <p className="text-gray-400 text-sm">Tạo thông báo mới để bắt đầu</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredNotifications?.map((notification) => {
                  const typeConfig = getTypeConfig(notification.type);
                  const statusConfig = STATUS_CONFIG[notification.status] || STATUS_CONFIG.draft;
                  const StatusIcon = statusConfig.icon;

                  return (
                    <tr key={notification.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{
                            backgroundColor: typeConfig.bgColor,
                            color: typeConfig.color
                          }}
                        >
                          {typeConfig.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900 max-w-xs truncate">
                          {notification.title}
                        </p>
                        {notification.title_en && (
                          <p className="text-xs text-gray-400 max-w-xs truncate">
                            {notification.title_en}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${statusConfig.bg}`}
                          style={{ color: statusConfig.color }}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900">
                          {notification.recipient_count || 0}
                        </p>
                        <p className="text-xs text-gray-500">
                          Gửi: {notification.sent_count || 0}
                          {notification.open_rate > 0 && ` | Mở: ${notification.open_rate}%`}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-600">
                          {formatDate(notification.created_at)}
                        </p>
                        {notification.scheduled_at && (
                          <p className="text-xs text-orange-600 font-medium">
                            Hẹn: {formatDate(notification.scheduled_at)}
                          </p>
                        )}
                        {notification.sent_at && (
                          <p className="text-xs text-green-600 font-medium">
                            Đã gửi: {formatDate(notification.sent_at)}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          {/* View Details */}
                          <button
                            onClick={() => onView?.(notification)}
                            className="p-2 text-gray-500 hover:bg-orange-100 hover:text-orange-600 rounded-lg transition-all"
                            title="Xem chi tiết"
                          >
                            <FaEye size={14} />
                          </button>

                          {/* Preview Email */}
                          <button
                            onClick={() => onPreview?.(notification)}
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                            title="Xem email"
                          >
                            <FaEnvelope size={14} />
                          </button>

                          {/* Copy */}
                          <button
                            onClick={() => onCopy?.(notification)}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-all"
                            title="Sao chép"
                          >
                            <FaCopy size={14} />
                          </button>

                          {/* Status-specific actions */}
                          {notification.status === 'draft' && (
                            <>
                              <button
                                onClick={() => onSend?.(notification)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                                title="Gửi ngay"
                              >
                                <FaPaperPlane size={14} />
                              </button>
                              <button
                                onClick={() => onSchedule?.(notification)}
                                className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                                title="Hẹn giờ"
                              >
                                <FaClock size={14} />
                              </button>
                            </>
                          )}

                          {(notification.status === 'sent' || notification.status === 'failed') && (
                            <>
                              <button
                                onClick={() => onLogs?.(notification)}
                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                                title="Chi tiết gửi"
                              >
                                <FaEnvelope size={14} />
                              </button>
                              <button
                                onClick={() => onResend?.(notification)}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                                title="Gửi lại"
                              >
                                <FaRedo size={14} />
                              </button>
                            </>
                          )}

                          {notification.status === 'scheduled' && (
                            <button
                              onClick={() => onSend?.(notification)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-all"
                              title="Gửi ngay"
                            >
                              <FaPaperPlane size={14} />
                            </button>
                          )}

                          {/* Delete */}
                          {(notification.status === 'draft' || notification.status === 'scheduled') && (
                            <button
                              onClick={() => onDelete?.(notification)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Xóa"
                            >
                              <FaTrash size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <p className="text-sm text-gray-600">
              Trang <span className="font-semibold text-gray-900">{pagination.page}</span> / {pagination.totalPages}
              <span className="ml-2 text-gray-400">({pagination.total} thông báo)</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onPageChange?.(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                <FaChevronLeft className="w-3 h-3" />
                Trước
              </button>
              <button
                onClick={() => onPageChange?.(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-white hover:border-orange-300 hover:text-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                Sau
                <FaChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { STATUS_CONFIG };
