import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  HiArrowLeft, HiOutlineSearch, HiBell, HiOutlineBell, 
  HiInformationCircle, HiRefresh, HiExclamationCircle,
  HiMail, HiUserCircle, HiLogout
} from 'react-icons/hi';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import ConversationList from '../../features/inbox/ConversationList';
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

const CHANNEL_FILTERS = (t) => [
  { value: '', label: t('inbox.allChannels') },
  { value: 'web', label: 'Web Chat' },
  { value: 'zalo_oa', label: 'Zalo OA' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'zalo_personal', label: 'Zalo Cá nhân' },
];

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

  const [filters, setFilters] = useState({
    channel: '',
    search: '',
  });

  // Resizing state
  const isMobile = useIsMobile();
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('uknow_inbox_sidebar_width', 384);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(384);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event) => {
      const delta = event.clientX - dragStartXRef.current;
      const nextWidth = Math.min(600, Math.max(280, dragStartWidthRef.current + delta));
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
        channel: filters.channel,
        search: filters.search,
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

  const fetchMessages = useCallback(async (conv) => {
    if (!conv) return;
    setIsLoadingMessages(true);
    try {
      const response = await chatbotApi.getMessages(conv.id, conv.type);
      if (response.success) {
        setMessages(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      toast.error(t('errors.loadFailed'));
    } finally {
      setIsLoadingMessages(false);
    }
  }, [t]);

  const handleNewMessage = useCallback((data) => {
    console.log('[InboxPage] SSE New message:', data);
    
    // Nếu app bị ẩn (chạy nền), hiển thị thông báo desktop
    if (document.hidden && data.message) {
      showNotification(t('inbox.newMessage'), {
        body: `${data.senderName || t('inbox.customer')}: ${data.message.substring(0, 100)}`,
        tag: `conv-${data.conversationId}`,
      });
    } else if (!document.hidden && data.message && (!selectedConversation || data.conversationId !== selectedConversation.id)) {
      // Nếu app đang mở nhưng không ở trong đoạn chat hiện tại, hiển thị toast
      const sender = data.senderName || t('inbox.customer');
      const msgPreview = data.message.length > 50 ? data.message.substring(0, 50) + '...' : data.message;
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
    
    fetchConversations(true);
    if (selectedConversation && data.conversationId === selectedConversation.id) {
      fetchMessages(selectedConversation);
    }
  }, [fetchConversations, fetchMessages, selectedConversation, showNotification, t]);

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
    setSelectedConversation(conv);
    await fetchMessages(conv);

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
  }, [fetchMessages, fetchUnreadCount]);

  useEffect(() => {
    fetchConversations(true);
    fetchUnreadCount();
    fetchSessionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.channel, filters.search]);

  const handleBack = () => {
    setSelectedConversation(null);
    setMessages([]);
  };

  const getChannelLabel = (channel) => {
    const filter = CHANNEL_FILTERS(t).find(f => f.value === channel);
    return filter ? t(filter.label) : channel;
  };

  return (
    <div className="h-[calc(100vh-64px)] flex overflow-hidden">
      {/* Left Sidebar */}
      <div
        className={`bg-white border-r border-gray-200 flex flex-col flex-shrink-0 ${
          !isResizing && 'transition-all duration-300'
        } ${selectedConversation ? 'hidden md:flex' : 'flex w-full md:w-auto'}`}
        style={{ width: isMobile && !selectedConversation ? '100%' : `${sidebarWidth}px` }}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <HiMail className="w-5 h-5 text-gray-600" />
              </div>
              <h1 className="text-lg font-semibold text-gray-900">{t('inbox.title')}</h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={toggleNotifications}
              className={`p-2 rounded-lg transition-colors ${
                notificationsEnabled 
                  ? 'text-primary-500 bg-primary-50 hover:bg-primary-100' 
                  : 'text-gray-400 hover:bg-gray-100'
              }`}
              title={notificationsEnabled ? t('inbox.notificationsOn') : t('inbox.notificationsOff')}
            >
              {notificationsEnabled ? (
                <HiBell className="w-5 h-5" />
              ) : (
                <HiOutlineBell className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Session warning */}
          {!sessionStatus.connected && sessionStatus.accounts?.length > 0 && (
            <div className="mb-3 p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <HiExclamationCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-yellow-800">{t('inbox.sessionExpired')}</p>
                <p className="text-xs text-yellow-600">{t('inbox.rescanQR')}</p>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('inbox.searchConversations')}
              value={filters.search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {filters.search && (
              <button
                onClick={() => handleSearch('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <HiLogout className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filters + Zalo selector */}
        <div className="px-4 py-3 border-b border-gray-100 space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {CHANNEL_FILTERS(t).map((filter) => (
              <button
                key={filter.value}
                onClick={() => setFilters(prev => ({ ...prev, channel: filter.value }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  filters.channel === filter.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>
          
          <ZaloAccountSelector 
            selectedAccountId={selectedAccountId}
            onAccountChange={setSelectedAccountId}
            onSyncComplete={fetchSessionStatus}
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-hidden">
          <ConversationList
            conversations={conversations}
            isLoading={isLoadingConversations}
            selectedId={selectedConversation ? `${selectedConversation.type}-${selectedConversation.id}` : null}
            onSelect={handleSelectConversation}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            onDelete={handleDeleteConversation}
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
          title={t('common.dragToResize')}
        />
      )}

      {/* Right panel */}
      <div
        className={`flex-1 flex bg-white ${
          selectedConversation ? 'flex' : 'hidden md:flex'
        }`}
      >
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
          <>
            {/* Message header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-white">
              <button
                onClick={handleBack}
                className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <HiArrowLeft className="w-5 h-5" />
              </button>

              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold">
                {selectedConversation.visitorName?.[0]?.toUpperCase() || <HiUserCircle className="w-6 h-6" />}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">
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
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title={t('common.refresh')}
              >
                <HiRefresh className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`p-2 rounded-lg transition-colors ${
                  showDetails 
                    ? 'text-primary-500 bg-primary-50' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title={t('inbox.conversationDetails')}
              >
                <HiInformationCircle className="w-5 h-5" />
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
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center max-w-xs px-6">
              <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-gray-100 flex items-center justify-center shadow-sm">
                <HiMail className="w-7 h-7 text-gray-400" />
              </div>
              <h2 className="text-base font-semibold text-gray-700 mb-1">
                {t('inbox.selectConversation')}
              </h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                {t('inbox.noConversations')}
              </p>
              {filters.channel === 'zalo_personal' && !sessionStatus.connected && (
                <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex items-start gap-2 text-left">
                    <HiExclamationCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-yellow-800">{t('inbox.zaloNotConnected')}</p>
                      <p className="text-xs text-yellow-600 mt-0.5">{t('inbox.connectZaloFirst')}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        {showDetails && selectedConversation && (
          <ConversationDetails
            conversation={selectedConversation}
            onClose={() => setShowDetails(false)}
          />
        )}
      </div>
    </div>
  );
};

export default InboxPage;
