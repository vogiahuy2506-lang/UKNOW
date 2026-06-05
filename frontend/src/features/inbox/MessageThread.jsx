import { useEffect, useRef } from 'react';
import { HiCheck } from 'react-icons/hi';
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
  return date.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
};

const isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;
  return new Date(date1).toDateString() === new Date(date2).toDateString();
};

const MessageBubble = ({ message, isOwn, showDate, t, isGroupConversation }) => {
  const isBot = message.role === 'bot';
  const isAgent = message.role === 'agent';
  const isVisitor = message.role === 'visitor';
  
  // Get sender name from message metadata
  const senderName = message.metadata?.sender_name || message.visitor_info?.sender_name || message.sender_name;

  return (
    <>
      {showDate && (
        <div className="flex items-center justify-center my-4">
          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
            {formatMessageDate(message.createdAt, t)}
          </span>
        </div>
      )}

      <div className={`flex mb-3 ${isOwn || isAgent ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] ${isOwn || isAgent ? 'order-2' : 'order-1'}`}>
          {/* Sender label - show name only for group messages, "Khách hàng" for personal */}
          <div className={`text-xs text-gray-500 mb-1 ${isOwn || isAgent ? 'text-right' : 'text-left'}`}>
            {isVisitor && (
              isGroupConversation 
                ? (senderName || t('inbox.customer'))  // Group: show sender name or fallback
                : t('inbox.customer')  // Personal: always show "Khách hàng"
            )}
            {isBot && t('inbox.bot')}
            {isAgent && t('inbox.you')}
          </div>

          {/* Message bubble */}
          <div
            className={`px-4 py-2.5 rounded-2xl ${
              isVisitor
                ? 'bg-gray-100 text-gray-800 rounded-tl-none'
                : isBot
                ? 'bg-primary-500 text-white rounded-tr-none'
                : 'bg-primary-500 text-white rounded-tr-none'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
          </div>

          {/* Time and status */}
          <div className={`flex items-center gap-1 mt-1 ${isOwn || isAgent ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-400">
              {formatMessageTime(message.createdAt)}
            </span>
            {isOwn || isAgent ? (
              message.isRead ? (
                <HiCheck className="w-3.5 h-3.5 text-primary-500" />
              ) : (
                <HiCheck className="w-3.5 h-3.5 text-gray-400" />
              )
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};

const MessageThread = ({ messages, isLoading, conversation }) => {
  const { t } = useI18n();
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  // Check if this is a group conversation - check by name prefix or visitor_info flag
  const isGroupConversation = 
    conversation?.visitor_info?.is_group === true || 
    String(conversation?.visitor_name || '').startsWith('Nhóm ');

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-gray-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-3">💬</div>
          <p>{t('inbox.noMessages')}</p>
          <p className="text-sm">{t('inbox.startConversation')}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 bg-gray-50">
      {messagesWithDate.map((msg, index) => (
        <MessageBubble
          key={msg.id || index}
          message={msg}
          isOwn={msg.role === 'agent'}
          showDate={msg.showDate}
          t={t}
          isGroupConversation={isGroupConversation}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageThread;
