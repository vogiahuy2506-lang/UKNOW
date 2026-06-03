import { useState, useEffect, useCallback } from 'react';
import { HiArrowLeft, HiOutlineSearch, HiOutlineFilter } from 'react-icons/hi';
import chatbotApi from '../../services/chatbotApi';
import ConversationList from '../../features/inbox/ConversationList';
import MessageThread from '../../features/inbox/MessageThread';
import ReplyInput from '../../features/inbox/ReplyInput';
import OutboxList from '../../features/inbox/OutboxList';
import OutboxDetail from '../../features/inbox/OutboxDetail';
import { useI18n } from '../../i18n';
import toast from 'react-hot-toast';

const CHANNEL_FILTERS = (t) => [
  { value: '', label: t('inbox.allChannels') },
  { value: 'web', label: 'Web Chat' },
  { value: 'zalo_oa', label: 'Zalo OA' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'zalo_personal', label: 'Zalo Cá nhân' },
];

const InboxOutboxPage = ({ defaultTab = 'inbox' }) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(defaultTab);

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

  // Outbox state
  const [outboxMessages, setOutboxMessages] = useState([]);
  const [selectedOutboxMessage, setSelectedOutboxMessage] = useState(null);
  const [isLoadingOutbox, setIsLoadingOutbox] = useState(true);
  const [outboxPage, setOutboxPage] = useState(0);
  const [outboxHasMore, setOutboxHasMore] = useState(true);
  const [outboxStats, setOutboxStats] = useState({});

  // Shared filters
  const [filters, setFilters] = useState({
    channel: '',
    search: '',
    startDate: '',
    endDate: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  // Keyboard shortcuts - must be after all state declarations
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setActiveTab('inbox');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        setActiveTab('outbox');
      }
      if (e.key === 'Escape') {
        if (selectedConversation || selectedOutboxMessage) {
          setSelectedConversation(null);
          setSelectedOutboxMessage(null);
          setMessages([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConversation, selectedOutboxMessage]);

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

  // Fetch outbox messages
  const fetchOutboxMessages = useCallback(async (reset = false) => {
    try {
      if (reset) {
        setIsLoadingOutbox(true);
        setOutboxPage(0);
      }

      const currentPage = reset ? 0 : outboxPage;
      const response = await chatbotApi.getOutboxMessages({
        channel: filters.channel,
        search: filters.search,
        startDate: filters.startDate,
        endDate: filters.endDate,
        offset: currentPage * 20,
        limit: 20,
      });

      if (response.success) {
        const newMessages = reset
          ? response.data.messages
          : [...outboxMessages, ...response.data.messages];

        setOutboxMessages(newMessages);
        setOutboxHasMore(newMessages.length < response.data.total);
        setOutboxStats(response.data.statsByChannel || {});
        setOutboxPage(currentPage + 1);
      }
    } catch (err) {
      console.error('Failed to fetch outbox messages:', err);
      toast.error(t('errors.loadFailed'));
    } finally {
      setIsLoadingOutbox(false);
    }
  }, [filters, outboxPage, outboxMessages, t]);

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
    setSelectedOutboxMessage(null);
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

  // Handle outbox message selection
  const handleSelectOutboxMessage = useCallback((msg) => {
    setSelectedOutboxMessage(msg);
    setSelectedConversation(null);
  }, []);

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
    if (activeTab === 'inbox') {
      if (!isLoadingConversations && hasMore) {
        fetchConversations(false);
      }
    } else {
      if (!isLoadingOutbox && outboxHasMore) {
        fetchOutboxMessages(false);
      }
    }
  }, [activeTab, isLoadingConversations, hasMore, isLoadingOutbox, outboxHasMore, fetchConversations, fetchOutboxMessages]);

  // Handle search
  const handleSearch = useCallback((value) => {
    setFilters(prev => ({ ...prev, search: value }));
  }, []);

  // Handle filter change
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Reset data when tab changes
  useEffect(() => {
    setSelectedConversation(null);
    setSelectedOutboxMessage(null);
    setMessages([]);
    setFilters({ channel: '', search: '', startDate: '', endDate: '' });
  }, [activeTab]);

  // Initial load and filter changes
  useEffect(() => {
    if (activeTab === 'inbox') {
      fetchConversations(true);
      fetchUnreadCount();
    } else {
      fetchOutboxMessages(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.channel, filters.search, filters.startDate, filters.endDate, activeTab]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'inbox' && !selectedConversation) {
        fetchConversations(true);
      }
      if (activeTab === 'outbox' && !selectedOutboxMessage) {
        fetchOutboxMessages(true);
      }
      fetchUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [activeTab, selectedConversation, selectedOutboxMessage, fetchConversations, fetchOutboxMessages, fetchUnreadCount]);

  // Back to list on mobile
  const handleBack = () => {
    setSelectedConversation(null);
    setSelectedOutboxMessage(null);
    setMessages([]);
  };

  const getChannelLabel = (channel) => {
    const filter = CHANNEL_FILTERS(t).find(f => f.value === channel);
    return filter ? t(filter.label) : channel;
  };

  const getTotalSent = () => {
    return Object.values(outboxStats).reduce((sum, stat) => sum + stat.totalSent, 0);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-gray-100">
      {/* Left panel - Tab and list */}
      <div
        className={`w-full md:w-96 lg:w-[420px] bg-white border-r border-gray-200 flex flex-col ${
          (activeTab === 'inbox' && selectedConversation) || (activeTab === 'outbox' && selectedOutboxMessage)
            ? 'hidden md:flex'
            : 'flex'
        }`}
      >
        {/* Header with tabs */}
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">{t('inbox.title')}</h1>
            <div className="flex items-center gap-2">
              {activeTab === 'inbox' && unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {unreadCount} {t('inbox.unread')}
                </span>
              )}
              {activeTab === 'outbox' && getTotalSent() > 0 && (
                <span className="bg-primary-500 text-white text-xs px-2 py-1 rounded-full">
                  {getTotalSent()} {t('outbox.sent')}
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('inbox')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'inbox'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📥 {t('outbox.inbox')}
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('outbox')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'outbox'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📤 {t('outbox.outbox')}
            </button>
          </div>

          {/* Quick date filters (for outbox) */}
          {activeTab === 'outbox' && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              <button
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  handleFilterChange('startDate', today);
                  handleFilterChange('endDate', today);
                }}
                className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                {t('outbox.today')}
              </button>
              <button
                onClick={() => {
                  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                  handleFilterChange('startDate', yesterday);
                  handleFilterChange('endDate', yesterday);
                }}
                className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                {t('outbox.yesterday')}
              </button>
              <button
                onClick={() => {
                  const week = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
                  handleFilterChange('startDate', week);
                  handleFilterChange('endDate', '');
                }}
                className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                {t('outbox.last7days')}
              </button>
              <button
                onClick={() => {
                  const month = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
                  handleFilterChange('startDate', month);
                  handleFilterChange('endDate', '');
                }}
                className="px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                {t('outbox.last30days')}
              </button>
            </div>
          )}

          {/* Search */}
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <HiOutlineSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={activeTab === 'inbox' ? t('inbox.searchConversations') : t('outbox.searchSent')}
                value={filters.search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2.5 rounded-xl border transition-colors ${
                showFilters || filters.startDate || filters.endDate
                  ? 'bg-primary-50 border-primary-200 text-primary-600'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700'
              }`}
              title={t('outbox.filters')}
            >
              <HiOutlineFilter className="w-5 h-5" />
            </button>
          </div>

          {/* Advanced filters */}
          {showFilters && (
            <div className="mt-3 p-3 bg-gray-50 rounded-xl space-y-3">
              {/* Channel filter */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('outbox.channel')}</label>
                <select
                  value={filters.channel}
                  onChange={(e) => handleFilterChange('channel', e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {CHANNEL_FILTERS(t).map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {t(filter.label)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t('outbox.dateRange')}</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder={t('outbox.startDate')}
                  />
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder={t('outbox.endDate')}
                  />
                </div>
              </div>

              {/* Clear filters */}
              {(filters.startDate || filters.endDate) && (
                <button
                  onClick={() => {
                    handleFilterChange('startDate', '');
                    handleFilterChange('endDate', '');
                  }}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  {t('outbox.clearFilters')}
                </button>
              )}
            </div>
          )}

          {/* Channel filter pills (mobile) */}
          {activeTab === 'inbox' && !showFilters && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {CHANNEL_FILTERS(t).map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => handleFilterChange('channel', filter.value)}
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
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'inbox' ? (
            <ConversationList
              conversations={conversations}
              isLoading={isLoadingConversations}
              selectedId={selectedConversation ? `${selectedConversation.type}-${selectedConversation.id}` : null}
              onSelect={handleSelectConversation}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
            />
          ) : (
            <>
              <OutboxList
                messages={outboxMessages}
                isLoading={isLoadingOutbox}
                selectedId={selectedOutboxMessage?.id}
                onSelect={handleSelectOutboxMessage}
                onLoadMore={handleLoadMore}
                hasMore={outboxHasMore}
              />
              {/* Stats summary */}
              {Object.keys(outboxStats).length > 0 && (
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <h3 className="text-xs font-medium text-gray-500 mb-2">{t('outbox.statsByChannel')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(outboxStats).map(([channel, stats]) => {
                      const channelInfo = CHANNEL_FILTERS(t).find(f => f.value === channel);
                      return (
                        <div key={channel} className="bg-white rounded-lg p-2 border border-gray-200">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs">{channelInfo?.label || channel}</span>
                          </div>
                          <div className="text-lg font-semibold text-gray-900">
                            {stats.totalSent}
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{stats.totalRead} {t('outbox.read')}</span>
                            <span className="font-medium text-primary-600">{stats.readRate}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right panel - Detail view */}
      <div
        className={`flex-1 flex flex-col bg-white ${
          (activeTab === 'inbox' && selectedConversation) || (activeTab === 'outbox' && selectedOutboxMessage)
            ? 'flex'
            : 'hidden md:flex'
        }`}
      >
        {activeTab === 'inbox' && selectedConversation ? (
          <>
            {/* Inbox message thread */}
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

            <MessageThread messages={messages} isLoading={isLoadingMessages} />

            <ReplyInput
              onSend={handleSendMessage}
              disabled={isSending}
              placeholder={t('inbox.typeMessage')}
            />
          </>
        ) : activeTab === 'outbox' && selectedOutboxMessage ? (
          <OutboxDetail
            message={selectedOutboxMessage}
            onBack={handleBack}
            onReply={(msg) => {
              // Navigate to inbox with this conversation
              setActiveTab('inbox');
              const conv = conversations.find(c => c.id === msg.conversationId);
              if (conv) {
                handleSelectConversation(conv);
              } else {
                toast.info(t('outbox.openConversationFromInbox'));
              }
            }}
          />
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-6xl mb-4">
                {activeTab === 'inbox' ? '📬' : '📤'}
              </div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                {activeTab === 'inbox' ? t('inbox.selectConversation') : t('outbox.selectMessage')}
              </h2>
              <p className="text-gray-500">
                {activeTab === 'inbox' ? t('inbox.noConversations') : t('outbox.noMessages')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InboxOutboxPage;
