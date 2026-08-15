/**
 * Public Chatbot Page - Dùng cho iframe embed trên website khác
 * Route: /chat/:chatbotId
 */
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import MessageAttachments, { formatFileSize } from '../../components/MessageAttachments';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../features/storage/validateUpload';

const ACCEPTED = '.pdf,.docx,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp';
const MAX_ATTACH = 3;

export default function PublicChatbotPage() {
  const { chatbotId } = useParams();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatbot, setChatbot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const sessionId = useRef(localStorage.getItem(`uknow_session_${chatbotId}`) || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    localStorage.setItem(`uknow_session_${chatbotId}`, sessionId.current);
  }, [chatbotId]);

  const primaryColor = chatbot?.primary_color || chatbot?.theme_color || '#6366f1';
  const backgroundColor = chatbot?.background_color || '#ffffff';
  const textColor = chatbot?.text_color || '#1f2937';
  const accentColor = chatbot?.accent_color || '#60A5FA';
  const logoUrl = chatbot?.logo_url || '';
  const showAvatar = chatbot?.show_avatar !== false;
  const suggestedQuestions = chatbot?.suggested_questions || [];
  const allowAttachments = chatbot?.allow_attachments === true;

  useEffect(() => {
    loadChatbot();
  }, [chatbotId]);

  useEffect(() => {
    const saved = localStorage.getItem(`uknow_msgs_${chatbotId}_${sessionId.current}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      } catch (e) { /* ignore */ }
    }
  }, [chatbotId, sessionId.current]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`uknow_msgs_${chatbotId}_${sessionId.current}`, JSON.stringify(messages));
    }
  }, [messages, chatbotId, sessionId.current]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChatbot = async () => {
    try {
      setLoading(true);
      const res = await chatbotApi.getPublicChatbot(chatbotId);
      if (res.data.success) {
        setChatbot(res.data.data);
        setMessages([{
          role: 'assistant',
          content: res.data.data.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?',
        }]);
      }
    } catch (err) {
      setError('Không tìm thấy chatbot');
    } finally {
      setLoading(false);
    }
  };

  const handlePickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !allowAttachments) return;
    const validation = validateFilesBeforeUpload(files, null);
    if (!validation.ok) {
      // eslint-disable-next-line no-alert
      alert(getUploadValidationErrorMessage(validation));
      return;
    }
    const remaining = MAX_ATTACH - pendingAttachments.length;
    if (remaining <= 0) return;

    setUploading(true);
    try {
      for (const file of files.slice(0, remaining)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId.current);
        const res = await chatbotApi.uploadPublicChatAttachment(chatbotId, formData);
        const data = res.data?.data;
        if (data) setPendingAttachments((prev) => [...prev, data]);
        else throw new Error(res.data?.message || 'Tải file thất bại');
      }
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err.response?.data?.message || err.message || 'Tải file thất bại');
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async (text) => {
    if ((!text?.trim() && pendingAttachments.length === 0) || isTyping || uploading) return;

    const attachmentsToSend = [...pendingAttachments];
    const userMsg = {
      role: 'user',
      content: text?.trim() || '',
      attachments: attachmentsToSend,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setPendingAttachments([]);
    setIsTyping(true);

    try {
      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments || [],
      }));

      const res = await chatbotApi.sendPublicChatbotMessage(chatbotId, {
        message: text?.trim() || '',
        history,
        sessionId: sessionId.current,
        attachments: attachmentsToSend,
      });

      if (res.data.success && res.data.data) {
        const payload = res.data.data;
        if (payload.rateLimited && !payload.content) {
          return;
        }
        if (payload.content) {
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: payload.content,
          }]);
        }
      } else {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: res.data?.message || 'Xin lỗi, đã có lỗi xảy ra.',
        }]);
      }
    } catch (err) {
      const isTimeout = err.code === 'ECONNABORTED' || /timeout/i.test(String(err.message || ''));
      const serverMsg = err.response?.data?.message;
      const fallback = isTimeout
        ? 'AI đang xử lý quá lâu, vui lòng thử lại sau vài giây.'
        : (serverMsg || 'Không thể kết nối với server. Vui lòng thử lại sau.');
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: fallback,
      }]);
      setPendingAttachments(attachmentsToSend);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  const handleSuggestionClick = (question) => {
    setInputText(question);
    inputRef.current?.focus();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: `${primaryColor} transparent transparent transparent` }}></div>
          <p style={{ color: textColor, opacity: 0.6 }}>Đang tải chatbot...</p>
        </div>
      </div>
    );
  }

  if (error || !chatbot) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor }}>
        <div className="text-center p-8 rounded-2xl shadow-lg" style={{ backgroundColor: '#fff' }}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-3xl" style={{ backgroundColor: `${primaryColor}15` }}>
            🤖
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: textColor }}>Chatbot không tồn tại</h2>
          <p style={{ color: textColor, opacity: 0.6 }}>{error || 'Vui lòng kiểm tra lại đường dẫn.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor, color: textColor }}>
      <div
        className="shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
          color: 'white',
        }}
      >
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          {showAvatar && (
            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-xl" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                '🤖'
              )}
            </div>
          )}
          <div>
            <h1 className="font-semibold text-base">{chatbot.name || 'AI Assistant'}</h1>
            <p className="text-xs opacity-80 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Đang trò chuyện
            </p>
          </div>
        </div>
      </div>

      {suggestedQuestions.length > 0 && messages.length === 1 && (
        <div className="max-w-lg mx-auto w-full px-4 pt-4">
          <p className="text-xs font-medium mb-2" style={{ color: textColor, opacity: 0.6 }}>Câu hỏi gợi ý:</p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSuggestionClick(q)}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all hover:scale-105"
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

      <div className="flex-1 overflow-y-auto p-4 chat-messages-scroll">
        <div className="max-w-lg mx-auto flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'text-white rounded-br-md'
                    : 'rounded-bl-md shadow-sm'
                }`}
                style={
                  msg.role === 'user'
                    ? { background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`, color: 'white' }
                    : { backgroundColor: '#fff', color: textColor, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }
                }
              >
                {msg.content ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: String(msg.content)
                        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="text-decoration: underline;">$1</a>')
                        .replace(/\n/g, '<br/>'),
                    }}
                  />
                ) : null}
                <MessageAttachments attachments={msg.attachments} messageRole={msg.role} />
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-bl-md shadow-sm" style={{ backgroundColor: '#fff' }}>
                <div className="flex gap-1">
                  <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: primaryColor, animationDelay: '0ms' }} />
                  <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: primaryColor, animationDelay: '150ms' }} />
                  <span className="w-2.5 h-2.5 rounded-full animate-bounce" style={{ backgroundColor: primaryColor, animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t" style={{ borderColor: `${primaryColor}20`, backgroundColor: '#fff' }}>
        <div className="max-w-lg mx-auto px-4 py-3">
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingAttachments.map((att, idx) => (
                <div key={att.ref || idx} className="text-xs px-2 py-1 rounded-lg bg-slate-100 flex items-center gap-1">
                  <span className="truncate max-w-[140px]">{att.displayName || att.name}</span>
                  <span className="text-slate-400">{formatFileSize(att.size)}</span>
                  <button type="button" className="text-slate-500" onClick={() => setPendingAttachments((p) => p.filter((_, i) => i !== idx))}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-center">
            {allowAttachments && (
              <>
                <input ref={fileInputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={handlePickFiles} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isTyping || uploading || pendingAttachments.length >= MAX_ATTACH}
                  className="w-11 h-11 rounded-full flex items-center justify-center border disabled:opacity-50"
                  style={{ borderColor: `${primaryColor}30`, color: primaryColor }}
                  title="Đính kèm tệp"
                >
                  📎
                </button>
              </>
            )}
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Nhập tin nhắn..."
              className="flex-1 px-4 py-3 border-2 rounded-full focus:outline-none text-sm transition-all"
              style={{
                borderColor: `${primaryColor}30`,
                color: textColor,
              }}
              disabled={isTyping}
            />
            <button
              type="button"
              onClick={() => sendMessage(inputText)}
              disabled={(!inputText.trim() && pendingAttachments.length === 0) || isTyping || uploading}
              className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`, boxShadow: `0 4px 12px ${primaryColor}40` }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
