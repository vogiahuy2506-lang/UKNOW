import { useState, useCallback, useEffect, useRef } from 'react';
import {
  HiOutlineViewBoards,
  HiOutlineMail,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChatAlt2,
  HiOutlinePlus,
  HiOutlinePaperClip,
  HiOutlineX,
  HiOutlineCog,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import MessageAttachments, { formatFileSize } from '../../components/MessageAttachments';
import ChatbotSettings from './ChatbotSettings';
import ChatListSidebar from './ChatListSidebar';
import { MAX_UPLOAD_FILE_MB } from '../../constants/uploadLimits';
import { useI18n } from '../../i18n';
import useStorageQuota from '../../features/storage/useStorageQuota';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../features/storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../features/storage/storageEvents';
import useMediaQuery from '../../hooks/useMediaQuery';

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp';
const MAX_ATTACHMENTS = 3;
const MAX_FILE_MB = MAX_UPLOAD_FILE_MB;

const MOBILE_PANELS = [
  { id: 'list',     label: 'Danh sách',  icon: HiOutlineViewBoards },
  { id: 'chat',     label: 'Trò chuyện', icon: HiOutlineChatAlt2 },
  { id: 'settings', label: 'Cài đặt',    icon: HiOutlineCog },
];

function clientValidateFile(file) {
  const name = file.name || '';
  const lower = name.toLowerCase();
  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
    return 'Chỉ nhận .docx, hãy Lưu thành .docx rồi gửi lại';
  }
  if (lower.endsWith('.svg')) {
    return 'Không nhận file SVG';
  }
  const maxBytes = MAX_FILE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File vượt dung lượng tối đa ${MAX_FILE_MB} MB`;
  }
  return null;
}

// Get custom colors from chatbot
function getChatbotTheme(chatbot) {
  const primaryColor = chatbot?.primary_color || '#6366F1';
  const accentColor = chatbot?.accent_color || '#818CF8';
  const bgColor = chatbot?.background_color || '#FFFFFF';
  const textColor = chatbot?.text_color || '#1F2937';
  const gradientStyle = `linear-gradient(135deg, ${primaryColor}, ${accentColor})`;

  return { primaryColor, accentColor, bgColor, textColor, gradientStyle };
}

// Empty State with custom branding
function EmptyState({ chatbot, onCreateNew: _onCreateNew }) {
  const { primaryColor, bgColor, textColor, gradientStyle } = getChatbotTheme(chatbot);
  const suggestedQuestions = chatbot?.suggested_questions || chatbot?.widget_settings?.suggested_questions || [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8" style={{ backgroundColor: bgColor }}>
      {/* Avatar */}
      <div className="relative mb-4 md:mb-6">
        <div
          className="w-20 h-20 md:w-24 md:h-24 rounded-3xl flex items-center justify-center shadow-lg"
          style={{ background: gradientStyle }}
        >
          {chatbot?.logo_url ? (
            <img src={chatbot.logo_url} alt="" className="w-full h-full rounded-3xl object-cover" />
          ) : chatbot?.avatar_url ? (
            <img src={chatbot.avatar_url} alt="" className="w-full h-full rounded-3xl object-cover" />
          ) : (
            <span className="text-white text-3xl md:text-4xl font-bold">{chatbot?.name?.[0]?.toUpperCase() || '?'}</span>
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 md:w-8 md:h-8 bg-green-400 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </div>
      </div>

      {/* Welcome */}
      <h2 className="text-xl md:text-2xl font-bold mb-2 px-2 text-center" style={{ color: textColor }}>
        {chatbot?.greeting_msg || `Chào bạn! Tôi là ${chatbot?.name || 'AI Assistant'}`}
      </h2>
      <p className="text-sm mb-6 md:mb-8 max-w-md text-center px-2" style={{ color: `${textColor}99` }}>
        {chatbot?.description || 'Hãy hỏi tôi bất cứ điều gì về kiến thức đã được thiết lập.'}
      </p>

      {/* Suggested Questions */}
      {suggestedQuestions.length > 0 && (
        <div className="mb-6 md:mb-8 w-full max-w-md px-2">
          <p className="text-xs font-semibold mb-3 text-center uppercase tracking-wider" style={{ color: `${textColor}80` }}>
            Câu hỏi gợi ý
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => {}}
                className="px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium transition-all hover:scale-105"
                style={{
                  backgroundColor: `${primaryColor}15`,
                  border: `1px solid ${primaryColor}30`,
                  color: primaryColor,
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Conversation List Sidebar
function ConversationList({ conversations, activeId, onSelect, onNewChat: _onNewChat, onDelete, primaryColor: _primaryColor }) {
  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="text-sm">Chưa có cuộc trò chuyện nào</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          onClick={() => onSelect(conv)}
          className={`p-3 cursor-pointer hover:bg-gray-50 transition-colors group relative ${
            activeId === conv.id ? 'bg-blue-50' : ''
          }`}
        >
          <div className="flex items-start gap-2">
            <HiOutlineChatAlt2 className="w-4 h-4 mt-1 text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{conv.title || 'Cuộc trò chuyện mới'}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {conv.last_message || 'Bắt đầu trò chuyện...'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {conv.last_message_at ? new Date(conv.last_message_at).toLocaleString('vi-VN', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                }) : ''}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-500 transition-all"
            >
              <HiOutlineTrash className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Chat Message Area with conversation saving
function ChatMessageArea({ chatbot, onUpdate: _onUpdate }) {
  const { t } = useI18n();
  const { usage: storageQuota } = useStorageQuota();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const pendingScrollRestoreRef = useRef(null);
  const shouldScrollToBottomRef = useRef(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const { primaryColor, bgColor, textColor, gradientStyle } = getChatbotTheme(chatbot);
  const suggestedQuestions = chatbot?.suggested_questions || chatbot?.widget_settings?.suggested_questions || [];

  // Load conversations when chatbot changes
  useEffect(() => {
    if (chatbot?.id) {
      loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id]);

  const loadConversations = async () => {
    try {
      const res = await chatbotApi.getChatbotStudioConversations({ chatbot_id: chatbot.id });
      if (res.data?.data?.items) {
        setConversations(res.data.data.items);
      }
    } catch (err) {
      console.error('Load conversations error:', err);
    }
  };

  const loadMessages = async (conversationId) => {
    setLoadingMessages(true);
    try {
      const res = await chatbotApi.getChatbotStudioMessages(conversationId, { limit: 30 });
      if (Array.isArray(res.data?.data)) {
        shouldScrollToBottomRef.current = true;
        setMessages(res.data.data.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
          attachments: m.attachments || [],
        })));
        setHasOlderMessages(Boolean(res.data?.pagination?.hasMore));
        setNextBeforeId(res.data?.pagination?.nextBeforeId || null);
      }
    } catch (err) {
      console.error('Load messages error:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!activeConversation?.id || !hasOlderMessages || !nextBeforeId || loadingOlderMessages) return;
    const container = messagesScrollRef.current;
    if (container) {
      pendingScrollRestoreRef.current = {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
      };
    }
    setLoadingOlderMessages(true);
    try {
      const res = await chatbotApi.getChatbotStudioMessages(activeConversation.id, {
        limit: 30,
        beforeId: nextBeforeId,
      });
      const older = Array.isArray(res.data?.data) ? res.data.data.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at,
        attachments: message.attachments || [],
      })) : [];
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id).filter(Boolean));
        return [...older.filter((message) => !message.id || !known.has(message.id)), ...current];
      });
      setHasOlderMessages(Boolean(res.data?.pagination?.hasMore));
      setNextBeforeId(res.data?.pagination?.nextBeforeId || null);
    } catch (err) {
      pendingScrollRestoreRef.current = null;
      toast.error(err.response?.data?.message || t('chatbot.studio.loadOlderMessagesFailed'));
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const handleSelectConversation = async (conv) => {
    setActiveConversation(conv);
    setPendingAttachments([]);
    await loadMessages(conv.id);
  };

  const handleNewChat = async () => {
    try {
      const res = await chatbotApi.createChatbotStudioConversation(chatbot.id);
      if (res.data?.data) {
        const newConv = res.data.data;
        setConversations(prev => [newConv, ...prev]);
        setActiveConversation(newConv);
        setMessages([]);
        setHasOlderMessages(false);
        setNextBeforeId(null);
        setPendingAttachments([]);
      }
    } catch (err) {
      toast.error('Không thể tạo cuộc trò chuyện mới');
    }
  };

  const handleDeleteConversation = async (convId) => {
    if (!confirm('Xóa cuộc trò chuyện này?')) return;
    try {
      await chatbotApi.deleteChatbotStudioConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConversation?.id === convId) {
        setActiveConversation(null);
        setMessages([]);
        setHasOlderMessages(false);
        setNextBeforeId(null);
        setPendingAttachments([]);
      }
      toast.success('Đã xóa cuộc trò chuyện');
    } catch (err) {
      toast.error('Không thể xóa cuộc trò chuyện');
    }
  };

  const handlePickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const validation = validateFilesBeforeUpload(files, storageQuota);
    if (!validation.ok) {
      toast.error(getUploadValidationErrorMessage(validation, t));
      return;
    }

    const remaining = MAX_ATTACHMENTS - pendingAttachments.length;
    if (remaining <= 0) {
      toast.error(`Tối đa ${MAX_ATTACHMENTS} tệp mỗi tin nhắn`);
      return;
    }

    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`Chỉ thêm được ${remaining} tệp nữa (tối đa ${MAX_ATTACHMENTS})`);
    }

    setUploadingAttachment(true);
    try {
      for (const file of toUpload) {
        const clientErr = clientValidateFile(file);
        if (clientErr) {
          toast.error(clientErr);
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chatbot_id', String(chatbot.id));
        const res = await chatbotApi.uploadChatAttachment(formData);
        const data = res.data?.data;
        if (!data) {
          toast.error(res.data?.message || 'Tải file thất bại');
          continue;
        }
        if (data.textExtracted === false && data.type === 'file') {
          toast('Đã gửi tệp, nhưng chatbot không đọc được nội dung', { icon: '⚠️' });
        }
        setPendingAttachments(prev => [...prev, data]);
        notifyStorageQuotaRefresh();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Tải file thất bại');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const removePendingAttachment = async (index) => {
    const toRemove = pendingAttachments[index];
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
    if (toRemove?.ref && chatbot?.id) {
      try {
        await chatbotApi.deleteChatAttachment({
          ref: toRemove.ref,
          chatbot_id: chatbot.id,
        });
        notifyStorageQuotaRefresh();
      } catch (err) {
        console.warn('[ChatbotStudio] Không thể xóa tệp đính kèm tạm:', err.message);
      }
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || sending || uploadingAttachment) return;

    // Create new conversation if none selected
    let conv = activeConversation;
    if (!conv) {
      try {
        const res = await chatbotApi.createChatbotStudioConversation(chatbot.id);
        if (res.data?.data) {
          conv = res.data.data;
          setConversations(prev => [conv, ...prev]);
          setActiveConversation(conv);
        }
      } catch (err) {
        toast.error('Không thể tạo cuộc trò chuyện');
        return;
      }
    }

    const userText = input.trim();
    const attachmentsToSend = [...pendingAttachments];
    const userMessage = {
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
      attachments: attachmentsToSend,
    };
    shouldScrollToBottomRef.current = true;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setPendingAttachments([]);
    setSending(true);

    try {
      // Save user message (server resolves ref → key)
      await chatbotApi.addChatbotStudioMessage(conv.id, {
        role: 'user',
        content: userText || (attachmentsToSend.length ? '[Đính kèm]' : ''),
        attachments: attachmentsToSend,
        message_type: attachmentsToSend.length ? 'file' : 'text',
      });

      // History must carry attachments so later turns still see files
      const history = messages.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments || [],
      }));

      const res = await chatbotApi.sendCustomChat({
        history: [...history, {
          role: 'user',
          content: userText || (attachmentsToSend.length ? '[Đính kèm]' : ''),
          attachments: attachmentsToSend,
        }],
        chatbot_id: chatbot?.id,
        system_instruction: chatbot?.system_instruction,
        temperature: chatbot?.temperature || 0.7,
        max_tokens: chatbot?.max_tokens || 2048,
        attachments: attachmentsToSend,
      });

      if (res.data?.content) {
        await chatbotApi.addChatbotStudioMessage(conv.id, {
          role: 'assistant',
          content: res.data.content,
        });

        shouldScrollToBottomRef.current = true;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.data.content,
          created_at: new Date().toISOString(),
        }]);

        setConversations(prev => prev.map(c =>
          c.id === conv.id
            ? { ...c, last_message: res.data.content.substring(0, 100), last_message_at: new Date().toISOString() }
            : c
        ));
      } else if (res.data?.message) {
        toast.error(res.data.message);
      }
    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(String(err.message || ''));
      toast.error(isTimeout ? 'AI đang xử lý quá lâu, vui lòng thử lại' : (err.response?.data?.message || err.message || 'Gửi thất bại'));
      setMessages(prev => prev.slice(0, -1));
      setPendingAttachments(attachmentsToSend);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  useEffect(() => {
    const container = messagesScrollRef.current;
    const restore = pendingScrollRestoreRef.current;
    if (container && restore) {
      container.scrollTop = container.scrollHeight - restore.scrollHeight + restore.scrollTop;
      pendingScrollRestoreRef.current = null;
      return;
    }
    if (shouldScrollToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      shouldScrollToBottomRef.current = false;
    }
  }, [messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = async () => {
    if (!activeConversation) return;
    if (!confirm('Xóa tất cả tin nhắn trong cuộc trò chuyện này?')) return;
    try {
      await chatbotApi.clearChatbotStudioConversation(activeConversation.id);
      setMessages([]);
      setHasOlderMessages(false);
      setNextBeforeId(null);
      toast.success('Đã xóa tin nhắn');
    } catch (err) {
      toast.error('Không thể xóa tin nhắn');
    }
  };

  const handleSuggestionClick = (q) => {
    setInput(q);
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
            style={{ background: gradientStyle }}
          >
            {chatbot?.logo_url ? (
              <img src={chatbot.logo_url} alt="" className="w-full h-full rounded-xl object-cover" />
            ) : chatbot?.avatar_url ? (
              <img src={chatbot.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
            ) : (
              <span className="text-white font-bold">{chatbot?.name?.[0]?.toUpperCase()}</span>
            )}
          </div>
          <div>
            <h3 className="font-bold" style={{ color: textColor }}>{chatbot?.name}</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs" style={{ color: `${textColor}80` }}>Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNewChat}
            className="p-2 rounded-lg transition-colors hover:bg-blue-50 text-blue-500"
            title="Cuộc trò chuyện mới"
          >
            <HiOutlinePlus className="w-5 h-5" />
          </button>
          {activeConversation && (
            <button
              onClick={handleClearChat}
              className="p-2 rounded-lg transition-colors hover:bg-red-50 text-red-400"
              title="Xóa chat"
            >
              <HiOutlineTrash className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesScrollRef}
        className="flex-1 min-h-0 overflow-y-scroll overscroll-contain p-4 space-y-4 chat-messages-scroll [scrollbar-gutter:stable]"
      >
        {hasOlderMessages && messages.length > 0 && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={loadingOlderMessages}
              className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingOlderMessages
                ? t('chatbot.studio.loadingOlderMessages')
                : t('chatbot.studio.loadOlderMessages')}
            </button>
          </div>
        )}
        {/* Conversations list toggle area */}
        {messages.length === 0 && (
          <div className="mb-4">
            {conversations.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Cuộc trò chuyện gần đây</p>
                  <button onClick={handleNewChat} className="text-xs text-blue-500 hover:underline">
                    + Mới
                  </button>
                </div>
                <ConversationList
                  conversations={conversations.slice(0, 5)}
                  activeId={activeConversation?.id}
                  onSelect={handleSelectConversation}
                  onDelete={handleDeleteConversation}
                  primaryColor={primaryColor}
                />
              </div>
            )}
          </div>
        )}

        {/* Suggested Questions - show when no messages */}
        {messages.length === 0 && suggestedQuestions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold mb-2" style={{ color: `${textColor}80` }}>Câu hỏi gợi ý:</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(q)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105"
                  style={{
                    backgroundColor: `${primaryColor}15`,
                    border: `1px solid ${primaryColor}30`,
                    color: primaryColor,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {loadingMessages && (
          <div className="flex items-center justify-center py-8">
            <div className="spinner w-6 h-6"></div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, idx) => (
          <div key={msg.id || `${msg.created_at}-${idx}`} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Bot Avatar */}
            {msg.role !== 'user' && (
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: gradientStyle }}
              >
                {chatbot?.avatar_url ? (
                  <img src={chatbot.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
                ) : (
                  <span className="text-white text-xs font-bold">{chatbot?.name?.[0]?.toUpperCase()}</span>
                )}
              </div>
            )}

            {/* User Avatar */}
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-slate-200">
                <svg className="w-4 h-4 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}

            {/* Bubble */}
            <div className={`max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div
                className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={msg.role === 'user'
                  ? { background: gradientStyle, color: 'white', boxShadow: `0 4px 12px ${primaryColor}30` }
                  : { backgroundColor: bgColor, color: textColor, border: `1px solid ${primaryColor}15` }
                }
              >
                {msg.content ? <p className="whitespace-pre-wrap">{msg.content}</p> : null}
                <MessageAttachments attachments={msg.attachments} messageRole={msg.role} />
              </div>
              <span className="text-[10px] mt-1 px-1" style={{ color: `${textColor}60` }}>
                {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {sending && (
          <div className="flex gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: gradientStyle }}
            >
              <span className="text-white text-xs font-bold">{chatbot?.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="px-4 py-3 rounded-2xl" style={{ backgroundColor: bgColor, border: `1px solid ${primaryColor}15` }}>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ backgroundColor: primaryColor, animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-100 bg-white">
        {pendingAttachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingAttachments.map((att, idx) => (
              <div
                key={`${att.ref || att.name}-${idx}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs max-w-[220px]"
              >
                <span className="truncate font-medium text-slate-700">{att.displayName || att.name}</span>
                <span className="text-slate-400 shrink-0">{formatFileSize(att.size)}</span>
                {att.textExtracted === false && att.type === 'file' && (
                  <span className="text-amber-600 shrink-0">!</span>
                )}
                <button
                  type="button"
                  onClick={() => removePendingAttachment(idx)}
                  className="p-0.5 text-slate-400 hover:text-slate-700"
                  aria-label="Xóa tệp"
                >
                  <HiOutlineX className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            className="hidden"
            onChange={handlePickFiles}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploadingAttachment || pendingAttachments.length >= MAX_ATTACHMENTS}
            className="w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 shrink-0"
            title="Đính kèm tệp"
          >
            {uploadingAttachment ? (
              <HiOutlineRefresh className="w-5 h-5 animate-spin" />
            ) : (
              <HiOutlinePaperClip className="w-5 h-5" />
            )}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập tin nhắn..."
            rows={1}
            className="flex-1 resize-none rounded-2xl px-3 py-2.5 md:px-4 md:py-3 text-base md:text-sm outline-none transition-all"
            style={{
              backgroundColor: `${primaryColor}05`,
              border: `2px solid ${primaryColor}20`,
              color: textColor,
            }}
            onFocus={(e) => e.target.style.borderColor = primaryColor}
            onBlur={(e) => e.target.style.borderColor = `${primaryColor}20`}
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && pendingAttachments.length === 0) || sending || uploadingAttachment}
            className="w-11 h-11 md:w-12 md:h-12 text-white rounded-xl flex items-center justify-center shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shrink-0"
            style={{ background: gradientStyle }}
          >
            {sending ? (
              <HiOutlineRefresh className="w-5 h-5 animate-spin" />
            ) : (
              <HiOutlineMail className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatbotStudioPage() {
  const [selectedBot, setSelectedBot] = useState(null);
  const [_bots, setBots] = useState([]);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState('list');

  const isMobile = useMediaQuery('(max-width: 767.99px)');
  const isCompact = useMediaQuery('(max-width: 1023.99px)'); // mobile + md → dùng tab view

  // Trên mobile, các panel chat/settings không có bot được disable trên tab bar
  // (chỉ list là khả dụng khi chưa chọn bot). isMobile dùng để dành cho logic tương lai.
  const _isMobile = isMobile;

  const handleSelectBot = useCallback((bot) => {
    setSelectedBot(bot);
    if (bot) setActivePanel('chat');
  }, []);

  const handleUpdateBot = useCallback((updatedBot) => {
    setSelectedBot(updatedBot);
    setBots(prev => prev.map(b => b.id === updatedBot.id ? updatedBot : b));
  }, []);

  const handleCreateNew = useCallback(() => {
    if (isCompact) setActivePanel('list');
    document.dispatchEvent(new CustomEvent('studio:create-new'));
  }, [isCompact]);

  // Card heights:
  // - Mobile (<768): dùng dvh để tránh lỗi khi browser chrome collapse; không có min-h cứng
  // - Tablet/Desktop: giữ nguyên calc(100vh-10rem) và min-h-[640px]
  const cardHeightClass = 'h-[calc(100dvh-9rem)] md:h-[calc(100vh-10rem)] md:min-h-[640px] md:max-h-[820px]';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">AI Chatbot</h1>
        <p className="text-sm text-gray-500 mt-2 hidden md:block">
          Quản lý và thiết lập chatbot AI cho doanh nghiệp của bạn.
        </p>
      </div>

      {/* Mobile + tablet compact: tab switcher */}
      {isCompact && (
        <div className="lg:hidden sticky top-0 z-30 -mx-4 sm:mx-0 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex">
            {MOBILE_PANELS.map((panel) => {
              const Icon = panel.icon;
              const isActive = activePanel === panel.id;
              const disabled = (panel.id === 'chat' || panel.id === 'settings') && !selectedBot;
              return (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => !disabled && setActivePanel(panel.id)}
                  disabled={disabled}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-colors ${
                    isActive ? 'text-primary-600' : 'text-slate-500 hover:text-slate-700'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  aria-label={panel.label}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px] font-medium">{panel.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary-500 rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch">
        {/* Left Sidebar (List) */}
        <div
          className={`${isCompact ? (activePanel === 'list' ? 'flex' : 'hidden') : 'flex'} transition-all duration-300 ease-in-out shrink-0 w-full md:w-full ${isCompact ? '' : 'lg:w-56 xl:w-72'}`}
        >
          <div className={`card ${cardHeightClass} flex flex-col overflow-hidden relative w-full`}>
            <button
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="absolute top-3 right-3 z-10 w-8 h-8 hidden xl:flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg shadow-sm border border-slate-200 transition-colors"
              title={leftCollapsed ? 'Mở rộng' : 'Thu gọn'}
            >
              {leftCollapsed ? <HiOutlineChevronRight className="w-4 h-4" /> : <HiOutlineChevronLeft className="w-4 h-4" />}
            </button>
            <div className={`flex-1 overflow-hidden transition-opacity duration-200 ${leftCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <ChatListSidebar
                selectedBot={selectedBot}
                onSelectBot={handleSelectBot}
                onCreateNew={handleCreateNew}
              />
            </div>
            {leftCollapsed && (
              <div className="absolute inset-0 flex flex-col items-center pt-16">
                <div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center font-bold">
                  {_bots.length}
                </div>
                <div className="text-slate-400 font-semibold tracking-widest mt-8 rotate-180" style={{ writingMode: 'vertical-rl' }}>
                  CHATBOTS
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Middle Chat (Preview) */}
        <div
          className={`${isCompact ? (activePanel === 'chat' ? 'flex' : 'hidden') : 'flex'} flex-1 w-full min-w-0 transition-all duration-300`}
        >
          <div className={`card ${cardHeightClass} flex min-h-0 flex-col overflow-hidden w-full`}>
            {selectedBot ? (
              <ChatMessageArea
                key={`chat-${selectedBot.id}`}
                chatbot={selectedBot}
                onUpdate={handleUpdateBot}
              />
            ) : (
              <EmptyState chatbot={selectedBot} onCreateNew={handleCreateNew} />
            )}
          </div>
        </div>

        {/* Right Settings */}
        <div
          className={`${isCompact ? (activePanel === 'settings' ? 'flex' : 'hidden') : 'flex'} transition-all duration-300 ease-in-out shrink-0 w-full md:w-full ${isCompact ? '' : 'lg:w-72 xl:w-[400px]'}`}
        >
          <div className={`card ${cardHeightClass} flex min-h-0 flex-col overflow-hidden relative w-full`}>
            <button
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className={`hidden xl:flex absolute z-20 w-7 h-14 items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-l-xl shadow-md border border-slate-200 border-r-0 transition-colors ${
                rightCollapsed
                  ? 'top-3 left-1/2 -translate-x-1/2'
                  : 'top-3 left-3 xl:top-1/2 xl:left-0 xl:-translate-x-1/2 xl:-translate-y-1/2'
              }`}
              title={rightCollapsed ? 'Mở rộng' : 'Thu gọn'}
            >
              {rightCollapsed ? <HiOutlineChevronLeft className="w-4 h-4" /> : <HiOutlineChevronRight className="w-4 h-4" />}
            </button>
            <div className={`flex-1 overflow-hidden transition-opacity duration-200 ${rightCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {selectedBot ? (
                <ChatbotSettings
                  key={`settings-${selectedBot.id}`}
                  chatbot={selectedBot}
                  onUpdate={handleUpdateBot}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-6 md:p-8 text-center h-full">
                  <svg className="w-10 h-10 md:w-12 md:h-12 mb-3 md:mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm">Chọn một chatbot để cấu hình</p>
                </div>
              )}
            </div>
            {rightCollapsed && (
              <div className="absolute inset-0 flex flex-col items-center pt-16">
                <div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center font-bold">
                  <HiOutlineViewBoards className="w-4 h-4" />
                </div>
                <div className="writing-vertical-rl text-slate-400 font-semibold tracking-widest mt-8 rotate-180" style={{ writingMode: 'vertical-rl' }}>
                  CÀI ĐẶT
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatbotStudioPage;
