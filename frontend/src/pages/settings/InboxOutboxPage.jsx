import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  HiArrowLeft, HiOutlineSearch, HiOutlineBell,
  HiOutlineInformationCircle, HiOutlineRefresh, HiOutlineExclamation,
  HiOutlineMail, HiOutlineInbox, HiX
} from 'react-icons/hi';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import ConversationList from '../../features/inbox/ConversationList';
import ConversationFilters from '../../features/inbox/ConversationFilters';
import MessageThread from '../../features/inbox/MessageThread';
import ReplyInput from '../../features/inbox/ReplyInput';
import ZaloAccountSelector from '../../features/inbox/ZaloAccountSelector';
import TypingIndicator from '../../features/inbox/TypingIndicator';
import ConversationDetails from '../../features/inbox/ConversationDetails';
import { useI18n } from '../../i18n';
import toast from 'react-hot-toast';
import useInboxSSE from '../../hooks/useInboxSSE';
import useDesktopNotifications from '../../hooks/useDesktopNotifications';
import useIsMobile from '../../hooks/useIsMobile';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { getMessagePreviewText } from '../../features/inbox/utils/normalizeMessageContent';

const getConversationKey = (conv) => (conv ? `${conv.type || ''}:${conv.id}` : '');

const mergeUniqueMessages = (baseMessages, nextMessages, markAsRead = false) => {
  const merged = [...baseMessages];

  for (const nextMessage of nextMessages) {
    const isDuplicate = merged.some(m =>
      m.createdAt === nextMessage.createdAt ||
      (m.content === nextMessage.content && Math.abs(new Date(m.createdAt) - new Date(nextMessage.createdAt)) < 5000)
    );

    if (!isDuplicate) {
      merged.push(markAsRead ? { ...nextMessage, isRead: true } : nextMessage);
    }
  }

  return merged;
};

