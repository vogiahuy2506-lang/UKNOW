import { useState, useCallback, useEffect, useRef } from 'react';
import {
  HiOutlineViewBoards,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineChatAlt2,
  HiOutlinePlus,
  HiOutlinePaperClip,
  HiOutlineX,
  HiOutlineCog,
  HiOutlineSparkles,
  HiOutlineArrowSmRight,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import MessageAttachments, { formatFileSize } from '../../components/MessageAttachments';
import ChatListSidebar from './ChatListSidebar';
import ChatbotConfigModal from './ChatbotConfigModal';
import PlaygroundHeader from './PlaygroundHeader';
import RightPanel from './RightPanel';
import WidgetSettingsModal from './WidgetSettingsModal';
import ShareChatbotModal from '../../components/marketplace/ShareChatbotModal';
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
  { id: 'settings', label: 'Cấu hình',   icon: HiOutlineCog },
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

function getChatbotTheme(chatbot) {
  const primaryColor = chatbot?.primary_color || '#ee7518';
  const accentColor = chatbot?.accent_color || '#f19342';
  const bgColor = chatbot?.background_color || '#FFFFFF';
  const textColor = chatbot?.text_color || '#0f172a';
  const gradientStyle = `linear-gradient(135deg, ${primaryColor}, ${accentColor})`;
  return { primaryColor, accentColor, bgColor, textColor, gradientStyle };
}

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ chatbot }) {
  const { primaryColor, gradientStyle } = getChatbotTheme(chatbot);
  const suggestedQuestions = chatbot?.suggested_questions || chatbot?.widget_settings?.suggested_questions || [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-10" style={{ background: primaryColor }} />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-10" style={{ background: primaryColor }} />

      <div className="relative flex flex-col items-center max-w-md text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: gradientStyle }}
        >
          <HiOutlineSparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2 tracking-tight">
          Chào bạn, tôi có thể giúp gì?
        </h2>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          Chọn một chatbot từ danh sách bên trái hoặc tạo chatbot mới để bắt đầu trò chuyện thử nghiệm.
        </p>
        {suggestedQuestions.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {suggestedQuestions.map((q, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {q}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Conversation Card (recent) ───────────────────────────────────────────────
function ConversationCard({ conv, onSelect, onDelete }) {
  return (
    <div className="group w-full text-left px-3 py-2.5 bg-white rounded-lg hover:bg-slate-50 transition-colors">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
          <HiOutlineChatAlt2 className="w-3.5 h-3.5" />
        </div>
        <button
          onClick={() => onSelect(conv)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm font-medium text-slate-900 truncate">{conv.title || 'Cuộc trò chuyện mới'}</p>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {conv.last_message || 'Bắt đầu trò chuyện...'}
          </p>
        </button>
        <button
          onClick={() => onDelete(conv.id)}
          className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
          title="Xóa"
        >
          <HiOutlineTrash className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Chat Message Area ────────────────────────────────────────────────────────
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

  const { primaryColor: _primaryColor, bgColor: _bgColor, textColor: _textColor, gradientStyle } = getChatbotTheme(chatbot);
  const suggestedQuestions = chatbot?.suggested_questions || chatbot?.widget_settings?.suggested_questions || [];

  useEffect(() => {
    if (chatbot?.id) loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id]);

  const loadConversations = async () => {
    try {
      const res = await chatbotApi.getChatbotStudioConversations({ chatbot_id: chatbot.id });
      if (res.data?.data?.items) setConversations(res.data.data.items);
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
      await chatbotApi.addChatbotStudioMessage(conv.id, {
        role: 'user',
        content: userText || (attachmentsToSend.length ? '[Đính kèm]' : ''),
        attachments: attachmentsToSend,
        message_type: attachmentsToSend.length ? 'file' : 'text',
      });

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

  const handleSuggestionClick = (q) => {
    setInput(q);
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      {/* Messages */}
      <div
        ref={messagesScrollRef}
        className="flex-1 min-h-0 overflow-y-scroll overscroll-contain px-4 py-6 sm:px-6 space-y-4 chat-messages-scroll [scrollbar-gutter:stable]"
      >
        {hasOlderMessages && messages.length > 0 && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={loadOlderMessages}
              disabled={loadingOlderMessages}
              className="inline-flex h-8 items-center justify-center rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 px-3 disabled:opacity-60 transition-colors"
            >
              {loadingOlderMessages ? t('chatbot.studio.loadingOlderMessages') : t('chatbot.studio.loadOlderMessages')}
            </button>
          </div>
        )}

        {/* Conversations recent list as cards */}
        {messages.length === 0 && conversations.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cuộc trò chuyện gần đây</p>
              <button onClick={handleNewChat} className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                <HiOutlinePlus className="w-3 h-3" />
                Mới
              </button>
            </div>
            <div className="space-y-1">
              {conversations.slice(0, 5).map(conv => (
                <ConversationCard
                  key={conv.id}
                  conv={conv}
                  onSelect={handleSelectConversation}
                  onDelete={handleDeleteConversation}
                />
              ))}
            </div>
          </div>
        )}

        {/* Suggested questions as clean cards */}
        {messages.length === 0 && suggestedQuestions.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-semibold text-slate-500 mb-2.5 px-1">Câu hỏi gợi ý</p>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(q)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {loadingMessages && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, idx) => (
          <div key={msg.id || `${msg.created_at}-${idx}`} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Bot Avatar */}
            {msg.role !== 'user' && (
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-semibold"
                style={{ background: gradientStyle }}
              >
                {chatbot?.avatar_url ? (
                  <img src={chatbot.avatar_url} alt="" className="w-full h-full rounded-lg object-cover" />
                ) : (
                  chatbot?.name?.[0]?.toUpperCase()
                )}
              </div>
            )}

            {/* User Avatar */}
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-slate-200 text-slate-600">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}

            {/* Bubble */}
            <div className={`max-w-[85%] md:max-w-[75%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'text-white rounded-tr-md'
                    : 'bg-slate-100 text-slate-900 rounded-tl-md'
                }`}
                style={msg.role === 'user' ? { background: gradientStyle } : {}}
              >
                {msg.content ? <p className="whitespace-pre-wrap">{msg.content}</p> : null}
                <MessageAttachments attachments={msg.attachments} messageRole={msg.role} />
              </div>
              <span className="text-[10px] mt-1 px-1 text-slate-400">
                {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {sending && (
          <div className="flex gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-semibold"
              style={{ background: gradientStyle }}
            >
              {chatbot?.name?.[0]?.toUpperCase()}
            </div>
            <div className="px-3.5 py-3 rounded-2xl rounded-tl-md bg-slate-100">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full animate-bounce bg-slate-400"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Composer */}
      <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2 bg-white">
        <div className="max-w-3xl mx-auto">
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingAttachments.map((att, idx) => (
                <div
                  key={`${att.ref || att.name}-${idx}`}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-xs"
                >
                  <span className="truncate font-medium text-slate-700 max-w-[160px]">{att.displayName || att.name}</span>
                  <span className="text-slate-400 shrink-0">{formatFileSize(att.size)}</span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(idx)}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Xóa tệp"
                  >
                    <HiOutlineX className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 bg-slate-50 rounded-2xl ring-1 ring-slate-200/60 focus-within:ring-primary-500 focus-within:bg-white transition-all p-2">
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
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 disabled:opacity-50 transition-colors shrink-0"
              title="Đính kèm tệp"
            >
              {uploadingAttachment ? (
                <HiOutlineRefresh className="w-4 h-4 animate-spin" />
              ) : (
                <HiOutlinePaperClip className="w-4 h-4" />
              )}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn..."
              rows={1}
              className="flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none text-slate-900 placeholder-slate-400 max-h-32"
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && pendingAttachments.length === 0) || sending || uploadingAttachment}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
              style={{ background: gradientStyle }}
            >
              {sending ? (
                <HiOutlineRefresh className="w-4 h-4 animate-spin" />
              ) : (
                <HiOutlineArrowSmRight className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
function ChatbotStudioPage() {
  const [selectedBot, setSelectedBot] = useState(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, _setRightCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState('list');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [widgetModalKind, setWidgetModalKind] = useState(null);

  const isCompact = useMediaQuery('(max-width: 1023.99px)');
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');

  const handleSelectBot = useCallback((bot) => {
    setSelectedBot(bot);
    if (bot) setActivePanel('chat');
  }, []);

  const handleUpdateBot = useCallback((updatedBot) => {
    setSelectedBot(updatedBot);
  }, []);

  const handleCreateNew = useCallback(() => {
    if (isCompact) setActivePanel('list');
    document.dispatchEvent(new CustomEvent('studio:create-new'));
  }, [isCompact]);

  return (
    <div className="h-[calc(100dvh-1.5rem)] min-h-[600px] flex flex-col">
      {/* Mobile tab switcher */}
      {isCompact && (
        <div className="lg:hidden sticky top-0 z-30 -mx-4 sm:mx-0 bg-white">
          <div className="flex border-b border-slate-100">
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
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 transition-colors relative ${
                    isActive ? 'text-primary-600' : 'text-slate-500 hover:text-slate-700'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-xs font-medium">{panel.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary-500 rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Desktop 3-column layout - flexbox linh hoạt, không border thô */}
      {isLargeScreen ? (
        <div className="flex-1 flex gap-0 bg-white rounded-xl shadow-sm shadow-slate-200/60 overflow-hidden">
          {/* Left */}
          <div className={`${leftCollapsed ? 'w-14' : 'w-72'} shrink-0 transition-[width] duration-200 border-r border-slate-100`}>
            <div className="h-full">
              <ChatListSidebar
                selectedBot={selectedBot}
                onSelectBot={handleSelectBot}
                onCreateNew={handleCreateNew}
                collapsed={leftCollapsed}
                onToggleCollapse={() => setLeftCollapsed(v => !v)}
              />
            </div>
          </div>

          {/* Middle */}
          <div className="flex-1 min-w-0 flex flex-col bg-white">
            {selectedBot ? (
              <>
                <div className="border-b border-slate-100">
                  <PlaygroundHeader
                    bot={selectedBot}
                    onConfig={() => setShowConfigModal(true)}
                    onShare={() => setShowShareModal(true)}
                    onDelete={handleCreateNew}
                  />
                </div>
                <ChatMessageArea
                  key={`chat-${selectedBot.id}`}
                  chatbot={selectedBot}
                  onUpdate={handleUpdateBot}
                />
              </>
            ) : (
              <EmptyState chatbot={selectedBot} />
            )}
          </div>

          {/* Right */}
          <div className={`${rightCollapsed ? 'w-14' : 'w-[360px]'} shrink-0 transition-[width] duration-200 border-l border-slate-100`}>
            <div className="h-full">
              <RightPanel
                chatbot={selectedBot}
                defaultTab="knowledge"
                onOpenWidgetSettings={(kind) => setWidgetModalKind(kind || 'script')}
                onUpdate={handleUpdateBot}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row gap-3 items-stretch">
          <div className={`${isCompact ? (activePanel === 'list' ? 'flex' : 'hidden') : 'flex'} flex-col w-full md:w-64 lg:w-72 shrink-0`}>
            <div className={`bg-white rounded-xl shadow-sm shadow-slate-200/60 flex-1 min-h-0 flex flex-col overflow-hidden`}>
              <ChatListSidebar
                selectedBot={selectedBot}
                onSelectBot={handleSelectBot}
                onCreateNew={handleCreateNew}
              />
            </div>
          </div>
          <div className={`${isCompact ? (activePanel === 'chat' ? 'flex' : 'hidden') : 'flex'} flex-1 min-w-0`}>
            <div className={`bg-white rounded-xl shadow-sm shadow-slate-200/60 flex-1 min-h-0 flex flex-col overflow-hidden w-full`}>
              {selectedBot ? (
                <ChatMessageArea
                  key={`chat-${selectedBot.id}`}
                  chatbot={selectedBot}
                  onUpdate={handleUpdateBot}
                />
              ) : (
                <EmptyState chatbot={selectedBot} />
              )}
            </div>
          </div>
          <div className={`${isCompact ? (activePanel === 'settings' ? 'flex' : 'hidden') : 'flex'} flex-col w-full md:w-72 xl:w-[360px] shrink-0`}>
            <div className={`bg-white rounded-xl shadow-sm shadow-slate-200/60 flex-1 min-h-0 flex flex-col overflow-hidden`}>
              {selectedBot ? (
                <RightPanel
                  chatbot={selectedBot}
                  defaultTab="knowledge"
                  onOpenWidgetSettings={(kind) => setWidgetModalKind(kind || 'script')}
                  onUpdate={handleUpdateBot}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <HiOutlineCog className="w-5 h-5 text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">Chọn chatbot</p>
                  <p className="text-xs text-slate-400 mt-1">Để cấu hình & triển khai</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ChatbotConfigModal
        open={showConfigModal}
        chatbot={selectedBot}
        onClose={() => setShowConfigModal(false)}
        onUpdate={handleUpdateBot}
      />
      <ShareChatbotModal
        open={showShareModal}
        chatbot={selectedBot}
        onClose={() => setShowShareModal(false)}
      />
      <WidgetSettingsModal
        open={!!widgetModalKind}
        embedKind={widgetModalKind}
        chatbot={selectedBot}
        onClose={() => setWidgetModalKind(null)}
        onUpdate={handleUpdateBot}
      />
    </div>
  );
}

export default ChatbotStudioPage;
