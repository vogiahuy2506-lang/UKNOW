import { useState, useCallback, useEffect, useRef } from 'react';
import {
  HiOutlineViewBoards,
  HiOutlinePaperAirplane,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../services/api';
import ChatbotSettings from './ChatbotSettings';
import ChatListSidebar from './ChatListSidebar';

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
    <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ backgroundColor: bgColor }}>
      {/* Avatar */}
      <div className="relative mb-6">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-lg"
          style={{ background: gradientStyle }}
        >
          {chatbot?.logo_url ? (
            <img src={chatbot.logo_url} alt="" className="w-full h-full rounded-3xl object-cover" />
          ) : chatbot?.avatar_url ? (
            <img src={chatbot.avatar_url} alt="" className="w-full h-full rounded-3xl object-cover" />
          ) : (
            <span className="text-white text-4xl font-bold">{chatbot?.name?.[0]?.toUpperCase() || '?'}</span>
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-400 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </div>
      </div>

      {/* Welcome */}
      <h2 className="text-2xl font-bold mb-2" style={{ color: textColor }}>
        {chatbot?.greeting_msg || `Chào bạn! Tôi là ${chatbot?.name || 'AI Assistant'}`}
      </h2>
      <p className="text-sm mb-8 max-w-md text-center" style={{ color: `${textColor}99` }}>
        {chatbot?.description || 'Hãy hỏi tôi bất cứ điều gì về kiến thức đã được thiết lập.'}
      </p>

      {/* Suggested Questions */}
      {suggestedQuestions.length > 0 && (
        <div className="mb-8 w-full max-w-md">
          <p className="text-xs font-semibold mb-3 text-center uppercase tracking-wider" style={{ color: `${textColor}80` }}>
            Câu hỏi gợi ý
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestedQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => {}}
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

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        {[
          { icon: '💡', label: 'Hỏi về sản phẩm', color: 'emerald' },
          { icon: '📖', label: 'Hướng dẫn sử dụng', color: 'blue' },
          { icon: '🔧', label: 'Hỗ trợ kỹ thuật', color: 'amber' },
          { icon: '💬', label: 'Trò chuyện tự do', color: 'violet' },
        ].map((action) => (
          <button
            key={action.label}
            onClick={() => {}}
            className="p-4 rounded-2xl border transition-all hover:scale-105 text-left"
            style={{
              backgroundColor: bgColor,
              borderColor: `${primaryColor}20`,
            }}
          >
            <span className="text-2xl mb-2 block">{action.icon}</span>
            <span className="text-sm font-semibold block" style={{ color: textColor }}>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Chat Message Area with custom branding
function ChatMessageArea({ chatbot, onUpdate: _onUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const { primaryColor, bgColor, textColor, gradientStyle } = getChatbotTheme(chatbot);
  const suggestedQuestions = chatbot?.suggested_questions || chatbot?.widget_settings?.suggested_questions || [];

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
      const res = await api.post('/ai/custom-chat', {
        history: [...history, { role: 'user', content: input }],
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

  const clearChat = () => {
    if (!confirm('Xóa tất cả tin nhắn?')) return;
    setMessages([]);
    toast.success('Đã xóa');
  };

  const handleSuggestionClick = (q) => {
    setInput(q);
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
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
        <button
          onClick={clearChat}
          className="p-2 rounded-lg transition-colors hover:bg-red-50 text-red-400"
          title="Xóa chat"
        >
          <HiOutlineTrash className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

        {/* Message bubbles */}
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
            <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div
                className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={msg.role === 'user'
                  ? { background: gradientStyle, color: 'white', boxShadow: `0 4px 12px ${primaryColor}30` }
                  : { backgroundColor: bgColor, color: textColor, border: `1px solid ${primaryColor}15` }
                }
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
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
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập tin nhắn..."
            rows={1}
            className="flex-1 resize-none rounded-2xl px-4 py-3 text-sm outline-none transition-all"
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
            disabled={!input.trim() || sending}
            className="w-12 h-12 text-white rounded-xl flex items-center justify-center shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            style={{ background: gradientStyle }}
          >
            {sending ? (
              <HiOutlineRefresh className="w-5 h-5 animate-spin" />
            ) : (
              <HiOutlinePaperAirplane className="w-5 h-5" />
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

  const handleSelectBot = useCallback((bot) => {
    setSelectedBot(bot);
  }, []);

  const handleUpdateBot = useCallback((updatedBot) => {
    setSelectedBot(updatedBot);
    setBots(prev => prev.map(b => b.id === updatedBot.id ? updatedBot : b));
  }, []);

  const handleCreateNew = useCallback(() => {
    document.dispatchEvent(new CustomEvent('studio:create-new'));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">AI Chatbot</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quản lý và thiết lập chatbot AI cho doanh nghiệp của bạn.
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Left Sidebar (List) */}
        <div className={`transition-all duration-300 ease-in-out shrink-0 ${leftCollapsed ? 'w-full xl:w-16' : 'w-full xl:w-72'}`}>
          <div className="card h-[700px] flex flex-col overflow-hidden relative">
            <button
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg shadow-sm border border-slate-200 transition-colors"
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
        <div className="flex-1 w-full min-w-0 transition-all duration-300">
          <div className="card h-[700px] flex flex-col overflow-hidden">
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
        <div className={`transition-all duration-300 ease-in-out shrink-0 ${rightCollapsed ? 'w-full xl:w-16' : 'w-full xl:w-[400px]'}`}>
          <div className="card h-[700px] flex flex-col overflow-hidden relative">
            <button
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg shadow-sm border border-slate-200 transition-colors"
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
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center h-full">
                  <svg className="w-12 h-12 mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
