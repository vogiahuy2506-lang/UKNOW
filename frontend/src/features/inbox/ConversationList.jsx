import { useState, useMemo } from 'react';
import { useI18n } from '../../i18n';
import ConfirmModal from './ConfirmModal';

const CHANNEL_LABELS = (t) => ({
  web: { label: t('inbox.webChat'), icon: '💬', bg: 'bg-blue-500', text: 'text-blue-500' },
  zalo_oa: { label: t('inbox.zaloOA'), icon: '📱', bg: 'bg-red-500', text: 'text-red-500' },
  facebook: { label: t('inbox.facebook'), icon: '📘', bg: 'bg-blue-600', text: 'text-blue-600' },
  zalo_personal: { label: t('inbox.zaloPersonal'), icon: '👤', bg: 'bg-orange-500', text: 'text-orange-500' },
  zalo_group: { label: t('inbox.zaloGroup') || 'Zalo Nhóm', icon: '👥', bg: 'bg-violet-500', text: 'text-violet-500' },
});

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

const getDisplayName = (conv) => {
  const visitorInfo = parseVisitorInfo(conv.visitor_info);
  
  if (visitorInfo.is_group) {
    if (visitorInfo.group_name && visitorInfo.group_name !== 'Nhóm') {
      return visitorInfo.group_name;
    }
    const groupId = visitorInfo.group_id || '';
    const shortId = groupId.replace('group_', '').slice(-6);
    return `Nhóm ${shortId}`;
  }
  
  if (visitorInfo.sender_name) {
    return visitorInfo.sender_name;
  }
  
  return conv.visitorName || 'Khách hàng';
};

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

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins}p`;
  if (diffHours < 24) return `${diffHours}giờ`;
  if (diffDays < 7) return `${diffDays}ngày`;
  return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
};

const truncateMessage = (message, maxLength = 45) => {
  if (!message) return '';
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength) + '...';
};

const ConversationItem = ({ 
  conv, 
  isSelected, 
  onSelect, 
  onDelete,
  t 
}) => {
  const channel = CHANNEL_LABELS(t)[conv.channel] || CHANNEL_LABELS(t).web;
  const displayName = getDisplayName(conv);
  const isGroup = isGroupConversation(conv);
  
  const hasUnread = conv.unreadCount > 0;
  const isActive = conv.status === 'active';

  return (
    <button
      onClick={() => onSelect(conv)}
      className={`w-full p-4 text-left transition-all duration-200 group relative ${
        isSelected
          ? 'bg-primary-50 border-l-4 border-l-primary-500'
          : 'hover:bg-gray-50 border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shadow-sm ${
            isGroup 
              ? 'bg-gradient-to-br from-violet-100 to-violet-200 text-violet-600' 
              : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600'
          }`}>
            {displayName ? displayName[0]?.toUpperCase() : '?'}
          </div>
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full border-2 border-white flex items-center justify-center shadow-md">
              <span className="text-[10px] text-white font-bold">{conv.unreadCount > 9 ? '9+' : conv.unreadCount}</span>
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              {isGroup && (
                <span className="text-violet-500 text-sm">👥</span>
              )}
              <span className={`font-bold text-sm truncate ${
                isSelected ? 'text-primary-700' : 'text-gray-900'
              }`}>
                {displayName || 'Khách hàng'}
              </span>
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0 ml-2 font-medium">
              {formatTime(conv.lastMessageAt, t)}
            </span>
          </div>

          {/* Channel badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${channel.bg} text-white font-semibold`}>
              {channel.icon} {channel.label}
            </span>
            {isActive && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                ● Hoạt động
              </span>
            )}
          </div>

          {/* Message preview */}
          {conv.lastMessage && (
            <p className={`text-sm truncate ${
              hasUnread ? 'text-gray-800 font-semibold' : 'text-gray-500'
            }`}>
              {truncateMessage(conv.lastMessage)}
            </p>
          )}
        </div>
      </div>

      {/* Delete button */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(conv);
          }}
          className="absolute right-3 top-3 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
          title="Xóa cuộc trò chuyện"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </button>
  );
};

