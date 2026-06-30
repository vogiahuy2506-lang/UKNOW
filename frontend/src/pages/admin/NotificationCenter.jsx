import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineBell, HiOutlineMail, HiOutlineClock, HiOutlineUserGroup, HiOutlineMailOpen, HiOutlinePencil, HiOutlineEye } from 'react-icons/hi';
import { FaBell, FaEye, FaCopy, FaRedo, FaClock, FaEnvelope } from 'react-icons/fa';
import adminNotificationApiService from '../../features/admin/services/adminNotificationApi.service';
import {
  NotificationTypeSelector,
  TargetingPanel,
  ScheduleSelector,
  NotificationEditor,
  NotificationHistoryTable,
  EmailPreviewModal,
  EmailLogsModal
} from '../../features/admin/components';

export default function NotificationCenter() {
  const [activeTab, setActiveTab] = useState('history');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  // Notification form state
  const [notificationType, setNotificationType] = useState('announcement');
  const [priority, setPriority] = useState('normal');
  const [targetingCriteria, setTargetingCriteria] = useState({});
  const [recipientCount, setRecipientCount] = useState(null);
  const [scheduleConfig, setScheduleConfig] = useState({ schedule_type: 'now' });
  const [editorData, setEditorData] = useState({
    title: '',
    title_en: '',
    message: '',
    message_en: ''
  });

  // Notifications list
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loadingList, setLoadingList] = useState(false);

  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState(null);

  // Modals
  const [previewModal, setPreviewModal] = useState({ isOpen: false, notification: null });
  const [logsModal, setLogsModal] = useState({ isOpen: false, notificationId: null, title: '' });
  const [selectedNotification, setSelectedNotification] = useState(null);

  const loadNotifications = useCallback(async (page = 1) => {
    setLoadingList(true);
    try {
      const response = await adminNotificationApiService.getNotifications({
        page,
        limit: pagination.limit || 20
      });
      if (response.data?.success) {
        setNotifications(response.data.data.data);
        setPagination(response.data.data.pagination);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Không thể tải danh sách thông báo');
    } finally {
      setLoadingList(false);
    }
  }, [pagination.limit]);

  // Load notifications on mount
  useEffect(() => {
    loadNotifications();
    loadDashboardStats();
  }, [loadNotifications]);

  const loadDashboardStats = async () => {
    try {
      const response = await adminNotificationApiService.getDashboardStats();
      if (response.data?.success) {
        setDashboardStats(response.data.data);
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    }
  };

  const handleCreateAndSend = async () => {
    if (!editorData.title?.trim()) {
      toast.error('Vui lòng nhập tiêu đề');
      return;
    }
    if (!editorData.message?.trim()) {
      toast.error('Vui lòng nhập nội dung');
      return;
    }
    
    // Kiểm tra đã chọn người nhận chưa
    const hasSelectedUsers = targetingCriteria.user_ids && targetingCriteria.user_ids.length > 0;
    const hasEmails = targetingCriteria.emails && targetingCriteria.emails.length > 0;
    
    if (!hasSelectedUsers && !hasEmails) {
      toast.error('Vui lòng chọn ít nhất một người nhận');
      return;
    }

    setSending(true);
    try {
      let response;

      if (scheduleConfig.schedule_type === 'now') {
        const sendData = {
          type: notificationType,
          priority,
          title: editorData.title,
          title_en: editorData.title_en,
          message: editorData.message,
          message_en: editorData.message_en
        };
        
        // Chỉ thêm các trường targeting nếu có dữ liệu
        if (targetingCriteria.user_ids && targetingCriteria.user_ids.length > 0) {
          sendData.target_user_ids = targetingCriteria.user_ids;
        }
        if (targetingCriteria.emails && targetingCriteria.emails.length > 0) {
          sendData.target_emails = targetingCriteria.emails;
        }
        
        response = await adminNotificationApiService.sendDirect(sendData);
      } else {
        response = await adminNotificationApiService.createNotification({
          type: notificationType,
          priority,
          title: editorData.title,
          title_en: editorData.title_en,
          message: editorData.message,
          message_en: editorData.message_en,
          target_roles: targetingCriteria.roles,
          target_plans: targetingCriteria.plans,
          target_statuses: targetingCriteria.statuses,
          target_emails: targetingCriteria.emails,
          registered_before: targetingCriteria.registered_before,
          registered_after: targetingCriteria.registered_after,
          schedule_type: scheduleConfig.schedule_type,
          scheduled_at: scheduleConfig.scheduled_at,
          recurrence_pattern: scheduleConfig.recurrence_pattern,
          recurrence_end_date: scheduleConfig.recurrence_end_date
        });

        if (response.data?.success) {
          const notificationId = response.data.data.id;

          if (scheduleConfig.schedule_type === 'scheduled') {
            response = await adminNotificationApiService.scheduleNotification(
              notificationId,
              scheduleConfig.scheduled_at
            );
            toast.success('Đã hẹn giờ thông báo thành công');
          } else {
            toast.success('Đã tạo thông báo thành công');
          }
        }
      }

      if (response.data?.success) {
        toast.success(response.data.message || 'Thao tác thành công');
        resetForm();
        loadNotifications();
        loadDashboardStats();
        setActiveTab('history');
      } else {
        toast.error(response.data?.message || 'Có lỗi xảy ra');
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setEditorData({ title: '', title_en: '', message: '', message_en: '' });
    setNotificationType('announcement');
    setPriority('normal');
    setTargetingCriteria({});
    setRecipientCount(null);
    setScheduleConfig({ schedule_type: 'now' });
  };

  const handleViewNotification = (notification) => {
    setSelectedNotification(notification);
  };

  const handlePreviewEmail = (notification) => {
    setPreviewModal({ isOpen: true, notification });
  };

  const handleViewLogs = (notification) => {
    setLogsModal({
      isOpen: true,
      notificationId: notification.id,
      title: notification.title
    });
  };

  const handleSendNotification = async (notification) => {
    if (!confirm(`Gửi thông báo "${notification.title}"?`)) return;

    setLoading(true);
    try {
      const response = await adminNotificationApiService.sendNotification(notification.id);
      if (response.data?.success) {
        toast.success(response.data.message);
        loadNotifications();
        loadDashboardStats();
      } else {
        toast.error(response.data?.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotification = async (notification) => {
    if (!confirm(`Xóa thông báo "${notification.title}"?`)) return;

    setLoading(true);
    try {
      const response = await adminNotificationApiService.deleteNotification(notification.id);
      if (response.data?.success) {
        toast.success('Đã xóa thông báo');
        loadNotifications();
      } else {
        toast.error(response.data?.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleNotification = async (notification) => {
    const scheduledAt = prompt('Nhập thời gian hẹn (định dạng: YYYY-MM-DD HH:mm)');
    if (!scheduledAt) return;

    const dateRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
    if (!dateRegex.test(scheduledAt)) {
      toast.error('Định dạng không đúng. Ví dụ: 2024-12-31 10:00');
      return;
    }

    setLoading(true);
    try {
      const response = await adminNotificationApiService.scheduleNotification(
        notification.id,
        new Date(scheduledAt).toISOString()
      );
      if (response.data?.success) {
        toast.success('Đã hẹn giờ thông báo');
        loadNotifications();
      } else {
        toast.error(response.data?.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNotification = (notification) => {
    setEditorData({
      title: notification.title || '',
      title_en: notification.title_en || '',
      message: notification.message || '',
      message_en: notification.message_en || ''
    });
    setNotificationType(notification.type || 'announcement');
    setPriority(notification.priority || 'normal');
    setTargetingCriteria({
      roles: notification.target_roles || null,
      plans: notification.target_plans || null,
      statuses: notification.target_statuses || null,
      emails: notification.target_emails || []
    });
    setScheduleConfig({
      schedule_type: 'now'
    });
    setActiveTab('create');
    toast.success('Đã sao chép nội dung thông báo');
  };

  const handleResend = async (notification) => {
    if (!confirm(`Gửi lại thông báo "${notification.title}"?\n\nLưu ý: Có thể gửi trùng email cho những người đã nhận.`)) return;

    setLoading(true);
    try {
      const response = await adminNotificationApiService.sendDirect({
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        title_en: notification.title_en,
        message: notification.message,
        message_en: notification.message_en,
        target_roles: notification.target_roles,
        target_plans: notification.target_plans,
        target_statuses: notification.target_statuses,
        target_emails: notification.target_emails,
        registered_before: notification.registered_before,
        registered_after: notification.registered_after
      });

      if (response.data?.success) {
        toast.success(response.data.message);
        loadNotifications();
        loadDashboardStats();
      } else {
        toast.error(response.data?.message);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewContent = () => {
    setPreviewModal({
      isOpen: true,
      notification: {
        type: notificationType,
        priority,
        title: editorData.title,
        title_en: editorData.title_en,
        message: editorData.message,
        message_en: editorData.message_en
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
        <div className="px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur">
              <HiOutlineBell className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Trung tâm Thông báo</h1>
              <p className="text-orange-100 text-sm">Quản lý và gửi thông báo đến người dùng</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {/* Dashboard Stats */}
        {dashboardStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <HiOutlineMail className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tổng đã gửi</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {parseInt(dashboardStats.total_sent || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                  <HiOutlineClock className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Đang hẹn</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {parseInt(dashboardStats.total_scheduled || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <HiOutlineMailOpen className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Thất bại</p>
                  <p className="text-2xl font-bold text-red-600">
                    {parseInt(dashboardStats.total_failed || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <HiOutlineEye className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tỉ lệ mở TB</p>
                  <p className="text-2xl font-bold text-green-600">
                    {dashboardStats.avg_open_rate ? `${Number(dashboardStats.avg_open_rate).toFixed(1)}%` : '0%'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="border-b border-gray-100 px-4">
            <nav className="flex gap-1">
              <button
                onClick={() => setActiveTab('history')}
                className={`
                  px-6 py-4 font-medium text-sm transition-all flex items-center gap-2 border-b-2 -mb-[1px]
                  ${activeTab === 'history'
                    ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <HiOutlineMailOpen className="w-4 h-4" />
                Lịch sử
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`
                  px-6 py-4 font-medium text-sm transition-all flex items-center gap-2 border-b-2 -mb-[1px]
                  ${activeTab === 'create'
                    ? 'border-orange-500 text-orange-600 bg-orange-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <HiOutlinePencil className="w-4 h-4" />
                Tạo mới
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="p-6">
            {activeTab === 'history' ? (
              <NotificationHistoryTable
                notifications={notifications}
                loading={loadingList}
                pagination={pagination}
                onPageChange={(page) => loadNotifications(page)}
                onView={handleViewNotification}
                onPreview={handlePreviewEmail}
                onLogs={handleViewLogs}
                onSend={handleSendNotification}
                onResend={handleResend}
                onCopy={handleCopyNotification}
                onSchedule={handleScheduleNotification}
                onDelete={handleDeleteNotification}
              />
            ) : (
              <div className="space-y-6">
                {/* Notification Type */}
                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <HiOutlineBell className="w-4 h-4 text-orange-500" />
                    Loại thông báo
                  </h3>
                  <NotificationTypeSelector
                    value={notificationType}
                    onChange={setNotificationType}
                    priority={priority}
                    onPriorityChange={setPriority}
                    onTemplateSelect={(template) => {
                      setEditorData({
                        title: template.title,
                        title_en: template.titleEn,
                        message: template.message,
                        message_en: template.messageEn
                      });
                    }}
                  />
                </div>

                {/* Targeting */}
                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <HiOutlineUserGroup className="w-4 h-4 text-orange-500" />
                    Nhắm đối tượng
                  </h3>
                  <TargetingPanel
                    criteria={targetingCriteria}
                    onChange={setTargetingCriteria}
                    recipientCount={recipientCount}
                    onCountChange={setRecipientCount}
                  />
                </div>

                {/* Schedule */}
                <div className="bg-gray-50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <HiOutlineClock className="w-4 h-4 text-orange-500" />
                    Thời gian gửi
                  </h3>
                  <ScheduleSelector
                    value={scheduleConfig}
                    onChange={setScheduleConfig}
                  />
                </div>

                {/* Editor */}
                <div className="bg-gray-50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <HiOutlineMail className="w-4 h-4 text-orange-500" />
                      Nội dung
                    </h3>
                    <button
                      onClick={handlePreviewContent}
                      className="px-4 py-2 text-sm text-orange-600 bg-white border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors flex items-center gap-2 shadow-sm"
                    >
                      <FaEye className="w-3.5 h-3.5" />
                      Xem trước
                    </button>
                  </div>
                  <NotificationEditor
                    data={editorData}
                    onChange={setEditorData}
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-5 py-2.5 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                  >
                    Đặt lại
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateAndSend}
                    disabled={sending}
                    className={`
                      px-6 py-2.5 text-white rounded-lg transition-all font-medium text-sm flex items-center gap-2 shadow-sm
                      ${sending
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'
                      }
                    `}
                  >
                    {sending ? (
                      <>
                        <span className="loading loading-spinner loading-sm" />
                        Đang xử lý...
                      </>
                    ) : scheduleConfig.schedule_type === 'now' ? (
                      <>
                        <FaBell className="w-4 h-4" />
                        Gửi ngay
                      </>
                    ) : scheduleConfig.schedule_type === 'scheduled' ? (
                      <>
                        <FaClock className="w-4 h-4" />
                        Hẹn giờ
                      </>
                    ) : (
                      <>
                        <FaBell className="w-4 h-4" />
                        Lên lịch
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
          onPreview={() => handlePreviewEmail(selectedNotification)}
          onLogs={() => handleViewLogs(selectedNotification)}
          onCopy={() => handleCopyNotification(selectedNotification)}
          onResend={() => handleResend(selectedNotification)}
          onDelete={() => {
            handleDeleteNotification(selectedNotification);
            setSelectedNotification(null);
          }}
        />
      )}

      {/* Email Preview Modal */}
      <EmailPreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal({ isOpen: false, notification: null })}
        notification={previewModal.notification}
      />

      {/* Email Logs Modal */}
      <EmailLogsModal
        isOpen={logsModal.isOpen}
        onClose={() => setLogsModal({ isOpen: false, notificationId: null, title: '' })}
        notificationId={logsModal.notificationId}
        notificationTitle={logsModal.title}
      />
    </div>
  );
}

// Notification Detail Modal
function NotificationDetailModal({ notification, onClose, onPreview, onLogs, onCopy, onResend, onDelete }) {
  if (!notification) return null;

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

  const TYPE_LABELS = {
    maintenance: 'Bảo trì',
    announcement: 'Thông báo',
    promotion: 'Khuyến mãi',
    warning: 'Cảnh báo',
    reminder: 'Nhắc nhở',
    security: 'Bảo mật'
  };

  const STATUS_LABELS = {
    draft: 'Nháp',
    scheduled: 'Đã hẹn',
    sending: 'Đang gửi',
    sent: 'Đã gửi',
    failed: 'Thất bại',
    cancelled: 'Đã hủy'
  };

  const typeColors = {
    maintenance: 'bg-amber-100 text-amber-700',
    announcement: 'bg-blue-100 text-blue-700',
    promotion: 'bg-green-100 text-green-700',
    warning: 'bg-red-100 text-red-700',
    reminder: 'bg-purple-100 text-purple-700',
    security: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <HiOutlineBell className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white">Chi tiết thông báo</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-auto max-h-[calc(90vh-120px)]">
          {/* Type & Status */}
          <div className="flex gap-3">
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${typeColors[notification.type] || 'bg-gray-100 text-gray-700'}`}>
              {TYPE_LABELS[notification.type] || notification.type}
            </span>
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              notification.status === 'sent' ? 'bg-green-100 text-green-700' :
              notification.status === 'failed' ? 'bg-red-100 text-red-700' :
              notification.status === 'scheduled' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {STATUS_LABELS[notification.status] || notification.status}
            </span>
          </div>

          {/* Title */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tiêu đề</label>
            <p className="text-gray-900 mt-1 font-medium">{notification.title}</p>
            {notification.title_en && (
              <p className="text-gray-500 text-sm mt-1">EN: {notification.title_en}</p>
            )}
          </div>

          {/* Message */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Nội dung</label>
            <p className="text-gray-900 mt-1 whitespace-pre-wrap leading-relaxed">{notification.message}</p>
            {notification.message_en && (
              <p className="text-gray-500 text-sm mt-2">EN: {notification.message_en}</p>
            )}
          </div>

          {/* Stats */}
          {notification.status === 'sent' && (
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{notification.recipient_count || 0}</p>
                <p className="text-xs text-gray-500">Người nhận</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-green-600">{notification.sent_count || 0}</p>
                <p className="text-xs text-gray-500">Đã gửi</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-purple-600">{notification.opened_count || 0}</p>
                <p className="text-xs text-gray-500">Đã mở</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-orange-600">{notification.open_rate || 0}%</p>
                <p className="text-xs text-gray-500">Tỉ lệ mở</p>
              </div>
            </div>
          )}

          {/* Targeting Info */}
          {(notification.target_roles || notification.target_plans || notification.target_statuses) && (
            <div className="bg-gray-50 rounded-xl p-4">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Đối tượng</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {notification.target_roles?.map(role => (
                  <span key={role} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                    {role}
                  </span>
                ))}
                {notification.target_plans?.map(plan => (
                  <span key={plan} className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium">
                    {plan}
                  </span>
                ))}
                {notification.target_statuses?.map(status => (
                  <span key={status} className="px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                    {status}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <span className="text-gray-500 text-xs">Tạo lúc:</span>
              <p className="font-medium text-gray-900">{formatDate(notification.created_at)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <span className="text-gray-500 text-xs">Gửi lúc:</span>
              <p className="font-medium text-gray-900">{formatDate(notification.sent_at)}</p>
            </div>
            {notification.scheduled_at && (
              <div className="bg-amber-50 rounded-xl p-3">
                <span className="text-amber-600 text-xs">Hẹn gửi:</span>
                <p className="font-medium text-amber-900">{formatDate(notification.scheduled_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onPreview}
            className="px-4 py-2 text-orange-600 bg-white border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <FaEye className="w-3.5 h-3.5" />
            Xem email
          </button>
          {notification.status === 'sent' && (
            <button
              onClick={onLogs}
              className="px-4 py-2 text-purple-600 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <FaEnvelope className="w-3.5 h-3.5" />
              Chi tiết gửi
            </button>
          )}
          {(notification.status === 'sent' || notification.status === 'failed') && (
            <button
              onClick={onResend}
              className="px-4 py-2 text-green-600 bg-white border border-green-200 rounded-lg hover:bg-green-50 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <FaRedo className="w-3.5 h-3.5" />
              Gửi lại
            </button>
          )}
          <button
            onClick={onCopy}
            className="px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <FaCopy className="w-3.5 h-3.5" />
            Sao chép
          </button>
          {(notification.status === 'draft' || notification.status === 'scheduled') && (
            <button
              onClick={onDelete}
              className="px-4 py-2 text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
            >
              Xoa
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
