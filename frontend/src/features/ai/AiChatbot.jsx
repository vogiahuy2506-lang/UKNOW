import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  HiOutlineSparkles, HiOutlinePaperClip, HiOutlineX,
  HiOutlineChevronRight, HiOutlinePlay, HiOutlineArrowRight,
  HiOutlineTerminal, HiOutlinePencilAlt, HiOutlineCheck,
  HiOutlineQuestionMarkCircle,
  HiOutlineMail, HiOutlineChat, HiOutlineExternalLink,
} from 'react-icons/hi';
import { writeCampaignDraft } from '../../utils/campaignDraftStorage';
import { toast } from 'react-hot-toast';
import aiApi from '../../services/aiApi';
import api from '../../services/api';

const CATEGORIES = [
  { id: 'marketing', label: '📢 Marketing' },
  { id: 'notification', label: '🔔 Thông báo' },
];

// Category picker overlay
const CategoryPicker = ({ onSelect, onCancel }) => (
  <div className="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
    <p className="text-xs font-bold text-orange-700 mb-2">📂 Lưu vào danh mục nào?</p>
    <div className="flex gap-2">
      {CATEGORIES.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className="flex-1 py-2 text-xs font-semibold bg-white border border-orange-200 rounded-lg hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all"
        >
          {cat.label}
        </button>
      ))}
    </div>
    <button onClick={onCancel} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600">Huỷ</button>
  </div>
);

