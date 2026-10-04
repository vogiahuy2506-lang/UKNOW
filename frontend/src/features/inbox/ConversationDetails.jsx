import { HiX, HiPhone, HiMail, HiLocationMarker, HiClock } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const parseVisitorInfo = (value) => {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
};

/**
 * Bảng "Chi tiết" của một hội thoại (nút ⓘ).
 *
 * H-17: API trả camelCase (`visitorName`, `visitorInfo`, `startedAt`, `lastMessageAt`) — bản cũ đọc snake_case nên luôn
 * hiện "Khách hàng ẩn danh", thời gian "-", không có SĐT/email và khối nhóm không bao giờ hiện. Ô Thẻ và tab Ghi chú
 * đã bỏ cho tới khi có backend lưu chúng (gõ rồi bấm lưu là chữ biến mất); dòng "Trạng thái" cũng bỏ vì mọi hội
 * thoại đều đang hoạt động.
 */
const ConversationDetails = ({ conversation, onClose }) => {
  const { t, locale } = useI18n();

  if (!conversation) return null;

  const visitorInfo = parseVisitorInfo(conversation.visitorInfo ?? conversation.visitor_info);
  const visitorName = conversation.visitorName ?? conversation.visitor_name;
  const startedAt = conversation.startedAt ?? conversation.started_at;
  const lastMessageAt = conversation.lastMessageAt ?? conversation.last_message_at;
  const isGroup = conversation.isGroup === true || visitorInfo.is_group === true;
  const groupName = conversation.groupName || visitorInfo.group_name || visitorInfo.groupName;

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getChannelInfo = () => {
    const channels = {
      web: { icon: '💬', label: t('inbox.webChat') },
      zalo_oa: { icon: '📱', label: t('inbox.zaloOA') },
      zalo_personal: { icon: '👤', label: t('inbox.zaloPersonal') },
      zalo_group: { icon: '👥', label: t('inbox.zaloGroup') },
      whatsapp_baileys: { icon: '🟢', label: 'WhatsApp' },
      telegram: { icon: '✈️', label: 'Telegram' },
    };
    return channels[conversation.channel] || { icon: '💬', label: conversation.channel };
  };

  const channel = getChannelInfo();

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{t('inbox.conversationDetails')}</h3>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
        >
          <HiX className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Visitor Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center text-white text-lg font-medium">
                {visitorName?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <h4 className="font-medium text-gray-900 truncate">
                  {visitorName || t('inbox.anonymousCustomer')}
                </h4>
                <p className="text-sm text-gray-500">
                  {channel.icon} {channel.label}
                </p>
              </div>
            </div>

            {/* Contact details */}
            <div className="space-y-2">
              {visitorInfo.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <HiPhone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{visitorInfo.phone}</span>
                </div>
              )}
              {visitorInfo.email && (
                <div className="flex items-center gap-2 text-sm">
                  <HiMail className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{visitorInfo.email}</span>
                </div>
              )}
              {visitorInfo.location && (
                <div className="flex items-center gap-2 text-sm">
                  <HiLocationMarker className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{visitorInfo.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
              <HiClock className="w-4 h-4" />
              {t('inbox.timeline')}
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('inbox.startedAt')}</span>
                <span className="text-gray-700">{formatDate(startedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('inbox.lastMessage')}</span>
                <span className="text-gray-700">{formatDate(lastMessageAt)}</span>
              </div>
              {conversation.unreadCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('inbox.unread')}</span>
                  <span className="text-red-600 font-medium">{conversation.unreadCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Group info */}
          {isGroup && (
            <div className="bg-purple-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-purple-700 mb-2">
                👥 {t('inbox.groupInfo')}
              </h4>
              <div className="space-y-2 text-sm">
                {groupName && (
                  <div className="flex justify-between gap-2">
                    <span className="text-purple-600">{t('inbox.groupName')}</span>
                    <span className="text-purple-800 font-medium text-right">{groupName}</span>
                  </div>
                )}
                {visitorInfo.sender_name && (
                  <div className="flex justify-between gap-2">
                    <span className="text-purple-600">{t('inbox.sender')}</span>
                    <span className="text-purple-800 font-medium text-right">{visitorInfo.sender_name}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationDetails;
