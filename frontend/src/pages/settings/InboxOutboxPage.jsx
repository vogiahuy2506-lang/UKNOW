import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  HiArrowLeft, HiOutlineSearch, HiOutlineBell,
  HiOutlineInformationCircle, HiOutlineRefresh, HiOutlineExclamation,
  HiOutlineMail, HiOutlineInbox, HiOutlineSparkles, HiOutlinePhone, HiX
} from 'react-icons/hi';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import ConversationList from '../../features/inbox/ConversationList';
import ConversationFilters from '../../features/inbox/ConversationFilters';
import MessageThread from '../../features/inbox/MessageThread';
import ReplyInput from '../../features/inbox/ReplyInput';
import { channelSupportsInboxAttachments } from '../../features/inbox/utils/channelInfo';
import ZaloAccountSelector from '../../features/inbox/ZaloAccountSelector';
import TypingIndicator from '../../features/inbox/TypingIndicator';
import ConversationDetails from '../../features/inbox/ConversationDetails';
import AiActivityReport from '../../features/inbox/AiActivityReport';
import ContactAlertsPanel from '../../features/inbox/ContactAlertsPanel';
import ConfirmModal from '../../features/inbox/ConfirmModal';
import { useI18n } from '../../i18n';
import toast from 'react-hot-toast';
import useInboxSSE from '../../hooks/useInboxSSE';
import useDesktopNotifications from '../../hooks/useDesktopNotifications';
import useIsMobile from '../../hooks/useIsMobile';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';
import { getConversationPreview } from '../../features/inbox/utils/conversationPreview';
import { useAuthStore } from '../../stores/authStore';

const getConversationKey = (conv) => (conv ? `${conv.type || ''}:${conv.id}` : '');

/** Lựa chọn tài khoản Zalo đã nhớ theo user (cùng khoá ô chọn tài khoản dùng trước đây). 'all' / không có = mọi tài khoản. */
const accountPreferenceKey = (userId) => `uknow.inbox.zaloAccountId.${userId || 'anon'}`;
const readSavedAccountId = (userId) => {
  try {
    const value = localStorage.getItem(accountPreferenceKey(userId));
    return value && value !== 'all' ? value : null;
  } catch {
    return null;
  }
};
const saveAccountPreference = (userId, accountId) => {
  try {
    localStorage.setItem(accountPreferenceKey(userId), accountId == null ? 'all' : String(accountId));
  } catch {
    // ignore quota / private mode
  }
};

const SEARCH_DEBOUNCE_MS = 300;

/** Loại hội thoại của một sự kiện SSE. Sự kiện AI trả lời Zalo không có `type`, chỉ có `channel` → suy ra. */
const getSseConversationType = (data) => {
  if (data.type) return data.type;
  if (data.conversationType) return data.conversationType;
  if (data.channel === 'web') return 'webchat';
  return 'zalo_personal';
};
const getSseConversationKey = (data) => `${getSseConversationType(data)}:${data.conversationId}`;

