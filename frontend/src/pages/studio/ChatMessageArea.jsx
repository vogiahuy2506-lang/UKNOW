import { useState, useEffect, useRef } from 'react';
import {
  HiOutlineTrash,
  HiOutlineChevronDown,
  HiOutlineChatAlt2,
  HiOutlineSparkles,
  HiOutlineCog,
  HiOutlineChevronDoubleRight,
  HiOutlinePaperAirplane,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';
import { getAiQuotaErrorMessage } from '../../utils/aiLimitError.util';

function ChatMessageArea({ chatbot, sidebarOpen, onToggleSidebar, settingsOpen, onToggleSettings }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const getSessionKey = () => `uknow_sessions_${chatbot?.id}`;
  const getMsgKey = (sessionId) => `uknow_msgs_${chatbot?.id}_${sessionId}`;

  const loadSessions = () => {
    try {
      const saved = localStorage.getItem(getSessionKey());
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  };

  const saveSessions = (sessions) => {
    localStorage.setItem(getSessionKey(), JSON.stringify(sessions));
  };

  useEffect(() => {
    if (chatbot) {
      setMessages([]);
      setActiveSessionId(null);
      const sessions = loadSessions();
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id]);

  useEffect(() => {
    if (chatbot?.id) {
      const msgKey = activeSessionId ? getMsgKey(activeSessionId) : null;
      if (msgKey) {
        const saved = localStorage.getItem(msgKey);
        setMessages(saved ? JSON.parse(saved) : []);
      } else {
        setMessages([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id, activeSessionId]);

  useEffect(() => {
    if (chatbot?.id && messages.length > 0) {
      const msgKey = activeSessionId ? getMsgKey(activeSessionId) : null;
      if (msgKey) {
        localStorage.setItem(msgKey, JSON.stringify(messages));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, chatbot?.id, activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMessage = { role: 'user', content: input.trim(), created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const fullHistory = [...history, userMessage];

      const res = await chatbotApi.sendCustomChat({
        history: fullHistory,
        chatbot_id: chatbot?.id,
        system_instruction: chatbot?.system_instruction,
        temperature: chatbot?.temperature || 0.7,
        max_tokens: chatbot?.max_tokens || 2048,
      });

      if (res.data?.content) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.data.content,
          created_at: new Date().toISOString(),
        }]);
      } else if (res.data?.message) {
        toast.error(res.data.message);
      }
    } catch (err) {
      const message = getAiQuotaErrorMessage(err, t) || err.message || 'Gửi thất bại';
      toast.error(message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const createNewSession = () => {
    if (messages.length > 0 && activeSessionId) {
      localStorage.setItem(getMsgKey(activeSessionId), JSON.stringify(messages));
    }

    const sessions = loadSessions();
    const newSession = {
      id: `sess_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    sessions.unshift(newSession);
    if (sessions.length > 10) sessions.pop();
    saveSessions(sessions);

    setActiveSessionId(newSession.id);
    setMessages([]);
    setShowSessionMenu(false);
  };

  const selectSession = (sessionId) => {
    if (messages.length > 0 && activeSessionId) {
      localStorage.setItem(getMsgKey(activeSessionId), JSON.stringify(messages));
    }
    setActiveSessionId(sessionId);
    const saved = localStorage.getItem(getMsgKey(sessionId));
    setMessages(saved ? JSON.parse(saved) : []);
    setShowSessionMenu(false);
  };

  const deleteSession = (sessionId, e) => {
    e.stopPropagation();
    if (!confirm('Xóa session này?')) return;

    let sessions = loadSessions().filter(s => s.id !== sessionId);
    saveSessions(sessions);
    localStorage.removeItem(getMsgKey(sessionId));

    if (activeSessionId === sessionId) {
      setActiveSessionId(sessions[0]?.id || null);
      setMessages([]);
    }
    setShowSessionMenu(false);
    toast.success('Đã xóa');
  };

  const clearChat = () => {
    if (!confirm('Xóa tất cả tin nhắn?')) return;
    if (activeSessionId) {
      localStorage.removeItem(getMsgKey(activeSessionId));
    }
    setMessages([]);
    toast.success('Đã xóa');
  };

  const sessions = loadSessions();

  if (!chatbot) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-[#FFFBF5] to-white">
        <div className="text-center max-w-sm px-6">
          <div className="w-16 h-16 bg-gradient-to-br from-[#F97316] to-[#FB923C] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_8px_24px_rgba(249,115,22,0.35)]">
            <HiOutlineChatAlt2 className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-[18px] font-semibold text-[#1F2937] mb-2">Chọn chatbot để bắt đầu</h3>
          <p className="text-[13px] text-[#6B7280]">
            Chọn một chatbot từ danh sách bên trái để bắt đầu cuộc trò chuyện
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header — Orange theme */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-[#FED7AA]/60 shrink-0 bg-gradient-to-r from-white via-[#FFFBF5] to-white">
        <div className="flex items-center gap-2.5 min-w-0">
          {chatbot.avatar_url ? (
            <img src={chatbot.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-[#FED7AA]" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F97316] to-[#FB923C] flex items-center justify-center text-white text-[13px] font-semibold shrink-0 shadow-[0_2px_8px_rgba(249,115,22,0.3)]">
              {chatbot.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-[#1F2937] truncate">{chatbot.name}</h3>
            <p className="text-[11px] text-[#6B7280] flex items-center gap-1.5 truncate">
              {chatbot.is_active ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
                  Đang hoạt động
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF] shrink-0" />
                  Tạm dừng
                </>
              )}
              {sessions.length > 0 && <span className="text-[#FED7AA]">•</span>}
              {sessions.length > 0 && <span>{sessions.length} phiên</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 relative">
          {!sidebarOpen && (
            <button
              onClick={onToggleSidebar}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#F97316] transition-colors"
              title="Mở danh sách chatbot"
            >
              <HiOutlineChevronDoubleRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onToggleSettings}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              settingsOpen
                ? 'bg-[#FFF7ED] text-[#F97316] ring-1 ring-[#FED7AA]'
                : 'text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#F97316]'
            }`}
            title="Cài đặt"
          >
            <HiOutlineCog className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#DC2626] transition-colors"
            title="Xóa cuộc trò chuyện"
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowSessionMenu(!showSessionMenu)}
              className="h-8 px-3 flex items-center gap-1.5 rounded-full text-[#6B7280] hover:bg-[#FFEDD5] hover:text-[#F97316] transition-colors text-[13px] font-medium"
            >
              <HiOutlineChatAlt2 className="w-4 h-4" />
              Phiên
              <HiOutlineChevronDown className="w-3 h-3" />
            </button>

            {showSessionMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-[0_8px_24px_rgba(249,115,22,0.18),0_2px_8px_rgba(0,0,0,0.08)] border border-[#FED7AA] py-1 z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-[#FED7AA]/60 flex items-center justify-between bg-gradient-to-r from-[#FFFBF5] to-white">
                  <p className="text-[13px] font-semibold text-[#1F2937]">Phiên trò chuyện</p>
                  <button
                    onClick={createNewSession}
                    className="text-[12px] text-[#F97316] hover:text-[#EA580C] hover:underline font-semibold"
                  >
                    + Mới
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-[#6B7280]">
                      Chưa có phiên nào
                    </div>
                  ) : (
                    sessions.map((session, idx) => (
                      <div
                        key={session.id}
                        onClick={() => selectSession(session.id)}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          session.id === activeSessionId
                            ? 'bg-gradient-to-r from-[#FFF7ED] to-[#FFFBF5]'
                            : 'hover:bg-[#FFFBF5]'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                          session.id === activeSessionId
                            ? 'bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white shadow-[0_2px_4px_rgba(249,115,22,0.3)]'
                            : 'bg-[#FFEDD5] text-[#F97316]'
                        }`}>
                          {sessions.length - idx}
                        </span>
                        <span className={`flex-1 text-[13px] truncate ${
                          session.id === activeSessionId ? 'text-[#EA580C] font-semibold' : 'text-[#1F2937]'
                        }`}>
                          Phiên {sessions.length - idx}
                        </span>
                        <button
                          onClick={(e) => deleteSession(session.id, e)}
                          className="p-1 text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEF2F2] rounded transition-colors"
                        >
                          <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 bg-gradient-to-b from-white via-[#FFFBF5]/30 to-white">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
            <div className="relative mb-5">
              <div className="absolute inset-0 bg-[#F97316]/20 blur-2xl rounded-full" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F97316] to-[#FB923C] flex items-center justify-center text-white shadow-[0_8px_24px_rgba(249,115,22,0.35)]">
                <HiOutlineSparkles className="w-8 h-8" />
              </div>
            </div>
            <h3 className="text-[20px] font-semibold text-[#1F2937] mb-2">Bắt đầu cuộc trò chuyện</h3>
            <p className="text-[13px] text-[#6B7280] leading-relaxed">
              Nhập tin nhắn bên dưới để chat với{' '}
              <span className="font-semibold text-[#EA580C]">{chatbot.name}</span>
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F97316] to-[#FB923C] flex items-center justify-center shrink-0 text-white text-[12px] font-semibold shadow-[0_2px_8px_rgba(249,115,22,0.25)]">
                    {chatbot.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[80%]`}>
                  <div className={`px-4 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white rounded-3xl rounded-br-md shadow-[0_2px_8px_rgba(249,115,22,0.25)]'
                      : 'bg-[#FFFBF5] text-[#1F2937] border border-[#FED7AA]/60 rounded-3xl rounded-bl-md'
                  }`}>
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  <p className="text-[10px] text-[#6B7280] mt-1 px-2">
                    {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {sending && (
          <div className="max-w-3xl mx-auto flex gap-2.5 mt-5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F97316] to-[#FB923C] flex items-center justify-center shrink-0 text-white text-[12px] font-semibold shadow-[0_2px_8px_rgba(249,115,22,0.25)]">
              {chatbot.name?.[0]?.toUpperCase()}
            </div>
            <div className="bg-[#FFFBF5] border border-[#FED7AA]/60 rounded-3xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input — Orange theme */}
      <div className="px-4 pb-4 pt-2 bg-white shrink-0 border-t border-[#FED7AA]/40">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-[#FFFBF5] hover:bg-[#FFF7ED] focus-within:bg-white focus-within:shadow-[0_2px_12px_rgba(249,115,22,0.15)] rounded-3xl transition-all border border-[#FED7AA]/60 focus-within:border-[#F97316] focus-within:ring-2 focus-within:ring-[#F97316]/20">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập tin nhắn..."
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3 text-[14px] text-[#1F2937] placeholder:text-[#9CA3AF] outline-none max-h-32 leading-relaxed"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="m-1.5 w-9 h-9 bg-gradient-to-br from-[#F97316] to-[#FB923C] hover:from-[#EA580C] hover:to-[#F97316] text-white rounded-full flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0 shadow-[0_2px_8px_rgba(249,115,22,0.35)]"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <HiOutlinePaperAirplane className="w-4 h-4 -rotate-45" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[#6B7280] text-center mt-2">
            AI có thể mắc lỗi. Hãy kiểm tra thông tin quan trọng.
          </p>
        </div>
      </div>

      {showSessionMenu && <div className="fixed inset-0 z-40" onClick={() => setShowSessionMenu(false)} />}
    </div>
  );
}

export default ChatMessageArea;