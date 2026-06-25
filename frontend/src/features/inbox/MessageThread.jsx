import { useEffect, useMemo, useRef, useState } from 'react';
import { HiCheck, HiDownload, HiReply, HiX, HiSearch } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import {
  getMessagePreviewText,
  getNormalizedMessageText,
  normalizeMessageContent,
} from './utils/normalizeMessageContent';

const formatMessageTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

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

const MessageAttachments = ({ attachments, messageRole }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((attachment, index) => {
        let attachmentData = attachment;
        if (typeof attachment === 'string') {
          try {
            attachmentData = JSON.parse(attachment);
          } catch {
            attachmentData = { type: 'unknown', url: attachment };
          }
        }

        const isFromAgent = messageRole === 'agent' || messageRole === 'bot';

        if (attachmentData.type === 'image' || attachmentData.type === 'photo') {
          return (
            <div key={index} className="relative group">
              <a href={attachmentData.url} target="_blank" rel="noopener noreferrer" className="block">
                <img 
                  src={attachmentData.url} 
                  alt={attachmentData.caption || 'Hình ảnh'}
                  className={`max-w-[280px] max-h-[200px] rounded-2xl object-cover cursor-pointer hover:opacity-90 transition-all shadow-md ${
                    isFromAgent ? 'rounded-br-sm' : 'rounded-bl-sm'
                  }`}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </a>
              <a
                href={attachmentData.url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 p-2.5 bg-black/60 hover:bg-black/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
              >
                <HiDownload className="w-4 h-4" />
              </a>
            </div>
          );
        }

        if (attachmentData.type === 'sticker' || attachmentData.type === 'gif') {
          return (
            <img 
              key={index}
              src={attachmentData.url || attachmentData.thumbUrl || attachmentData.src}
              alt="Sticker"
              className="h-20 w-20 object-contain"
            />
          );
        }

        if (attachmentData.type === 'video') {
          return (
            <div key={index} className="relative group">
              <video 
                src={attachmentData.url}
                controls
                className={`max-w-[280px] max-h-[200px] rounded-2xl ${
                  isFromAgent ? 'rounded-br-sm' : 'rounded-bl-sm'
                } shadow-md`}
              />
            </div>
          );
        }

        if (attachmentData.type === 'file' || attachmentData.type === 'doc') {
          const fileName = attachmentData.name || 'Tệp đính kèm';
          const fileSize = attachmentData.size ? formatFileSize(attachmentData.size) : '';
          
          return (
            <a
              key={index}
              href={attachmentData.url}
              download={fileName}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 p-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl max-w-[280px] hover:bg-white transition-all shadow-sm ${
                isFromAgent ? 'border-primary-200/50' : ''
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isFromAgent ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
              }`}>
                <span className="text-xl">{getFileIcon(fileName)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{fileName}</p>
                {fileSize && <p className="text-xs text-gray-500">{fileSize}</p>}
              </div>
              <HiDownload className="w-5 h-5 text-gray-400" />
            </a>
          );
        }

        return null;
      })}
    </div>
  );
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconMap = {
    pdf: '📄', doc: '📝', docx: '📝',
    xls: '📊', xlsx: '📊',
    ppt: '📽️', pptx: '📽️',
    zip: '📦', rar: '📦', '7z': '📦',
    txt: '📃',
  };
  return iconMap[ext] || '📎';
};

const MessageBubble = ({ 
  message, 
  isOwn, 
  showDate, 
  isGroupConversation, 
  isGroupChannel, 
  onReply,
  replyingTo,
  messageLabels,
}) => {
  const isBot = message.role === 'bot';
  const isAgent = message.role === 'agent';
  const isVisitor = message.role === 'visitor';
  
  const metadata = typeof message.metadata === 'string' ? JSON.parse(message.metadata || '{}') : (message.metadata || {});
  const visitorInfo = typeof message.visitor_info === 'string' ? JSON.parse(message.visitor_info || '{}') : (message.visitor_info || {});
  
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
      {String(text).split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
        part.match(/^https?:\/\//) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`break-all underline font-medium hover:opacity-80 transition-opacity ${isAgentMessage ? 'text-white/90' : 'text-primary-600'}`}
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
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
              isAgentMessage
                ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-3xl rounded-br-sm shadow-lg shadow-primary-500/20'
                : 'bg-white text-gray-800 rounded-3xl rounded-bl-sm border border-gray-100 shadow-sm'
            } ${isReplyingToThis ? 'ring-2 ring-primary-300 ring-offset-2' : ''}`}
          >
            {/* Tail */}
            <div className={`absolute top-3 w-3 h-3 ${
              isAgentMessage 
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
                    <p className={`text-sm leading-snug break-words ${isAgentMessage ? 'text-white/80' : 'text-gray-500'}`} style={{ overflowWrap: 'anywhere' }}>
                      {normalizedContent.description}
                    </p>
                  )}
                  <a
                    href={normalizedContent.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block break-all text-sm underline font-medium hover:opacity-80 transition-opacity ${isAgentMessage ? 'text-white/90' : 'text-primary-600'}`}
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
              <span className={`text-[11px] ${isAgentMessage ? 'text-white/70' : 'text-gray-400'}`}>
                {formatMessageTime(message.createdAt)}
              </span>
              {isAgentMessage && (
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

const MessageThread = ({ messages, isLoading, conversation, onReply, replyingTo }) => {
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

  const visitorInfo = typeof conversation?.visitor_info === 'string' 
    ? JSON.parse(conversation.visitor_info || '{}') 
    : (conversation?.visitor_info || {});
  
  const isGroupConversation = 
    visitorInfo.is_group === true || 
    visitorInfo.source === 'zalo_group' ||
    String(conversation?.visitor_name || '').startsWith('Nhóm ');
  
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
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, messages, messageLabels]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
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
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-3 border-primary-500 border-t-transparent rounded-full mx-auto mb-4 animate-spin"></div>
          <p className="text-gray-500 font-medium">Đang tải tin nhắn...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
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
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
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
      <div ref={containerRef} className="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4">
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
