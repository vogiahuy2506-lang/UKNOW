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
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useI18n } from '../../i18n';

const TABS = [
  { id: 'general', label: 'chatbot.studio.tabGeneral', icon: HiOutlineUserCircle },
  { id: 'knowledge', label: 'chatbot.studio.tabKnowledge', icon: HiOutlineBookOpen },
  { id: 'deploy', label: 'chatbot.studio.tabDeploy', icon: HiOutlineChip },
];

const STATUS_COLORS = {
  pending: 'text-slate-400 bg-slate-100',
  processing: 'text-blue-600 bg-blue-100',
  ready: 'text-green-600 bg-green-100',
  error: 'text-red-600 bg-red-100',
};

function ChatbotSettings({ chatbot, onUpdate }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [deployTab, setDeployTab] = useState('script');

  // General settings
  const [form, setForm] = useState({
    name: '',
    description: '',
    system_instruction: '',
    greeting_msg: '',
    avatar_url: '',
    is_active: true,
    temperature: 0.7,
    max_tokens: 2048,
  });

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

  // Deploy settings
  const [widgetSettings, setWidgetSettings] = useState({
    theme_color: '#6366F1',
    position: 'bottom-right',
    welcome_message: '',
  });
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [_channels, setChannels] = useState([]);
  const [showChannelModal, setShowChannelModal] = useState(null);
  const [channelForms, setChannelForms] = useState({});
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (chatbot) {
      setForm({
        name: chatbot.name || '',
        description: chatbot.description || '',
        system_instruction: chatbot.system_instruction || '',
        greeting_msg: chatbot.greeting_msg || '',
        avatar_url: chatbot.avatar_url || '',
        is_active: chatbot.is_active !== false,
        temperature: chatbot.temperature || 0.7,
        max_tokens: chatbot.max_tokens || 2048,
      });
      setWidgetSettings({
        theme_color: chatbot.widget_settings?.theme_color || '#6366F1',
        position: chatbot.widget_settings?.position || 'bottom-right',
        welcome_message: chatbot.widget_settings?.welcome_message || '',
      });
      // Reset documents khi đổi chatbot
      setDocuments([]);
      // Load documents for this chatbot
      loadDocumentsForChatbot(chatbot.id);
      setChannels(chatbot.channels || []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id]);

  // Load documents from backend
  const loadDocumentsForChatbot = async (chatbotId) => {
    if (!chatbotId) return;
    try {
      const res = await api.get(`/ai/custom-chat/documents/${chatbotId}`);
      if (res.data?.documents) {
        setDocuments(res.data.documents);
      } else {
        // Fallback to localStorage
        setDocuments(chatbot?.documents || []);
      }
    } catch {
      // Fallback to localStorage
      setDocuments(chatbot?.documents || []);
    }
  };

  // ── General ────────────────────────────────────────────────────────────────

  const handleSaveGeneral = async () => {
    if (!form.name.trim()) {
      toast.error(t('chatbot.studio.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const updatedBot = {
        ...chatbot,
        ...form,
        widget_settings: widgetSettings,
      };
      // Save to localStorage (bypass API for now)
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        bots[idx] = updatedBot;
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
      onUpdate(updatedBot);
      toast.success(t('common.success'));
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // ── Documents ────────────────────────────────────────────────────────────

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
      // Upload to backend for processing
      const formData = new FormData();
      formData.append('file', uploadForm.file);
      formData.append('chatbot_id', chatbot.id.toString());

      const res = await api.post('/ai/custom-chat/upload', formData, {
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
        toast.success(`${t('chatbot.knowledgeBase.processing')}: ${res.data.chunks} chunks`);
        // Update localStorage
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
      // Create document locally
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
      // Update localStorage
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
      // Update localStorage
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

  // ── Deploy ────────────────────────────────────────────────────────────────

  const handleSaveWidget = async () => {
    setSaving(true);
    try {
      const updatedBot = {
        ...chatbot,
        widget_settings: widgetSettings,
      };
      // Update localStorage
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        bots[idx] = updatedBot;
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
      onUpdate(updatedBot);
      toast.success(t('common.success'));
    } catch {
      toast.error(t('errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const copyWidgetCode = () => {
    const baseUrl = window.location.origin;
    const code = `<script>
  window.customChatbotConfig = {
    token: '${chatbot.widget_key || chatbot.id}',
    baseUrl: '${baseUrl}',
    themeColor: '${widgetSettings.theme_color}',
    colorBg: '#ffffff',
    colorText: '#1f2937',
    position: '${widgetSettings.position}',
    welcomeMessage: '${widgetSettings.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?'}'
  };
</script>
<script src="${baseUrl}/widget.js" defer></script>`;
    navigator.clipboard.writeText(code);
    setWidgetCopied(true);
    toast.success(t('common.copied'));
    setTimeout(() => setWidgetCopied(false), 2000);
  };

  const handleConnectZalo = async () => {
    const form = channelForms.zalo_oa || {};
    if (!form.oa_id || !form.oa_secret) {
      toast.error(t('errors.validationError'));
      return;
    }
    setConnecting(true);
    try {
      const channel = {
        type: 'zalo_oa',
        oa_id: form.oa_id,
        oa_secret: form.oa_secret,
        verify_token: form.verify_token,
        is_connected: true,
      };
      // Update localStorage
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        const channels = bots[idx].channels || [];
        const chIdx = channels.findIndex(c => c.type === 'zalo_oa');
        if (chIdx >= 0) {
          channels[chIdx] = channel;
        } else {
          channels.push(channel);
        }
        bots[idx].channels = channels;
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
      setChannels(prev => {
        const updated = [...prev];
        const zaloIdx = updated.findIndex(c => c.type === 'zalo_oa');
        if (zaloIdx >= 0) updated[zaloIdx] = channel;
        else updated.push(channel);
        return updated;
      });
      setShowChannelModal(null);
      toast.success(t('common.success'));
    } catch {
      toast.error(t('errors.connectFailed'));
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectFacebook = async () => {
    const form = channelForms.facebook || {};
    if (!form.page_id || !form.page_token) {
      toast.error(t('errors.validationError'));
      return;
    }
    setConnecting(true);
    try {
      const channel = {
        type: 'facebook',
        page_id: form.page_id,
        page_token: form.page_token,
        verify_token: form.verify_token,
        is_connected: true,
      };
      // Update localStorage
      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
      const idx = bots.findIndex(b => b.id === chatbot.id);
      if (idx >= 0) {
        const channels = bots[idx].channels || [];
        const chIdx = channels.findIndex(c => c.type === 'facebook');
        if (chIdx >= 0) {
          channels[chIdx] = channel;
        } else {
          channels.push(channel);
        }
        bots[idx].channels = channels;
        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
      }
      setChannels(prev => {
        const updated = [...prev];
        const fbIdx = updated.findIndex(c => c.type === 'facebook');
        if (fbIdx >= 0) updated[fbIdx] = channel;
        else updated.push(channel);
        return updated;
      });
      setShowChannelModal(null);
      toast.success(t('common.success'));
    } catch {
      toast.error(t('errors.connectFailed'));
    } finally {
      setConnecting(false);
    }
  };

  if (!chatbot) {
    return (
      <div className="w-80 h-full bg-white border-l border-slate-200 flex items-center justify-center">
        <div className="text-center">
          <HiOutlineCog className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">{t('chatbot.studio.selectBotToConfigure')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 h-full bg-white border-l border-slate-200 flex flex-col shrink-0">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-purple-600 border-b-2 border-purple-500 bg-purple-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden lg:inline">{t(tab.label)}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── General Tab ── */}
        {activeTab === 'general' && (
          <div className="p-4 space-y-4">
            {/* Avatar */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('chatbot.studio.avatar')}
              </label>
              <div className="flex items-center gap-3 mt-1">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex items-center justify-center overflow-hidden">
                  {form.avatar_url ? (
                    <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xl font-bold">{form.name?.[0]?.toUpperCase() || '🤖'}</span>
                  )}
                </div>
                <input
                  type="url"
                  value={form.avatar_url}
                  onChange={(e) => setForm(p => ({ ...p, avatar_url: e.target.value }))}
                  placeholder={t('chatbot.studio.avatarUrlPlaceholder')}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400"
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('chatbot.studio.botName')} *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-purple-400"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('chatbot.studio.description')}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
                className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-purple-400 resize-none"
              />
            </div>

            {/* Greeting */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('chatbot.studio.greetingMsg')}
              </label>
              <textarea
                value={form.greeting_msg}
                onChange={(e) => setForm(p => ({ ...p, greeting_msg: e.target.value }))}
                placeholder={t('chatbot.studio.greetingPlaceholder')}
                rows={2}
                className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-purple-400 resize-none"
              />
            </div>

            {/* System Instructions */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('chatbot.studio.systemInstructions')}
              </label>
              <textarea
                value={form.system_instruction}
                onChange={(e) => setForm(p => ({ ...p, system_instruction: e.target.value }))}
                placeholder={t('chatbot.studio.instructionsPlaceholder')}
                rows={4}
                className="mt-1 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-purple-400 resize-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.studio.instructionsTip')}</p>
            </div>

            {/* Model Settings */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('chatbot.studio.temperature')}
              </label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
                  className="flex-1"
                />
                <span className="text-xs text-slate-500 w-8">{form.temperature}</span>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('chatbot.studio.status')}
              </label>
              <button
                onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  form.is_active ? 'bg-purple-500' : 'bg-slate-300'
                }`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.is_active ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveGeneral}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? (
                <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('common.processing')}</>
              ) : (
                <><HiOutlineSave className="w-4 h-4" />{t('common.save')}</>
              )}
            </button>
          </div>
        )}

        {/* ── Knowledge Tab ── */}
        {activeTab === 'knowledge' && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                {t('chatbot.studio.documents')}
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">
                Upload tài liệu để chatbot học và trả lời chính xác hơn
              </p>
            </div>

            {/* Upload Actions */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-purple-400 hover:text-purple-600 transition-colors"
                >
                  <HiOutlineUpload className="w-3.5 h-3.5" />
                  {t('chatbot.studio.uploadFile')}
                </button>
                <button
                  onClick={() => setShowTextModal(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-500 text-white rounded-lg text-xs font-semibold hover:bg-purple-600 transition-colors"
                >
                  <HiOutlinePlus className="w-3.5 h-3.5" />
                  {t('chatbot.studio.addText')}
                </button>
              </div>
            </div>

            {/* Documents List */}
            <div className="flex-1 overflow-y-auto p-3">
              {documents.length === 0 ? (
                <div className="text-center py-8">
                  <HiOutlineDocumentText className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">{t('chatbot.studio.noDocuments')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                      <HiOutlineDocumentText className={`w-5 h-5 shrink-0 ${STATUS_COLORS[doc.status]?.split(' ')[0] || 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{doc.title}</p>
                        <p className="text-[10px] text-slate-400">{doc.chunk_count || 0} chunks</p>
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc)}
                        disabled={deletingDoc === doc.id}
                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-40"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Deploy Tab ── */}
        {activeTab === 'deploy' && (
          <div className="p-4 space-y-4">
            {/* All 4 Tabs in 1 Row */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setDeployTab('script')}
                className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
                  deployTab === 'script'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📜 Script
              </button>
              <button
                onClick={() => setDeployTab('iframe')}
                className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
                  deployTab === 'iframe'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                🖼️ iFrame
              </button>
              <button
                onClick={() => setDeployTab('zalo')}
                className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
                  deployTab === 'zalo'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                💬 Zalo
              </button>
              <button
                onClick={() => setDeployTab('facebook')}
                className={`flex-1 py-2 px-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
                  deployTab === 'facebook'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📘 Facebook
              </button>
            </div>

            {/* Script Tab */}
            {deployTab === 'script' && (
              <>
                {/* Widget Settings */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
                    {t('chatbot.studio.widgetSettings')}
                  </h3>

                  {/* Theme Color */}
                  <div className="mb-3">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">{t('chatbot.studio.themeColor')}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="color"
                        value={widgetSettings.theme_color}
                        onChange={(e) => setWidgetSettings(p => ({ ...p, theme_color: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                      <span className="text-xs text-slate-500">{widgetSettings.theme_color}</span>
                    </div>
                  </div>

                  {/* Position */}
                  <div className="mb-3">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">{t('chatbot.studio.position')}</label>
                    <select
                      value={widgetSettings.position}
                      onChange={(e) => setWidgetSettings(p => ({ ...p, position: e.target.value }))}
                      className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-purple-400 bg-white"
                    >
                      <option value="bottom-right">{t('chatbot.studio.bottomRight')}</option>
                      <option value="bottom-left">{t('chatbot.studio.bottomLeft')}</option>
                      <option value="top-right">{t('chatbot.studio.topRight')}</option>
                      <option value="top-left">{t('chatbot.studio.topLeft')}</option>
                    </select>
                  </div>

                  {/* Welcome Message */}
                  <div className="mb-3">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase">{t('chatbot.studio.welcomeMsg')}</label>
                    <textarea
                      value={widgetSettings.welcome_message}
                      onChange={(e) => setWidgetSettings(p => ({ ...p, welcome_message: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-purple-400 resize-none"
                    />
                  </div>

                  {/* Save Widget */}
                  <button
                    onClick={handleSaveWidget}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-500 text-white text-xs font-semibold rounded-lg hover:bg-purple-600 disabled:opacity-60 transition-colors"
                  >
                    <HiOutlineSave className="w-3.5 h-3.5" />
                    {t('common.save')}
                  </button>
                </div>

                {/* Embed Code */}
                <div className="bg-slate-900 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-300">{t('chatbot.studio.scriptCode')}</h3>
                    <button
                      onClick={copyWidgetCode}
                      className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] rounded transition-colors"
                    >
                      {widgetCopied ? <HiOutlineCheck className="w-3 h-3" /> : <HiOutlineCode className="w-3 h-3" />}
                      {widgetCopied ? t('common.copied') : t('common.copy')}
                    </button>
                  </div>
                  <pre className="text-[10px] text-green-400 font-mono overflow-x-auto">
{`<script>
  window.customChatbotConfig = {
    token: '${chatbot.widget_key || chatbot.id}',
    baseUrl: '${window.location.origin}',
    themeColor: '${widgetSettings.theme_color}',
    colorBg: '#ffffff',
    colorText: '#1f2937',
    position: '${widgetSettings.position}',
    welcomeMessage: '${widgetSettings.welcome_message || 'Xin chào!'}'
  };
</script>
<script src="${window.location.origin}/widget.js" defer></script>`}
                  </pre>
                  <p className="text-[10px] text-slate-500 mt-2">
                    {t('chatbot.studio.scriptNote')}
                  </p>
                </div>
              </>
            )}

            {/* iFrame Tab */}
            {deployTab === 'iframe' && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <HiOutlineGlobeAlt className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold text-indigo-700">{t('chatbot.studio.iframeEmbed')}</h3>
                </div>
                <p className="text-xs text-indigo-600 mb-4">
                  {t('chatbot.studio.iframeDesc')}
                </p>
                <pre className="text-[10px] text-indigo-800 font-mono bg-white rounded-lg p-3 overflow-x-auto">
{`<iframe
  src="${window.location.origin}/chat/${chatbot.id}"
  width="100%" height="600"
  style="border:none;border-radius:12px;"
  allow="microphone;camera"
></iframe>`}
                </pre>
                <button
                  onClick={() => {
                    const code = `<iframe src="${window.location.origin}/chat/${chatbot.id}" width="100%" height="600" style="border:none;border-radius:12px;" allow="microphone;camera"></iframe>`;
                    navigator.clipboard.writeText(code);
                    toast.success(t('common.copied'));
                  }}
                  className="mt-4 flex items-center justify-center gap-1.5 w-full py-2.5 bg-indigo-500 text-white text-xs font-semibold rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  <HiOutlineCode className="w-4 h-4" />
                  {t('common.copy')} {t('chatbot.studio.iframeCode')}
                </button>
              </div>
            )}

            {/* Zalo OA Tab */}
            {deployTab === 'zalo' && (
              <div className="space-y-4">
                {/* Detailed Guide */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <h4 className="font-bold text-blue-700 mb-3 flex items-center gap-2">
                    💬 {t('chatbot.studio.zaloGuide')}
                  </h4>

                  {/* Step 1: Get Zalo OA */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-blue-800 mb-1">Bước 1: Tạo Zalo OA (Official Account)</p>
                    <ul className="text-xs text-blue-600 space-y-1 ml-2">
                      <li>• Đăng nhập <a href="https://oa.zalo.me" target="_blank" rel="noreferrer" className="underline">oa.zalo.me</a></li>
                      <li>• Nếu chưa có OA, nhấn "Tạo OA" và làm theo hướng dẫn</li>
                      <li>• Sau khi có OA, vào <strong>Cài đặt → Thông tin OA</strong></li>
                      <li>• Copy <strong>ID Ứng dụng</strong> (ví dụ: 123456789)</li>
                    </ul>
                  </div>

                  {/* Step 2: Get Secret */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-blue-800 mb-1">Bước 2: Lấy Secret Key</p>
                    <ul className="text-xs text-blue-600 space-y-1 ml-2">
                      <li>• Vào <strong>Cài đặt → Kết nối API</strong></li>
                      <li>• Nhấn "Tạo Secret Key" nếu chưa có</li>
                      <li>• Copy <strong>Secret Key</strong> đã tạo</li>
                    </ul>
                  </div>

                  {/* Step 3: Setup Webhook */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-blue-800 mb-1">Bước 3: Cài đặt Webhook</p>
                    <ul className="text-xs text-blue-600 space-y-1 ml-2">
                      <li>• Vào <strong>Cài đặt → Webhook API</strong></li>
                      <li>• Dán Webhook URL bên dưới vào ô "Callback URL"</li>
                      <li>• Nhấn "Xác nhận" để verify</li>
                      <li>• Bật <strong>"Nhận tin nhắn"</strong> và <strong>"Nhận sự kiện"</strong></li>
                    </ul>
                  </div>

                  {/* Step 4: Enter credentials */}
                  <div>
                    <p className="text-xs font-semibold text-blue-800 mb-1">Bước 4: Nhập thông tin</p>
                    <ul className="text-xs text-blue-600 space-y-1 ml-2">
                      <li>• Nhấn nút <strong>"Cài đặt Zalo OA"</strong> bên dưới</li>
                      <li>• Nhập Zalo OA ID, Secret Key đã lấy ở bước 1-2</li>
                      <li>• Generate Verify Token bằng nút 🎲</li>
                      <li>• Nhấn <strong>"Kết nối"</strong></li>
                    </ul>
                  </div>
                </div>

                {/* Webhook URL */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">🔗 Webhook URL:</p>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/api/webhooks/zalo/${chatbot.id}`;
                        navigator.clipboard.writeText(url);
                        toast.success(t('common.copied'));
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      📋 {t('common.copy')}
                    </button>
                  </div>
                  <code className="text-xs text-purple-600 break-all block bg-slate-50 p-3 rounded-lg">
                    {window.location.origin}/api/webhooks/zalo/{chatbot.id}
                  </code>
                </div>

                {/* Verify Token */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">🔐 Verify Token:</p>
                    <button
                      onClick={() => {
                        const token = chatbot.zalo_verify_token || `zalo_${chatbot.id}_${Date.now().toString(36)}`;
                        navigator.clipboard.writeText(token);
                        toast.success(t('common.copied'));
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      📋 {t('common.copy')}
                    </button>
                  </div>
                  <code className="text-xs text-purple-600 break-all block bg-slate-50 p-3 rounded-lg">
                    {chatbot.zalo_verify_token || `zalo_${chatbot.id}_token`}
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Dán token này vào ô "Verify Token" trên Zalo Developer
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Auto-generate verify token if not exists
                    if (!chatbot.zalo_verify_token) {
                      const token = `zalo_${chatbot.id}_${Date.now().toString(36)}`;
                      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
                      const idx = bots.findIndex(b => b.id === chatbot.id);
                      if (idx >= 0) {
                        bots[idx].zalo_verify_token = token;
                        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
                      }
                    }
                    setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, verify_token: chatbot.zalo_verify_token || `zalo_${chatbot.id}_${Date.now().toString(36)}` } }));
                    setShowChannelModal('zalo_oa');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white text-sm font-semibold rounded-xl hover:bg-blue-600 transition-colors"
                >
                  <HiOutlineCog className="w-5 h-5" />
                  {t('chatbot.studio.setupZalo')}
                </button>
              </div>
            )}

            {/* Facebook Tab */}
            {deployTab === 'facebook' && (
              <div className="space-y-4">
                {/* Detailed Guide */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <h4 className="font-bold text-indigo-700 mb-3 flex items-center gap-2">
                    📘 {t('chatbot.studio.fbGuide')}
                  </h4>

                  {/* Step 1: Create App */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-indigo-800 mb-1">Bước 1: Tạo Facebook App</p>
                    <ul className="text-xs text-indigo-600 space-y-1 ml-2">
                      <li>• Truy cập <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline">developers.facebook.com</a></li>
                      <li>• Nhấn <strong>"My Apps"</strong> → <strong>"Create App"</strong></li>
                      <li>• Chọn loại app: <strong>"Business"</strong></li>
                      <li>• Điền tên app và email, nhấn "Create App"</li>
                    </ul>
                  </div>

                  {/* Step 2: Add Messenger */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-indigo-800 mb-1">Bước 2: Thêm sản phẩm Messenger</p>
                    <ul className="text-xs text-indigo-600 space-y-1 ml-2">
                      <li>• Trong App Dashboard, vào <strong>"Add Products"</strong></li>
                      <li>• Tìm <strong>"Messenger"</strong> và nhấn "Set Up"</li>
                      <li>• Kéo xuống phần <strong>"Access Tokens"</strong></li>
                    </ul>
                  </div>

                  {/* Step 3: Get Page Token */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-indigo-800 mb-1">Bước 3: Lấy Page Access Token</p>
                    <ul className="text-xs text-indigo-600 space-y-1 ml-2">
                      <li>• Chọn Facebook Page của bạn từ dropdown</li>
                      <li>• Nhấn <strong>"Generate Token"</strong></li>
                      <li>• Copy token (token này dài, không cần nhớ)</li>
                      <li>• <strong>⚠️ Lưu lại somewhere vì chỉ hiển thị 1 lần!</strong></li>
                    </ul>
                  </div>

                  {/* Step 4: Setup Webhooks */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-indigo-800 mb-1">Bước 4: Cài đặt Webhooks</p>
                    <ul className="text-xs text-indigo-600 space-y-1 ml-2">
                      <li>• Trong <strong>"Webhooks"</strong> section, nhấn "Edit Subscription"</li>
                      <li>• Paste Webhook URL bên dưới vào ô <strong>"Callback URL"</strong></li>
                      <li>• Nhập <strong>Verify Token</strong> (tự tạo hoặc dùng 🎲)</li>
                      <li>• Subscribe vào: <strong>messages</strong>, <strong>messaging_postbacks</strong></li>
                    </ul>
                  </div>

                  {/* Step 5: Get Page ID & Enter info */}
                  <div>
                    <p className="text-xs font-semibold text-indigo-800 mb-1">Bước 5: Nhập thông tin</p>
                    <ul className="text-xs text-indigo-600 space-y-1 ml-2">
                      <li>• Vào Facebook Page → <strong>Giới thiệu → Thông tin Trang</strong></li>
                      <li>• Copy <strong>ID Trang</strong></li>
                      <li>• Nhấn <strong>"Cài đặt Facebook"</strong> bên dưới</li>
                      <li>• Nhập Page ID, Page Token, Verify Token</li>
                      <li>• Nhấn <strong>"Kết nối"</strong></li>
                    </ul>
                  </div>
                </div>

                {/* Webhook URL */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">🔗 Webhook URL:</p>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/api/webhooks/facebook/${chatbot.id}`;
                        navigator.clipboard.writeText(url);
                        toast.success(t('common.copied'));
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      📋 {t('common.copy')}
                    </button>
                  </div>
                  <code className="text-xs text-purple-600 break-all block bg-slate-50 p-3 rounded-lg">
                    {window.location.origin}/api/webhooks/facebook/{chatbot.id}
                  </code>
                </div>

                {/* Verify Token */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">🔐 Verify Token:</p>
                    <button
                      onClick={() => {
                        const token = chatbot.fb_verify_token || `fb_${chatbot.id}_${Date.now().toString(36)}`;
                        navigator.clipboard.writeText(token);
                        toast.success(t('common.copied'));
                      }}
                      className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                      📋 {t('common.copy')}
                    </button>
                  </div>
                  <code className="text-xs text-purple-600 break-all block bg-slate-50 p-3 rounded-lg">
                    {chatbot.fb_verify_token || `fb_${chatbot.id}_token`}
                  </code>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Dán token này vào ô "Verify Token" trên Facebook Developer
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Auto-generate verify token if not exists
                    if (!chatbot.fb_verify_token) {
                      const token = `fb_${chatbot.id}_${Date.now().toString(36)}`;
                      const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
                      const idx = bots.findIndex(b => b.id === chatbot.id);
                      if (idx >= 0) {
                        bots[idx].fb_verify_token = token;
                        localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
                      }
                    }
                    setChannelForms(p => ({ ...p, facebook: { ...p.facebook, verify_token: chatbot.fb_verify_token || `fb_${chatbot.id}_${Date.now().toString(36)}` } }));
                    setShowChannelModal('facebook');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 transition-colors"
                >
                  <HiOutlineCog className="w-5 h-5" />
                  {t('chatbot.studio.setupFacebook')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.studio.uploadFile')}</h3>
              <button onClick={() => setShowUploadModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUploadFile} className="p-4 space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setUploadForm(p => ({ ...p, file: f, title: f.name.replace(/\.[^.]+$/, '') }));
                }}
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-purple-400 transition-colors"
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
                {uploadForm.file ? (
                  <>
                    <HiOutlineDocumentText className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">{uploadForm.file.name}</p>
                  </>
                ) : (
                  <>
                    <HiOutlineUpload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">{t('chatbot.studio.dropFileHere')}</p>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowUploadModal(false)} className="px-3 py-1.5 text-sm text-slate-500">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={uploading || !uploadForm.file} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                  {uploading ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" /></> : <><HiOutlineUpload className="w-4 h-4" />{t('chatbot.studio.upload')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Text Modal */}
      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">{t('chatbot.studio.addTextContent')}</h3>
              <button onClick={() => setShowTextModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddText} className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{t('chatbot.studio.content')}</label>
                <textarea
                  value={textForm.content}
                  onChange={(e) => setTextForm(p => ({ ...p, content: e.target.value }))}
                  rows={6}
                  placeholder={t('chatbot.studio.contentPlaceholder')}
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowTextModal(false)} className="px-3 py-1.5 text-sm text-slate-500">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={addingText} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white text-sm font-semibold rounded-lg disabled:opacity-60">
                  {addingText ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" /></> : <HiOutlinePlus className="w-4 h-4" />}
                  {t('chatbot.studio.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Zalo OA Setup Modal */}
      {showChannelModal === 'zalo_oa' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">💬</span>
                <h3 className="text-sm font-bold text-slate-800">{t('chatbot.studio.zaloSetupTitle')}</h3>
              </div>
              <button onClick={() => setShowChannelModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Zalo OA ID */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{t('chatbot.studio.zaloOaId')}</label>
                <input
                  type="text"
                  value={channelForms.zalo_oa?.oa_id || ''}
                  onChange={(e) => setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, oa_id: e.target.value } }))}
                  placeholder="123456789"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.studio.zaloOaIdTip')}</p>
              </div>

              {/* Zalo OA Secret */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{t('chatbot.studio.zaloOaSecret')}</label>
                <input
                  type="password"
                  value={channelForms.zalo_oa?.oa_secret || ''}
                  onChange={(e) => setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, oa_secret: e.target.value } }))}
                  placeholder="••••••••"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.studio.zaloOaSecretTip')}</p>
              </div>

              {/* Zalo Verify Token */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{t('chatbot.studio.zaloVerifyToken')}</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="password"
                    value={channelForms.zalo_oa?.verify_token || ''}
                    onChange={(e) => setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, verify_token: e.target.value } }))}
                    placeholder="Nhập verify token"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => {
                      const token = Math.random().toString(36).substring(2, 15);
                      setChannelForms(p => ({ ...p, zalo_oa: { ...p.zalo_oa, verify_token: token } }));
                    }}
                    className="px-3 py-2 text-xs bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
                  >
                    🎲 Random
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.studio.zaloVerifyTokenTip')}</p>
              </div>

              {/* Webhook URL */}
              <div className="bg-blue-50 rounded-xl p-3">
                <label className="text-[10px] font-semibold text-blue-600 uppercase">{t('chatbot.studio.webhookUrl')}</label>
                <code className="text-xs text-blue-700 break-all block mt-1 bg-white rounded p-2">
                  {window.location.origin}/api/webhooks/zalo/{chatbot.id}
                </code>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowChannelModal(null)}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleConnectZalo()}
                  disabled={connecting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-60"
                >
                  {connecting ? <HiOutlineRefresh className="w-4 h-4 animate-spin" /> : <HiOutlineCheck className="w-4 h-4" />}
                  {t('chatbot.studio.connect')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Facebook Setup Modal */}
      {showChannelModal === 'facebook' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xl">📘</span>
                <h3 className="text-sm font-bold text-slate-800">{t('chatbot.studio.fbSetupTitle')}</h3>
              </div>
              <button onClick={() => setShowChannelModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Facebook Page ID */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{t('chatbot.studio.fbPageId')}</label>
                <input
                  type="text"
                  value={channelForms.facebook?.page_id || ''}
                  onChange={(e) => setChannelForms(p => ({ ...p, facebook: { ...p.facebook, page_id: e.target.value } }))}
                  placeholder="123456789"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.studio.fbPageIdTip')}</p>
              </div>

              {/* Facebook Page Token */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{t('chatbot.studio.fbPageToken')}</label>
                <input
                  type="password"
                  value={channelForms.facebook?.page_token || ''}
                  onChange={(e) => setChannelForms(p => ({ ...p, facebook: { ...p.facebook, page_token: e.target.value } }))}
                  placeholder="••••••••"
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.studio.fbPageTokenTip')}</p>
              </div>

              {/* Facebook Verify Token */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase">{t('chatbot.studio.fbVerifyToken')}</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="password"
                    value={channelForms.facebook?.verify_token || ''}
                    onChange={(e) => setChannelForms(p => ({ ...p, facebook: { ...p.facebook, verify_token: e.target.value } }))}
                    placeholder="Nhập verify token"
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => {
                      const token = Math.random().toString(36).substring(2, 15);
                      setChannelForms(p => ({ ...p, facebook: { ...p.facebook, verify_token: token } }));
                    }}
                    className="px-3 py-2 text-xs bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
                  >
                    🎲 Random
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{t('chatbot.studio.fbVerifyTokenTip')}</p>
              </div>

              {/* Webhook URL */}
              <div className="bg-indigo-50 rounded-xl p-3">
                <label className="text-[10px] font-semibold text-indigo-600 uppercase">{t('chatbot.studio.webhookUrl')}</label>
                <code className="text-xs text-indigo-700 break-all block mt-1 bg-white rounded p-2">
                  {window.location.origin}/api/webhooks/facebook/{chatbot.id}
                </code>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowChannelModal(null)}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleConnectFacebook()}
                  disabled={connecting}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 disabled:opacity-60"
                >
                  {connecting ? <HiOutlineRefresh className="w-4 h-4 animate-spin" /> : <HiOutlineCheck className="w-4 h-4" />}
                  {t('chatbot.studio.connect')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatbotSettings;
