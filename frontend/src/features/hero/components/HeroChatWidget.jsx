import { useState, useRef, useEffect } from 'react';
import { HiOutlineX, HiOutlineSparkles } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

// Custom SVG Icons
const BotAvatarIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C9.79 2 8 3.79 8 6V7H7C5.34 7 4 8.34 4 10V18C4 19.66 5.34 21 7 21H17C18.66 21 20 19.66 20 18V10C20 8.34 18.66 7 17 7H16V6C16 3.79 14.21 2 12 2Z" fill="white" fillOpacity="0.95"/>
    <circle cx="9" cy="13" r="1.5" fill="#ea580c"/>
    <circle cx="15" cy="13" r="1.5" fill="#ea580c"/>
    <path d="M9 17H15" stroke="#ea580c" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="6" y="4" width="2" height="3" rx="1" fill="white" fillOpacity="0.95"/>
    <rect x="16" y="4" width="2" height="3" rx="1" fill="white" fillOpacity="0.95"/>
  </svg>
);

const ChatBubbleIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3C6.48 3 2 6.94 2 11.8c0 2.42 1.16 4.6 3.06 6.16L2 21l3.32-1.49C6.74 20.15 9.3 20.6 12 20.6c5.52 0 10-3.94 10-8.8S17.52 3 12 3z" fill="currentColor"/>
    <circle cx="8" cy="11.5" r="1.2" fill="white"/>
    <circle cx="12" cy="11.5" r="1.2" fill="white"/>
    <circle cx="16" cy="11.5" r="1.2" fill="white"/>
  </svg>
);

const SendIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor"/>
  </svg>
);

const CheckIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.2"/>
    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const VISITOR_ID_KEY = 'founderai_consultation_visitor_id';

function getVisitorId() {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = 'v_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

async function fetchVisitorIp() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch {
    return 'unknown';
  }
}

