import { useState } from 'react';
import { useI18n } from '../../i18n';
import ConfirmModal from './ConfirmModal';
import { getConversationPreview } from './utils/conversationPreview';

const isPlaceholderGroupName = (name) => {
  const value = String(name || '').trim();
  if (!value || value === 'Nhóm') return true;
  if (value.startsWith('Nhóm group_')) return true;
  return /^Nhóm \d+$/.test(value);
};

const CHANNEL_LABELS = (t) => ({
  web: { label: t('inbox.webChat'), icon: '💬', bg: 'bg-blue-500', text: 'text-blue-500' },
  zalo_oa: { label: t('inbox.zaloOA'), icon: '📱', bg: 'bg-red-500', text: 'text-red-500' },
  facebook: { label: t('inbox.facebook'), icon: '📘', bg: 'bg-blue-600', text: 'text-blue-600' },
  zalo_personal: { label: t('inbox.zaloPersonal'), icon: '👤', bg: 'bg-orange-500', text: 'text-orange-500' },
  zalo_group: { label: t('inbox.zaloGroup') || 'Zalo Nhóm', icon: '👥', bg: 'bg-violet-500', text: 'text-violet-500' },
  whatsapp_baileys: { label: 'WhatsApp', icon: '🟢', bg: 'bg-green-500', text: 'text-green-500' },
  telegram: { label: 'Telegram', icon: '✈️', bg: 'bg-sky-500', text: 'text-sky-500' },
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

const getDisplayName = (conv, t) => {
  const defaultCustomer = t('inbox.customer');
  const defaultGroup = t('inbox.group');
  if (!conv) return defaultCustomer;
  const visitorInfo = parseVisitorInfo(conv.visitor_info || conv.visitorInfo);
  
  if (visitorInfo.is_group) {
    const groupName = visitorInfo.group_name || visitorInfo.groupName || conv.groupName || conv.group_name;
    if (groupName && !isPlaceholderGroupName(groupName)) {
      return groupName;
    }
    if (conv.visitorName && !isPlaceholderGroupName(conv.visitorName)) {
      return conv.visitorName;
    }
    const groupId = visitorInfo.group_id || visitorInfo.groupId || '';
    const shortId = groupId.replace('group_', '').slice(-6);
    return `${defaultGroup} ${shortId}`;
  }
  
  const senderName = visitorInfo.sender_name || visitorInfo.senderName;
  if (senderName) {
    return senderName;
  }
  
  return conv.visitorName || defaultCustomer;
};

const isGroupConversation = (conv) => {
  const visitorInfo = parseVisitorInfo(conv.visitor_info || conv.visitorInfo);
  return visitorInfo.is_group === true || visitorInfo.source === 'zalo_group';
};

const getLastMessageAt = (conv) =>
  conv.lastMessageAt || conv.last_message_at || conv.updatedAt || conv.createdAt || '';

const formatTime = (dateString, t, locale) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('inbox.justNow');
  // H-22: có dấu cách giữa số và đơn vị ("6 giờ", "45 phút", "3 ngày"); tiếng Anh giữ "6h".
  if (diffMins < 60) return t('inbox.timeMinutes', { n: diffMins });
  if (diffHours < 24) return t('inbox.timeHours', { n: diffHours });
  if (diffDays < 7) return t('inbox.timeDays', { n: diffDays });
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', { day: 'numeric', month: 'short' });
};

/**
 * Huy hiệu AI của một hội thoại (H-09). Chỉ hiện khi nó có nghĩa:
 *  - chatbot phải ĐANG BẬT cho tài khoản đó và hội thoại không phải nhóm (AI không bao giờ trả lời nhóm);
 *  - tắt tay (không có mốc tự bật lại) → "AI tắt";
 *  - bạn vừa trả lời và AI đang nghỉ (còn trong thời gian chờ, hoặc tự bật lại đang tắt) → "Bạn đang trả lời";
 *  - quá mốc tự bật lại rồi thì không hiện gì: cờ ở DB còn đó nhưng AI sẽ tự trả lời ở tin khách kế tiếp.
 * Bản cũ hiện "Tạm dừng" cho cả cờ đã quá hạn, cho nhóm, và cho tài khoản chưa từng bật chatbot (10/11 hội thoại của
 * admin đều dính).
 */
const getAiBadge = (conv, isGroup, now = Date.now()) => {
  if (!conv.aiPaused || conv.chatbotEnabled === false || isGroup) return null;
  if (!conv.aiPausedAt) return 'off';
  if (conv.aiResumeAt === null) return 'replying';
  if (typeof conv.aiResumeAt === 'string' && new Date(conv.aiResumeAt).getTime() > now) return 'replying';
  return null;
};

const truncateMessage = (preview, maxLength = 45) => {
  if (!preview) return '';
  if (preview.length <= maxLength) return preview;
  return preview.slice(0, maxLength) + '...';
};

const ConversationItem = ({ 
  conv, 
  isSelected, 
  onSelect, 
  onDelete,
  t,
  locale
}) => {
  const channel = CHANNEL_LABELS(t)[conv.channel] || CHANNEL_LABELS(t).web;
  const displayName = getDisplayName(conv, t);
  const isGroup = isGroupConversation(conv);
  const messageLabels = {
    sticker: t('inbox.previewSticker'),
    groupEvent: t('inbox.messageGroupEvent'),
    link: t('inbox.messageLink'),
    call: t('inbox.previewCall'),
    zaloEvent: t('inbox.messageZaloEvent'),
    image: t('inbox.previewImage'),
    file: t('inbox.previewFile'),
    video: t('inbox.previewVideo'),
    gif: t('inbox.previewGif'),
    location: t('inbox.previewLocation'),
    voice: t('inbox.previewVoice'),
  };
  const preview = getConversationPreview({
    content: conv.lastMessage,
    rawType: conv.lastMessageRawType,
    attachmentType: conv.lastMessageAttachmentType,
    messageType: conv.lastMessageType,
    sender: conv.lastMessageSender,
    isGroup,
    role: conv.lastMessageRole,
  }, messageLabels);
  const aiBadge = getAiBadge(conv, isGroup);

  const hasUnread = conv.unreadCount > 0;
  const lastMessageTime = formatTime(getLastMessageAt(conv), t, locale);
  const selectedConversation = isGroup
    ? {
        ...conv,
        visitorName: displayName,
        groupName: displayName,
        visitorInfo: {
          ...parseVisitorInfo(conv.visitor_info || conv.visitorInfo),
          group_name: displayName,
        },
      }
    : conv;
  const handleSelect = () => onSelect(selectedConversation);
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className={`w-full cursor-pointer px-3 py-2.5 text-left transition-colors group relative border-b border-gray-50 ${
        isSelected
          ? 'bg-primary-50 border-l-2 border-l-primary-500'
          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="relative flex-shrink-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
            isGroup
              ? 'bg-violet-100 text-violet-600'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {displayName ? displayName[0]?.toUpperCase() : '?'}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] border border-white ${channel.bg}`}
            title={channel.label}
          >
            {channel.icon}
          </span>
          {hasUnread && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-0.5 bg-red-500 rounded-full border border-white flex items-center justify-center">
              <span className="text-[9px] text-white font-bold leading-none">
                {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
              </span>
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1 min-w-0">
              {isGroup && <span className="text-violet-500 text-xs">👥</span>}
              <span className={`font-semibold text-sm truncate ${
                isSelected ? 'text-primary-700' : 'text-gray-900'
              }`}>
                {displayName || t('inbox.customer')}
              </span>
              {aiBadge === 'off' && (
                <span className="shrink-0 text-[9px] px-1 py-px rounded bg-amber-50 text-amber-700 border border-amber-200">
                  {t('inbox.badgeAiOff')}
                </span>
              )}
              {aiBadge === 'replying' && (
                <span className="shrink-0 text-[9px] px-1 py-px rounded bg-slate-50 text-slate-600 border border-slate-200">
                  {t('inbox.badgeYouReplying')}
                </span>
              )}
            </div>
            <div className="flex h-6 w-12 shrink-0 items-center justify-end">
              <span className={`text-[10px] text-gray-400 transition-opacity ${onDelete ? 'group-hover:opacity-0' : ''}`}>
                {lastMessageTime}
              </span>
              {onDelete && (
                <button
                  type="button"
                  aria-label={t('inbox.confirmDeleteTitle')}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(conv, e);
                  }}
                  className="absolute right-2 top-2 hidden p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all group-hover:flex focus:outline-none focus:ring-2 focus:ring-red-300"
                  title={t('inbox.confirmDeleteTitle')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {preview && (
            <p className={`text-xs truncate ${
              hasUnread ? 'text-gray-800 font-medium' : 'text-gray-500'
            }`}>
              {truncateMessage(preview, 52)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ title, hint }) => (
  <div className="flex-1 flex items-center justify-center text-gray-500">
    <div className="text-center p-8">
      <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gray-100 flex items-center justify-center">
        <span className="text-4xl">💬</span>
      </div>
      <p className="text-base font-semibold text-gray-600">{title}</p>
      <p className="text-sm text-gray-400 mt-2">{hint}</p>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <div key={i} className="flex items-start gap-2.5 animate-pulse">
        <div className="w-10 h-10 rounded-xl bg-gray-200" />
        <div className="flex-1">
          <div className="flex justify-between mb-1.5">
            <div className="h-3.5 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-200 rounded w-10" />
          </div>
          <div className="h-3 bg-gray-200 rounded w-full" />
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
  /** Đang có bộ lọc / từ khoá tìm kiếm: danh sách rỗng nghĩa là "không khớp" chứ không phải "chưa có gì". */
  hasActiveFilters = false,
}) => {
  const { t, locale } = useI18n();
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Thứ tự do server quyết định (mới nhất trước, trên TOÀN bộ danh sách) — không sắp lại phía FE: bản cũ chỉ sắp trong
  // 20–40 hội thoại đã tải nên "Chưa đọc"/"Tên A-Z" ở trang 2 không bao giờ được đưa lên (H-13).
  const filteredConversations = conversations;

  const handleDeleteClick = (conv) => {
    setDeleteTarget(conv);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDelete?.(deleteTarget);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {isLoading && conversations.length === 0 && <LoadingSkeleton />}

      {!isLoading && filteredConversations.length === 0 && (
        <EmptyState
          title={hasActiveFilters ? t('inbox.emptyFilteredTitle') : t('inbox.emptyListTitle')}
          hint={hasActiveFilters ? t('inbox.emptyFilteredHint') : t('inbox.emptyListHint')}
        />
      )}

      {filteredConversations.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {filteredConversations.map((conv) => (
            <ConversationItem
              key={`${conv.type}-${conv.id}`}
              conv={conv}
              isSelected={selectedId === `${conv.type}-${conv.id}`}
              onSelect={onSelect}
              onDelete={onDelete ? handleDeleteClick : undefined}
              t={t}
              locale={locale}
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
                  {t('common.loading')}
                </span>
              ) : (
                t('inbox.loadMoreConversations')
              )}
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('inbox.confirmDeleteTitle')}
        message={t('inbox.confirmDelete')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
      />
    </div>
  );
};

export default ConversationList;
