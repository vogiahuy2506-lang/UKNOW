import { useEffect, useMemo, useRef, useState } from 'react';
import { HiCheck, HiReply, HiX, HiSearch, HiExclamationCircle } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import MessageAttachments from '../../components/MessageAttachments';
import {
  getMessagePreviewText,
  getNormalizedMessageText,
  normalizeMessageContent,
} from './utils/normalizeMessageContent';
import RenderTextWithLinks from '../../utils/renderTextWithLinks';

const RETRYING_STALE_MS = 2 * 60 * 1000;

const formatMessageTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

function parseMessageMetadata(message) {
  const raw = typeof message.metadata === 'string'
    ? JSON.parse(message.metadata || '{}')
    : (message.metadata || {});
  return raw && typeof raw === 'object' ? raw : {};
}

function getSendState(metadata, now = Date.now()) {
  const send = metadata?.send;
  if (!send || typeof send !== 'object') return { kind: 'ok' };
  const status = send.status;
  if (status === 'failed') {
    return { kind: 'failed', error: send.error || '', canRetry: true };
  }
  if (status === 'retrying') {
    const lockedAt = send.lockedAt ? new Date(send.lockedAt).getTime() : NaN;
    const failedAt = send.failedAt ? new Date(send.failedAt).getTime() : NaN;
    const anchor = Number.isFinite(lockedAt) ? lockedAt : failedAt;
    const stale = !Number.isFinite(anchor) || (now - anchor) >= RETRYING_STALE_MS;
    return {
      kind: stale ? 'failed' : 'retrying',
      error: send.error || '',
      canRetry: stale,
    };
  }
  return { kind: 'ok' };
}

const formatMessageDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Hôm nay';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }
  return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });
};

const isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;
  return new Date(date1).toDateString() === new Date(date2).toDateString();
};