export default function HeroChatWidget() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [contactForm, setContactForm] = useState(null);
  const [contactData, setContactData] = useState({ name: '', email: '', phone: '', message: '' });
  const [isMinimized, setIsMinimized] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const i18nKey = (key) => t(`heroPage.${key}`);
  
  // Get quick replies from i18n for multi-language support
  const quickReplies = i18nKey('heroConsultation.quickReplies') || [];
  
  const welcomeMessage = i18nKey('heroConsultation.welcomeMessage') || 'Chào bạn! 👋 Tôi có thể giúp bạn tìm hiểu về Landing Page, Email Marketing, Zalo Automation và CRM. Bạn cần hỗ trợ về vấn đề gì?';
  const widgetTitle = i18nKey('heroConsultation.title') || 'Trợ lý Tư vấn';
  const freeChatsText = i18nKey('heroConsultation.freeChats') || 'Tư vấn miễn phí';
  const quotaTitle = i18nKey('heroConsultation.quotaTitle') || 'Hết lượt tư vấn';
  const quotaExceededText = i18nKey('heroConsultation.quotaExceeded') || 'Bạn đã hết lượt tư vấn miễn phí. Điền form bên dưới, đội ngũ tư vấn sẽ gọi lại cho bạn trong 24 giờ!';
  const placeholderText = i18nKey('heroConsultation.placeholder') || 'Nhập câu hỏi...';
  const openChatText = i18nKey('heroConsultation.openChat') || 'Chat tư vấn';
  const _closeText = i18nKey('heroConsultation.close') || 'Đóng';
  const suggestionsTitle = i18nKey('heroConsultation.suggestionsTitle') || 'Gợi ý:';

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, isMinimized, messages]);

  const handleOpen = () => {
    setIsOpen(true);
    setIsMinimized(false);
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', content: welcomeMessage }]);
    }
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const _handleClose = () => {
    setIsMinimized(true);
    setTimeout(() => setIsOpen(false), 200);
  };

  const handleMinimize = () => {
    setIsMinimized(true);
    setTimeout(() => setIsOpen(false), 200);
  };

  const handleQuickReply = (reply) => {
    // Show user's question
    setMessages(prev => [...prev, { role: 'user', content: reply.text }]);

    // Show pre-written response immediately (no AI call)
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: reply.response }]);
    }, 300);

    // Handle special action: open campaign flow modal
    if (reply.isAction === 'open_campaign_demo') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-campaign-flow', { detail: { flowKey: 'email' } }));
      }, 400);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || quotaExceeded) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setShowSuggestions(false);

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const visitorId = getVisitorId();
      const visitorIp = await fetchVisitorIp();

      const response = await fetch('/api/public/hero/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, visitorIp, message: userMessage })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === 'QUOTA_EXCEEDED') {
          setQuotaExceeded(true);
          setMessages(prev => [...prev, { role: 'assistant', content: quotaExceededText }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: data.message || 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.' 
          }]);
        }
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

    } catch (error) {
      console.error('Consultation error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Xin lỗi, đã xảy ra lỗi kết nối. Vui lòng thử lại.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactData.name || !contactData.email || !contactData.phone) return;

    try {
      const visitorId = getVisitorId();
      const visitorIp = await fetchVisitorIp();

      const response = await fetch('/api/public/hero/consultation/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...contactData, 
          visitorId, 
          visitorIp 
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setContactForm({ success: true });
      } else {
        setContactForm({ error: data.message || 'Đã xảy ra lỗi. Vui lòng thử lại.' });
      }
    } catch (error) {
      console.error('Contact form error:', error);
      setContactForm({ error: 'Đã xảy ra lỗi kết nối. Vui lòng thử lại.' });
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = document.getElementById('hero-chat-form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
    }
  };

  const formatMarkdown = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        data-help-shot-hide
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full p-3 shadow-2xl hover:shadow-orange-500/30 transition-all duration-300 flex items-center gap-2 group"
        aria-label="Open chat"
      >
        <ChatBubbleIcon className="w-6 h-6" />
        <span className="font-semibold text-sm pr-1 group-hover:pr-0 transition-all">{openChatText}</span>
        <span className="absolute -top-1.5 -right-1.5 bg-green-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse">
          {freeChatsText}
        </span>
      </button>
    );
  }

  return (
    // data-help-shot-hide: bộ chụp ảnh minh hoạ (e2e/screenshots) ẩn widget này đi,
    // nếu không nó nổi ở góc phải mọi ảnh chụp trang công khai.
    <div data-help-shot-hide className={`fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-48px)] transition-all duration-300 ${isMinimized ? 'h-0 opacity-0 overflow-hidden' : 'h-[520px] opacity-100'}`}>
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/20 p-1.5 rounded-lg">
              <BotAvatarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">{widgetTitle}</h3>
              <p className="text-orange-100 text-xs">{freeChatsText}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleMinimize}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Minimize"
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-br-md' 
                  : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-gray-100'
              }`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <BotAvatarIcon className="w-4 h-4" />
                    <span className="text-xs font-medium text-gray-500">Foundy</span>
                  </div>
                )}
                <p 
                  className={`text-sm leading-relaxed ${msg.role === 'user' ? '' : 'text-gray-700'}`}
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                />
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-bl-md shadow-sm border border-gray-100 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <BotAvatarIcon className="w-4 h-4" />
                  <span className="text-xs text-gray-500">Typing...</span>
                </div>
                <div className="flex gap-1 mt-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {quotaExceeded && !contactForm && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-amber-800 text-sm font-medium mb-3">{quotaTitle}</p>
              <form onSubmit={handleContactSubmit} className="space-y-3">
                <input
                  type="text"
                  placeholder="Họ và tên"
                  value={contactData.name}
                  onChange={(e) => setContactData({...contactData, name: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={contactData.email}
                  onChange={(e) => setContactData({...contactData, email: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                <input
                  type="tel"
                  placeholder="Số điện thoại"
                  value={contactData.phone}
                  onChange={(e) => setContactData({...contactData, phone: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  required
                />
                <textarea
                  placeholder="Câu hỏi của bạn (tùy chọn)"
                  value={contactData.message}
                  onChange={(e) => setContactData({...contactData, message: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  rows={2}
                />
                <button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 rounded-lg transition-colors"
                >
                  Gửi yêu cầu
                </button>
              </form>
            </div>
          )}

          {contactForm?.success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <div className="text-green-500 mb-2">
                <CheckIcon className="w-8 h-8 mx-auto" />
              </div>
              <p className="text-green-800 font-medium">Đã gửi thành công!</p>
              <p className="text-green-600 text-sm mt-1">Đội ngũ tư vấn sẽ gọi lại cho bạn trong 24 giờ.</p>
            </div>
          )}

          {contactForm?.error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-red-600 text-sm">{contactForm.error}</p>
            </div>
          )}

          {/* Quick Reply Suggestions */}
          {showSuggestions && messages.length <= 2 && quickReplies.length > 0 && (
            <div className="bg-gradient-to-t from-gray-50 pt-3 -mx-5 px-5">
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                <HiOutlineSparkles className="w-3 h-3 text-orange-500" />
                {suggestionsTitle}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickReplies.map((reply) => (
                  <button
                    key={reply.id}
                    onClick={() => handleQuickReply(reply)}
                    className="px-3 py-1.5 bg-white border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-600 hover:text-orange-700 rounded-full text-xs font-medium transition-all duration-150 shadow-sm hover:shadow"
                  >
                    {reply.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form id="hero-chat-form" onSubmit={handleSubmit} className="border-t border-gray-100 p-4 bg-white">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder={placeholderText}
              disabled={isLoading || quotaExceeded}
              className="flex-1 px-4 py-2.5 bg-gray-100 border-0 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading || quotaExceeded}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-gray-300 disabled:to-gray-300 text-white p-2.5 rounded-full transition-all shadow-md hover:shadow-lg disabled:shadow-none"
              aria-label="Send message"
            >
              <SendIcon className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