/** Id tin lớn hơn mốc này là id đặt tạm bằng Date.now() (tin vừa gửi chưa có id server), không dùng làm mốc phân trang. */
const MAX_SERVER_MESSAGE_ID = 1_000_000_000_000;
/** Id tin SERVER cũ nhất đang hiện. Id BIGINT từ API là CHUỖI ('123'); bỏ tin tạm `temp-…` và id đặt tạm. */
const getOldestLoadedMessageId = (list) => {
  for (const message of list || []) {
    const id = Number(message.id);
    if (Number.isInteger(id) && id > 0 && id < MAX_SERVER_MESSAGE_ID) return id;
  }
  return null;
};

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
  const navigate = useNavigate();
  const activeContext = useAuthStore((state) => state.activeContext);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isEmployeeContext = activeContext?.type === 'employee';
  const permissions = activeContext?.permissions || {};
  const canReply = !isEmployeeContext || permissions.inbox_reply === true;
  const canManage = !isEmployeeContext || permissions.inbox_manage === true;
  const canManageChannels = !isEmployeeContext || permissions.chatbot_channels_manage === true;
  
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
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'ai_report' | 'contact_alerts'
  const [contactAlertsOpenCount, setContactAlertsOpenCount] = useState(0);
  const [searchParams] = useSearchParams();
  
  const [sessionStatus, setSessionStatus] = useState({
    connected: false,
    accounts: [],
    message: '',
  });
  const [sessionLoaded, setSessionLoaded] = useState(false);
  
  const [showDetails, setShowDetails] = useState(false);
  // Kênh user có trong Hộp thư (từ server) — chỉ hiện tab của các kênh đó (H-12).
  const [availableChannels, setAvailableChannels] = useState([]);
  const [confirmMarkAllRead, setConfirmMarkAllRead] = useState(false);
  const searchInputRef = useRef(null);
  
  const [pendingMessages, setPendingMessages] = useState({});
  const selectedConversationRef = useRef(null);
  const messagesRequestSeqRef = useRef(0);
  const pendingMessagesForFetchRef = useRef(null);
  // H-01: còn tin cũ hơn phần đã tải không (server trả hasMore) + đang tải trang cũ.
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const messagesRef = useRef([]);
  const listRequestSeqRef = useRef(0);
  // Hội thoại vừa mở có tin chưa đọc: đánh dấu đọc SAU khi tải xong khung đọc, và chỉ phần đã tải (H-01).
  const markReadAfterLoadRef = useRef(null);
  const markOpenReadTimerRef = useRef(null);
  const unreadRefreshTimerRef = useRef(null);
  const loadAvailableChannelsRef = useRef(null);

  const [filters, setFilters] = useState({
    channel: '',
    search: '',
    date: 'all',
    kind: '',
    unreadOnly: false,
  });
  // Ô tìm gõ tới đâu hiện tới đó (searchInput); chỉ SAU 300 ms yên lặng mới đưa vào bộ lọc để tải danh sách (H-07).
  const [searchInput, setSearchInput] = useState('');

  const isMobile = useIsMobile();
  const [sidebarWidth, setSidebarWidth] = useLocalStorageState('uknow_inbox_sidebar_width', 360);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(360);
  const messagePreviewLabels = useMemo(() => ({
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
  }), [t]);

  // Dòng xem trước cho tin đến qua SSE — cùng quy tắc với danh sách (ảnh → "[Hình ảnh]", không in URL thô).
  const getDisplayMessage = useCallback((message, messageType, extra = {}) => (
    getConversationPreview({
      content: message,
      messageType,
      rawType: extra.rawType,
      sender: extra.sender,
      isGroup: extra.isGroup,
      role: extra.role,
    }, messagePreviewLabels)
  ), [messagePreviewLabels]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => () => {
    clearTimeout(markOpenReadTimerRef.current);
    clearTimeout(unreadRefreshTimerRef.current);
  }, []);

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
        // H-07: chọn luôn tài khoản (đã nhớ, hoặc "tất cả") CÙNG LÚC với việc có trạng thái, để danh sách chỉ tải một lần
        // thay vì tải khi chưa biết tài khoản rồi tải lại khi ô chọn tự chọn.
        const accounts = Array.isArray(payload.data?.accounts) ? payload.data.accounts : [];
        setSelectedAccountId((prev) => {
          const wanted = prev ?? readSavedAccountId(currentUserId);
          return wanted != null && accounts.some((a) => String(a.id) === String(wanted)) ? wanted : null;
        });
        // Giao tài khoản Zalo cho nhân viên: danh sách này đã được server lọc theo tài khoản được giao. Tài khoản đã nhớ mà không
        // còn trong danh sách (chủ vừa gỡ giao, hoặc đổi sang không gian làm việc khác) thì bỏ hẳn khỏi bộ nhớ, không để lần
        // sau lại gửi một id mà người này không còn được dùng.
        const savedAccountId = readSavedAccountId(currentUserId);
        if (savedAccountId != null && !accounts.some((a) => String(a.id) === String(savedAccountId))) {
          saveAccountPreference(currentUserId, null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch session status:', err);
    } finally {
      setSessionLoaded(true);
    }
  }, [currentUserId]);

  const handleAccountChange = useCallback((accountId) => {
    setSelectedAccountId(accountId);
    saveAccountPreference(currentUserId, accountId);
  }, [currentUserId]);

  const fetchConversations = useCallback(async (reset = false) => {
    // H-07: số thứ tự yêu cầu — kết quả của yêu cầu cũ (chậm hơn) về sau KHÔNG được đè kết quả mới.
    const requestSeq = listRequestSeqRef.current + 1;
    listRequestSeqRef.current = requestSeq;
    try {
      if (reset) {
        setIsLoadingConversations(true);
        setPage(0);
      }

      const currentPage = reset ? 0 : page;
      const requestParams = {
        channel: filters.channel || undefined,
        search: filters.search || undefined,
        date: filters.date === 'all' ? undefined : filters.date,
        kind: filters.kind || undefined,
        unreadOnly: filters.unreadOnly ? true : undefined,
        offset: currentPage * 20,
        limit: 20,
      };

      if (selectedAccountId) {
        requestParams.zaloAccountId = selectedAccountId;
      }

      const response = await chatbotApi.getConversations(requestParams);
      if (requestSeq !== listRequestSeqRef.current) return;

      if (response.success) {
        let newConversations;
        if (reset) {
          newConversations = response.data.conversations;
        } else {
          // Trang kế: hội thoại có tin mới có thể đã nhảy lên đầu/xuống trang này → bỏ trùng theo loại + id.
          const known = new Set(conversations.map(getConversationKey));
          newConversations = [
            ...conversations,
            ...response.data.conversations.filter((c) => !known.has(getConversationKey(c))),
          ];
        }

        setConversations(newConversations);
        setHasMore(response.data.conversations.length > 0 && newConversations.length < response.data.total);
        setPage(currentPage + 1);
      }
    } catch (err) {
      if (requestSeq !== listRequestSeqRef.current) return;
      console.error('Failed to fetch conversations:', err);
      toast.error(t('errors.loadFailed'));
    } finally {
      if (requestSeq === listRequestSeqRef.current) {
        setIsLoadingConversations(false);
      }
    }
  }, [filters, page, conversations, selectedAccountId, t]);

  // C5: "Đánh dấu tất cả đã đọc" — theo đúng bộ lọc đang xem; chỉ chạy khi người dùng bấm, không tự đánh dấu tin cũ.
  const handleMarkAllRead = useCallback(async () => {
    setConfirmMarkAllRead(false);
    try {
      await chatbotApi.markAllAsRead({
        channel: filters.channel || undefined,
        zaloAccountId: selectedAccountId || undefined,
        search: filters.search || undefined,
        date: filters.date === 'all' ? undefined : filters.date,
        kind: filters.kind || undefined,
      });
      toast.success(t('inbox.markAllReadDone'));
      setSelectedConversation((prev) => (prev ? { ...prev, unreadCount: 0 } : prev));
      await fetchConversations(true);
      fetchUnreadCountRef.current();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      toast.error(err?.response?.data?.message || t('errors.loadFailed'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, selectedAccountId, t]);

  const fetchConversationsRef = useRef(null);
  fetchConversationsRef.current = fetchConversations;

  const handleFilterChange = useCallback((nextFilters) => {
    setFilters(nextFilters);
    setPage(0);
  }, []);

  const handleDeleteConversation = async (conv) => {
    try {
      const response = await chatbotApi.deleteConversation(conv.id, conv.type);
      const success = response?.success || response?.data?.success;
      if (success) {
        toast.success(t('common.deleted'));
        await fetchConversations(true);
        if (selectedConversation?.id === conv.id) {
          setSelectedConversation(null);
          setMessages([]);
        }
      } else {
        toast.error(t('errors.deleteFailed'));
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      toast.error(t('errors.deleteFailed'));
    }
  };

  // H-03: số HỘI THOẠI 1-1 có tin chưa đọc, đúng phạm vi đang xem (tab kênh + tài khoản Zalo), không tính nhóm.
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await chatbotApi.getUnreadCount({
        channel: filters.channel || undefined,
        zaloAccountId: selectedAccountId || undefined,
      });
      if (response.success) {
        setUnreadCount(response.data.total);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [filters.channel, selectedAccountId]);

  // Ref để các callback đánh dấu đọc không đổi danh tính mỗi khi đổi bộ lọc (fetchMessages phụ thuộc chúng — đổi
  // danh tính sẽ kích hoạt tải lại khung đọc đang mở).
  const fetchUnreadCountRef = useRef(fetchUnreadCount);
  fetchUnreadCountRef.current = fetchUnreadCount;

  // Gom nhiều tin đến liên tiếp thành MỘT lần hỏi lại số chưa đọc.
  const scheduleUnreadRefresh = useCallback(() => {
    clearTimeout(unreadRefreshTimerRef.current);
    unreadRefreshTimerRef.current = setTimeout(() => {
      fetchUnreadCount();
    }, 1000);
  }, [fetchUnreadCount]);

  const loadAvailableChannels = useCallback(async () => {
    try {
      const response = await chatbotApi.getInboxChannels();
      const channels = response?.data?.channels;
      if (response?.success && Array.isArray(channels)) setAvailableChannels(channels);
    } catch {
      // Lỗi tải danh sách kênh chỉ làm hàng tab kênh ẩn đi, không chặn Hộp thư.
    }
  }, []);
  loadAvailableChannelsRef.current = loadAvailableChannels;

  const fetchContactAlertsCount = useCallback(async () => {
    try {
      const res = await chatbotApi.getContactAlerts({ status: 'open', limit: 1 });
      const data = res?.data?.data ?? res?.data;
      if (data && typeof data.openCount === 'number') {
        setContactAlertsOpenCount(data.openCount);
      }
    } catch {
      // Bỏ qua lỗi im lặng (không toast)
    }
  }, []);

  // H-01: chỉ đánh dấu đọc phần khung đọc ĐÃ TẢI (từ tin cũ nhất đang hiện trở về sau). Tin cũ hơn chưa từng hiện ra
  // giữ nguyên "chưa đọc" — bản cũ đánh dấu hết, nên mở nhóm 117 tin chưa đọc là 67 tin bị nuốt mà không ai xem được.
  const markLoadedMessagesRead = useCallback(async (conv, loadedMessages) => {
    const fromMessageId = getOldestLoadedMessageId(loadedMessages);
    if (!conv || !fromMessageId) return;
    try {
      const response = await chatbotApi.markAsRead(conv.id, conv.type, { fromMessageId });
      const remaining = Number(response?.data?.remainingUnread);
      setConversations((prev) => prev.map((c) => (
        c.id === conv.id && c.type === conv.type
          ? { ...c, unreadCount: Number.isFinite(remaining) ? remaining : 0 }
          : c
      )));
      fetchUnreadCountRef.current();
    } catch (err) {
      console.error('Failed to mark as read:', err);
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
        const merged = mergeUniqueMessages(response.data || [], bufferedForTarget, true);
        setMessages(merged);
        setHasMoreOlderMessages(response.hasMore === true);

        if (markReadAfterLoadRef.current === targetKey) {
          markReadAfterLoadRef.current = null;
          markLoadedMessagesRead(target, merged);
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      toast.error(t('errors.loadFailed'));
    } finally {
      if (requestSeq === messagesRequestSeqRef.current && getConversationKey(selectedConversationRef.current) === targetKey) {
        setIsLoadingMessages(false);
      }
    }
  }, [selectedConversation, t, markLoadedMessagesRead]);

  // H-01: nút "Tải tin cũ hơn" — kéo trang cũ hơn tin cũ nhất đang hiện, đánh dấu đọc phần vừa tải.
  const handleLoadOlderMessages = useCallback(async () => {
    const target = selectedConversationRef.current;
    const beforeId = getOldestLoadedMessageId(messagesRef.current);
    if (!target || !beforeId || isLoadingOlderMessages) return false;
    const targetKey = getConversationKey(target);
    setIsLoadingOlderMessages(true);
    try {
      const response = await chatbotApi.getMessages(target.id, target.type, { before: beforeId });
      if (!response.success || getConversationKey(selectedConversationRef.current) !== targetKey) return false;
      const older = response.data || [];
      setMessages((prev) => {
        const known = new Set(prev.map((m) => String(m.id)));
        return [...older.filter((m) => !known.has(String(m.id))), ...prev];
      });
      setHasMoreOlderMessages(response.hasMore === true);
      if (older.length > 0) {
        markLoadedMessagesRead(target, older);
      }
      return true;
    } catch (err) {
      console.error('Failed to fetch older messages:', err);
      toast.error(t('errors.loadFailed'));
      return false;
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [isLoadingOlderMessages, markLoadedMessagesRead, t]);

  // H-27: tin khách đến khi đang mở đúng hội thoại → đánh dấu đọc ở DB (chỉ phần khung đọc đã tải), gom 0,8 giây.
  const scheduleMarkOpenConversationRead = useCallback((conv) => {
    clearTimeout(markOpenReadTimerRef.current);
    markOpenReadTimerRef.current = setTimeout(() => {
      const current = selectedConversationRef.current;
      if (!current || getConversationKey(current) !== getConversationKey(conv)) return;
      markLoadedMessagesRead(current, messagesRef.current);
    }, 800);
  }, [markLoadedMessagesRead]);

  const handleNewMessage = useCallback((data) => {
    fetchContactAlertsCount();
    const displayMessage = getDisplayMessage(data.message, data.messageType, {
      rawType: data.rawType || data.metadata?.msg_type_raw,
      sender: data.senderName,
      isGroup: data.isGroup,
      role: data.role,
    });
    // H-25: khớp hội thoại theo CẢ loại lẫn id — id của 3 bảng hội thoại là ba dãy số riêng.
    const eventKey = getSseConversationKey(data);
    const selected = selectedConversationRef.current;
    const isThisConversation = !!selected && getConversationKey(selected) === eventKey;
    const msgRole = data.role || 'visitor';
    // Chỉ TIN KHÁCH mới tăng chưa đọc / bắn thông báo; tin AI hoặc chính chủ gửi từ điện thoại thì không.
    const isVisitorMessage = msgRole === 'visitor';

    setConversations(prev => {
      const existingIndex = prev.findIndex(c => getConversationKey(c) === eventKey);

      if (existingIndex !== -1) {
        const existing = prev[existingIndex];
        const updated = {
          ...existing,
          lastMessage: displayMessage,
          lastMessageAt: data.timestamp || new Date().toISOString(),
          last_message_at: data.timestamp || new Date().toISOString(),
          unreadCount: isThisConversation
            ? 0
            : (existing.unreadCount || 0) + (isVisitorMessage ? 1 : 0),
          // isSelf: chỉ áp pause thật từ BE (aiPaused/aiPausedAt/aiResumeAt), không đoán.
          ...(data.isSelf === true ? pausePatchFromSse(data, existing) : {}),
        };
        const newList = [updated, ...prev.slice(0, existingIndex), ...prev.slice(existingIndex + 1)];
        return newList;
      } else {
        // Hội thoại của một kênh chưa có tab (vd vừa nối WhatsApp) → nạp lại danh sách kênh.
        if (data.channel && data.channel !== 'facebook') {
          setAvailableChannels((known) => {
            if (!known.includes(data.channel)) loadAvailableChannelsRef.current?.();
            return known;
          });
        }
        const newConv = {
          id: data.conversationId,
          type: getSseConversationType(data),
          channel: data.channel || 'zalo_personal',
          status: 'active',
          visitorName: data.isGroup
            ? (data.visitorName || data.groupName || data.senderName || t('inbox.group'))
            : (data.senderName || data.visitorName || t('inbox.customer')),
          lastMessage: displayMessage,
          lastMessageAt: data.timestamp || new Date().toISOString(),
          last_message_at: data.timestamp || new Date().toISOString(),
          unreadCount: isThisConversation || !isVisitorMessage ? 0 : 1,
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
        if (!prev || getConversationKey(prev) !== eventKey) return prev;
        const patch = pausePatchFromSse(data, prev);
        if (!Object.keys(patch).length) return prev;
        return { ...prev, ...patch };
      });
    }
    if (isVisitorMessage && document.hidden && displayMessage) {
      showNotification(t('inbox.newMessage'), {
        body: `${data.senderName || t('inbox.customer')}: ${displayMessage.substring(0, 100)}`,
        tag: `conv-${eventKey}`,
      });
    } else if (isVisitorMessage && !document.hidden && displayMessage && !isThisConversation) {
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

    if (isVisitorMessage) {
      if (isThisConversation) {
        scheduleMarkOpenConversationRead(selected);
      } else {
        // H-27: tổng chưa đọc ở đầu trang cập nhật cho cả Zalo (trước chỉ Web chat có sự kiện unread_change).
        scheduleUnreadRefresh();
      }
    }

    if (isThisConversation) {
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
          // P5: anh/tep khach gui qua Telegram/WhatsApp (SSE mang url ky san) — hien ngay, khong doi tai lai.
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
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
        const convMessages = prev[eventKey] || [];

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
          // P5: anh/tep khach gui qua Telegram/WhatsApp (SSE mang url ky san) — hien ngay, khong doi tai lai.
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
          senderName: data.senderName,
        };

        return {
          ...prev,
          [eventKey]: [...convMessages, newMsg],
        };
      });
    }
  }, [fetchContactAlertsCount, getDisplayMessage, showNotification, t, scheduleMarkOpenConversationRead, scheduleUnreadRefresh]);

  const handleUnreadChange = useCallback(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // H-26: sau khi nối lại luồng thời gian thực, tin đến trong khe hở không được phát lại → tải lại danh sách + số chưa đọc.
  const handleSseReconnected = useCallback(() => {
    fetchConversationsRef.current?.(true);
    fetchUnreadCountRef.current();
  }, []);

  const { status: sseStatus, retry: retrySse } = useInboxSSE(handleNewMessage, handleUnreadChange, handleSseReconnected);

  const handleSendMessage = useCallback(async (content, _unusedReplyTo, files = []) => {
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
        // Apply pause state from sendMessage response (PR1 returns aiPausedAt/aiResumeAt).
        const pauseState = extractPauseState(response);
        setSelectedConversation((prev) => (prev ? { ...prev, ...pauseState } : prev));
        // Cập nhật danh sách: đổi preview tin cuối + đẩy hội thoại lên đầu (khớp
        // cách xử lý tin ĐẾN qua SSE :325-344). Trước đây chỉ .map pauseState nên
        // tin BẠN gửi không hiện ở preview và hội thoại không nhảy lên đầu.
        const sentPreview = content?.trim()
          ? content.trim()
          : (attachments?.length ? t('inbox.previewFile') : '');
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
          // H-29: chỉ nói chuyện AI khi chatbot ĐANG BẬT cho hội thoại này (không phải nhóm, không phải chưa bật).
          const aiRelevant = selectedConversation.chatbotEnabled !== false
            && !isGroupConversation(selectedConversation)
            && pauseState.aiPaused === true
            && typeof pauseState.aiResumeAt === 'string'
            && !!pauseState.aiPausedAt;
          if (aiRelevant) {
            const minutes = Math.max(1, Math.round(
              (new Date(pauseState.aiResumeAt).getTime() - new Date(pauseState.aiPausedAt).getTime()) / 60000
            ));
            toast.success(t('inbox.sentWithAiPause', { n: minutes }));
          } else {
            toast.success(t('inbox.sentToast'));
          }
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      const serverMessage = err.response?.data?.message;
      toast.error(serverMessage || t('errors.sendFailed'));
      // H-16: ném lại để ReplyInput GIỮ nội dung đang gõ (hết hạn mức gửi / rớt mạng không được làm mất đoạn đã gõ).
      throw err;
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

  const handleLoadMore = useCallback(() => {
    if (!isLoadingConversations && hasMore) {
      fetchConversations(false);
    }
  }, [isLoadingConversations, hasMore, fetchConversations]);

  const handleSearch = useCallback((value) => {
    setSearchInput(value);
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === filters.search) return undefined;
    // Xoá sạch ô tìm thì áp ngay; còn lại đợi người dùng ngừng gõ.
    const delay = trimmed === '' ? 0 : SEARCH_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: trimmed }));
      setPage(0);
    }, delay);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search]);

  const handleSelectConversation = useCallback(async (conv) => {
    selectedConversationRef.current = conv;
    setSelectedConversation(conv);
    setIsLoadingMessages(true);

    const convKey = getConversationKey(conv);
    const bufferedMessages = pendingMessages[convKey] || [];
    pendingMessagesForFetchRef.current = bufferedMessages.length > 0
      ? { key: getConversationKey(conv), messages: bufferedMessages }
      : null;

    if (bufferedMessages.length > 0) {
      setMessages(mergeUniqueMessages([], bufferedMessages, true));
      setPendingMessages(prev => {
        const { [convKey]: _, ...rest } = prev;
        return rest;
      });
    } else {
      setMessages([]);
    }

    // H-01: không đánh dấu đọc ngay lúc bấm — đợi khung đọc tải xong rồi chỉ đánh dấu phần đã tải (fetchMessages).
    markReadAfterLoadRef.current = conv.unreadCount > 0 ? getConversationKey(conv) : null;
    setHasMoreOlderMessages(false);
  }, [pendingMessages]);

  const handleOpenConversationByRef = useCallback(({ id, type, visitorName = t('inbox.customer') }) => {
    setActiveView('chat');
    const convId = Number(id);
    const found = conversations.find((c) => Number(c.id) === convId && (!type || c.type === type));
    if (found) {
      handleSelectConversation(found);
    } else {
      handleSelectConversation({
        id: convId,
        type: type || 'webchat',
        visitorName,
        unreadCount: 0,
      });
    }
  }, [conversations, handleSelectConversation, t]);

  const handleOpenConversationFromReport = useCallback((convId) => {
    handleOpenConversationByRef({ id: convId, type: 'zalo_personal' });
  }, [handleOpenConversationByRef]);

  const lastHandledDeepLinkRef = useRef(null);
  useEffect(() => {
    const convParam = searchParams.get('conversation');
    const typeParam = searchParams.get('type');
    if (convParam) {
      const key = `${convParam}:${typeParam || ''}`;
      if (lastHandledDeepLinkRef.current !== key) {
        lastHandledDeepLinkRef.current = key;
        handleOpenConversationByRef({ id: convParam, type: typeParam });
      }
    }
  }, [searchParams, handleOpenConversationByRef]);

  useEffect(() => {
    fetchContactAlertsCount();
  }, [fetchContactAlertsCount]);

  useEffect(() => {
    loadAvailableChannels();
  }, [loadAvailableChannels]);

  // H-05: trạng thái tài khoản Zalo chỉ nạp MỘT lần khi mở trang (và sau khi bấm Đồng bộ) — không chạy lại theo
  // từng bộ lọc / phím gõ. Ô chọn tài khoản nhận dữ liệu này qua props, không tự gọi API nữa.
  useEffect(() => {
    fetchSessionStatus();
  }, [fetchSessionStatus]);

  // Đợi có trạng thái tài khoản (đã chọn tài khoản) rồi mới tải danh sách — chỉ MỘT lần khi mở trang (H-07).
  useEffect(() => {
    if (!sessionLoaded) return;
    fetchConversations(true);
    fetchUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoaded, filters.channel, filters.search, filters.date, filters.kind, filters.unreadOnly, selectedAccountId]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation);
    }
  }, [fetchMessages, selectedConversation]);

  const handleBack = () => {
    messagesRequestSeqRef.current += 1;
    selectedConversationRef.current = null;
    markReadAfterLoadRef.current = null;
    setSelectedConversation(null);
    setMessages([]);
    setHasMoreOlderMessages(false);
    setIsLoadingMessages(false);
  };

  const getChannelLabel = (channel, conversation = null) => {
    if (isGroupConversation(conversation)) {
      return t('inbox.zaloGroup');
    }

    const channelMap = {
      web: t('inbox.webChat'),
      zalo_oa: 'Zalo OA',
      facebook: 'Facebook',
      zalo_personal: t('inbox.zaloPersonal'),
      whatsapp_baileys: 'WhatsApp',
      telegram: 'Telegram',
    };
    return channelMap[channel] || channel || '';
  };

  return (
    <div className="h-full min-h-0 flex overflow-hidden overscroll-none bg-gray-100">
      {/* Left Sidebar */}
      <div
        className={`h-full min-h-0 bg-white flex flex-col flex-shrink-0 overflow-hidden border-r border-gray-200 ${
          !isResizing && 'transition-all duration-200'
        } ${(selectedConversation || activeView !== 'chat') ? 'hidden lg:flex' : 'flex w-full lg:w-auto'}`}
        style={{ width: isMobile && !selectedConversation && activeView === 'chat' ? '100%' : `${sidebarWidth}px` }}
      >
        {/* Sidebar toolbar — compact so list gets most of the height */}
        <div className="shrink-0 border-b border-gray-100">
          {/* View Toggle Tabs: Chat vs AI Report vs Contact Alerts */}
          <div className="flex items-center gap-1 p-1 bg-gray-100/90 rounded-xl mx-3 my-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              title={unreadCount > 0 ? t('inbox.unreadConversationsTooltip', { n: unreadCount }) : undefined}
              className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeView === 'chat'
                  ? 'bg-white text-primary-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineInbox className="w-4 h-4 shrink-0" />
              <span className="truncate">{t('inbox.title')}</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-bold shrink-0">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveView('ai_report')}
              className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeView === 'ai_report'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineSparkles className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="truncate">{t('inbox.aiReportTab')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('contact_alerts')}
              className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeView === 'contact_alerts'
                  ? 'bg-white text-rose-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlinePhone className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="truncate">{t('inbox.contactAlertsTab')}</span>
              {contactAlertsOpenCount > 0 && (
                <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-bold shrink-0">
                  {contactAlertsOpenCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={toggleNotifications}
              className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                notificationsEnabled
                  ? 'text-primary-600 bg-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-white/70'
              }`}
              title={notificationsEnabled ? t('inbox.notificationsOff') : t('inbox.notificationsOn')}
              aria-label={notificationsEnabled ? t('inbox.notificationsOff') : t('inbox.notificationsOn')}
            >
              <HiOutlineBell className="w-4 h-4" />
            </button>
          </div>

          {!sessionStatus.connected && sessionStatus.accounts?.length > 0 && (
            <div className="mx-3 mb-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-2">
              <HiOutlineInformationCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <p className="text-[11px] text-gray-600 leading-snug flex-1 min-w-0">
                {sessionStatus.accounts.length === 1
                  ? t('inbox.zaloReloginBanner', { name: sessionStatus.accounts[0].displayName || t('inbox.zaloPersonalShort') })
                  : t('inbox.zaloReloginBannerMany', { n: sessionStatus.accounts.length })}
              </p>
              {canManageChannels && (
                <button
                  type="button"
                  onClick={() => navigate('/app/settings/channels')}
                  className="shrink-0 text-[11px] font-semibold text-primary-600 hover:underline"
                >
                  {t('inbox.openChannelSettings')}
                </button>
              )}
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
                value={searchInput}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              />
              {searchInput && (
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
              availableChannels={availableChannels}
            />

            {(!filters.channel || filters.channel === 'zalo_personal') && (
              <ZaloAccountSelector
                selectedAccountId={selectedAccountId}
                onAccountChange={handleAccountChange}
                statusAccounts={sessionStatus.accounts}
                isLoading={!sessionLoaded}
                showEmptyCta={filters.channel === 'zalo_personal'}
                canSync={canManage}
                canManageChannels={canManageChannels}
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

        {conversations.some((c) => c.unreadCount > 0) && (
          <div className="shrink-0 border-b border-gray-100 px-3 py-1 flex justify-end bg-white">
            <button
              type="button"
              onClick={() => setConfirmMarkAllRead(true)}
              className="text-[11px] font-semibold text-primary-600 hover:underline"
            >
              {t('inbox.markAllRead')}
            </button>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 min-h-0 overflow-hidden bg-white">
          <ConversationList
            conversations={conversations}
            isLoading={isLoadingConversations}
            selectedId={selectedConversation ? `${selectedConversation.type}-${selectedConversation.id}` : null}
            onSelect={handleSelectConversation}
            onLoadMore={handleLoadMore}
            hasMore={hasMore}
            onDelete={canManage ? handleDeleteConversation : undefined}
            hasActiveFilters={Boolean(filters.search || filters.channel || filters.kind || filters.unreadOnly || filters.date !== 'all')}
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
          (selectedConversation || activeView === 'ai_report' || activeView === 'contact_alerts')
            ? (activeView === 'ai_report' || activeView === 'contact_alerts' ? 'flex flex-col' : 'grid grid-rows-[auto,minmax(0,1fr),auto]')
            : 'hidden lg:flex lg:flex-col'
        }`}
      >
        {activeView !== 'chat' && isMobile && (
          <div className="shrink-0 px-3 py-2 bg-white border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveView('chat')}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary-600"
            >
              <HiArrowLeft className="w-4 h-4" />
              {t('inbox.backToInbox')}
            </button>
          </div>
        )}
        {activeView === 'ai_report' ? (
          <AiActivityReport
            selectedAccountId={selectedAccountId}
            onSelectConversation={handleOpenConversationFromReport}
            canManage={canManage}
            canSummarize={!isEmployeeContext}
          />
        ) : activeView === 'contact_alerts' ? (
          <ContactAlertsPanel
            onSelectConversation={handleOpenConversationByRef}
            isEmployeeContext={isEmployeeContext}
            onOpenCountChange={setContactAlertsOpenCount}
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
                    disabled={!canManage || selectedConversation.chatbotEnabled === false || isGroupConversation(selectedConversation)}
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

              {canManage && selectedConversation.channel === 'zalo_personal' && isGroupConversation(selectedConversation) && <button
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
                          payload?.data?.message || t('inbox.syncPersonalNoHistory'),
                          { icon: 'ℹ️', duration: 6000 }
                        );
                      } else {
                        const synced = Number(payload?.data?.synced || 0);
                        toast.success(
                          synced > 0
                            ? t('inbox.syncThreadPulled', { count: synced })
                            : t('inbox.syncThreadEmpty')
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
                title={t('inbox.syncNow')}
              >
                <HiOutlineRefresh className={`w-5 h-5 ${isSyncingThread ? 'animate-spin' : ''}`} />
              </button>}

              <button
                onClick={() => setShowDetails(!showDetails)}
                className={`p-2.5 rounded-xl transition-all ${
                  showDetails 
                    ? 'text-primary-600 bg-primary-50 shadow-sm' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                title={t('common.details')}
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
                onRetry={canManage ? handleRetryMessage : undefined}
                retryingMessageId={retryingMessageId}
                currentUserId={currentUserId}
                hasMoreOlder={hasMoreOlderMessages}
                isLoadingOlder={isLoadingOlderMessages}
                onLoadOlder={handleLoadOlderMessages}
              />
            </div>

            {isTyping && (
              <TypingIndicator 
                isTyping={isTyping}
                senderName={typingSender}
              />
            )}

            {canReply && (
              <ReplyInput
                onSend={handleSendMessage}
                disabled={isSending}
                placeholder={t('inbox.typeMessage')}
                allowAttachments={channelSupportsInboxAttachments(selectedConversation?.channel)}
              />
            )}
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
                {t('inbox.selectConversationHint')}
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

      <ConfirmModal
        isOpen={confirmMarkAllRead}
        title={t('inbox.markAllRead')}
        message={t('inbox.markAllReadConfirm')}
        onConfirm={handleMarkAllRead}
        onCancel={() => setConfirmMarkAllRead(false)}
        confirmText={t('inbox.markAllReadConfirmBtn')}
        cancelText={t('common.cancel')}
      />

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
