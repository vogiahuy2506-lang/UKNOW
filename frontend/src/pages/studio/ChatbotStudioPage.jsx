import { useState, useCallback, useEffect, useRef } from 'react';
import {
  HiOutlineViewBoards,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineChatAlt2,
  HiOutlinePaperClip,
  HiOutlineX,
  HiOutlineCog,
  HiOutlineGlobeAlt,
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
import { clientValidateFile, getChatbotTheme } from './studio.util';
import { StudioEmptyState } from './StudioEmptyState';
import { useI18n } from '../../i18n';
import useStorageQuota from '../../features/storage/useStorageQuota';
import RenderTextWithLinks from '../../utils/renderTextWithLinks';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../features/storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../features/storage/storageEvents';
import useMediaQuery from '../../hooks/useMediaQuery';
import { useAuthStore } from '../../stores/authStore';

const RECENT_CONVERSATIONS_LIMIT = 5;
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp';
const MAX_ATTACHMENTS = 3;

// Tab thứ ba của điện thoại/máy tính bảng thực chất mở cột Triển khai, không phải hộp Cấu hình — nhãn cũ "Cấu hình" làm
// khách tìm mãi không thấy chỗ đổi tên/hướng dẫn AI (S-02). Hộp Cấu hình nay mở bằng nút ở đầu khung chat.
const MOBILE_PANELS = [
  { id: 'list',     label: 'Danh sách',  icon: HiOutlineViewBoards },
  { id: 'chat',     label: 'Trò chuyện', icon: HiOutlineChatAlt2 },
  { id: 'settings', labelKey: 'chatbot.studio.tabDeploy', icon: HiOutlineGlobeAlt },
];

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
function ChatMessageArea({ chatbot, onOpenConfig, canUseAi = true }) {
  const { t } = useI18n();
  const { usage: storageQuota } = useStorageQuota();
  // Gói có giới hạn credit thì chat thử bị trừ 1 credit mỗi câu trả lời: nói rõ dưới ô nhập. Gói không giới hạn (hoặc
  // chưa tải xong) thì không hứa "1 credit" — chỉ nói điều luôn đúng (chat thử bỏ qua khung giờ và giới hạn lượt).
  const aiCreditLimit = useAuthStore((state) => state.aiCredits?.limit);
  const hasCreditLimit = Number(aiCreditLimit) > 0;
  const [showAllConversations, setShowAllConversations] = useState(false);
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
  // document_count (API danh sách) = số tài liệu SẴN SÀNG; thiếu trường (bot vừa tạo) = chưa có tài liệu.
  const hasNoDocuments = !chatbot?._offlineCache && (Number(chatbot?.document_count ?? chatbot?.documents?.length ?? 0) || 0) === 0;

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

    const userText = input.trim();
    const attachmentsToSend = [...pendingAttachments];
    const userContent = userText || (attachmentsToSend.length ? '[Đính kèm]' : '');
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
      const history = messages.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments || [],
      }));

      const res = await chatbotApi.sendCustomChat({
        history: [...history, {
          role: 'user',
          content: userContent,
          attachments: attachmentsToSend,
        }],
        chatbot_id: chatbot?.id,
        system_instruction: chatbot?.system_instruction,
        temperature: chatbot?.temperature || 0.7,
        max_tokens: chatbot?.max_tokens || 2048,
        attachments: attachmentsToSend,
      });

      const reply = res.data?.content;
      if (!reply) throw new Error(res.data?.message || t('chatbot.studio.sendFailed'));

      // CHỈ lưu vào phiên SAU KHI AI đã trả lời (S-28). Bản cũ tạo phiên + lưu tin người dùng trước khi gọi AI: AI lỗi thì
      // tin biến khỏi màn nhưng còn trong DB (F5 thấy tin không có trả lời), và phiên tạo xong mà lỗi nằm lại rỗng
      // (production 04/10: 11/84 phiên chat thử rỗng).
      let conv = activeConversation;
      try {
        if (!conv) {
          const created = await chatbotApi.createChatbotStudioConversation(chatbot.id);
          conv = created.data?.data || null;
          if (conv) {
            setConversations(prev => [conv, ...prev]);
            setActiveConversation(conv);
          }
        }
        if (conv) {
          await chatbotApi.addChatbotStudioMessage(conv.id, {
            role: 'user',
            content: userContent,
            attachments: attachmentsToSend,
            message_type: attachmentsToSend.length ? 'file' : 'text',
          });
          await chatbotApi.addChatbotStudioMessage(conv.id, {
            role: 'assistant',
            content: reply,
          });
        }
      } catch {
        // Câu trả lời đã có (và đã tính credit): vẫn hiện trên màn, chỉ báo là chưa lưu được vào lịch sử.
        toast.error(t('chatbot.studio.saveChatFailed'));
      }

      shouldScrollToBottomRef.current = true;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      }]);

      if (conv) {
        setConversations(prev => prev.map(c =>
          c.id === conv.id
            ? { ...c, last_message: reply.substring(0, 100), last_message_at: new Date().toISOString() }
            : c
        ));
      }
    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(String(err.message || ''));
      toast.error(isTimeout ? 'AI đang xử lý quá lâu, vui lòng thử lại' : (err.response?.data?.message || err.message || 'Gửi thất bại'));
      // Trả lại đúng như trước khi bấm gửi: bỏ tin vừa hiện, khôi phục chữ và tệp đính kèm để bấm gửi lại.
      setMessages(prev => prev.filter(m => m !== userMessage));
      setInput(current => current || userText);
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

        {/* Khung trống: lời chào của bot, dải báo thiếu tài liệu, câu hỏi gợi ý, cuộc trò chuyện gần đây (S-06) */}
        {messages.length === 0 && !loadingMessages && (
          <div className="flex gap-2.5">
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
            <div className="max-w-[85%] md:max-w-[75%]">
              <div data-testid="welcome-bubble" className="px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-slate-100 text-sm leading-relaxed text-slate-900">
                <p className="whitespace-pre-wrap">
                  {chatbot?.greeting_msg || chatbot?.welcome_message || t('chatbot.studio.defaultGreeting')}
                </p>
              </div>
            </div>
          </div>
        )}

        {messages.length === 0 && !loadingMessages && hasNoDocuments && (
          <div data-testid="no-documents-strip" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
            <p className="text-xs text-amber-900 leading-relaxed">{t('chatbot.studio.noDocumentsStrip')}</p>
            <button
              type="button"
              onClick={() => onOpenConfig?.('knowledge')}
              className="shrink-0 px-2.5 py-1.5 rounded-md bg-white border border-amber-200 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors whitespace-nowrap"
            >
              {t('chatbot.studio.addDocuments')}
            </button>
          </div>
        )}

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

        {messages.length === 0 && conversations.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2.5 px-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cuộc trò chuyện gần đây</p>
            </div>
            <div className="space-y-1">
              {(showAllConversations ? conversations : conversations.slice(0, RECENT_CONVERSATIONS_LIMIT)).map(conv => (
                <ConversationCard
                  key={conv.id}
                  conv={conv}
                  onSelect={handleSelectConversation}
                  onDelete={handleDeleteConversation}
                />
              ))}
            </div>
            {conversations.length > RECENT_CONVERSATIONS_LIMIT && (
              <button
                type="button"
                onClick={() => setShowAllConversations(v => !v)}
                className="mt-1.5 px-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
              >
                {showAllConversations
                  ? t('chatbot.studio.recentsShowLess')
                  : t('chatbot.studio.recentsShowMore', { count: conversations.length - RECENT_CONVERSATIONS_LIMIT })}
              </button>
            )}
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
                {msg.content ? (
                  <p className="whitespace-pre-wrap">
                    <RenderTextWithLinks
                      text={msg.content}
                      linkClassName={`underline break-all font-medium hover:opacity-80 ${msg.role === 'user' ? 'text-white' : 'text-primary-600'}`}
                    />
                  </p>
                ) : null}
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
          {canUseAi ? <>
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
          <p data-testid="test-chat-note" className="mt-1.5 px-1 text-[11px] text-slate-400">
            {hasCreditLimit ? t('chatbot.studio.testChatNoteCredit') : t('chatbot.studio.testChatNoteFree')}
          </p>
          </> : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
              {t('chatbot.studio.employeeNoTestChat')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
function ChatbotStudioPage() {
  const { t } = useI18n();
  const activeContext = useAuthStore((state) => state.activeContext);
  const isEmployeeContext = activeContext?.type === 'employee';
  const [selectedBot, setSelectedBot] = useState(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [activePanel, setActivePanel] = useState('list');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configSection, setConfigSection] = useState(null);
  const [widgetModalKind, setWidgetModalKind] = useState(null);
  const [deployDrawerOpen, setDeployDrawerOpen] = useState(false);
  // Đổi số này = dựng lại khung chat thử từ đầu (cuộc trò chuyện mới) mà không cần tạo phiên rỗng trong DB.
  const [chatResetKey, setChatResetKey] = useState(0);

  const isCompact = useMediaQuery('(max-width: 1023.99px)');
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  // Từ 1280px mới đủ chỗ cho 3 cột (menu 220 + danh sách 288 + cột Triển khai 360 → khung chat còn ≥ 400px). Từ 1024 đến
  // 1279 khung chat chỉ còn ~150px, nên cột Triển khai thành ngăn kéo mở bằng nút "Triển khai" (S-19).
  const isWide = useMediaQuery('(min-width: 1280px)');

  const handleSelectBot = useCallback((bot) => {
    setSelectedBot(bot);
    setDeployDrawerOpen(false);
    if (bot) setActivePanel('chat');
  }, []);

  const handleUpdateBot = useCallback((updatedBot) => {
    setSelectedBot(updatedBot);
    // Cột trái giữ danh sách riêng: báo để nó gộp bản mới, kẻo chọn lại bot sẽ nhận object cũ.
    if (updatedBot?.id != null) {
      document.dispatchEvent(new CustomEvent('studio:bot-updated', { detail: updatedBot }));
    }
  }, []);

  // KnowledgeTab báo số tài liệu mới: bot đang chọn cập nhật theo để dải "chưa có tài liệu" tự biến mất khi vừa thêm.
  useEffect(() => {
    const handler = (e) => {
      const { chatbotId, count, errorCount } = e.detail || {};
      if (chatbotId == null || !Number.isFinite(Number(count))) return;
      setSelectedBot((prev) => (
        prev && String(prev.id) === String(chatbotId)
          ? { ...prev, document_count: Number(count), document_error_count: Number(errorCount) || 0 }
          : prev
      ));
    };
    document.addEventListener('studio:knowledge-changed', handler);
    return () => document.removeEventListener('studio:knowledge-changed', handler);
  }, []);

  const handleCreateNew = useCallback(() => {
    if (isCompact) setActivePanel('list');
    document.dispatchEvent(new CustomEvent('studio:create-new'));
  }, [isCompact]);

  const openConfig = useCallback((section) => {
    setConfigSection(typeof section === 'string' ? section : null);
    setShowConfigModal(true);
  }, []);

  const handleNewChat = useCallback(() => setChatResetKey((k) => k + 1), []);

  const openWidgetSettings = (kind) => setWidgetModalKind(kind || 'script');

  const renderChat = () => (
    <ChatMessageArea
      key={`chat-${selectedBot.id}-${chatResetKey}`}
      chatbot={selectedBot}
      onOpenConfig={openConfig}
      canUseAi={!isEmployeeContext}
    />
  );

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
                  <span className="text-xs font-medium">{panel.labelKey ? t(panel.labelKey) : panel.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary-500 rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Desktop: 3 cột từ 1280px; 1024–1279px: 2 cột + ngăn kéo Triển khai */}
      {isLargeScreen ? (
        <div className="flex-1 flex gap-0 bg-white rounded-xl shadow-sm shadow-slate-200/60 overflow-hidden relative">
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
                    onConfig={openConfig}
                    onNewChat={handleNewChat}
                    onOpenDeploy={isWide ? undefined : () => setDeployDrawerOpen(true)}
                  />
                </div>
                {renderChat()}
              </>
            ) : (
              <StudioEmptyState chatbot={selectedBot} />
            )}
          </div>

          {/* Right */}
          {isWide && (
            <div className="w-[360px] shrink-0 border-l border-slate-100">
              <div className="h-full">
                <RightPanel
                  chatbot={selectedBot}
                  onOpenWidgetSettings={openWidgetSettings}
                  onUpdate={handleUpdateBot}
                />
              </div>
            </div>
          )}

          {/* Ngăn kéo Triển khai (< 1280px) */}
          {!isWide && deployDrawerOpen && selectedBot && (
            <>
              <div
                data-testid="deploy-drawer-backdrop"
                className="absolute inset-0 z-20 bg-slate-900/20"
                onClick={() => setDeployDrawerOpen(false)}
              />
              <div
                data-testid="deploy-drawer"
                className="absolute inset-y-0 right-0 z-30 w-[360px] max-w-full bg-white border-l border-slate-100 shadow-xl"
              >
                <button
                  type="button"
                  onClick={() => setDeployDrawerOpen(false)}
                  className="absolute top-3 right-3 z-10 w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  aria-label="Đóng"
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
                <RightPanel
                  chatbot={selectedBot}
                  onOpenWidgetSettings={(kind) => {
                    setDeployDrawerOpen(false);
                    openWidgetSettings(kind);
                  }}
                  onUpdate={handleUpdateBot}
                />
              </div>
            </>
          )}
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
                <>
                  {/* S-02: trên điện thoại/máy tính bảng, đầu khung chat có tên bot, trạng thái và nút Cấu hình — trước đây
                      chỉ nhánh màn lớn vẽ PlaygroundHeader nên không có đường nào mở hộp Cấu hình. */}
                  <div className="border-b border-slate-100">
                    <PlaygroundHeader
                      bot={selectedBot}
                      onConfig={openConfig}
                      onNewChat={handleNewChat}
                    />
                  </div>
                  {renderChat()}
                </>
              ) : (
                <StudioEmptyState chatbot={selectedBot} />
              )}
            </div>
          </div>
          <div className={`${isCompact ? (activePanel === 'settings' ? 'flex' : 'hidden') : 'flex'} flex-col w-full md:w-72 xl:w-[360px] shrink-0`}>
            <div className={`bg-white rounded-xl shadow-sm shadow-slate-200/60 flex-1 min-h-0 flex flex-col overflow-hidden`}>
              {selectedBot ? (
                <RightPanel
                  chatbot={selectedBot}
                  onOpenWidgetSettings={openWidgetSettings}
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
        initialSection={configSection}
        onClose={() => {
          setShowConfigModal(false);
          setConfigSection(null);
        }}
        onUpdate={handleUpdateBot}
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
