import { useEffect, useRef, useState } from 'react';
import { HiCheck, HiDownload, HiExternalLink, HiReply, HiX, HiSearch } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const formatMessageTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const formatMessageDate = (dateString, t) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return t('inbox.today');
  } else if (date.toDateString() === yesterday.toDateString()) {
    return t('inbox.yesterday');
  }
  return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;
  return new Date(date1).toDateString() === new Date(date2).toDateString();
};

/**
 * Render message attachments (images, files, stickers)
 */
const MessageAttachments = ({ attachments, messageRole }) => {
  const { t } = useI18n();
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((attachment, index) => {
        // Parse attachment if it's a string
        let attachmentData = attachment;
        if (typeof attachment === 'string') {
          try {
            attachmentData = JSON.parse(attachment);
          } catch {
            attachmentData = { type: 'unknown', url: attachment };
          }
        }

        const isFromAgent = messageRole === 'agent' || messageRole === 'bot';

        // Image attachment
        if (attachmentData.type === 'image' || attachmentData.type === 'photo') {
          return (
            <div key={index} className="relative group">
              <a 
                href={attachmentData.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block"
              >
                <img 
                  src={attachmentData.url} 
                  alt={attachmentData.caption || 'Hình ảnh'}
                  className={`max-w-[280px] max-h-[200px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity ${
                    isFromAgent ? 'rounded-tr-none' : 'rounded-tl-none'
                  }`}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              </a>
              {/* Fallback for broken images */}
              <div className="hidden items-center gap-2 p-3 bg-gray-200 rounded-lg max-w-[280px]">
                <span className="text-2xl">🖼️</span>
                <span className="text-sm text-gray-600">{t('inbox.imageLoadFailed')}</span>
              </div>
              {/* Download button */}
              <a
                href={attachmentData.url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                title={t('common.download')}
              >
                <HiDownload className="w-4 h-4" />
              </a>
            </div>
          );
        }

        // Sticker attachment
        if (attachmentData.type === 'sticker' || attachmentData.type === 'gif') {
          return (
            <div key={index} className="relative">
              <img 
                src={attachmentData.url || attachmentData.thumbUrl || attachmentData.src}
                alt={attachmentData.stickerId ? `Sticker ${attachmentData.stickerId}` : 'Sticker'}
                className={`h-16 w-16 object-contain ${
                  isFromAgent ? 'rounded-tr-none' : 'rounded-tl-none'
                }`}
              />
              {attachmentData.packageId && (
                <span className="absolute -bottom-1 -right-1 text-[8px] bg-gray-200 px-1 rounded">
                  PKG
                </span>
              )}
            </div>
          );
        }

        // Video attachment
        if (attachmentData.type === 'video') {
          return (
            <div key={index} className="relative group">
              <video 
                src={attachmentData.url}
                controls
                className={`max-w-[280px] max-h-[200px] rounded-lg ${
                  isFromAgent ? 'rounded-tr-none' : 'rounded-tl-none'
                }`}
              />
              <a
                href={attachmentData.url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-2 right-2 p-1.5 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <HiDownload className="w-4 h-4" />
              </a>
            </div>
          );
        }

        // File attachment
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
              className={`flex items-center gap-3 p-3 bg-white border rounded-lg max-w-[280px] hover:bg-gray-50 transition-colors ${
                isFromAgent ? 'border-primary-200' : 'border-gray-200'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isFromAgent ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
              }`}>
                <span className="text-lg">
                  {getFileIcon(fileName)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{fileName}</p>
                {fileSize && <p className="text-xs text-gray-500">{fileSize}</p>}
              </div>
              <HiDownload className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </a>
          );
        }

        // Location attachment
        if (attachmentData.type === 'location') {
          return (
            <a
              key={index}
              href={attachmentData.url || `https://maps.google.com/?q=${attachmentData.lat},${attachmentData.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 p-3 bg-white border rounded-lg max-w-[280px] hover:bg-gray-50 transition-colors ${
                isFromAgent ? 'border-primary-200' : 'border-gray-200'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-green-100 text-green-600`}>
                📍
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{attachmentData.name || 'Vị trí'}</p>
                {attachmentData.address && (
                  <p className="text-xs text-gray-500 truncate">{attachmentData.address}</p>
                )}
              </div>
              <HiExternalLink className="w-5 h-5 text-gray-400" />
            </a>
          );
        }

        return null;
      })}
    </div>
  );
};

