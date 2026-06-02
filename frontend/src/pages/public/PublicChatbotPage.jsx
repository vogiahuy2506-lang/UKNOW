/**
 * Public Chatbot Page - Dùng cho iframe embed trên website khác
 * Route: /chat/:chatbotId
 */
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';

export default function PublicChatbotPage() {
  const { chatbotId } = useParams();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatbot, setChatbot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    loadChatbot();
  }, [chatbotId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChatbot = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/chatbot-public/chatbot/${chatbotId}`);
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

  const sendMessage = async (text) => {
    if (!text?.trim() || isTyping) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await api.post(`/chatbot-public/custom-chatbot/${chatbotId}/chat`, {
        message: text,
        history: messages.slice(-10),
      });

      if (res.data.success && res.data.data) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.data.data.content,
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Xin lỗi, đã có lỗi xảy ra.',
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Không thể kết nối với server.',
      }]);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Đang tải chatbot...</p>
        </div>
      </div>
    );
  }

  if (error || !chatbot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-sm">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Chatbot không tồn tại</h2>
          <p className="text-gray-500">{error || 'Vui lòng kiểm tra lại đường dẫn.'}</p>
        </div>
      </div>
    );
  }

  const themeColor = chatbot.theme_color || '#6366f1';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div
        className="px-4 py-3 text-white shadow-md"
        style={{ backgroundColor: themeColor }}
      >
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-lg">
            🤖
          </div>
          <div>
            <h1 className="font-semibold">{chatbot.name || 'AI Assistant'}</h1>
            <p className="text-xs opacity-80">Đang trò chuyện</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'text-white rounded-br-md'
                    : 'bg-white text-gray-800 rounded-bl-md shadow-sm'
                }`}
                style={msg.role === 'user' ? { backgroundColor: themeColor } : {}}
                dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }}
              />
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white px-4 py-2.5 rounded-2xl rounded-bl-md shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-white p-3">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Nhập tin nhắn..."
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              disabled={isTyping}
            />
            <button
              onClick={() => sendMessage(inputText)}
              disabled={!inputText.trim() || isTyping}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: themeColor }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