const InboxPage = () => {
  const { t } = useI18n();
  
  const { isEnabled: notificationsEnabled, toggleNotifications, showNotification } = useDesktopNotifications();
  
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingSender, setTypingSender] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  
  const [sessionStatus, setSessionStatus] = useState({
    connected: false,
    accounts: [],
    message: '',
  });
  
  const [replyingTo, setReplyingTo] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const searchInputRef = useRef(null);
  
  const [pendingMessages, setPendingMessages] = useState({});
  const selectedConversationRef = useRef(null);
  const messagesRequestSeqRef = useRef(0);
  const pendingMessagesForFetchRef = useRef(null);

  const [filters, setFilters] = useState({
    channel: '',
    search: '',
    sort: 'latest',
    status: 'all',
    date: 'all',
  });

  const isMobile = useIsMobile();
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('uknow_inbox_sidebar_width', 360);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(360);
  const messagePreviewLabels = useMemo(() => ({
    sticker: t('inbox.messageSticker'),
    groupEvent: t('inbox.messageGroupEvent'),
    link: t('inbox.messageLink'),
    call: t('inbox.messageCall'),
    zaloEvent: t('inbox.messageZaloEvent'),
  }), [t]);

  const getDisplayMessage = useCallback((message, messageType) => {
    if (message) return getMessagePreviewText(message, messagePreviewLabels);
    if (messageType === 'image') return t('inbox.messageImage');
    if (messageType === 'sticker') return t('inbox.messageSticker');
    return '';
  }, [messagePreviewLabels, t]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event) => {
      const delta = event.clientX - dragStartXRef.current;
      const nextWidth = Math.min(500, Math.max(280, dragStartWidthRef.current + delta));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  const handleResizeStart = (event) => {
    setIsResizing(true);
    dragStartXRef.current = event.clientX;
    dragStartWidthRef.current = sidebarWidth;
  };

  const fetchSessionStatus = useCallback(async () => {
    try {
      const response = await chatbotApi.getZaloSyncStatus();
      const payload = response.data;
      if (payload?.success) {
        setSessionStatus(payload.data);
      }
    } catch (err) {
      console.error('Failed to fetch session status:', err);
    }
  }, []);

  const fetchConversations = useCallback(async (reset = false) => {
    try {
      if (reset) {
        setIsLoadingConversations(true);
        setPage(0);
      }

      const currentPage = reset ? 0 : page;
      const requestParams = {
        channel: filters.channel || undefined,
        search: filters.search || undefined,
        status: filters.status === 'all' ? undefined : filters.status,
        date: filters.date === 'all' ? undefined : filters.date,
        offset: currentPage * 20,
        limit: 20,
      };
      
      if (filters.channel === 'zalo_personal' && selectedAccountId) {
        requestParams.zaloAccountId = selectedAccountId;
      }
      
      const response = await chatbotApi.getConversations(requestParams);

      if (response.success) {
        const newConversations = reset
          ? response.data.conversations
          : [...conversations, ...response.data.conversations];

        setConversations(newConversations);
        setHasMore(newConversations.length < response.data.total);
        setPage(currentPage + 1);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      toast.error(t('errors.loadFailed'));
    } finally {
      setIsLoadingConversations(false);
    }
  }, [filters, page, conversations, selectedAccountId, t]);

  const handleFilterChange = useCallback((nextFilters) => {
    setFilters(nextFilters);
    setPage(0);
  }, []);

  const handleDeleteConversation = async (conv) => {
    try {
      const response = await chatbotApi.deleteConversation(conv.id, conv.type);
      const success = response?.success || response?.data?.success;
      if (success) {
        toast.success(t('common.deleted') || 'Đã xóa');
        await fetchConversations(true);
        if (selectedConversation?.id === conv.id) {
          setSelectedConversation(null);
          setMessages([]);
        }
      } else {
        toast.error(t('errors.deleteFailed') || 'Xóa thất bại');
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      toast.error(t('errors.deleteFailed') || 'Xóa thất bại');
    }
  };

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await chatbotApi.getUnreadCount();
      if (response.success) {
        setUnreadCount(response.data.total);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  const fetchMessages = useCallback(async (conv = null) => {
    const target = conv || selectedConversation;
    if (!target) return;
    const requestSeq = messagesRequestSeqRef.current + 1;
    messagesRequestSeqRef.current = requestSeq;
    const targetKey = getConversationKey(target);
    setIsLoadingMessages(true);
    try {
      const response = await chatbotApi.getMessages(target.id, target.type);
      if (response.success) {
        const currentKey = getConversationKey(selectedConversationRef.current);
        if (requestSeq !== messagesRequestSeqRef.current || currentKey !== targetKey) return;

        const bufferedForTarget = pendingMessagesForFetchRef.current?.key === targetKey
          ? pendingMessagesForFetchRef.current.messages
          : [];
        pendingMessagesForFetchRef.current = null;
        setMessages(mergeUniqueMessages(response.data || [], bufferedForTarget, true));
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      toast.error(t('errors.loadFailed'));
    } finally {
      if (requestSeq === messagesRequestSeqRef.current && getConversationKey(selectedConversationRef.current) === targetKey) {
        setIsLoadingMessages(false);
      }
    }
  }, [selectedConversation, t]);

  const handleNewMessage = useCallback((data) => {
    const displayMessage = getDisplayMessage(data.message, data.messageType);

    setConversations(prev => {
      const existingIndex = prev.findIndex(c => c.id === data.conversationId);
      
      if (existingIndex !== -1) {
        const existing = prev[existingIndex];
        const updated = {
          ...existing,
          lastMessage: displayMessage,
          lastMessageAt: data.timestamp || new Date().toISOString(),
          last_message_at: data.timestamp || new Date().toISOString(),
          unreadCount: (selectedConversation?.id === data.conversationId) ? 0 : (existing.unreadCount || 0) + 1,
        };
        const newList = [updated, ...prev.slice(0, existingIndex), ...prev.slice(existingIndex + 1)];
        return newList;
      } else {
        const newConv = {
          id: data.conversationId,
          type: data.type || 'zalo_personal',
          channel: data.channel || 'zalo_personal',
          visitorName: data.isGroup 
            ? (data.visitorName || data.groupName || data.senderName || 'Nhóm') 
            : (data.senderName || data.visitorName || 'Khách hàng'),
          lastMessage: displayMessage,
          lastMessageAt: data.timestamp || new Date().toISOString(),
          last_message_at: data.timestamp || new Date().toISOString(),
          unreadCount: (selectedConversation?.id === data.conversationId) ? 0 : 1,
          isGroup: data.isGroup || false,
          groupName: data.groupName || null,
          senderId: data.senderId,
        };
        return [newConv, ...prev];
      }
    });

    if (document.hidden && displayMessage) {
      showNotification(t('inbox.newMessage'), {
        body: `${data.senderName || t('inbox.customer')}: ${displayMessage.substring(0, 100)}`,
        tag: `conv-${data.conversationId}`,
      });
    } else if (!document.hidden && displayMessage && (!selectedConversation || data.conversationId !== selectedConversation.id)) {
      const sender = data.senderName || t('inbox.customer');
      const msgPreview = displayMessage.length > 50 ? displayMessage.substring(0, 50) + '...' : displayMessage;
      toast.success(`${sender}: ${msgPreview}`, {
        icon: '💬',
        duration: 4000,
      });
    }
    
    if (data.isTyping) {
      setTypingSender(data.senderName);
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 3000);
      return;
    }
    
    const isThisConversation = selectedConversation && data.conversationId === selectedConversation.id;
    
    if (isThisConversation) {
      const msgRole = data.role || 'visitor';
      
      setMessages(prev => {
        const isDuplicate = prev.some(m => 
          m.createdAt === data.timestamp || 
          (m.content === data.message && Math.abs(new Date(m.createdAt) - new Date(data.timestamp || Date.now())) < 5000)
        );
        
        if (isDuplicate) return prev;
        
        const newMsg = {
          id: data.messageId || `temp-${Date.now()}`,
          role: msgRole,
          content: data.message || displayMessage,
          createdAt: data.timestamp || new Date().toISOString(),
          isRead: true,
          messageType: data.messageType || 'text',
          attachmentUrl: data.attachmentUrl || null,
          senderName: data.senderName,
        };
        return [...prev, newMsg];
      });
      
      setTimeout(() => {
        const endEl = document.querySelector('[data-messages-end]');
        if (endEl) {
          endEl.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      setPendingMessages(prev => {
        const convMessages = prev[data.conversationId] || [];
        const msgRole = data.role || 'visitor';
        
        const isDuplicate = convMessages.some(m => 
          m.createdAt === data.timestamp || 
          (m.content === data.message && Math.abs(new Date(m.createdAt) - new Date(data.timestamp || Date.now())) < 5000)
        );
        
        if (isDuplicate) return prev;
        
        const newMsg = {
          id: data.messageId || `temp-${Date.now()}`,
          role: msgRole,
          content: data.message || displayMessage,
          createdAt: data.timestamp || new Date().toISOString(),
          isRead: false,
          messageType: data.messageType || 'text',
          attachmentUrl: data.attachmentUrl || null,
          senderName: data.senderName,
        };
        
        return {
          ...prev,
          [data.conversationId]: [...convMessages, newMsg],
        };
      });
    }
  }, [getDisplayMessage, selectedConversation, showNotification, t]);

  const handleUnreadChange = useCallback(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useInboxSSE(handleNewMessage, handleUnreadChange);

  const handleSendMessage = useCallback(async (content, replyTo) => {
    if (!selectedConversation || isSending) return;
    setIsSending(true);
    try {
      const response = await chatbotApi.sendMessage(selectedConversation.id, {
        type: selectedConversation.type,
        content,
        replyTo: replyTo ? {
          id: replyTo.id,
          content: replyTo.content,
          role: replyTo.role,
        } : undefined,
      });

      if (response.success) {
        const newMessage = {
          id: Date.now(),
          role: 'agent',
          content,
          createdAt: new Date().toISOString(),
          isRead: true,
          replyTo,
        };
        setMessages(prev => [...prev, newMessage]);
        setReplyingTo(null);
        toast.success(t('common.success'));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error(t('errors.sendFailed'));
    } finally {
      setIsSending(false);
    }
  }, [selectedConversation, isSending, t]);

  const handleReply = useCallback((message) => {
    setReplyingTo(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingConversations && hasMore) {
      fetchConversations(false);
    }
  }, [isLoadingConversations, hasMore, fetchConversations]);

  const handleSearch = useCallback((value) => {
    setFilters(prev => ({ ...prev, search: value }));
  }, []);

  const handleSelectConversation = useCallback(async (conv) => {
    selectedConversationRef.current = conv;
    setSelectedConversation(conv);
    setIsLoadingMessages(true);

    const bufferedMessages = pendingMessages[conv.id] || [];
    pendingMessagesForFetchRef.current = bufferedMessages.length > 0
      ? { key: getConversationKey(conv), messages: bufferedMessages }
      : null;

    if (bufferedMessages.length > 0) {
      setMessages(mergeUniqueMessages([], bufferedMessages, true));
      setPendingMessages(prev => {
        const { [conv.id]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setMessages([]);
    }

    if (conv.unreadCount > 0) {
      try {
        await chatbotApi.markAsRead(conv.id, conv.type);
        setConversations(prev =>
          prev.map(c =>
            c.id === conv.id && c.type === conv.type
              ? { ...c, unreadCount: 0 }
              : c
          )
        );
        fetchUnreadCount();
      } catch (err) {
        console.error('Failed to mark as read:', err);
      }
    }
  }, [fetchUnreadCount, pendingMessages]);

  useEffect(() => {
    fetchConversations(true);
    fetchUnreadCount();
    fetchSessionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.channel, filters.search, filters.status, filters.date, selectedAccountId]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation);
    }
  }, [fetchMessages, selectedConversation]);

  const handleBack = () => {
    messagesRequestSeqRef.current += 1;
    selectedConversationRef.current = null;
    setSelectedConversation(null);
    setMessages([]);
    setIsLoadingMessages(false);
  };

  const getChannelLabel = (channel) => {
    const channelMap = {
      web: 'Web Chat',
      zalo_oa: 'Zalo OA',
      facebook: 'Facebook',
      zalo_personal: 'Zalo Cá nhân',
    };
    return channelMap[channel] || channel || '';
  };

  return (
    <div className="h-full min-h-0 flex overflow-hidden bg-gray-100">
      {/* Left Sidebar */}
      <div
        className={`bg-white flex flex-col flex-shrink-0 border-r border-gray-200 ${
          !isResizing && 'transition-all duration-200'
        } ${selectedConversation ? 'hidden lg:flex' : 'flex w-full lg:w-auto'}`}
        style={{ width: isMobile && !selectedConversation ? '100%' : `${sidebarWidth}px` }}
      >
        {/* Sidebar toolbar — compact so list gets most of the height */}
        <div className="shrink-0 border-b border-gray-100">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-sm">
              <HiOutlineInbox className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-gray-900 truncate">{t('inbox.title')}</h1>
                {unreadCount > 0 && (
                  <span className="shrink-0 text-[10px] font-semibold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full">
                    {unreadCount} {t('inbox.unread')}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleNotifications}
              className={`p-1.5 rounded-lg transition-colors ${
                notificationsEnabled
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={notificationsEnabled ? 'Tắt thông báo' : 'Bật thông báo'}
            >
              <HiOutlineBell className="w-4 h-4" />
            </button>
          </div>

          {!sessionStatus.connected && sessionStatus.accounts?.length > 0 && (
            <div className="mx-3 mb-2 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-1.5">
              <HiOutlineExclamation className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-800 leading-tight">
                {t('inbox.sessionExpired')} — {t('inbox.rescanQR')}
              </p>
            </div>
          )}

          <div className="px-3 pb-2">
            <div className="relative">
              <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('inbox.searchConversations')}
                value={filters.search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              />
              {filters.search && (
                <button
                  type="button"
                  onClick={() => handleSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                >
                  <HiX className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="px-3 pb-2 space-y-2">
            <ConversationFilters
              filters={filters}
              onChange={handleFilterChange}
            />

            {(!filters.channel || filters.channel === 'zalo_personal') && (
              <ZaloAccountSelector
                selectedAccountId={selectedAccountId}
                onAccountChange={setSelectedAccountId}
                onSyncComplete={fetchSessionStatus}
              />
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-hidden bg-white">
          <ConversationList
            conversations={conversations}
            isLoading={isLoadingConversations}
            selectedId={selectedConversation ? `${selectedConversation.type}-${selectedConversation.id}` : null}
            onSelect={handleSelectConversation}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            onDelete={handleDeleteConversation}
            sortBy={filters.sort}
          />
        </div>
      </div>

      {/* Resizer Handle */}
      {!isMobile && (
        <div
          className={`w-1 cursor-col-resize hover:bg-primary-300 transition-colors z-10 flex-shrink-0 ${
            isResizing ? 'bg-primary-500' : 'bg-transparent'
          }`}
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Right panel */}
      <div
        className={`flex-1 min-w-0 flex flex-col bg-gray-50 ${
          selectedConversation ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {selectedConversation ? (
          <>
            {/* Message header */}
            <div className="px-5 py-4 bg-white border-b border-gray-200 flex items-center gap-4 shadow-sm">
              <button
                onClick={handleBack}
                className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
              >
                <HiArrowLeft className="w-5 h-5" />
              </button>

              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-primary-600 font-bold text-lg shadow-sm">
                {selectedConversation.visitorName?.[0]?.toUpperCase() || '?'}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-gray-900 truncate text-lg">
                  {selectedConversation.visitorName || t('inbox.anonymousCustomer')}
                </h2>
                <p className="text-sm text-gray-500">
                  {getChannelLabel(selectedConversation.channel)}
                </p>
              </div>

              <button
                onClick={() => {
                  fetchMessages(selectedConversation);
                  fetchConversations(true);
                }}
                className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                title="Làm mới"
              >
                <HiOutlineRefresh className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`p-2.5 rounded-xl transition-all ${
                  showDetails 
                    ? 'text-primary-600 bg-primary-50 shadow-sm' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title="Chi tiết"
              >
                <HiOutlineInformationCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <MessageThread 
                messages={messages} 
                isLoading={isLoadingMessages}
                conversation={selectedConversation}
                onReply={handleReply}
                replyingTo={replyingTo}
              />
            </div>

            {isTyping && (
              <TypingIndicator 
                isTyping={isTyping}
                senderName={typingSender}
              />
            )}

            <ReplyInput
              onSend={handleSendMessage}
              disabled={isSending}
              placeholder={t('inbox.typeMessage')}
              replyingTo={replyingTo}
              onCancelReply={handleCancelReply}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
            <div className="text-center max-w-sm px-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center shadow-lg shadow-primary-500/10">
                <HiOutlineMail className="w-12 h-12 text-primary-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                {t('inbox.selectConversation')}
              </h2>
              <p className="text-gray-500 leading-relaxed">
                {t('inbox.noConversations')}
              </p>
              {filters.channel === 'zalo_personal' && !sessionStatus.connected && (
                <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                  <div className="flex items-start gap-3 text-left">
                    <HiOutlineExclamation className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">{t('inbox.zaloNotConnected')}</p>
                      <p className="text-sm text-amber-600 mt-1">{t('inbox.connectZaloFirst')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Conversation Details Panel */}
      {showDetails && selectedConversation && (
        <ConversationDetails
          conversation={selectedConversation}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
};

export default InboxPage;