const MessageBubble = ({
  message,
  isOwn,
  showDate,
  isGroupConversation,
  isGroupChannel, 
  onReply,
  onRetry,
  retryingMessageId,
  replyingTo,
  messageLabels,
}) => {
  const { t } = useI18n();
  const isBot = message.role === 'bot';
  const isAgent = message.role === 'agent';
  const isVisitor = message.role === 'visitor';
  
  const metadata = parseMessageMetadata(message);
  const visitorInfo = typeof message.visitor_info === 'string' ? JSON.parse(message.visitor_info || '{}') : (message.visitor_info || {});
  const sendState = isAgent ? getSendState(metadata) : { kind: 'ok' };
  const sendFailed = sendState.kind === 'failed';
  const sendRetrying = sendState.kind === 'retrying';
  const isRetryBusy = retryingMessageId != null && Number(retryingMessageId) === Number(message.id);
  
  const senderName = metadata.sender_name || visitorInfo.sender_name || message.sender_name;
  
  let attachments = message.attachments;
  if (typeof attachments === 'string') {
    try {
      attachments = JSON.parse(attachments);
    } catch {
      attachments = [];
    }
  }
  if (!Array.isArray(attachments)) {
    attachments = attachments ? [attachments] : [];
  }
  
  let showSenderName = false;
  if (isVisitor) {
    if (isGroupChannel || isGroupConversation) {
      showSenderName = true;
    } else {
      showSenderName = !!senderName;
    }
  }

  const isReplyingToThis = replyingTo && replyingTo.id === message.id;
  const isAgentMessage = isOwn || isAgent || isBot;
  const normalizedContent = normalizeMessageContent(message.content, messageLabels);
  const normalizedText = getNormalizedMessageText(normalizedContent);

  const renderTextWithLinks = (text) => (
    <p
      className="text-[15px] whitespace-pre-wrap break-words leading-relaxed"
      style={{ overflowWrap: 'anywhere' }}
    >
      <RenderTextWithLinks
        text={text}
        linkClassName={`break-all underline font-medium hover:opacity-80 transition-opacity ${isAgentMessage ? 'text-white/90' : 'text-primary-600'}`}
      />
    </p>
  );

  return (
    <>
      {showDate && (
        <div className="flex items-center justify-center my-6">
          <span className="text-xs font-medium text-gray-400 bg-gray-100/80 px-4 py-1.5 rounded-full backdrop-blur-sm">
            {formatMessageDate(message.createdAt)}
          </span>
        </div>
      )}

      <div className={`flex min-w-0 mb-4 ${isAgentMessage ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] min-w-0 ${isAgentMessage ? 'order-2' : 'order-1'}`}>
          {/* Sender label */}
          <div className={`flex items-center justify-between gap-3 mb-1.5 ${isAgentMessage ? 'flex-row-reverse' : ''}`}>
            {isVisitor && showSenderName && senderName && (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                  {senderName[0]?.toUpperCase() || '?'}
                </div>
                <span className="text-sm font-semibold text-gray-700">{senderName}</span>
              </div>
            )}
            {isBot && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full">
                🤖 Bot
              </span>
            )}
            {isAgent && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-full">
                ✨ Bạn
              </span>
            )}
          </div>

          {/* Message bubble */}
          <div
            className={`relative group min-w-0 ${
              sendFailed
                ? 'bg-red-50 text-red-900 rounded-3xl rounded-br-sm border border-red-200 shadow-sm'
                : sendRetrying
                  ? 'bg-amber-50 text-amber-950 rounded-3xl rounded-br-sm border border-amber-200 shadow-sm'
                : isAgentMessage
                ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-3xl rounded-br-sm shadow-lg shadow-primary-500/20'
                : 'bg-white text-gray-800 rounded-3xl rounded-bl-sm border border-gray-100 shadow-sm'
            } ${isReplyingToThis ? 'ring-2 ring-primary-300 ring-offset-2' : ''}`}
          >
            {/* Tail */}
            <div className={`absolute top-3 w-3 h-3 ${
              sendFailed
                ? '-right-1.5 bg-red-50 rotate-45 border-r border-t border-red-200'
                : sendRetrying
                  ? '-right-1.5 bg-amber-50 rotate-45 border-r border-t border-amber-200'
                : isAgentMessage 
                ? '-right-1.5 bg-primary-500 rotate-45' 
                : '-left-1.5 bg-white rotate-45 border-l border-b border-gray-100'
            }`} />
            
            <div className="px-4 py-3 min-w-0">
              {normalizedText && normalizedContent.type === 'link' && normalizedContent.href && (
                <div className="space-y-1.5">
                  {normalizedContent.thumbUrl && (
                    <img
                      src={normalizedContent.thumbUrl}
                      alt={normalizedContent.title || messageLabels.link}
                      className="max-h-32 w-full rounded-2xl object-cover"
                    />
                  )}
                  {normalizedContent.title && (
                    <p className="text-[15px] font-semibold leading-snug break-words" style={{ overflowWrap: 'anywhere' }}>
                      {normalizedContent.title}
                    </p>
                  )}
                  {normalizedContent.description && (
                    <p className={`text-sm leading-snug break-words ${
                      sendFailed || sendRetrying ? 'text-red-700/80' : isAgentMessage ? 'text-white/80' : 'text-gray-500'
                    }`} style={{ overflowWrap: 'anywhere' }}>
                      {normalizedContent.description}
                    </p>
                  )}
                  <a
                    href={normalizedContent.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block break-all text-sm underline font-medium hover:opacity-80 transition-opacity ${
                      sendFailed || sendRetrying ? 'text-red-700' : isAgentMessage ? 'text-white/90' : 'text-primary-600'
                    }`}
                  >
                    {normalizedContent.href}
                  </a>
                </div>
              )}

              {normalizedText && (normalizedContent.type !== 'link' || !normalizedContent.href) && (
                renderTextWithLinks(normalizedText)
              )}
              
              <MessageAttachments attachments={attachments} messageRole={message.role} />
            </div>

            {/* Time and status */}
            <div className={`flex items-center gap-1.5 px-4 pb-2 ${isAgentMessage ? 'justify-end' : 'justify-start'}`}>
              <span className={`text-[11px] ${
                sendFailed || sendRetrying ? 'text-red-500' : isAgentMessage ? 'text-white/70' : 'text-gray-400'
              }`}>
                {formatMessageTime(message.createdAt)}
              </span>
              {isAgent && sendFailed && (
                <span title={sendState.error || t('inbox.sendFailed')} className="text-red-600">
                  <HiExclamationCircle className="w-4 h-4" />
                </span>
              )}
              {isAgent && sendRetrying && (
                <span title={t('inbox.sendRetrying')} className="text-amber-600 text-[11px] font-medium">
                  {t('inbox.sendRetrying')}
                </span>
              )}
              {isAgentMessage && !sendFailed && !sendRetrying && (
                message.isRead ? (
                  <span className="text-white/80">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </span>
                ) : (
                  <span className="text-white/60">
                    <HiCheck className="w-4 h-4" />
                  </span>
                )
              )}
            </div>

            {isAgent && sendFailed && sendState.canRetry && onRetry && (
              <div className="px-4 pb-3">
                <button
                  type="button"
                  disabled={isRetryBusy}
                  onClick={() => onRetry(message)}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRetryBusy ? t('inbox.retrying') : t('inbox.retrySend')}
                </button>
              </div>
            )}

            {/* Reply button */}
            {isVisitor && onReply && (
              <button
                onClick={() => onReply(message)}
                className={`absolute top-1/2 -translate-y-1/2 p-2 rounded-full transition-all opacity-0 group-hover:opacity-100 ${
                  isAgentMessage ? 'left-3 hover:bg-white/20 text-white/70 hover:text-white' : 'right-3 hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                }`}
              >
                <HiReply className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const MessageThread = ({ messages, isLoading, conversation, onReply, onRetry, retryingMessageId, replyingTo }) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const messageLabels = useMemo(() => ({
    sticker: t('inbox.messageSticker'),
    groupEvent: t('inbox.messageGroupEvent'),
    link: t('inbox.messageLink'),
    call: t('inbox.messageCall'),
    zaloEvent: t('inbox.messageZaloEvent'),
  }), [t]);

  const rawVisitorInfo = conversation?.visitor_info || conversation?.visitorInfo || {};
  const visitorInfo = typeof rawVisitorInfo === 'string'
    ? JSON.parse(rawVisitorInfo || '{}')
    : rawVisitorInfo;
  
  const isGroupConversation = 
    conversation?.isGroup === true ||
    visitorInfo.is_group === true ||
    visitorInfo.isGroup === true ||
    visitorInfo.source === 'zalo_group' ||
    String(conversation?.visitor_name || conversation?.visitorName || '').startsWith('Nhóm ');
  
  const isGroupChannel = conversation?.channel === 'zalo_group' || conversation?.channel === 'zalo_personal';

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const results = messages
        .map((msg, index) => ({ ...msg, index }))
        .filter(msg => getMessagePreviewText(msg.content, messageLabels).toLowerCase().includes(query));
      setSearchResults(results);
      
      if (results.length > 0) {
        setTimeout(() => {
          const element = containerRef.current?.querySelector(`[data-msg-index="${results[0].index}"]`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }, 100);
      }
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, messages, messageLabels]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const messagesWithDate = messages.map((msg, index) => {
    const prevMsg = messages[index - 1];
    const showDate = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);
    return { ...msg, showDate };
  });

  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery('');
      setSearchResults([]);
    } else {
      searchInputRef.current?.focus();
    }
  };

  if (isLoading) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-3 border-primary-500 border-t-transparent rounded-full mx-auto mb-4 animate-spin"></div>
          <p className="text-gray-500 font-medium">Đang tải tin nhắn...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gray-100 flex items-center justify-center">
            <span className="text-4xl">💬</span>
          </div>
          <p className="text-lg font-semibold text-gray-700">Chưa có tin nhắn</p>
          <p className="text-sm text-gray-400 mt-2">Bắt đầu cuộc trò chuyện ngay</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto,minmax(0,1fr)] overflow-hidden">
      {/* Search bar */}
      <div className="px-5 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <HiSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm trong cuộc trò chuyện..."
              className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-all"
              >
                <HiX className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-3.5 py-2 rounded-xl">
              {searchResults.length} kết quả
            </span>
          )}
          <button
            onClick={toggleSearch}
            className={`p-2.5 rounded-xl transition-all ${
              showSearch ? 'text-primary-600 bg-primary-50 shadow-sm' : 'text-gray-400 hover:bg-gray-100'
            }`}
          >
            {showSearch ? <HiX className="w-5 h-5" /> : <HiSearch className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="h-full min-h-0 min-w-0 overflow-y-scroll overscroll-contain px-5 py-4 [scrollbar-gutter:stable]">
        {messagesWithDate.map((msg, index) => {
          const isHighlighted = searchResults.some(r => r.index === index);
          return (
            <div 
              key={msg.id || index} 
              data-msg-index={index}
              className={isHighlighted ? 'bg-primary-50/50 rounded-2xl -mx-4 px-4 py-2 my-2' : ''}
            >
              <MessageBubble
                message={msg}
                isOwn={msg.role === 'agent'}
                showDate={msg.showDate}
                isGroupConversation={isGroupConversation}
                isGroupChannel={isGroupChannel}
                conversation={conversation}
                onReply={onReply}
                onRetry={onRetry}
                retryingMessageId={retryingMessageId}
                replyingTo={replyingTo}
                messageLabels={messageLabels}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} data-messages-end />
      </div>
    </div>
  );
};

export default MessageThread;