/**
 * Format file size to human readable
 */
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

/**
 * Get file icon based on extension
 */
const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconMap = {
    pdf: '📄',
    doc: '📝', docx: '📝',
    xls: '📊', xlsx: '📊',
    ppt: '📽️', pptx: '📽️',
    zip: '📦', rar: '📦', '7z': '📦',
    txt: '📃',
    mp3: '🎵', wav: '🎵', ogg: '🎵',
    mp4: '🎬', avi: '🎬', mov: '🎬',
  };
  return iconMap[ext] || '📎';
};

const MessageBubble = ({ 
  message, 
  isOwn, 
  showDate, 
  t, 
  isGroupConversation, 
  isGroupChannel, 
  conversation,
  onReply,
  replyingTo 
}) => {
  const isBot = message.role === 'bot';
  const isAgent = message.role === 'agent';
  const isVisitor = message.role === 'visitor';
  
  // Get sender name from message metadata
  const metadata = typeof message.metadata === 'string' ? JSON.parse(message.metadata || '{}') : (message.metadata || {});
  const visitorInfo = typeof message.visitor_info === 'string' ? JSON.parse(message.visitor_info || '{}') : (message.visitor_info || {});
  
  const senderName = metadata.sender_name || visitorInfo.sender_name || message.sender_name;
  
  // Parse attachments
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
  
  // Determine display name based on conversation type
  // For GROUP messages: Always show sender name (not "Khách hàng")
  // For PERSONAL messages: Show sender name if available, or "Khách hàng"
  let displayName;
  let showSenderName = false;
  
  if (isVisitor) {
    if (isGroupChannel || isGroupConversation) {
      // Group: Always show actual sender name
      displayName = senderName || t('inbox.anonymousUser');
      showSenderName = true;
    } else {
      // Personal: Show sender name if available
      displayName = senderName || t('inbox.customer');
      showSenderName = !!senderName;
    }
  }

  // Check if this message is being replied to
  const isReplyingToThis = replyingTo && replyingTo.id === message.id;

  return (
    <>
      {showDate && (
        <div className="flex items-center justify-center my-4">
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
            {formatMessageDate(message.createdAt, t)}
          </span>
        </div>
      )}

      {/* Reply preview indicator */}
      {isReplyingToThis && (
        <div className="flex items-center justify-center mb-2">
          <span className="text-xs text-primary-500 bg-primary-50 px-3 py-1 rounded-full">
            ↩️ {t('inbox.replyingToThis')}
          </span>
        </div>
      )}

      <div className={`flex mb-3 ${isOwn || isAgent ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] ${isOwn || isAgent ? 'order-2' : 'order-1'}`}>
          {/* Sender label - show name for group messages, "Khách hàng" for personal */}
          <div className={`flex items-center justify-between gap-2 mb-1 ${isOwn || isAgent ? 'flex-row-reverse' : ''}`}>
            <div className={`text-xs text-gray-500 ${isOwn || isAgent ? 'text-right' : 'text-left'}`}>
              {isVisitor && (
                <span className={`inline-flex items-center gap-1 ${
                  (isGroupChannel || isGroupConversation) && senderName 
                    ? 'text-purple-600 font-medium' 
                    : 'text-gray-500'
                }`}>
                  {showSenderName && senderName && (
                    <>
                      <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">
                        {senderName[0]?.toUpperCase() || '?'}
                      </span>
                      <span className="font-medium">{senderName}</span>
                    </>
                  )}
                  {!showSenderName && t('inbox.customer')}
                  {(isGroupChannel || isGroupConversation) && (
                    <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">
                      👥 {visitorInfo.group_name || t('inbox.group')}
                    </span>
                  )}
                </span>
              )}
              {isBot && (
                <span className="inline-flex items-center gap-1 text-primary-600">
                  🤖 {t('inbox.bot')}
                </span>
              )}
              {isAgent && (
                <span className="inline-flex items-center gap-1 text-primary-600">
                  {t('inbox.you')}
                </span>
              )}
            </div>
            
            {/* Reply button - only show for visitor messages */}
            {isVisitor && onReply && (
              <button
                onClick={() => onReply(message)}
                className="p-1 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                title={t('inbox.reply')}
              >
                <HiReply className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Message bubble */}
          <div
            className={`px-4 py-2.5 rounded-2xl ${
              isVisitor
                ? 'bg-gray-100 text-gray-800 rounded-tl-none'
                : 'bg-primary-500 text-white rounded-tr-none'
            } ${isReplyingToThis ? 'ring-2 ring-primary-300' : ''}`}
          >
            {/* Text content */}
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {message.content.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                  part.match(/^https?:\/\//) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline font-medium hover:opacity-80 transition-opacity" onClick={e => e.stopPropagation()}>
                      {part}
                    </a>
                  ) : (
                    part
                  )
                )}
              </p>
            )}
            
            {/* Attachments */}
            <MessageAttachments attachments={attachments} messageRole={message.role} />
          </div>

          {/* Time and status */}
          <div className={`flex items-center gap-1 mt-1 ${isOwn || isAgent ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-400">
              {formatMessageTime(message.createdAt)}
            </span>
            {isOwn || isAgent ? (
              message.isRead ? (
                <span className="text-primary-500" title={t('inbox.read')}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
              ) : (
                <span className="text-gray-400" title={t('inbox.sent')}>
                  <HiCheck className="w-3.5 h-3.5" />
                </span>
              )
            ) : null}
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

  // Check if this is a group conversation - check by name prefix or visitor_info flag
  const visitorInfo = typeof conversation?.visitor_info === 'string' 
    ? JSON.parse(conversation.visitor_info || '{}') 
    : (conversation?.visitor_info || {});
  
  const isGroupConversation = 
    visitorInfo.is_group === true || 
    visitorInfo.source === 'zalo_group' ||
    String(conversation?.visitor_name || '').startsWith('Nhóm ');
  
  // Check if this is a group channel (multiple senders)
  const isGroupChannel = conversation?.channel === 'zalo_group' || conversation?.channel === 'zalo_personal';

  // Search messages
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const results = messages
        .map((msg, index) => ({ ...msg, index }))
        .filter(msg => 
          msg.content?.toLowerCase().includes(query)
        );
      setSearchResults(results);
      
      // Highlight first result
      if (results.length > 0) {
        setTimeout(() => {
          const element = containerRef.current?.querySelector(`[data-msg-index="${results[0].index}"]`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, messages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Group messages by date
  const messagesWithDate = messages.map((msg, index) => {
    const prevMsg = messages[index - 1];
    const showDate = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);
    return { ...msg, showDate };
  });

  // Toggle search
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
      <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-3">💬</div>
          <p>{t('inbox.noMessages')}</p>
          <p className="text-sm">{t('inbox.startConversation')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search bar */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <HiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('inbox.searchMessages')}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <HiX className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {searchResults.length} {t('inbox.results')}
            </span>
          )}
          <button
            onClick={toggleSearch}
            className={`p-2 rounded-lg transition-colors ${
              showSearch ? 'text-primary-500 bg-primary-50' : 'text-gray-400 hover:bg-gray-100'
            }`}
            title={t('inbox.searchMessages')}
          >
            {showSearch ? <HiX className="w-5 h-5" /> : <HiSearch className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50">
        {messagesWithDate.map((msg, index) => {
          const isHighlighted = searchResults.some(r => r.index === index);
          return (
            <div 
              key={msg.id || index} 
              data-msg-index={index}
              className={isHighlighted ? 'bg-yellow-100 rounded-lg -mx-2 px-2' : ''}
            >
              <MessageBubble
                message={msg}
                isOwn={msg.role === 'agent'}
                showDate={msg.showDate}
                t={t}
                isGroupConversation={isGroupConversation}
                isGroupChannel={isGroupChannel}
                conversation={conversation}
                onReply={onReply}
                replyingTo={replyingTo}
                isHighlighted={isHighlighted}
              />
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageThread;
