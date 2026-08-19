import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  HiArrowLeft, HiOutlineSearch, HiOutlineBell,
  HiOutlineInformationCircle, HiOutlineRefresh, HiOutlineExclamation,
  HiOutlineMail, HiOutlineInbox, HiOutlineSparkles, HiX
} from 'react-icons/hi';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import ConversationList from '../../features/inbox/ConversationList';
import ConversationFilters from '../../features/inbox/ConversationFilters';
import MessageThread from '../../features/inbox/MessageThread';
import ReplyInput from '../../features/inbox/ReplyInput';
import ZaloAccountSelector from '../../features/inbox/ZaloAccountSelector';
import TypingIndicator from '../../features/inbox/TypingIndicator';
import ConversationDetails from '../../features/inbox/ConversationDetails';
import AiActivityReport from '../../features/inbox/AiActivityReport';
import { useI18n } from '../../i18n';
import toast from 'react-hot-toast';
import useInboxSSE from '../../hooks/useInboxSSE';
import useDesktopNotifications from '../../hooks/useDesktopNotifications';
import useIsMobile from '../../hooks/useIsMobile';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { getMessagePreviewText } from '../../features/inbox/utils/normalizeMessageContent';

const getConversationKey = (conv) => (conv ? `${conv.type || ''}:${conv.id}` : '');

/** Single source of truth for "is this a Zalo group conversation" — used by both
 * the channel label and the AI auto-reply toggle so they never disagree. */
const isGroupConversation = (conversation) => {
  if (!conversation) return false;
  const visitorInfo = conversation.visitorInfo || conversation.visitor_info || {};
  const parsedVisitorInfo = typeof visitorInfo === 'string' ? JSON.parse(visitorInfo || '{}') : visitorInfo;
  return (
    conversation.isGroup === true ||
    parsedVisitorInfo?.is_group === true ||
    parsedVisitorInfo?.isGroup === true ||
    parsedVisitorInfo?.source === 'zalo_group'
  );
};

const extractPauseState = (res) => {
  const payload = res?.data ?? res ?? {};
  return {
    aiPaused: payload.aiPaused === true,
    aiPausedAt: payload.aiPausedAt ?? null,
    // Server always sends ISO or null; undefined only from optimistic socket.
    aiResumeAt: Object.prototype.hasOwnProperty.call(payload, 'aiResumeAt')
      ? payload.aiResumeAt
      : null,
  };
};

/** Apply BE pause fields from SSE when present; never guess aiPaused:true. */
const pausePatchFromSse = (data, existing) => {
  if (!data || typeof data !== 'object') return {};
  const hasPauseFields = Object.prototype.hasOwnProperty.call(data, 'aiPaused')
    || Object.prototype.hasOwnProperty.call(data, 'aiPausedAt')
    || Object.prototype.hasOwnProperty.call(data, 'aiResumeAt');
  if (!hasPauseFields) return {};
  // Manual pause (aiPaused && !aiPausedAt) must not become countdown.
  if (existing?.aiPaused && !existing?.aiPausedAt) return {};
  return {
    aiPaused: data.aiPaused === true,
    aiPausedAt: data.aiPausedAt ?? null,
    aiResumeAt: Object.prototype.hasOwnProperty.call(data, 'aiResumeAt')
      ? data.aiResumeAt
      : null,
  };
};

const formatCountdown = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