const EmptyState = ({ message }) => (
  <div className="flex-1 flex items-center justify-center text-gray-500">
    <div className="text-center p-8">
      <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gray-100 flex items-center justify-center">
        <span className="text-4xl">💬</span>
      </div>
      <p className="text-base font-semibold text-gray-600">{message}</p>
      <p className="text-sm text-gray-400 mt-2">Chọn một cuộc trò chuyện để bắt đầu</p>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-start gap-3 animate-pulse">
        <div className="w-12 h-12 rounded-2xl bg-gray-200"></div>
        <div className="flex-1">
          <div className="flex justify-between mb-2">
            <div className="h-4 bg-gray-200 rounded w-36"></div>
            <div className="h-3 bg-gray-200 rounded w-14"></div>
          </div>
          <div className="h-3 bg-gray-200 rounded w-full mb-1.5"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    ))}
  </div>
);

const ConversationList = ({ 
  conversations, 
  isLoading, 
  selectedId, 
  onSelect, 
  onLoadMore, 
  hasMore, 
  onDelete,
  sortBy = 'latest',
  filterStatus = 'all',
  filterDate = 'all',
  channelFilter = '',
}) => {
  const { t } = useI18n();
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filteredConversations = useMemo(() => {
    let result = [...conversations];

    if (channelFilter) {
      result = result.filter(conv => conv.channel === channelFilter);
    }

    if (filterStatus === 'active') {
      result = result.filter(conv => conv.status === 'active');
    } else if (filterStatus === 'closed') {
      result = result.filter(conv => conv.status !== 'active');
    }

    if (filterDate !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      result = result.filter(conv => {
        const msgDate = new Date(conv.lastMessageAt);
        if (filterDate === 'today') {
          return msgDate >= today;
        } else if (filterDate === 'week') {
          const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          return msgDate >= weekAgo;
        } else if (filterDate === 'month') {
          const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
          return msgDate >= monthAgo;
        }
        return true;
      });
    }

    switch (sortBy) {
      case 'latest':
        result.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
        break;
      case 'unread':
        result.sort((a, b) => (b.unreadCount || 0) - (a.unreadCount || 0));
        break;
      case 'name_asc':
        result.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), 'vi'));
        break;
      case 'name_desc':
        result.sort((a, b) => getDisplayName(b).localeCompare(getDisplayName(a), 'vi'));
        break;
    }

    const unread = result.filter(c => c.unreadCount > 0);
    const read = result.filter(c => !c.unreadCount || c.unreadCount === 0);
    
    return [...unread, ...read];
  }, [conversations, sortBy, filterStatus, filterDate, channelFilter]);

  const handleDeleteClick = (e, conv) => {
    e.stopPropagation();
    setDeleteTarget(conv);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDelete?.(deleteTarget);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-white flex items-center justify-center text-sm shadow-sm">
              💬
            </span>
            <span>Danh sách</span>
          </h2>
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
            {filteredConversations.length}
          </span>
        </div>
      </div>

      {isLoading && conversations.length === 0 && <LoadingSkeleton />}

      {!isLoading && filteredConversations.length === 0 && (
        <EmptyState message={t('inbox.noMessages')} />
      )}

      {filteredConversations.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
            <ConversationItem
              key={`${conv.type}-${conv.id}`}
              conv={conv}
              isSelected={selectedId === `${conv.type}-${conv.id}`}
              onSelect={onSelect}
              onDelete={handleDeleteClick}
              t={t}
            />
          ))}

          {hasMore && (
            <button
              onClick={onLoadMore}
              disabled={isLoading}
              className="w-full p-4 text-sm text-primary-600 hover:bg-primary-50 transition-colors font-semibold border-t border-gray-100"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full"></span>
                  Đang tải...
                </span>
              ) : (
                'Tải thêm cuộc trò chuyện'
              )}
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('inbox.confirmDeleteTitle') || 'Xóa cuộc trò chuyện'}
        message={t('inbox.confirmDelete') || 'Bạn có chắc muốn xóa cuộc trò chuyện này?'}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmText={t('common.delete') || 'Xóa'}
        cancelText={t('common.cancel') || 'Hủy'}
        danger
      />
    </div>
  );
};

export default ConversationList;
