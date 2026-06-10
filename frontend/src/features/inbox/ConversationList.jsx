import { useState } from 'react';
import { useI18n } from '../../i18n';
import ConfirmModal from './ConfirmModal';

const CHANNEL_LABELS = (t) => ({
  web: { label: t('inbox.webChat'), icon: '💬', color: 'bg-blue-500' },
  zalo_oa: { label: t('inbox.zaloOA'), icon: '📱', color: 'bg-red-500' },
  facebook: { label: t('inbox.facebook'), icon: '📘', color: 'bg-blue-600' },
  zalo_personal: { label: t('inbox.zaloPersonal'), icon: '👤', color: 'bg-orange-500' },
  zalo_group: { label: t('inbox.zaloGroup') || 'Zalo Nhóm', icon: '👥', color: 'bg-purple-500' },
});

/**
 * Parse visitor_info from various formats (string, object, null)
 */
const parseVisitorInfo = (visitorInfo) => {
  if (!visitorInfo) return {};
  if (typeof visitorInfo === 'string') {
    try {
      return JSON.parse(visitorInfo);
    } catch {
      return {};
    }
  }
  return visitorInfo || {};
};

/**
 * Get display name considering group vs personal context
 */
const getDisplayName = (conv) => {
  const visitorInfo = parseVisitorInfo(conv.visitor_info);
  
  // Priority: sender_name > group_name > visitorName
  if (visitorInfo.is_group && visitorInfo.sender_name) {
    // For group messages: show "SenderName (GroupName)"
    const groupName = visitorInfo.group_name || 'Nhóm';
    return `${visitorInfo.sender_name} (${groupName})`;
  }
  
  if (visitorInfo.sender_name) {
    return visitorInfo.sender_name;
  }
  
  if (visitorInfo.group_name) {
    return visitorInfo.group_name;
  }
  
  return conv.visitorName || null;
};

/**
 * Get message source info with detailed context
 */
const getMessageSource = (conv) => {
  const visitorInfo = parseVisitorInfo(conv.visitor_info);
  
  // If it's a group message
  if (visitorInfo.is_group || visitorInfo.source === 'zalo_group') {
    return {
      type: 'group',
      icon: '👥',
      label: visitorInfo.group_name || 'Nhóm Zalo',
      isGroup: true,
      senderName: visitorInfo.sender_name,
      senderId: visitorInfo.sender_id,
      groupId: visitorInfo.group_id,
      groupName: visitorInfo.group_name,
    };
  }
  
  // For personal messages within zalo_personal channel
  if (conv.channel === 'zalo_personal') {
    return {
      type: 'personal',
      icon: '👤',
      label: visitorInfo.sender_name || conv.visitorName || 'Zalo cá nhân',
      isGroup: false,
      senderName: visitorInfo.sender_name,
      senderId: visitorInfo.sender_id,
    };
  }
  
  return null;
};

/**
 * Check if conversation is a group
 */
const isGroupConversation = (conv) => {
  const visitorInfo = parseVisitorInfo(conv.visitor_info);
  return visitorInfo.is_group === true || visitorInfo.source === 'zalo_group';
};

const formatTime = (dateString, t) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return `${diffMins} ${t('time.minutesAgo', { n: diffMins })}`;
  if (diffHours < 24) return `${diffHours} ${t('time.hoursAgo', { n: diffHours })}`;
  if (diffDays < 7) return `${diffDays} ${t('time.daysAgo', { n: diffDays })}`;
  return date.toLocaleDateString('vi-VN');
};

const truncateMessage = (message, maxLength = 50) => {
  if (!message) return '';
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength) + '...';
};

const ConversationList = ({ conversations, isLoading, selectedId, onSelect, onLoadMore, hasMore, onDelete }) => {
  const { t } = useI18n();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleDeleteClick = (e, conv) => {
    e.stopPropagation();
    setDeleteTarget(conv);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget);
      setDeleteTarget(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">{t('inbox.messages')}</h2>
      </div>

      {/* Loading skeleton */}
      {isLoading && conversations.length === 0 && (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 rounded-lg animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Conversation list */}
      {!isLoading && conversations.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center p-4">
            <div className="text-4xl mb-2">📭</div>
            <p>{t('inbox.noMessages')}</p>
          </div>
        </div>
      )}

      {conversations.length > 0 && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => {
            const channel = CHANNEL_LABELS(t)[conv.channel] || CHANNEL_LABELS(t).web;
            const isSelected = selectedId === `${conv.type}-${conv.id}`;
            const displayName = getDisplayName(conv);
            const messageSource = getMessageSource(conv);
            const isGroup = isGroupConversation(conv);

            return (
              <button
                key={`${conv.type}-${conv.id}`}
                onClick={() => onSelect(conv)}
                className={`w-full p-3 rounded-lg text-left transition-all duration-200 ${
                  isSelected
                    ? 'bg-primary-50 border border-primary-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full ${isGroup ? 'bg-purple-500' : channel.color} flex items-center justify-center text-white text-sm font-medium flex-shrink-0`}>
                    {displayName ? displayName[0]?.toUpperCase() : '?'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 truncate">
                        {displayName || t('inbox.anonymousCustomer')}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <span className="text-xs text-gray-500">
                          {formatTime(conv.lastMessageAt, t)}
                        </span>
                        {onDelete && (
                          <button
                            onClick={(e) => handleDeleteClick(e, conv)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title={t('common.delete') || 'Xóa'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Show channel badge */}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${channel.color} text-white`}>
                        {channel.icon} {channel.label}
                      </span>
                      
                      {/* Show GROUP badge with group name for group messages */}
                      {isGroup && messageSource?.groupName && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          👥 {messageSource.groupName}
                        </span>
                      )}
                      
                      {/* Show SENDER name for group messages */}
                      {isGroup && messageSource?.senderName && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                          ✉️ {messageSource.senderName}
                        </span>
                      )}
                      
                      {/* Show personal badge for non-group zalo_personal */}
                      {!isGroup && messageSource && conv.channel === 'zalo_personal' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {messageSource.icon} {messageSource.label}
                        </span>
                      )}
                      
                      {/* Unread badge */}
                      {conv.unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>

                    {/* Last message preview */}
                    {conv.lastMessage && (
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        {truncateMessage(conv.lastMessage)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Load more button */}
          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="w-full p-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            >
              {isLoading ? t('common.loading') : t('inbox.loadMore')}
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('inbox.confirmDeleteTitle') || 'Xóa cuộc trò chuyện'}
        message={t('inbox.confirmDelete') || 'Bạn có chắc muốn xóa cuộc trò chuyện này?'}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        confirmText={t('common.delete') || 'Xóa'}
        cancelText={t('common.cancel') || 'Hủy'}
        danger
      />
    </div>
  );
};

export default ConversationList;
