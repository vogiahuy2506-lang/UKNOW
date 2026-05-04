import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  HiOutlineSparkles, 
  HiOutlinePaperClip, 
  HiOutlineX, 
  HiOutlineChatAlt2, 
  HiOutlineChevronRight,
  HiOutlineCheckCircle,
  HiOutlineRefresh,
  HiOutlinePlay,
  HiOutlineArrowRight,
  HiOutlineTerminal,
  HiOutlinePencilAlt
} from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import aiApi from '../../services/aiApi';
import api from '../../services/api';

const AiChatbot = ({ isOpen, onToggle }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Chào bạn! Tôi là trợ lý AI chuyên gia Marketing. Hãy gửi cho tôi Profile doanh nghiệp hoặc thông tin sản phẩm, tôi sẽ thiết kế kịch bản chiến dịch tự động cho bạn.'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [suggestedScript, setSuggestedScript] = useState(null);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setIsUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/uploads/temp', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        return res.data.data;
      });

      const results = await Promise.all(uploadPromises);
      setUploadedFiles(prev => [...prev, ...results]);
      toast.success(`Đã tải lên ${results.length} tệp`);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Tải tệp lên thất bại');
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (tempId) => {
    setUploadedFiles(prev => prev.filter(f => f.tempId !== tempId));
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() && !uploadedFiles.length) return;

    const userMessage = {
      role: 'user',
      content: inputText,
      files: [...uploadedFiles]
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText('');
    setUploadedFiles([]);
    setIsTyping(true);
    setSuggestedScript(null);

    try {
      // Use the new chat API that supports history and smart routing
      const response = await aiApi.chat(newMessages, userMessage.files);
      
      if (response.success) {
        const { type, content, data } = response.data;
        
        const aiMessage = {
          role: 'assistant',
          content: content,
          script: type === 'script' ? data : null
        };
        
        setMessages(prev => [...prev, aiMessage]);
        if (type === 'script') {
          setSuggestedScript(data);
        }
      }
    } catch (error) {
      console.error('AI Error Details:', error);
      const serverMessage = error.response?.data?.message;
      const axiosError = error.message;
      const displayError = serverMessage || axiosError || 'Lỗi không xác định';
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Lỗi: ${displayError}`
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const navigate = useNavigate();

  const handleEditCampaign = async (script) => {
    const loadingToast = toast.loading('Đang chuẩn bị bộ thiết kế...');
    try {
      const response = await aiApi.executeCampaign(script, false);
      if (response.success && response.data?.id) {
        toast.success('Đã sẵn sàng! Đang chuyển hướng...', { id: loadingToast });
        navigate(`/app/campaigns/${response.data.id}/builder`);
        if (onToggle) onToggle();
      }
    } catch (error) {
      console.error('Create for edit error:', error);
      toast.error('Không thể mở bộ thiết kế kịch bản.', { id: loadingToast });
    }
  };

  const handleExecuteCampaign = async () => {
    if (!suggestedScript) return;

    const loadingToast = toast.loading('Đang khởi tạo và chạy chiến dịch...');
    try {
      const response = await aiApi.executeCampaign(suggestedScript, true);
      if (response.success) {
        toast.success('Chiến dịch đã được khởi tạo và đang chạy tự động!', { id: loadingToast });
        setSuggestedScript(null);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Tuyệt vời! Chiến dịch đã được kích hoạt thành công. Bạn có thể theo dõi tiến độ trong mục Quản lý chiến dịch.'
        }]);
      }
    } catch (error) {
      console.error('Execute error:', error);
      toast.error('Không thể thực thi chiến dịch tự động.', { id: loadingToast });
    }
  };

  return (
    <div 
      className={`fixed top-0 right-0 h-full bg-white border-l border-slate-200 shadow-2xl transition-all duration-300 ease-in-out z-40 flex flex-col ${
        isOpen ? 'w-full sm:w-[400px] md:w-[450px] translate-x-0' : 'w-0 translate-x-full'
      }`}
    >
      {/* Header */}
      <div className="flex-shrink-0 h-16 border-b border-slate-100 flex items-center justify-between px-5 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <HiOutlineSparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm tracking-tight">AI Assistant</h3>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ready</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onToggle}
          className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
        >
          <HiOutlineArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl ${
              msg.role === 'user' 
                ? 'bg-slate-100 text-slate-800 px-4 py-3' 
                : 'text-slate-800'
            }`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-orange-100 rounded-md flex items-center justify-center">
                    <HiOutlineSparkles className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Assistant</span>
                </div>
              )}
              
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              
              {msg.files && msg.files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {msg.files.map((f, fIdx) => (
                    <div key={fIdx} className="bg-white rounded-lg px-2 py-1.5 flex items-center gap-2 text-[10px] border border-slate-200 shadow-sm">
                      <HiOutlinePaperClip className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate max-w-[120px] font-medium text-slate-600">{f.originalName}</span>
                    </div>
                  ))}
                </div>
              )}

              {msg.script && (
                <div className="mt-5 bg-orange-50/50 rounded-2xl p-4 border border-orange-100/50 group hover:border-orange-200 transition-all">
                  <div className="flex items-center gap-2 mb-3 text-orange-600">
                    <HiOutlineTerminal className="w-5 h-5" />
                    <span className="font-black text-[10px] uppercase tracking-[0.2em]">
                      {msg.script.nodes && msg.script.landingPage 
                        ? 'Marketing Package' 
                        : msg.script.landingPage 
                          ? 'Landing Page Design' 
                          : 'Generated Script'}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mb-1">{msg.script.campaignName}</h4>
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">{msg.script.description}</p>
                  
                  <div className="space-y-2 mb-5">
                    {msg.script.nodes?.filter(node => node.nodeType !== 'trigger').slice(0, 5).map((node, nIdx) => (
                      <div key={nIdx} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-white border border-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-500 shadow-sm">
                          {nIdx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-slate-700 font-bold">
                            {node.nodeName || node.nodeSubtype || node.nodeType || 'Unnamed Step'}
                          </p>
                          {node.config?.subject && (
                            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1 italic">
                              Sub: {node.config.subject}
                            </p>
                          )}
                          {node.config?.content && (
                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                              {node.config.content}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {(msg.script.nodes?.length > 6) && (
                      <span className="text-[10px] text-slate-400 ml-9 font-medium">
                        + {msg.script.nodes.length - 6} steps more
                      </span>
                    )}
                  </div>

                  {msg.script.nodes && (
                    <div className="space-y-2">
                      <button 
                        onClick={handleExecuteCampaign}
                        className="w-full py-3 px-4 bg-orange-500 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 active:scale-[0.98]"
                      >
                        <HiOutlinePlay className="w-4 h-4" /> Run Campaign Now
                      </button>
                      
                      <button 
                        onClick={() => handleEditCampaign(msg.script)}
                        className="w-full py-3 px-4 bg-white text-slate-700 border border-slate-200 font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                      >
                        <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" /> Customize in Builder
                      </button>
                    </div>
                  )}

                  {msg.script.landingPage && (
                    <button 
                      onClick={() => {
                        const win = window.open('', '_blank');
                        win.document.write(`
                          <html>
                            <head>
                              <title>${msg.script.landingPage.title}</title>
                              <style>${msg.script.landingPage.css}</style>
                            </head>
                            <body>${msg.script.landingPage.html}</body>
                          </html>
                        `);
                        win.document.close();
                      }}
                      className="w-full mt-2 py-3 px-4 bg-white text-slate-800 border border-slate-200 font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <HiOutlineSparkles className="w-4 h-4 text-orange-500" /> Preview Landing Page
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1.5 px-4 py-3 bg-slate-50 rounded-2xl">
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-5 bg-white border-t border-slate-100">
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {uploadedFiles.map(file => (
              <div key={file.tempId} className="flex items-center gap-2 bg-slate-50 rounded-xl pl-3 pr-2 py-1.5 text-xs text-slate-600 border border-slate-100">
                <HiOutlinePaperClip className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate max-w-[150px] font-semibold">{file.originalName}</span>
                <button 
                  onClick={() => removeFile(file.tempId)} 
                  className="p-1 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <HiOutlineX className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type your requirements..."
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-12 py-4 text-sm outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/5 transition-all resize-none min-h-[100px]"
          />
          
          <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all disabled:opacity-50"
              title="Attach files"
            >
              {isUploading ? (
                <div className="w-5 h-5 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin"></div>
              ) : (
                <HiOutlinePaperClip className="w-5 h-5" />
              )}
            </button>
            <button 
              onClick={handleSendMessage}
              disabled={!inputText.trim() && !uploadedFiles.length}
              className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-orange-500 transition-all shadow-lg disabled:bg-slate-200 disabled:shadow-none transform active:scale-90"
            >
              <HiOutlineChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <p className="mt-3 text-[10px] text-center text-slate-400 font-medium">
          Powered by Gemini 2.0 Flash • UKNOW Marketing AI
        </p>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        multiple 
        className="hidden" 
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
      />
    </div>
  );
};

export default AiChatbot;