// Template preview card
const TemplateDraftCard = ({ draft, onSave, onEdit }) => {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (category) => {
    setSaving(true);
    setShowCategoryPicker(false);
    try {
      const endpoint = draft.channel === 'zalo' ? '/zalo-templates' : '/email-templates';
      await api.post(endpoint, {
        templateName: draft.templateName,
        subject: draft.subject || '',
        bodyHtml: draft.bodyHtml || '',
        bodyText: draft.bodyText || '',
        category,
        variables: [],
      });
      toast.success('✅ Đã lưu template thành công!');
      onSave?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-slate-100">
        {draft.channel === 'email'
          ? <HiOutlineMail className="w-4 h-4 text-orange-500" />
          : <HiOutlineChat className="w-4 h-4 text-blue-500" />}
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
          {draft.channel === 'email' ? 'Template Email' : 'Template Zalo'}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Tên template</p>
          <p className="text-sm font-bold text-slate-800">{draft.templateName}</p>
        </div>

        {draft.subject && (
          <div>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Tiêu đề</p>
            <p className="text-sm text-slate-700">{draft.subject}</p>
          </div>
        )}

        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">Nội dung</p>
          {draft.channel === 'email' && draft.bodyHtml ? (
            <div
              className="text-xs text-slate-600 leading-relaxed max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-2 bg-gray-50"
              dangerouslySetInnerHTML={{ __html: draft.bodyHtml }}
            />
          ) : (
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
              {draft.bodyText}
            </p>
          )}
        </div>

        {showCategoryPicker ? (
          <CategoryPicker onSelect={handleSave} onCancel={() => setShowCategoryPicker(false)} />
        ) : (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowCategoryPicker(true)}
              disabled={saving}
              className="flex-1 py-2.5 bg-orange-500 text-white text-xs font-black rounded-xl hover:bg-orange-600 flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
            >
              <HiOutlineCheck className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu vào thư viện'}
            </button>
            <button
              onClick={() => onEdit?.(draft)}
              className="flex-1 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-all"
            >
              <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" />
              Chỉnh sửa
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Ask-more card
const AskMoreCard = ({ missingFields }) => (
  <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
    <HiOutlineQuestionMarkCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
    <div>
      <p className="text-xs font-bold text-amber-800 mb-1">Cần thêm thông tin:</p>
      <ul className="space-y-0.5">
        {missingFields.map((f, i) => (
          <li key={i} className="text-xs text-amber-700 flex items-center gap-1">
            <span className="w-1 h-1 bg-amber-500 rounded-full shrink-0" />{f}
          </li>
        ))}
      </ul>
    </div>
  </div>
);

// Campaign script card
const CampaignScriptCard = ({ script, onRun, onEdit }) => (
  <div className="mt-4 bg-orange-50/50 rounded-2xl p-4 border border-orange-100">
    <div className="flex items-center gap-2 mb-3 text-orange-600">
      <HiOutlineTerminal className="w-5 h-5" />
      <span className="font-black text-[10px] uppercase tracking-[0.2em]">Kịch bản chiến dịch</span>
    </div>
    <h4 className="font-bold text-slate-900 text-sm mb-1">{script.campaignName}</h4>
    <p className="text-xs text-slate-500 mb-4 leading-relaxed">{script.description}</p>
    <div className="space-y-2 mb-4">
      {script.nodes?.filter(n => n.nodeType !== 'trigger').slice(0, 5).map((node, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-white border border-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-500 shadow-sm">{i + 1}</div>
          <div className="flex-1">
            <p className="text-xs text-slate-700 font-bold">{node.nodeName || node.nodeSubtype}</p>
            {node.config?.subject && <p className="text-[10px] text-slate-400 line-clamp-1 italic">Sub: {node.config.subject}</p>}
          </div>
        </div>
      ))}
      {script.nodes?.length > 6 && <span className="text-[10px] text-slate-400 ml-9">+ {script.nodes.length - 6} bước nữa</span>}
    </div>
    <div className="space-y-2">
      <button onClick={onRun} className="w-full py-2.5 bg-orange-500 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-orange-600 flex items-center justify-center gap-2">
        <HiOutlinePlay className="w-4 h-4" /> Chạy ngay
      </button>
      <button onClick={() => onEdit(script)} className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2">
        <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" /> Tùy chỉnh
      </button>
    </div>
  </div>
);

// Landing page card
const LandingPageCard = ({ page, onSaveToLibrary }) => {
  const handlePreview = () => {
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${page.title}</title><style>${page.css || ''}</style></head><body>${page.html}</body></html>`);
    win.document.close();
  };
  return (
    <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-200">
      <div className="flex items-center gap-2 mb-2 text-slate-600">
        <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
        <span className="font-black text-[10px] uppercase tracking-widest">Landing Page</span>
      </div>
      <p className="text-sm font-bold text-slate-800 mb-3">{page.title}</p>
      <div className="space-y-2">
        <button onClick={handlePreview} className="w-full py-2.5 bg-slate-800 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-900 flex items-center justify-center gap-2">
          <HiOutlineExternalLink className="w-4 h-4 text-orange-400" /> Xem trước
        </button>
        <button onClick={() => onSaveToLibrary?.(page)} className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-2">
          <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" /> Chỉnh sửa & Lưu
        </button>
      </div>
    </div>
  );
};

const AiChatbot = ({ isOpen, onToggle }) => {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const welcomeMessage = isSuperAdmin
    ? 'Xin chào Admin! 📊 Tôi có thể giúp bạn phân tích dữ liệu nền tảng UKNOW theo thời gian thực.\n\nBạn có thể hỏi tôi về:\n- Doanh thu, đơn hàng tháng này\n- Số lượng thành viên, ai sắp hết hạn\n- Phân bố gói dịch vụ\n- Tình trạng chiến dịch toàn nền tảng\n\nHãy hỏi tôi!'
    : 'Chào bạn! 👋 Tôi có thể giúp bạn:\n\n📧 Viết template Email / Zalo\n🚀 Tạo kịch bản chiến dịch\n🌐 Thiết kế Landing Page\n\nHãy cho tôi biết bạn cần gì nhé!';

  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: welcomeMessage,
  }]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentScript, setCurrentScript] = useState(null);
  const [hasProfile, setHasProfile] = useState(true);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (!isSuperAdmin) {
        aiApi.getBusinessProfile()
          .then(res => setHasProfile(!!res.data))
          .catch(() => setHasProfile(true));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setIsUploading(true);
    try {
      const results = await Promise.all(files.map(async (file) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/uploads/temp', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        return res.data.data;
      }));
      setUploadedFiles(prev => [...prev, ...results]);
      toast.success(`Đã tải lên ${results.length} tệp`);
    } catch {
      toast.error('Tải tệp lên thất bại');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() && !uploadedFiles.length) return;
    const userMsg = { role: 'user', content: inputText, files: [...uploadedFiles] };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputText('');
    setUploadedFiles([]);
    setIsTyping(true);

    try {
      const response = await aiApi.chat(newHistory, userMsg.files);
      if (response.success) {
        const { type, content, data, missing_fields } = response.data;
        setMessages(prev => [...prev, {
          role: 'assistant', content, type, data,
          missing_fields: missing_fields || [],
        }]);
        if (type === 'campaign_script') setCurrentScript(data);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Lỗi: ${error.response?.data?.message || error.message}`
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleEditTemplate = (draft) => {
    navigate('/app/settings/templates', { state: { aiDraft: draft } });
    onToggle?.();
  };

  // Write AI campaign script to sessionStorage draft so CampaignBuilder loads it directly
  const handleEditCampaign = (script) => {
    writeCampaignDraft({
      campaignName: script.campaignName || '',
      campaignDescription: script.description || '',
      campaignType: script.campaignType || 'mixed',
      // Store raw script nodes/connections for buildFlowFromCampaign (legacy format)
      _aiScript: script,
      updatedAt: new Date().toISOString(),
    });
    navigate('/app/campaigns/new/builder');
    onToggle?.();
  };

  const handleSaveLandingPage = (page) => {
    navigate('/app/settings/landing-pages', { state: { aiDraft: page } });
    onToggle?.();
  };

  const handleRunCampaign = async () => {
    if (!currentScript) return;
    const t = toast.loading('Đang khởi chạy...');
    try {
      const res = await aiApi.executeCampaign(currentScript, true);
      if (res.success) {
        toast.success('Chiến dịch đã kích hoạt!', { id: t });
        setCurrentScript(null);
        setMessages(prev => [...prev, { role: 'assistant', content: '🎉 Chiến dịch đã được kích hoạt! Theo dõi tại mục Quản lý chiến dịch nhé.' }]);
      }
    } catch {
      toast.error('Không thể chạy chiến dịch.', { id: t });
    }
  };

  return (
    <div className={`fixed top-0 right-0 h-full bg-white border-l border-slate-200 shadow-2xl transition-all duration-300 z-40 flex flex-col ${isOpen ? 'w-full sm:w-[420px] translate-x-0' : 'w-0 translate-x-full'}`}>
      {/* Header */}
      <div className="flex-shrink-0 h-16 border-b border-slate-100 flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
            <HiOutlineSparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">UKNOW AI Assistant</h3>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sẵn sàng</span>
            </div>
          </div>
        </div>
        <button onClick={onToggle} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600">
          <HiOutlineArrowRight className="w-5 h-5" />
        </button>
      </div>

      {/* Banner nhắc thiết lập hồ sơ — chỉ hiện cho user_admin */}
      {!isSuperAdmin && !hasProfile && (
        <div className="flex-shrink-0 mx-4 mt-3 flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <HiOutlineSparkles className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-orange-800">Chưa có hồ sơ doanh nghiệp</p>
            <p className="text-xs text-orange-600 mt-0.5">Thiết lập để AI cá nhân hóa nội dung theo đúng thương hiệu của bạn.</p>
          </div>
          <Link
            to="/app/settings/ai-profile"
            onClick={onToggle}
            className="shrink-0 text-xs font-bold text-orange-600 hover:text-orange-700 underline underline-offset-2 whitespace-nowrap"
          >
            Thiết lập →
          </Link>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] ${msg.role === 'user' ? 'bg-slate-100 rounded-2xl px-4 py-3' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-5 bg-orange-100 rounded-md flex items-center justify-center">
                    <HiOutlineSparkles className="w-3 h-3 text-orange-500" />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI</span>
                </div>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">{msg.content}</p>

              {/* Files */}
              {msg.files?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.files.map((f, i) => (
                    <div key={i} className="bg-white rounded-lg px-2 py-1 flex items-center gap-1.5 text-[10px] border border-slate-200">
                      <HiOutlinePaperClip className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[100px] font-medium text-slate-600">{f.originalName}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ask more */}
              {msg.type === 'ask_more' && msg.missing_fields?.length > 0 && (
                <AskMoreCard missingFields={msg.missing_fields} />
              )}

              {/* Template draft */}
              {msg.type === 'template_draft' && msg.data && (
                <TemplateDraftCard
                  draft={msg.data}
                  onSave={() => {}}
                  onEdit={handleEditTemplate}
                />
              )}

              {/* Campaign script */}
              {msg.type === 'campaign_script' && msg.data && (
                <CampaignScriptCard
                  script={msg.data}
                  onRun={handleRunCampaign}
                  onEdit={handleEditCampaign}
                />
              )}

              {/* Landing page */}
              {msg.type === 'landing_page' && msg.data && (
                <LandingPageCard page={msg.data} onSaveToLibrary={handleSaveLandingPage} />
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="flex gap-1.5 px-4 py-3 bg-slate-50 rounded-2xl">
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-slate-100 bg-white">
        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {uploadedFiles.map(f => (
              <div key={f.tempId} className="flex items-center gap-1.5 bg-slate-50 rounded-xl pl-3 pr-2 py-1.5 text-xs border border-slate-100">
                <HiOutlinePaperClip className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate max-w-[130px] font-semibold text-slate-600">{f.originalName}</span>
                <button onClick={() => setUploadedFiles(p => p.filter(x => x.tempId !== f.tempId))} className="p-0.5 hover:text-red-500">
                  <HiOutlineX className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Nhập yêu cầu... (Enter để gửi)"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-12 py-3.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/10 resize-none min-h-[90px] transition-all"
          />
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl disabled:opacity-50">
              {isUploading
                ? <div className="w-4 h-4 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                : <HiOutlinePaperClip className="w-4 h-4" />}
            </button>
            <button onClick={handleSend} disabled={!inputText.trim() && !uploadedFiles.length}
              className="p-2 bg-slate-900 text-white rounded-xl hover:bg-orange-500 disabled:bg-slate-200 disabled:shadow-none transition-all">
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-center text-slate-400">Powered by Gemini • UKNOW Marketing AI</p>
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
    </div>
  );
};

export default AiChatbot;
