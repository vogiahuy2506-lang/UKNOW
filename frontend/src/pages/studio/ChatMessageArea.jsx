import { useState, useEffect, useRef } from 'react';
import {
  HiOutlinePaperAirplane,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineChevronDown,
  HiOutlineChatAlt2,
  HiOutlineSparkles,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../services/api';

function ChatMessageArea({ chatbot }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Get custom colors from chatbot settings
  const primaryColor = chatbot?.primary_color || chatbot?.widget_settings?.primary_color || '#6366F1';
  const accentColor = chatbot?.accent_color || chatbot?.widget_settings?.accent_color || '#818CF8';
  const gradientStyle = `linear-gradient(135deg, ${primaryColor}, ${accentColor})`;

  // Storage keys
  const getSessionKey = () => `uknow_sessions_${chatbot?.id}`;
  const getMsgKey = (sessionId) => `uknow_msgs_${chatbot?.id}_${sessionId}`;

  // Load sessions
  const loadSessions = () => {
    try {
      const saved = localStorage.getItem(getSessionKey());
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  };

  // Save sessions
  const saveSessions = (sessions) => {
    localStorage.setItem(getSessionKey(), JSON.stringify(sessions));
  };

  // Reset when chatbot changes
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

  // Load messages when session changes
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

  // Save messages
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

      const res = await api.post('/ai/custom-chat', {
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
      toast.error(err.message || 'Gửi thất bại');
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
    // Save current messages first
    if (messages.length > 0 && activeSessionId) {
      localStorage.setItem(getMsgKey(activeSessionId), JSON.stringify(messages));
    }

    // Create new session
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
    // Save current
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
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <p className="text-slate-400">Chọn chatbot để bắt đầu</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: gradientStyle }}>
            {chatbot.avatar_url ? (
              <img src={chatbot.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-white text-sm font-bold">{chatbot.name?.[0]?.toUpperCase()}</span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{chatbot.name}</h3>
            <p className="text-xs text-slate-400">
              {sessions.length > 0 ? `Session 1/${sessions.length}` : 'Chưa có session'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={clearChat} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
            <HiOutlineTrash className="w-4 h-4" />
          </button>

          <div className="relative">
            <button onClick={() => setShowSessionMenu(!showSessionMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
              <HiOutlineChatAlt2 className="w-4 h-4" />
              <span className="hidden sm:inline">Session</span>
              <HiOutlineChevronDown className="w-3.5 h-3.5" />
            </button>

            {showSessionMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
                {sessions.map((session, idx) => (
                  <div key={session.id}
                    onClick={() => selectSession(session.id)}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 ${
                      session.id === activeSessionId ? 'bg-purple-50' : ''
                    }`}>
                    <span className="text-xs text-slate-400 w-4">{sessions.length - idx}</span>
                    <span className="flex-1 text-sm text-slate-700">Session {sessions.length - idx}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(session.created_at).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })}
                    </span>
                    {session.id === activeSessionId && <span className="w-2 h-2 bg-purple-500 rounded-full" />}
                    <button onClick={(e) => deleteSession(session.id, e)}
                      className="p-1 text-slate-400 hover:text-red-500">
                      <HiOutlineTrash className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <button onClick={createNewSession}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 border-t border-slate-100">
                  <HiOutlinePlus className="w-4 h-4" />
                  Session mới
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <HiOutlineSparkles className="w-8 h-8 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Bắt đầu trò chuyện</h3>
            <p className="text-sm text-slate-500">Nhập tin nhắn để chat với AI</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role !== 'user' && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: gradientStyle }}>
                  <span className="text-white text-xs font-bold">{chatbot.name?.[0]?.toUpperCase()}</span>
                </div>
              )}
              <div className={`max-w-[70%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                <div className={`rounded-2xl px-4 py-2.5 ${
                  msg.role === 'user'
                    ? 'text-white rounded-br-md'
                    : 'rounded-bl-md shadow-sm'
                }`}
                  style={msg.role === 'user'
                    ? { background: gradientStyle }
                    : { backgroundColor: '#fff', color: '#374151' }}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  {new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: gradientStyle }}>
              <span className="text-white text-xs font-bold">{chatbot.name?.[0]?.toUpperCase()}</span>
            </div>
            <div className="bg-white rounded-2xl rounded-bl-md shadow-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: primaryColor, animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: primaryColor, animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: primaryColor, animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập tin nhắn..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-11 h-11 text-white rounded-xl flex items-center justify-center disabled:opacity-50"
            style={{ background: gradientStyle }}
          >
            {sending ? (
              <HiOutlineTrash className="w-5 h-5 animate-spin" />
            ) : (
              <HiOutlinePaperAirplane className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {showSessionMenu && <div className="fixed inset-0 z-40" onClick={() => setShowSessionMenu(false)} />}
    </div>
  );
}

export default ChatMessageArea;
