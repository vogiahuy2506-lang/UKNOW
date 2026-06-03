import { useState, useEffect, useRef } from 'react';
import {
  HiOutlineUserCircle,
  HiOutlineBookOpen,
  HiOutlineChip,
  HiOutlineSave,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineUpload,
  HiOutlinePlus,
  HiOutlineX,
  HiOutlineDocumentText,
  HiOutlineCog,
  HiOutlineCode,
  HiOutlineCheck,
  HiOutlineGlobeAlt,
  HiOutlineColorSwatch,
  HiOutlineLink,
  HiOutlineGlobe,
  HiOutlineEye,
  HiOutlineChevronLeft,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../services/api';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';

const TABS = [
  { id: 'general', label: 'Cấu hình', icon: HiOutlineUserCircle },
  { id: 'knowledge', label: 'Kiến thức', icon: HiOutlineBookOpen },
  { id: 'deploy', label: 'Triển khai', icon: HiOutlineChip },
];

const STATUS_COLORS = {
  pending: 'text-amber-500 bg-amber-50 border-amber-100',
  processing: 'text-blue-500 bg-blue-50 border-blue-100',
  ready: 'text-emerald-500 bg-emerald-50 border-emerald-100',
  error: 'text-red-500 bg-red-50 border-red-100',
};

function ChatbotSettings({ chatbot, onUpdate }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [deployTab, setDeployTab] = useState('script');

  const [form, setForm] = useState({
    name: '',
    description: '',
    avatar_url: '',
    greeting_msg: '',
    system_instruction: '',
    temperature: 0.7,
    max_tokens: 2048,
    is_active: true,
    // Widget appearance merged in
    primary_color: '#6366F1',
    background_color: '#FFFFFF',
    text_color: '#1F2937',
    accent_color: '#60A5FA',
    position: 'bottom-right',
    logo_url: '',
    show_avatar: true,
    suggested_questions: [],
  });

  const [newQuestion, setNewQuestion] = useState('');

  // Documents
  const [documents, setDocuments] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', file: null });
  const [textForm, setTextForm] = useState({ title: '', content: '' });
  const [uploading, setUploading] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const fileInputRef = useRef(null);

  // Deploy
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [_channels, setChannels] = useState([]);
  const [showChannelModal, setShowChannelModal] = useState(null);
  const [channelForms, setChannelForms] = useState({});
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (chatbot) {
      const ws = chatbot.widget_settings || {};
      setForm({
        name: chatbot.name || '',
        description: chatbot.description || '',
        avatar_url: chatbot.avatar_url || '',
        greeting_msg: chatbot.greeting_msg || '',
        system_instruction: chatbot.system_instruction || '',
        temperature: chatbot.temperature || 0.7,
        max_tokens: chatbot.max_tokens || 2048,
        is_active: chatbot.is_active !== false,
        // Widget appearance
        primary_color: ws.primary_color || '#6366F1',
        background_color: ws.background_color || '#FFFFFF',
        text_color: ws.text_color || '#1F2937',
        accent_color: ws.accent_color || '#60A5FA',
        position: ws.position || 'bottom-right',
        logo_url: ws.logo_url || '',
        show_avatar: ws.show_avatar !== false,
        suggested_questions: ws.suggested_questions || [],
      });
      setDocuments([]);
      loadDocumentsForChatbot(chatbot.id);
      setChannels(chatbot.channels || []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id]);

  const loadDocumentsForChatbot = async (chatbotId) => {
    if (!chatbotId) return;
    try {
      const res = await api.get(`/ai/custom-chat/documents/${chatbotId}`);
      if (res.data?.documents) setDocuments(res.data.documents);
      else setDocuments(chatbot?.documents || []);
    } catch {
      setDocuments(chatbot?.documents || []);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('chatbot.studio.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      // Call backend API to save chatbot settings
      const updateData = {
        name: form.name,
        description: form.description,
        avatar_url: form.avatar_url,
        greeting_msg: form.greeting_msg,
        system_instruction: form.system_instruction,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        is_active: form.is_active,
        // Widget UI customization - these are stored directly on custom_chatbots
        primary_color: form.primary_color,
        background_color: form.background_color,
        text_color: form.text_color,
        accent_color: form.accent_color,
        position: form.position,
        logo_url: form.logo_url,
        show_avatar: form.show_avatar,
        border_radius: form.border_radius || 16,
        chat_height: form.chat_height || '600px',
        // Suggested questions - applies to all deployment types (widget, iframe, studio)
        suggested_questions: form.suggested_questions || [],
      };

      let updatedBot;
      try {
        const res = await chatbotApi.updateChatbot(chatbot.id, updateData);
        if (res.success) {
          updatedBot = { ...chatbot, ...res.data };
        } else {
          throw new Error(res.message);
        }
      } catch (apiError) {
        // If API fails, fallback to localStorage (for offline/demo mode)
        console.warn('[ChatbotSettings] API save failed, using localStorage:', apiError.message);
        updatedBot = {
          ...chatbot,
          ...updateData,
          widget_settings: {
            primary_color: form.primary_color,
            background_color: form.background_color,
            text_color: form.text_color,
            accent_color: form.accent_color,
            position: form.position,
            logo_url: form.logo_url,
            show_avatar: form.show_avatar,
            suggested_questions: form.suggested_questions,
          },
        };
        // Save to localStorage as fallback
        const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
        const idx = bots.findIndex(b => b.id === chatbot.id);
        if (idx >= 0) {
          bots[idx] = updatedBot;
          localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
        }
      }

      onUpdate(updatedBot);
      toast.success(t('common.success'));
    } catch (err) {
      toast.error(err.message || t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const addSuggestedQuestion = () => {
    if (!newQuestion.trim()) return;
    if (form.suggested_questions?.length >= 5) {
      toast.error('Tối đa 5 câu hỏi gợi ý');
      return;
    }
    setForm(p => ({
      ...p,
      suggested_questions: [...(p.suggested_questions || []), newQuestion.trim()]
    }));
    setNewQuestion('');
  };

  const removeSuggestedQuestion = (index) => {
    setForm(p => ({
      ...p,
      suggested_questions: p.suggested_questions.filter((_, i) => i !== index)
    }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t('chatbot.knowledgeBase.fileTooLarge'));
        return;
      }
      setUploadForm({ title: file.name.replace(/\.[^.]+$/, ''), file });
    }
    e.target.value = '';
  };

  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!uploadForm.file) {
      toast.error(t('errors.validationError'));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadForm.file);
      fd.append('chatbot_id', chatbot.id.toString());
      const res = await api.post('/ai/custom-chat/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.success) {
        const newDoc = {
          id: Date.now(),
          title: uploadForm.title || uploadForm.file.name,
          type: 'file',
          file_name: uploadForm.file.name,
          status: 'ready',
          chunk_count: res.data.chunks,
          created_at: new Date().toISOString(),
        };
        setDocuments(prev => [newDoc, ...prev]);
        setShowUploadModal(false);
        setUploadForm({ title: '', file: null });
        toast.success(`Đã upload: ${res.data.chunks} chunks`);
        const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
        const idx = bots.findIndex(b => b.id === chatbot.id);
        if (idx >= 0) {
          bots[idx].documents = [newDoc, ...(bots[idx].documents || [])];
          localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
        }
      } else {
        toast.error(res.data?.message || t('errors.uploadFailed'));
      }
    } catch (err) {
      toast.error(err.message || t('errors.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const handleAddText = async (e) => {
    e.preventDefault();
    if (!textForm.content.trim()) {
      toast.error(t('errors.validationError'));
      return;
    }
    setAddingText(true);
    try {
      const newDoc = {
        id: Date.now(),
        title: textForm.title || 'Text Document',
        type: 'text',
        content: textForm.content,
        status: 'ready',
        chunk_count: Math.ceil(textForm.content.length / 500),
        created_at: new Date().toISOString(),
      };
      setDocuments(prev => [newDoc, ...prev]);
      setShowTextModal(false);
      setTextForm({ title: '', content: '' });
      toast.success(t('chatbot.knowledgeBase.processing'));
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        bots[idx].documents = [newDoc, ...(bots[idx].documents || [])];
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
    } catch {
      toast.error(t('errors.addFailed'));
    } finally {
      setAddingText(false);
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!confirm(`Xóa tài liệu "${doc.title}"?`)) return;
    setDeletingDoc(doc.id);
    try {
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        bots[idx].documents = bots[idx].documents.filter(d => d.id !== doc.id);
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
      toast.success(t('common.success'));
    } catch {
      toast.error(t('errors.deleteFailed'));
    } finally {
      setDeletingDoc(null);
    }
  };

  const copyWidgetCode = () => {
    const baseUrl = window.location.origin;
    const code = `<script>
  window.customChatbotConfig = {
    token: '${chatbot.widget_key || chatbot.id}',
    baseUrl: '${baseUrl}',
    primaryColor: '${form.primary_color}',
    backgroundColor: '${form.background_color}',
    textColor: '${form.text_color}',
    accentColor: '${form.accent_color}',
    logoUrl: '${form.logo_url || ''}',
    showAvatar: ${form.show_avatar !== false},
    suggestedQuestions: ${JSON.stringify(form.suggested_questions || [])},
    position: '${form.position}',
    welcomeMessage: '${form.greeting_msg || 'Xin chào! Tôi có thể giúp gì cho bạn?'}'
  };
</script>
<script src="${baseUrl}/widget.js" defer></script>`;
    navigator.clipboard.writeText(code);
    setWidgetCopied(true);
    toast.success(t('common.copied'));
    setTimeout(() => setWidgetCopied(false), 2000);
  };

  const handleConnectZalo = async () => {
    const fd = channelForms.zalo_oa || {};
    if (!fd.oa_id || !fd.oa_secret) { toast.error(t('errors.validationError')); return; }
    setConnecting(true);
    try {
      const channel = { type: 'zalo_oa', oa_id: fd.oa_id, oa_secret: fd.oa_secret, verify_token: fd.verify_token, is_connected: true };
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        const chs = bots[idx].channels || [];
        const ci = chs.findIndex(c => c.type === 'zalo_oa');
        if (ci >= 0) chs[ci] = channel; else chs.push(channel);
        bots[idx].channels = chs;
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
      setChannels(prev => {
        const up = [...prev];
        const zi = up.findIndex(c => c.type === 'zalo_oa');
        if (zi >= 0) up[zi] = channel; else up.push(channel);
        return up;
      });
      setShowChannelModal(null);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.connectFailed')); }
    finally { setConnecting(false); }
  };

  const handleConnectFacebook = async () => {
    const fd = channelForms.facebook || {};
    if (!fd.page_id || !fd.page_token) { toast.error(t('errors.validationError')); return; }
    setConnecting(true);
    try {
      const channel = { type: 'facebook', page_id: fd.page_id, page_token: fd.page_token, verify_token: fd.verify_token, is_connected: true };
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        const chs = bots[idx].channels || [];
        const ci = chs.findIndex(c => c.type === 'facebook');
        if (ci >= 0) chs[ci] = channel; else chs.push(channel);
        bots[idx].channels = chs;
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
      setChannels(prev => {
        const up = [...prev];
        const fi = up.findIndex(c => c.type === 'facebook');
        if (fi >= 0) up[fi] = channel; else up.push(channel);
        return up;
      });
      setShowChannelModal(null);
      toast.success(t('common.success'));
    } catch { toast.error(t('errors.connectFailed')); }
    finally { setConnecting(false); }
  };

  if (!chatbot) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center">
        <div className="text-center px-8">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HiOutlineCog className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-sm text-slate-400">{t('chatbot.studio.selectBotToConfigure')}</p>
        </div>
      </div>
    );
  }

  const wrapperClass = 'w-full h-full bg-white flex flex-col overflow-hidden';

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile: back chevron */}
          <button
            className="md:hidden -ml-1 w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            onClick={() => {
              // Dispatch event for parent to handle
              document.dispatchEvent(new CustomEvent('studio:close-settings'));
            }}
            title="Quay lại"
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>

          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/20">
            {chatbot.avatar_url ? (
              <img src={chatbot.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
            ) : (
              <span className="text-white text-lg font-bold">{chatbot.name?.[0]?.toUpperCase() || '?'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800 truncate">{chatbot.name}</h2>
              {form.is_active ? (
                <span className="text-[10px] bg-emerald-50 text-emerald-600 font-semibold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full shrink-0">Inactive</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">{chatbot.description || 'Không có mô tả'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b border-slate-100/80 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-semibold transition-all relative ${
              activeTab === tab.id ? 'text-violet-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'general' && (
          <ConfigTab form={form} setForm={setForm} newQuestion={newQuestion} setNewQuestion={setNewQuestion}
            onAddQuestion={addSuggestedQuestion} onRemoveQuestion={removeSuggestedQuestion} saving={saving} onSave={handleSave}
          />
        )}
        {activeTab === 'knowledge' && (
          <KnowledgeTab documents={documents} showUploadModal={showUploadModal} setShowUploadModal={setShowUploadModal}
            showTextModal={showTextModal} setShowTextModal={setShowTextModal}
            uploadForm={uploadForm} setUploadForm={setUploadForm} textForm={textForm} setTextForm={setTextForm}
            uploading={uploading} addingText={addingText} deletingDoc={deletingDoc}
            fileInputRef={fileInputRef} onFileSelect={handleFileSelect} onUpload={handleUploadFile}
            onAddText={handleAddText} onDelete={handleDeleteDoc}
          />
        )}
        {activeTab === 'deploy' && (
          <DeployTab deployTab={deployTab} setDeployTab={setDeployTab} form={form} chatbot={chatbot}
            widgetCopied={widgetCopied} showChannelModal={showChannelModal} setShowChannelModal={setShowChannelModal}
            channelForms={channelForms} setChannelForms={setChannelForms} connecting={connecting}
            onCopyWidgetCode={copyWidgetCode}
            onConnectZalo={handleConnectZalo} onConnectFacebook={handleConnectFacebook}
          />
        )}
      </div>
    </div>
  );
}

function ConfigTab({ form, setForm, newQuestion, setNewQuestion, onAddQuestion, onRemoveQuestion, saving, onSave }) {
  return (
    <div className="p-5 space-y-5">
      {/* ── Thông tin cơ bản ── */}
      <SectionCard title="Thông tin chatbot" icon={<HiOutlineUserCircle className="w-4 h-4" />}>
        {/* Avatar */}
        <div className="flex items-start gap-3 mb-4">
          <div className="relative shrink-0">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center overflow-hidden shadow-md">
              {form.avatar_url
                ? <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-white text-xl font-bold">{form.name?.[0]?.toUpperCase() || '?'}</span>
              }
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full shadow border border-slate-200 flex items-center justify-center cursor-pointer hover:bg-slate-50">
              <HiOutlinePlus className="w-3 h-3 text-slate-500" />
            </div>
          </div>
          <div className="flex-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase">Avatar URL</label>
            <input type="url" value={form.avatar_url}
              onChange={e => setForm(p => ({ ...p, avatar_url: e.target.value }))}
              placeholder="https://..."
              className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Tên chatbot *</label>
            <input type="text" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Mô tả</label>
            <textarea value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Tin nhắn chào mừng</label>
            <textarea value={form.greeting_msg}
              onChange={e => setForm(p => ({ ...p, greeting_msg: e.target.value }))}
              rows={2} placeholder="VD: Xin chào! Tôi có thể giúp gì cho bạn?"
              className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">System Instructions</label>
            <textarea value={form.system_instruction}
              onChange={e => setForm(p => ({ ...p, system_instruction: e.target.value }))}
              rows={4} placeholder="Hướng dẫn cách chatbot nên hành xử..."
              className="mt-1 w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-violet-400 transition-colors resize-none font-mono text-xs"
            />
            <p className="text-[10px] text-slate-400 mt-1">{form.system_instruction?.length || 0} / 2000 ký tự</p>
          </div>
        </div>
      </SectionCard>

      {/* ── Giao diện chatbot ── */}
      <SectionCard title="Giao diện chatbot" icon={<HiOutlineColorSwatch className="w-4 h-4" />} variant="violet">
        {/* Preview mini */}
        <div className="mb-4 bg-slate-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-slate-500 uppercase">Xem trước</span>
            <span className="text-[10px] text-slate-400">{form.position?.replace('-', ' ')}</span>
          </div>
          <div className="flex justify-end">
            <div className="w-48 bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
              <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: form.primary_color + '15' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: form.primary_color }}>
                  {form.avatar_url
                    ? <img src={form.avatar_url} alt="" className="w-full h-full rounded-lg object-cover" />
                    : <span className="text-white text-xs font-bold">{form.name?.[0]?.toUpperCase() || '?'}</span>
                  }
                </div>
                <div>
                  <p className="text-[11px] font-bold" style={{ color: form.text_color }}>{form.name || 'Chatbot'}</p>
                  <p className="text-[9px]" style={{ color: form.accent_color }}>Online</p>
                </div>
              </div>
              <div className="p-2">
                <div className="text-[10px] rounded-lg px-2 py-1.5 mb-1" style={{ backgroundColor: form.background_color, color: form.text_color, border: `1px solid ${form.primary_color}20` }}>
                  {form.greeting_msg || 'Xin chào! Tôi có thể giúp gì cho bạn?'}
                </div>
                <div className="h-5 rounded-lg" style={{ backgroundColor: form.background_color, border: `1px solid #e5e7eb` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Position */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Vị trí hiển thị</label>
          <div className="grid grid-cols-2 gap-2">
            {['bottom-right', 'bottom-left', 'top-right', 'top-left'].map(pos => (
              <button key={pos} onClick={() => setForm(p => ({ ...p, position: pos }))}
                className={`py-2 text-xs font-medium rounded-xl border-2 transition-all ${
                  form.position === pos ? 'border-violet-400 bg-violet-50 text-violet-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                {pos.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">Màu sắc</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'primary_color', label: 'Màu chính', value: form.primary_color },
              { key: 'background_color', label: 'Màu nền', value: form.background_color },
              { key: 'text_color', label: 'Màu chữ', value: form.text_color },
              { key: 'accent_color', label: 'Màu nhấn', value: form.accent_color },
            ].map(c => (
              <div key={c.key} className="bg-slate-50 rounded-xl p-2.5">
                <label className="text-[10px] font-semibold text-slate-500">{c.label}</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={c.value}
                    onChange={e => setForm(p => ({ ...p, [c.key]: e.target.value }))}
                    className="w-8 h-8 rounded-lg cursor-pointer border-2 border-white shadow-sm shrink-0"
                  />
                  <input type="text" value={c.value}
                    onChange={e => setForm(p => ({ ...p, [c.key]: e.target.value }))}
                    className="flex-1 text-xs font-mono bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-violet-400"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Logo URL */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-slate-500 uppercase mb-1.5 block">Logo chatbot</label>
          <input type="url" value={form.logo_url}
            onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))}
            placeholder="https://example.com/logo.png"
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 transition-colors"
          />
        </div>

        {/* Show Avatar */}
        <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">Hiển thị avatar bot</p>
            <p className="text-[10px] text-slate-400">Avatar hiển thị trong khung chat</p>
          </div>
          <button onClick={() => setForm(p => ({ ...p, show_avatar: !p.show_avatar }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.show_avatar ? 'bg-violet-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.show_avatar ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Suggested Questions */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase mb-2 block">
            Câu hỏi gợi ý <span className="text-slate-400 font-normal normal-case">(tối đa 5)</span>
          </label>
          <div className="flex gap-2">
            <input type="text" value={newQuestion}
              onChange={e => setNewQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), onAddQuestion())}
              placeholder="Nhập câu hỏi..."
              className="flex-1 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
            <button onClick={onAddQuestion}
              className="px-4 py-2 bg-violet-500 text-white text-sm font-semibold rounded-xl hover:bg-violet-600 transition-colors">
              Thêm
            </button>
          </div>
          {form.suggested_questions?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {form.suggested_questions.map((q, i) => (
                <span key={i} className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-violet-200 text-violet-600 rounded-full text-xs group">
                  <span className="w-4 h-4 bg-violet-200 rounded-full flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                  <span className="max-w-[120px] truncate">{q}</span>
                  <button onClick={() => onRemoveQuestion(i)}
                    className="w-4 h-4 hover:bg-violet-200 rounded-full flex items-center justify-center text-violet-400 hover:text-violet-600 transition-colors">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Model Settings ── */}
      <SectionCard title="Cài đặt AI" icon={<HiOutlineChip className="w-4 h-4" />} variant="emerald">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Temperature</label>
              <span className="text-xs font-mono text-violet-600 font-bold">{form.temperature}</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={form.temperature}
              onChange={e => setForm(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Precise (0.0)</span>
              <span>Creative (1.0)</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Max Tokens: <span className="font-bold text-violet-600">{form.max_tokens}</span></label>
            <input type="range" min="256" max="8192" step="256" value={form.max_tokens}
              onChange={e => setForm(p => ({ ...p, max_tokens: parseInt(e.target.value) }))}
              className="w-full mt-1 accent-violet-500"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Active Toggle ── */}
      <div className="flex items-center justify-between bg-white border-2 border-slate-200 rounded-2xl p-4">
        <div>
          <p className="text-sm font-bold text-slate-700">Trạng thái hoạt động</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Bot có thể nhận và trả lời tin nhắn</p>
        </div>
        <button onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
          className={`relative w-12 h-7 rounded-full transition-colors ${form.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
          <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Save Button */}
      <button onClick={onSave} disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-violet-500/30 active:scale-95">
        {saving ? (
          <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang lưu...</>
        ) : (
          <><HiOutlineSave className="w-4 h-4" /> Lưu thay đổi</>
        )}
      </button>
    </div>
  );
}

function SectionCard({ title, icon, variant = 'default', children }) {
  const variants = {
    default: 'bg-white border border-slate-200/80',
    violet: 'bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100/60',
    emerald: 'bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/60',
    blue: 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/60',
  };
  return (
    <div className={`rounded-2xl overflow-hidden ${variants[variant]}`}>
      <div className={`px-4 py-3 border-b ${
        variant === 'violet' ? 'border-violet-200/50' :
        variant === 'emerald' ? 'border-emerald-200/50' :
        variant === 'blue' ? 'border-blue-200/50' :
        'border-slate-100/60'
      }`}>
        <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
          variant === 'violet' ? 'text-violet-700' :
          variant === 'emerald' ? 'text-emerald-700' :
          variant === 'blue' ? 'text-blue-700' :
          'text-slate-700'
        }`}>
          {icon}
          {title}
        </h3>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}

function KnowledgeTab({
  documents, showUploadModal, setShowUploadModal, showTextModal, setShowTextModal,
  uploadForm, setUploadForm, textForm, setTextForm,
  uploading, addingText, deletingDoc, fileInputRef, onFileSelect, onUpload, onAddText, onDelete
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4 pb-3">
        <h3 className="text-sm font-bold text-slate-700">Tài liệu kiến thức</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Upload tài liệu để chatbot trả lời chính xác hơn</p>
      </div>

      <div className="px-5 pb-4 grid grid-cols-2 gap-2">
        <button onClick={() => setShowUploadModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-xs font-semibold text-slate-500 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50/30 transition-all">
          <HiOutlineUpload className="w-4 h-4" /> Upload file
        </button>
        <button onClick={() => setShowTextModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-sm">
          <HiOutlinePlus className="w-4 h-4" /> Thêm văn bản
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <HiOutlineDocumentText className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">Chưa có tài liệu nào</p>
            <p className="text-[11px] text-slate-400 mt-1">Upload file hoặc thêm văn bản để bắt đầu</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-white border border-slate-200/80 rounded-xl hover:border-violet-300 hover:bg-violet-50/20 transition-all group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${STATUS_COLORS[doc.status] || STATUS_COLORS.pending}`}>
                  <HiOutlineDocumentText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-400">{doc.chunk_count || 0} chunks</span>
                    {doc.status && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        doc.status === 'ready' ? 'bg-emerald-50 text-emerald-600' :
                        doc.status === 'processing' ? 'bg-blue-50 text-blue-600' :
                        doc.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                      }`}>{doc.status}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => onDelete(doc)} disabled={deletingDoc === doc.id}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  {deletingDoc === doc.id ? <HiOutlineRefresh className="w-4 h-4 animate-spin" /> : <HiOutlineTrash className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 pt-5 pb-4 bg-gradient-to-br from-violet-500 to-purple-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <HiOutlineUpload className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base">Upload tài liệu</h3>
                    <p className="text-violet-200 text-xs mt-0.5">PDF, DOCX, TXT, CSV, XLSX</p>
                  </div>
                </div>
                <button onClick={() => setShowUploadModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white">
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>
            </div>
            <form onSubmit={onUpload} className="p-6 space-y-4">
              <div onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setUploadForm(p => ({ ...p, file: f, title: f.name.replace(/\.[^.]+$/, '') })); }}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/20 transition-all">
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xls" className="hidden" onChange={onFileSelect} />
                {uploadForm.file ? (
                  <>
                    <HiOutlineDocumentText className="w-10 h-10 text-violet-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-700">{uploadForm.file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">{(uploadForm.file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </>
                ) : (
                  <>
                    <HiOutlineUpload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Kéo thả file hoặc click để chọn</p>
                  </>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tiêu đề</label>
                <input type="text" value={uploadForm.title}
                  onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Tên tài liệu (tùy chọn)"
                  className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
                <button type="submit" disabled={uploading || !uploadForm.file}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 shadow-sm">
                  {uploading ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang upload...</> : <><HiOutlineUpload className="w-4 h-4" /> Upload</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 pt-5 pb-4 bg-gradient-to-br from-emerald-500 to-teal-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <HiOutlinePlus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base">Thêm văn bản kiến thức</h3>
                    <p className="text-emerald-200 text-xs mt-0.5">Nhập nội dung để chatbot học</p>
                  </div>
                </div>
                <button onClick={() => setShowTextModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white">
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>
            </div>
            <form onSubmit={onAddText} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tiêu đề</label>
                <input type="text" value={textForm.title}
                  onChange={e => setTextForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Tên tài liệu (tùy chọn)"
                  className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Nội dung</label>
                <textarea value={textForm.content}
                  onChange={e => setTextForm(p => ({ ...p, content: e.target.value }))}
                  rows={8} placeholder="Dán nội dung tài liệu, FAQ..."
                  className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-400 resize-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">{textForm.content.length} ký tự · ~{Math.ceil(textForm.content.length / 500)} chunks</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTextModal(false)} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
                <button type="submit" disabled={addingText || !textForm.content.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 shadow-sm">
                  {addingText ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang thêm...</> : <><HiOutlinePlus className="w-4 h-4" /> Thêm vào</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DeployTab({ deployTab, setDeployTab, form, chatbot, widgetCopied, showChannelModal, setShowChannelModal, channelForms, setChannelForms, connecting, onCopyWidgetCode, onConnectZalo, onConnectFacebook }) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="p-5 space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {[
          { id: 'script', label: 'Script', icon: HiOutlineCode },
          { id: 'iframe', label: 'iFrame', icon: HiOutlineGlobe },
          { id: 'zalo', label: 'Zalo OA', icon: HiOutlineLink },
          { id: 'facebook', label: 'Facebook', icon: HiOutlineLink },
        ].map(tab => (
          <button key={tab.id} onClick={() => setDeployTab(tab.id)}
            className={`flex-1 py-2 px-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              deployTab === tab.id ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {deployTab === 'script' && (
        <div className="bg-slate-900 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800">
            <span className="text-xs font-bold text-slate-300">Embed Code</span>
            <button onClick={onCopyWidgetCode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-[11px] rounded-lg transition-colors">
              {widgetCopied ? <><HiOutlineCheck className="w-3.5 h-3.5 text-green-400" /> Đã copy!</> : <><HiOutlineCode className="w-3.5 h-3.5" /> Copy code</>}
            </button>
          </div>
          <pre className="p-4 text-[10px] text-green-400 font-mono overflow-x-auto">
{`<script>
  window.customChatbotConfig = {
    token: '${chatbot.widget_key || chatbot.id}',
    baseUrl: '${baseUrl}',
    primaryColor: '${form.primary_color}',
    backgroundColor: '${form.background_color}',
    textColor: '${form.text_color}',
    accentColor: '${form.accent_color}',
    logoUrl: '${form.logo_url || ''}',
    showAvatar: ${form.show_avatar !== false},
    suggestedQuestions: ${JSON.stringify(form.suggested_questions || [])},
    position: '${form.position}',
    welcomeMessage: '${form.greeting_msg || 'Xin chào!'}'
  };
</script>
<script src="${baseUrl}/widget.js" defer></script>`}
          </pre>
        </div>
      )}

      {deployTab === 'iframe' && (
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center">
              <HiOutlineGlobeAlt className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-indigo-700">iFrame Embed</h3>
          </div>
          <p className="text-xs text-indigo-600">Nhúng chatbot vào website bất kỳ bằng iFrame</p>
          <pre className="text-[10px] text-indigo-800 font-mono bg-white rounded-xl p-4 overflow-x-auto border border-indigo-100">
{`<iframe
  src="${baseUrl}/chat/${chatbot.id}"
  width="100%" height="600"
  style="border:none;border-radius:12px;"
  allow="microphone;camera"
></iframe>`}
          </pre>
          <button onClick={() => { navigator.clipboard.writeText(`<iframe src="${baseUrl}/chat/${chatbot.id}" width="100%" height="600" style="border:none;border-radius:12px;"></iframe>`); toast.success('Đã copy!'); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-500 text-white text-xs font-bold rounded-xl hover:bg-indigo-600 transition-colors shadow-sm">
            <HiOutlineCode className="w-4 h-4" /> Copy iFrame code
          </button>
        </div>
      )}

      {deployTab === 'zalo' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 space-y-3">
            <h4 className="font-bold text-blue-700 text-sm">💬 Hướng dẫn kết nối Zalo OA</h4>
            {[
              'Đăng nhập oa.zalo.me và tạo Official Account',
              'Lấy App ID và Secret Key từ Cài đặt → Kết nối API',
              'Cài đặt Webhook URL bên dưới trên Zalo Developer',
              'Nhấn "Cài đặt Zalo OA" để kết nối',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs text-blue-700">{text}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase">🔗 Webhook URL</p>
              <button onClick={() => { navigator.clipboard.writeText(`${baseUrl}/api/webhooks/zalo/${chatbot.id}`); toast.success('Đã copy!'); }}
                className="text-xs text-violet-600 font-semibold">📋 Copy</button>
            </div>
            <code className="text-xs text-violet-600 break-all block bg-slate-50 p-3 rounded-lg font-mono">{baseUrl}/api/webhooks/zalo/{chatbot.id}</code>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase">🔐 Verify Token</p>
              <button onClick={() => {
                const token = chatbot.zalo_verify_token || `zalo_${chatbot.id}_${Date.now().toString(36)}`;
                navigator.clipboard.writeText(token);
                toast.success('Đã copy!');
              }} className="text-xs text-violet-600 font-semibold">📋 Copy</button>
            </div>
            <code className="text-xs text-violet-600 break-all block bg-slate-50 p-3 rounded-lg font-mono">
              {chatbot.zalo_verify_token || `zalo_${chatbot.id}_token`}
            </code>
          </div>

          <button onClick={() => {
            if (!chatbot.zalo_verify_token) {
              const token = `zalo_${chatbot.id}_${Date.now().toString(36)}`;
              const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
              const idx = bots.findIndex(b => b.id === chatbot.id);
              if (idx >= 0) { bots[idx].zalo_verify_token = token; localStorage.setItem('uknow_chatbots', JSON.stringify(bots)); }
            }
            setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, verify_token: chatbot.zalo_verify_token || `zalo_${chatbot.id}_token` } }));
            setShowChannelModal('zalo_oa');
          }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-bold rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-colors shadow-sm">
            <HiOutlineCog className="w-5 h-5" /> Cài đặt Zalo OA
          </button>
          <ZaloModal show={showChannelModal === 'zalo_oa'} onClose={() => setShowChannelModal(null)}
            channelForms={channelForms} setChannelForms={setChannelForms} connecting={connecting} onConnect={onConnectZalo} />
        </div>
      )}

      {deployTab === 'facebook' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-4 space-y-3">
            <h4 className="font-bold text-indigo-700 text-sm">📘 Hướng dẫn kết nối Facebook Messenger</h4>
            {[
              'Tạo App trên developers.facebook.com',
              'Thêm sản phẩm Messenger và lấy Page Token',
              'Cài đặt Webhook URL trên Meta Developer',
              'Nhấn "Cài đặt Facebook" để kết nối',
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs text-indigo-700">{text}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase">🔗 Webhook URL</p>
              <button onClick={() => { navigator.clipboard.writeText(`${baseUrl}/api/webhooks/facebook/${chatbot.id}`); toast.success('Đã copy!'); }}
                className="text-xs text-violet-600 font-semibold">📋 Copy</button>
            </div>
            <code className="text-xs text-violet-600 break-all block bg-slate-50 p-3 rounded-lg font-mono">{baseUrl}/api/webhooks/facebook/{chatbot.id}</code>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase">🔐 Verify Token</p>
              <button onClick={() => {
                const token = chatbot.fb_verify_token || `fb_${chatbot.id}_${Date.now().toString(36)}`;
                navigator.clipboard.writeText(token);
                toast.success('Đã copy!');
              }} className="text-xs text-violet-600 font-semibold">📋 Copy</button>
            </div>
            <code className="text-xs text-violet-600 break-all block bg-slate-50 p-3 rounded-lg font-mono">
              {chatbot.fb_verify_token || `fb_${chatbot.id}_token`}
            </code>
          </div>

          <button onClick={() => {
            if (!chatbot.fb_verify_token) {
              const token = `fb_${chatbot.id}_${Date.now().toString(36)}`;
              const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
              const idx = bots.findIndex(b => b.id === chatbot.id);
              if (idx >= 0) { bots[idx].fb_verify_token = token; localStorage.setItem('uknow_chatbots', JSON.stringify(bots)); }
            }
            setChannelForms(p => ({ ...p, facebook: { ...p.facebook, verify_token: chatbot.fb_verify_token || `fb_${chatbot.id}_token` } }));
            setShowChannelModal('facebook');
          }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-sm font-bold rounded-xl hover:from-indigo-600 hover:to-violet-600 transition-colors shadow-sm">
            <HiOutlineCog className="w-5 h-5" /> Cài đặt Facebook
          </button>
          <FacebookModal show={showChannelModal === 'facebook'} onClose={() => setShowChannelModal(null)}
            channelForms={channelForms} setChannelForms={setChannelForms} connecting={connecting} onConnect={onConnectFacebook} />
        </div>
      )}
    </div>
  );
}

function ZaloModal({ show, onClose, channelForms, setChannelForms, connecting, onConnect }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 pt-5 pb-4 bg-gradient-to-br from-blue-500 to-indigo-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <h3 className="text-white font-bold text-base">Cài đặt Zalo OA</h3>
                <p className="text-blue-200 text-xs mt-0.5">Kết nối Official Account</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Zalo OA ID *</label>
            <input type="text" value={channelForms.zalo_oa?.oa_id || ''}
              onChange={e => setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, oa_id: e.target.value } }))}
              placeholder="123456789"
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Secret Key *</label>
            <input type="password" value={channelForms.zalo_oa?.oa_secret || ''}
              onChange={e => setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, oa_secret: e.target.value } }))}
              placeholder="••••••••"
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Verify Token</label>
            <div className="flex gap-2 mt-1.5">
              <input type="password" value={channelForms.zalo_oa?.verify_token || ''}
                onChange={e => setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, verify_token: e.target.value } }))}
                placeholder="Verify token"
                className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400"
              />
              <button onClick={() => {
                const token = Math.random().toString(36).substring(2, 15);
                setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, verify_token: token } }));
              }} className="px-3 py-2 bg-slate-100 text-slate-600 text-xs rounded-xl hover:bg-slate-200">🎲</button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
            <button onClick={onConnect} disabled={connecting}
              className="flex items-center gap-2 px-5 py-2 bg-blue-500 text-white text-sm font-bold rounded-xl hover:bg-blue-600 disabled:opacity-50">
              {connecting ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang kết nối...</> : <><HiOutlineCheck className="w-4 h-4" /> Kết nối</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FacebookModal({ show, onClose, channelForms, setChannelForms, connecting, onConnect }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 pt-5 pb-4 bg-gradient-to-br from-indigo-500 to-violet-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📘</span>
              <div>
                <h3 className="text-white font-bold text-base">Cài đặt Facebook Messenger</h3>
                <p className="text-indigo-200 text-xs mt-0.5">Kết nối Page Messenger</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Page ID *</label>
            <input type="text" value={channelForms.facebook?.page_id || ''}
              onChange={e => setChannelForms(p => ({ ...p, facebook: { ...p.facebook, page_id: e.target.value } }))}
              placeholder="123456789"
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Page Token *</label>
            <input type="password" value={channelForms.facebook?.page_token || ''}
              onChange={e => setChannelForms(p => ({ ...p, facebook: { ...p.facebook, page_token: e.target.value } }))}
              placeholder="••••••••"
              className="mt-1.5 w-full border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase">Verify Token</label>
            <div className="flex gap-2 mt-1.5">
              <input type="password" value={channelForms.facebook?.verify_token || ''}
                onChange={e => setChannelForms(p => ({ ...p, facebook: { ...p.facebook, verify_token: e.target.value } }))}
                placeholder="Verify token"
                className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
              />
              <button onClick={() => {
                const token = Math.random().toString(36).substring(2, 15);
                setChannelForms(p => ({ ...p, facebook: { ...p.facebook, verify_token: token } }));
              }} className="px-3 py-2 bg-slate-100 text-slate-600 text-xs rounded-xl hover:bg-slate-200">🎲</button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500">Hủy</button>
            <button onClick={onConnect} disabled={connecting}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-500 text-white text-sm font-bold rounded-xl hover:bg-indigo-600 disabled:opacity-50">
              {connecting ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang kết nối...</> : <><HiOutlineCheck className="w-4 h-4" /> Kết nối</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatbotSettings;
