import { useState, useEffect, useCallback } from 'react';
import { HiArrowLeft, HiOutlineSearch } from 'react-icons/hi';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import ConversationList from '../../features/inbox/ConversationList';
import MessageThread from '../../features/inbox/MessageThread';
import ReplyInput from '../../features/inbox/ReplyInput';
import { useI18n } from '../../i18n';
import toast from 'react-hot-toast';

const CHANNEL_FILTERS = (t) => [
  { value: '', label: t('inbox.allChannels') },
  { value: 'web', label: 'Web Chat' },
  { value: 'zalo_oa', label: 'Zalo OA' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'zalo_personal', label: 'Zalo Cá nhân' },
];

const InboxPage = () => {
  const { t } = useI18n();
  
  // Inbox state
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Filters
  const [filters, setFilters] = useState({
    channel: '',
    search: '',
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedConversation) {
        setSelectedConversation(null);
        setMessages([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConversation]);

  // Fetch inbox conversations
  const fetchConversations = useCallback(async (reset = false) => {
    try {
      if (reset) {
        setIsLoadingConversations(true);
        setPage(0);
      }

      const currentPage = reset ? 0 : page;
      const response = await chatbotApi.getConversations({
        channel: filters.channel,
        search: filters.search,
        offset: currentPage * 20,
        limit: 20,
      });

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
  }, [filters, page, conversations, t]);

  // Fetch unread count
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

  // Fetch inbox messages
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

  // Handle conversation selection
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

  // Handle send message
  const handleSendMessage = useCallback(async (content) => {
    if (!selectedConversation || isSending) return;

    setIsSending(true);
    try {
      const response = await chatbotApi.sendMessage(selectedConversation.id, {
        type: selectedConversation.type,
        content,
      });

      if (response.success) {
        const newMessage = {
          id: Date.now(),
          role: 'agent',
          content,
          createdAt: new Date().toISOString(),
          isRead: true,
        };
        setMessages(prev => [...prev, newMessage]);
        toast.success(t('common.success'));
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      toast.error(t('errors.sendFailed'));
    } finally {
      setIsSending(false);
    }
  }, [selectedConversation, isSending, t]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (!isLoadingConversations && hasMore) {
      fetchConversations(false);
    }
  }, [isLoadingConversations, hasMore, fetchConversations]);

  // Handle search
  const handleSearch = useCallback((value) => {
    setFilters(prev => ({ ...prev, search: value }));
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations(true);
    fetchUnreadCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.channel, filters.search]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!selectedConversation) {
        fetchConversations(true);
      }
      fetchUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedConversation, fetchConversations, fetchUnreadCount]);

  // Back to list on mobile
  const handleBack = () => {
    setSelectedConversation(null);
    setMessages([]);
  };

  const getChannelLabel = (channel) => {
    const filter = CHANNEL_FILTERS(t).find(f => f.value === channel);
    return filter ? t(filter.label) : channel;
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-gray-100">
      {/* Left panel - Conversation list */}
      <div
        className={`w-full md:w-96 lg:w-[420px] bg-white border-r border-gray-200 flex flex-col ${
          selectedConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">{t('inbox.title')}</h1>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {unreadCount} {t('inbox.unread')}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <HiOutlineSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('inbox.searchConversations')}
              value={filters.search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Channel filter */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CHANNEL_FILTERS(t).map((filter) => (
              <button
                key={filter.value}
                onClick={() => setFilters(prev => ({ ...prev, channel: filter.value }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  filters.channel === filter.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t(filter.label)}
              </button>
            ))}
          </div>
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
          />
        </div>
      </div>

      {/* Right panel - Message thread */}
      <div
        className={`flex-1 flex flex-col bg-white ${
          selectedConversation ? 'flex' : 'hidden md:flex'
        }`}
      >
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
              <button
                onClick={handleBack}
                className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-700"
              >
                <HiArrowLeft className="w-5 h-5" />
              </button>

              <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white font-medium">
                {selectedConversation.visitorName?.[0]?.toUpperCase() || '?'}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">
                  {selectedConversation.visitorName || t('inbox.anonymousCustomer')}
                </h2>
                <p className="text-sm text-gray-500">
                  {getChannelLabel(selectedConversation.channel)}
                </p>
              </div>
            </div>

            {/* Messages */}
            <MessageThread messages={messages} isLoading={isLoadingMessages} />

            {/* Reply input */}
            <ReplyInput
              onSend={handleSendMessage}
              disabled={isSending}
              placeholder={t('inbox.typeMessage')}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-6xl mb-4">📬</div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                {t('inbox.selectConversation')}
              </h2>
              <p className="text-gray-500">
                {t('inbox.noConversations')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxPage;