/** Header subtitle for AI pause: manual / countdown / auto-off / pending */
const AiPauseStatusText = ({ conversation, t }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!conversation?.aiPaused || typeof conversation.aiResumeAt !== 'string') {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [conversation?.aiPaused, conversation?.aiResumeAt, conversation?.id, conversation?.type]);

  if (!conversation?.aiPaused) return null;

  if (!conversation.aiPausedAt) {
    return <> · {t('inbox.aiManualOff')}</>;
  }
  if (conversation.aiResumeAt === undefined) {
    return <> · {t('inbox.aiPausedPending')}</>;
  }
  if (conversation.aiResumeAt === null) {
    return <> · {t('inbox.aiAutoResumeOff')}</>;
  }

  const remaining = new Date(conversation.aiResumeAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return <> · {t('inbox.aiResumeOnNextMessage')}</>;
  }
  return <> · {t('inbox.aiCountdown', { time: formatCountdown(remaining) })}</>;
};

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
  const [retryingMessageId, setRetryingMessageId] = useState(null);
  const [isSyncingThread, setIsSyncingThread] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingSender, setTypingSender] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'ai_report'
  
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
    if (messageType === 'image' || messageType === 'photo') return t('inbox.messageImage');
    if (messageType === 'sticker') return t('inbox.messageSticker');
    if (messageType === 'file' || messageType === 'doc') return t('inbox.messageFile');
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
      
      if (selectedAccountId) {
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
      const existingIndex = prev.findIndex(c => Number(c.id) === Number(data.conversationId));
      
      if (existingIndex !== -1) {
        const existing = prev[existingIndex];
        const updated = {
          ...existing,
          lastMessage: displayMessage,
          lastMessageAt: data.timestamp || new Date().toISOString(),
          last_message_at: data.timestamp || new Date().toISOString(),
          unreadCount: (selectedConversation && Number(selectedConversation.id) === Number(data.conversationId))
            ? 0
            : (existing.unreadCount || 0) + 1,
          // isSelf: chỉ áp pause thật từ BE (aiPaused/aiPausedAt/aiResumeAt), không đoán.
          ...(data.isSelf === true ? pausePatchFromSse(data, existing) : {}),
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
          unreadCount: (selectedConversation && Number(selectedConversation.id) === Number(data.conversationId)) ? 0 : 1,
          isGroup: data.isGroup || false,
          groupName: data.groupName || null,
          senderId: data.senderId,
          ...(data.isSelf === true ? pausePatchFromSse(data, null) : {}),
        };
        return [newConv, ...prev];
      }
    });

    if (data.isSelf === true) {
      setSelectedConversation((prev) => {
        if (!prev || Number(prev.id) !== Number(data.conversationId)) return prev;
        const patch = pausePatchFromSse(data, prev);
        if (!Object.keys(patch).length) return prev;
        return { ...prev, ...patch };
      });
    }
    if (document.hidden && displayMessage) {
      showNotification(t('inbox.newMessage'), {
        body: `${data.senderName || t('inbox.customer')}: ${displayMessage.substring(0, 100)}`,
        tag: `conv-${data.conversationId}`,
      });
    } else if (!document.hidden && displayMessage && (
      !selectedConversation || Number(data.conversationId) !== Number(selectedConversation.id)
    )) {
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
    
    const isThisConversation = selectedConversation
      && Number(data.conversationId) === Number(selectedConversation.id);
    
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

  const { status: sseStatus, retry: retrySse } = useInboxSSE(handleNewMessage, handleUnreadChange);

  const handleSendMessage = useCallback(async (content, replyTo, files = []) => {
    if (!selectedConversation || isSending) return;
    setIsSending(true);
    try {
      let attachments = [];
      if (Array.isArray(files) && files.length > 0) {
        const uploaded = await Promise.all(
          files.map((item) => chatbotApi.uploadInboxAttachment(
            selectedConversation.id,
            item?.file || item
          ))
        );
        attachments = uploaded
          .map((u) => u?.data)
          .filter(Boolean);
      }

      const response = await chatbotApi.sendMessage(selectedConversation.id, {
        type: selectedConversation.type,
        content,
        attachments,
        replyTo: replyTo ? {
          id: replyTo.id,
          content: replyTo.content,
          role: replyTo.role,
        } : undefined,
      });

      if (response.success) {
        const sendStatus = response.sendStatus || 'sent';
        const newMessage = {
          id: response.messageId || Date.now(),
          role: 'agent',
          content,
          attachments,
          createdAt: new Date().toISOString(),
          isRead: true,
          replyTo,
          metadata: {
            source: 'manual_inbox',
            send: sendStatus === 'failed'
              ? {
                  status: 'failed',
                  error: response.error || t('inbox.sendFailed'),
                  attempts: 1,
                  failedAt: new Date().toISOString(),
                }
              : { status: 'sent', attempts: 1 },
          },
        };
        setMessages(prev => [...prev, newMessage]);
        setReplyingTo(null);
        // Apply pause state from sendMessage response (PR1 returns aiPausedAt/aiResumeAt).
        const pauseState = extractPauseState(response);
        setSelectedConversation((prev) => (prev ? { ...prev, ...pauseState } : prev));
        // Cập nhật danh sách: đổi preview tin cuối + đẩy hội thoại lên đầu (khớp
        // cách xử lý tin ĐẾN qua SSE :325-344). Trước đây chỉ .map pauseState nên
        // tin BẠN gửi không hiện ở preview và hội thoại không nhảy lên đầu.
        const sentPreview = content?.trim()
          ? content.trim()
          : (attachments?.length ? t('inbox.messageFile') : '');
        const sentAt = newMessage.createdAt;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => (
            c.id === selectedConversation.id && c.type === selectedConversation.type
          ));
          if (idx === -1) return prev;
          const updated = {
            ...prev[idx],
            ...pauseState,
            lastMessage: sentPreview,
            lastMessageAt: sentAt,
          };
          return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
        });
        if (sendStatus === 'failed') {
          toast.error(response.error || t('inbox.sendFailed'));
        } else {
          toast.success(t('inbox.sentAiPausedHint') || t('common.success'));
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      const serverMessage = err.response?.data?.message;
      toast.error(serverMessage || t('errors.sendFailed'));
    } finally {
      setIsSending(false);
    }
  }, [selectedConversation, isSending, t]);

  const handleRetryMessage = useCallback(async (message) => {
    if (!selectedConversation || !message?.id || retryingMessageId) return;
    setRetryingMessageId(message.id);
    try {
      const response = await chatbotApi.retryMessage(message.id, {
        type: selectedConversation.type,
      });
      if (response.success) {
        setMessages((prev) => prev.map((m) => {
          if (Number(m.id) !== Number(message.id)) return m;
          const prevMeta = typeof m.metadata === 'string'
            ? JSON.parse(m.metadata || '{}')
            : (m.metadata || {});
          return {
            ...m,
            metadata: response.metadata || {
              ...prevMeta,
              send: {
                ...(prevMeta.send || {}),
                status: response.sendStatus,
                error: response.error || null,
              },
            },
          };
        }));
        if (response.sendStatus === 'failed') {
          toast.error(response.error || t('inbox.retryFailed'));
        } else {
          toast.success(t('inbox.retrySuccess'));
        }
      }
    } catch (err) {
      console.error('Failed to retry message:', err);
      toast.error(err.response?.data?.message || t('inbox.retryFailed'));
    } finally {
      setRetryingMessageId(null);
    }
  }, [selectedConversation, retryingMessageId, t]);

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

  const handleOpenConversationFromReport = useCallback((convId) => {
    setActiveView('chat');
    const found = conversations.find((c) => Number(c.id) === Number(convId));
    if (found) {
      handleSelectConversation(found);
    } else {
      handleSelectConversation({
        id: convId,
        type: 'zalo_personal',
        visitorName: 'Khách hàng',
        unreadCount: 0,
      });
    }
  }, [conversations, handleSelectConversation]);

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

  const getChannelLabel = (channel, conversation = null) => {
    if (isGroupConversation(conversation)) {
      return t('inbox.zaloGroup') || 'Zalo Nhóm';
    }

    const channelMap = {
      web: 'Web Chat',
      zalo_oa: 'Zalo OA',
      facebook: 'Facebook',
      zalo_personal: 'Zalo Cá nhân',
    };
    return channelMap[channel] || channel || '';
  };

  return (
    <div className="h-full min-h-0 flex overflow-hidden overscroll-none bg-gray-100">
      {/* Left Sidebar */}
      <div
        className={`h-full min-h-0 bg-white flex flex-col flex-shrink-0 overflow-hidden border-r border-gray-200 ${
          !isResizing && 'transition-all duration-200'
        } ${(selectedConversation || activeView === 'ai_report') ? 'hidden lg:flex' : 'flex w-full lg:w-auto'}`}
        style={{ width: isMobile && !selectedConversation && activeView !== 'ai_report' ? '100%' : `${sidebarWidth}px` }}
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

          {/* View Toggle Tabs: Chat vs AI Report */}
          <div className="flex items-center gap-1 p-1 bg-gray-100/90 rounded-xl mx-3 mb-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeView === 'chat'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineInbox className="w-4 h-4" />
              <span>{t('inbox.title') || 'Hộp thư'}</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('ai_report')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeView === 'ai_report'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineSparkles className="w-4 h-4 text-indigo-500" />
              <span>Báo cáo AI</span>
            </button>
          </div>

          {!sessionStatus.connected && sessionStatus.accounts?.length > 0 && (
            <div className="mx-3 mb-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 shadow-sm">
              <HiOutlineExclamation className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-rose-800 leading-tight">
                  Tài khoản Zalo mất kết nối — Bot tạm dừng nhận tin!
                </p>
                <p className="text-[10px] text-rose-600 mt-0.5 leading-tight">
                  {t('inbox.sessionExpired')} — Vui lòng quét lại mã QR tại Cài đặt kênh.
                </p>
              </div>
            </div>
          )}

          {sseStatus === 'disconnected' && (
            <div className="mx-3 mb-2 px-2 py-1.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
              <HiOutlineExclamation className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <p className="text-[11px] text-rose-800 leading-tight flex-1">
                {t('inbox.sseDisconnected')}
              </p>
              <button
                type="button"
                onClick={retrySse}
                className="shrink-0 text-[11px] font-semibold text-rose-700 underline"
              >
                {t('inbox.sseRetry')}
              </button>
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
                refreshTrigger={sessionStatus.connected}
                onSyncComplete={() => {
                  fetchSessionStatus();
                  fetchConversations(true);
                  if (selectedConversationRef.current) {
                    fetchMessages(selectedConversationRef.current);
                  }
                }}
              />
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 min-h-0 overflow-hidden bg-white">
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
        className={`h-full min-h-0 flex-1 min-w-0 overflow-hidden bg-gray-50 ${
          (selectedConversation || activeView === 'ai_report')
            ? (activeView === 'ai_report' ? 'flex flex-col' : 'grid grid-rows-[auto,minmax(0,1fr),auto]')
            : 'hidden lg:flex lg:flex-col'
        }`}
      >
        {activeView === 'ai_report' ? (
          <AiActivityReport
            selectedAccountId={selectedAccountId}
            onSelectConversation={handleOpenConversationFromReport}
          />
        ) : selectedConversation ? (
          <>
            {/* Message header */}
            <div className="shrink-0 px-5 py-4 bg-white border-b border-gray-200 flex items-center gap-4 shadow-sm">
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
                  {getChannelLabel(selectedConversation.channel, selectedConversation)}
                  <AiPauseStatusText conversation={selectedConversation} t={t} />
                  {selectedConversation.channelDisplayName && (
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {selectedConversation.channelDisplayName}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm text-right leading-tight ${
                    selectedConversation.chatbotEnabled === false || isGroupConversation(selectedConversation)
                      ? 'text-gray-400'
                      : 'text-gray-700'
                  }`}>
                    {t('inbox.aiToggleLabel')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={selectedConversation.chatbotEnabled !== false && !isGroupConversation(selectedConversation) && !selectedConversation.aiPaused}
                    disabled={selectedConversation.chatbotEnabled === false || isGroupConversation(selectedConversation)}
                    onClick={async () => {
                      if (selectedConversation.chatbotEnabled === false || isGroupConversation(selectedConversation)) return;
                      try {
                        const nextPaused = !selectedConversation.aiPaused;
                        const apiRes = await chatbotApi.setConversationAiPaused(
                          selectedConversation.id,
                          selectedConversation.type || 'zalo_personal',
                          nextPaused
                        );
                        const pauseState = extractPauseState(apiRes);
                        setSelectedConversation((prev) => (prev ? { ...prev, ...pauseState } : prev));
                        setConversations((prev) => prev.map((c) =>
                          c.id === selectedConversation.id && c.type === selectedConversation.type
                            ? { ...c, ...pauseState }
                            : c
                        ));
                      } catch (err) {
                        toast.error(err?.response?.data?.message || err.message);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                      selectedConversation.chatbotEnabled !== false && !isGroupConversation(selectedConversation) && !selectedConversation.aiPaused
                        ? 'bg-primary-600'
                        : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        selectedConversation.chatbotEnabled !== false && !isGroupConversation(selectedConversation) && !selectedConversation.aiPaused
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                  {selectedConversation.chatbotEnabled === false ? (
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-[11px] text-amber-700 text-right leading-snug max-w-[220px]">
                        {selectedConversation.chatbotDisabledReason === 'account_disconnected'
                          ? t('inbox.aiDisabledAccountDisconnected', { name: selectedConversation.channelDisplayName || '' })
                          : selectedConversation.chatbotDisabledReason === 'chatbot_off'
                          ? t('inbox.aiDisabledChatbotOff', { name: selectedConversation.channelDisplayName || '' })
                          : t('inbox.aiDisabledNoAccount')}
                      </p>
                      {selectedConversation.chatbotDisabledReason === 'account_disconnected' ? (
                        <button
                          type="button"
                          className="text-[11px] text-amber-700 underline font-medium"
                          onClick={() => window.open('/app/settings/channels', '_blank')}
                        >
                          {t('inbox.btnReconnect')}
                        </button>
                      ) : selectedConversation.chatbotDisabledReason === 'chatbot_off' ? (
                        <button
                          type="button"
                          className="text-[11px] text-amber-700 underline font-medium"
                          onClick={() => window.open('/app/chatbot-studio', '_blank')}
                        >
                          {t('inbox.openDeployModal')}
                        </button>
                      ) : null}
                    </div>
                  ) : isGroupConversation(selectedConversation) ? (
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-[11px] text-amber-700 text-right leading-snug max-w-[220px]">
                        {t('inbox.aiGroupUnsupported')}
                      </p>
                    </div>
                  ) : selectedConversation.aiPaused ? (
                    <p className="text-[11px] text-gray-500 text-right leading-snug max-w-[220px]">
                      {!selectedConversation.aiPausedAt
                        ? t('inbox.aiManualOff')
                        : selectedConversation.aiResumeAt === null
                          ? t('inbox.aiAutoResumeOff')
                          : t('inbox.aiToggleManualHint')}
                    </p>
                  ) : null}
              </div>

              <button
                type="button"
                disabled={isSyncingThread}
                onClick={async () => {
                  const conv = selectedConversation;
                  if (!conv) return;
                  const channel = conv.channel || conv.type;
                  const visitorInfo = conv.visitorInfo || conv.visitor_info || {};
                  const parsed = typeof visitorInfo === 'string'
                    ? (() => { try { return JSON.parse(visitorInfo || '{}'); } catch { return {}; } })()
                    : visitorInfo;
                  const isZalo = channel === 'zalo_personal';
                  const isGroup = conv.isGroup === true
                    || parsed.is_group === true
                    || String(conv.externalId || '').startsWith('group_')
                    || String(conv.externalId || '').startsWith('g_');

                  if (isZalo && conv.externalId) {
                    setIsSyncingThread(true);
                    try {
                      const response = await chatbotApi.syncZaloChatHistory(conv.externalId, isGroup, {
                        limit: 50,
                        accountId: selectedAccountId || conv.idZaloSetting,
                      });
                      const payload = response?.data || response;
                      if (payload?.success === false) {
                        toast.error(payload?.message || t('inbox.syncFailed'));
                      } else if (!isGroup) {
                        toast(
                          payload?.data?.message
                            || t('inbox.syncPersonalNoHistory')
                            || 'Chat 1-1 không kéo lịch sử được. Đã làm mới kết nối — nhờ đối phương nhắn tin mới.',
                          { icon: 'ℹ️', duration: 6000 }
                        );
                      } else {
                        const synced = Number(payload?.data?.synced || 0);
                        toast.success(
                          synced > 0
                            ? (t('inbox.syncThreadPulled', { count: synced }) || `Đã kéo ${synced} tin từ Zalo`)
                            : (t('inbox.syncThreadEmpty') || 'Không có tin mới từ Zalo')
                        );
                      }
                    } catch (err) {
                      toast.error(err?.response?.data?.message || err.message || t('inbox.syncFailed'));
                    } finally {
                      setIsSyncingThread(false);
                    }
                  }

                  await fetchMessages(conv);
                  fetchConversations(true);
                }}
                className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                title={t('inbox.syncNow') || 'Đồng bộ'}
              >
                <HiOutlineRefresh className={`w-5 h-5 ${isSyncingThread ? 'animate-spin' : ''}`} />
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
            <div className="min-h-0 min-w-0 overflow-hidden">
              <MessageThread 
                messages={messages} 
                isLoading={isLoadingMessages}
                conversation={selectedConversation}
                onReply={handleReply}
                onRetry={handleRetryMessage}
                retryingMessageId={retryingMessageId}
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
                {conversations.length === 0
                  ? (t('inbox.emptyInboxHint') || t('inbox.noConversations'))
                  : t('inbox.noConversations')}
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
