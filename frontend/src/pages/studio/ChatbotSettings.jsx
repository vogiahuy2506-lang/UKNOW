import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HiOutlineSave,
  HiOutlineRefresh,
  HiOutlineUpload,
  HiOutlineDocumentText,
  HiOutlineTrash,
  HiOutlineCode,
  HiOutlineCheck,
  HiOutlinePlus,
  HiOutlineX,
  HiOutlineChatAlt2,
  HiOutlineSparkles,
  HiOutlineGlobeAlt,
  HiOutlineColorSwatch,
  HiOutlineBookOpen,
  HiOutlineExternalLink,
  HiOutlineShieldCheck,
  HiOutlineLink,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';
import {
  ChannelGuideModal,
  ChannelOverview,
  ChannelQuickTest,
  ChecklistStep,
  CopyField,
  FacebookChannelCard,
  FieldRow,
  SectionCard,
  Textarea,
  TextInput,
  Toggle,
  ZaloChannelCard,
} from '../../features/chatbot/components/ChatbotSettingsComponents';

const TABS = [
  { id: 'general',   label: 'Cấu hình' },
  { id: 'knowledge', label: 'Kiến thức' },
  { id: 'deploy',    label: 'Triển khai' },
];

// ── Main component ──────────────────────────────────────────────────────────────

export default function ChatbotSettings({ chatbot, onUpdate }) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [showChannelGuideModal, setShowChannelGuideModal] = useState(null);
  const [showFacebookConnectModal, setShowFacebookConnectModal] = useState(false);
  const [facebookConnectForm, setFacebookConnectForm] = useState({
    display_name: chatbot?.name ? `${chatbot.name} Facebook` : '',
    page_id: '',
    page_access_token: '',
  });
  const [uploadForm, setUploadForm] = useState({ title: '', file: null });
  const [textForm, setTextForm] = useState({ title: '', content: '' });
  const [uploading, setUploading] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const fileInputRef = useRef(null);

  // Deploy
  const [widgetCopied, setWidgetCopied] = useState(false);
  const [channels, setChannels] = useState([]);
  const [channelConnecting, setChannelConnecting] = useState(false);
  const [showZaloConnectModal, setShowZaloConnectModal] = useState(false);
  const [zaloConnectForm, setZaloConnectForm] = useState({
    display_name: chatbot?.name ? `${chatbot.name} Zalo OA` : '',
    zalo_app_id: '',
    zalo_app_secret: '',
  });
  const [expandedGuideStep, setExpandedGuideStep] = useState({
    zalo: 1,
    facebook: 1,
  });

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
        primary_color: ws.primary_color || '#8B5CF6',
        background_color: ws.background_color || '#FFFFFF',
        text_color: ws.text_color || '#1F2937',
        accent_color: ws.accent_color || '#A78BFA',
        position: ws.position || 'bottom-right',
        logo_url: ws.logo_url || '',
        show_avatar: ws.show_avatar !== false,
        suggested_questions: ws.suggested_questions || [],
      });
      setZaloConnectForm({
        display_name: chatbot.name ? `${chatbot.name} Zalo OA` : '',
        zalo_app_id: '',
        zalo_app_secret: '',
      });
      setDocuments([]);
      loadDocumentsForChatbot(chatbot.id);
      loadChannels(chatbot.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id]);

  useEffect(() => {
    const oauthChannel = searchParams.get('channel_oauth');
    const oauthChatbotId = searchParams.get('chatbot_id');
    const encodedPages = searchParams.get('facebook_pages');
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (!chatbot?.id) return;

    if (oauthChatbotId && String(chatbot.id) !== oauthChatbotId) return;

    if (error && oauthChannel === 'facebook') {
      toast.error('Kết nối Facebook thất bại. Vui lòng thử lại.');
      setSearchParams(prev => {
        prev.delete('channel_oauth');
        prev.delete('chatbot_id');
        prev.delete('error');
        prev.delete('reason');
        prev.delete('facebook_pages');
        prev.delete('token');
        return prev;
      });
      return;
    }

    if (oauthChannel === 'facebook' && encodedPages && token) {
      try {
        const parsedPages = JSON.parse(encodedPages);
        const firstPage = Array.isArray(parsedPages) ? parsedPages[0] : null;
        if (firstPage) {
          setFacebookConnectForm(prev => ({
            ...prev,
            display_name: firstPage.name || prev.display_name,
            page_id: firstPage.id || '',
            page_access_token: firstPage.access_token || token,
          }));
        }
        setShowFacebookConnectModal(true);
      } catch {
        toast.error('Không đọc được danh sách Facebook Pages');
      } finally {
        setSearchParams(prev => {
          prev.delete('facebook_pages');
          prev.delete('token');
          prev.delete('error');
          prev.delete('reason');
          return prev;
        });
      }
    }
  }, [chatbot?.id, searchParams, setSearchParams]);

  const loadDocumentsForChatbot = async (chatbotId) => {
    if (!chatbotId) return;
    try {
      const res = await chatbotApi.listCustomChatDocuments(chatbotId);
      if (res.data?.documents) setDocuments(res.data.documents);
      else setDocuments(chatbot?.documents || []);
    } catch {
      setDocuments(chatbot?.documents || []);
    }
  };

  const loadChannels = async (chatbotId) => {
    if (!chatbotId) return;
    try {
      const res = await chatbotApi.getChatbotChannels(chatbotId);
      if (res.success) setChannels(res.data || []);
    } catch {
      setChannels(chatbot?.channels || []);
    }
  };

  const handleDisconnectChannel = async (channelType) => {
    try {
      await chatbotApi.disconnectChatbotChannel(chatbot.id, channelType);
      toast.success('Đã ngắt kết nối thành công!');
      await loadChannels(chatbot.id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không thể ngắt kết nối');
    }
  };

  const handleConnectZaloChannel = async (e) => {
    e.preventDefault();
    if (!zaloConnectForm.zalo_app_id.trim() || !zaloConnectForm.zalo_app_secret.trim()) {
      toast.error('Vui lòng nhập App ID và App Secret');
      return;
    }

    setChannelConnecting(true);
    try {
      const res = await chatbotApi.connectChatbotZaloOA(chatbot.id, {
        display_name: zaloConnectForm.display_name.trim() || `${chatbot.name} Zalo OA`,
        zalo_app_id: zaloConnectForm.zalo_app_id.trim(),
        zalo_app_secret: zaloConnectForm.zalo_app_secret.trim(),
      });

      if (!res.success) throw new Error(res.message || 'Không thể kết nối Zalo OA');

      toast.success(res.message || 'Kết nối Zalo OA thành công');
      setShowZaloConnectModal(false);
      setShowChannelGuideModal('zalo');
      setZaloConnectForm(prev => ({ ...prev, zalo_app_id: '', zalo_app_secret: '' }));
      await loadChannels(chatbot.id);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Không thể kết nối Zalo OA');
    } finally {
      setChannelConnecting(false);
    }
  };

  const handleConnectFacebookChannel = async (e) => {
    e.preventDefault();
    
    if (!facebookConnectForm.page_id || !facebookConnectForm.page_access_token) {
      toast.error('Vui lòng nhập đầy đủ Page ID và Page Access Token');
      return;
    }

    setChannelConnecting(true);
    try {
      const res = await chatbotApi.connectChatbotFacebook(chatbot.id, {
        page_id: facebookConnectForm.page_id,
        page_name: facebookConnectForm.display_name || 'Facebook Page',
        page_access_token: facebookConnectForm.page_access_token,
      });

      if (!res.success) throw new Error(res.message || 'Không thể kết nối Facebook');

      toast.success(res.message || 'Kết nối Facebook thành công');
      setShowFacebookConnectModal(false);
      setShowChannelGuideModal('facebook');
      setFacebookConnectForm(prev => ({ ...prev, page_id: '', page_access_token: '' }));
      await loadChannels(chatbot.id);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Không thể kết nối Facebook');
    } finally {
      setChannelConnecting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('chatbot.studio.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const updateData = {
        name: form.name,
        description: form.description,
        avatar_url: form.avatar_url,
        greeting_msg: form.greeting_msg,
        system_instruction: form.system_instruction,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        is_active: form.is_active,
        primary_color: form.primary_color,
        background_color: form.background_color,
        text_color: form.text_color,
        accent_color: form.accent_color,
        position: form.position,
        logo_url: form.logo_url,
        show_avatar: form.show_avatar,
        border_radius: 16,
        chat_height: '600px',
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
      const res = await chatbotApi.uploadCustomChatDocument(fd);
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

  const copyIframeCode = () => {
    const src = `${window.location.origin}/chat/${chatbot.id}`;
    const code = `<iframe src="${src}" width="100%" height="600" style="border:none;border-radius:12px;" allow="microphone;camera"></iframe>`;
    navigator.clipboard.writeText(code);
    toast.success(t('common.copied'));
  };

  const zaloChannel = channels.find(c => c.channel_type === 'zalo');
  const facebookChannel = channels.find(c => c.channel_type === 'facebook');
  const productionApiBase = 'https://founderai.biz';
  const zaloWebhookUrl = zaloChannel?.webhook_url || `${productionApiBase}/api/webhooks/zalo-oa`;
  const facebookWebhookUrl = facebookChannel?.webhook_url || `${productionApiBase}/api/webhooks/facebook`;
  const facebookVerifyToken = 'founderai';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ background: `linear-gradient(135deg, ${form.primary_color}, ${form.accent_color})` }}>
              {chatbot.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-800 truncate">{chatbot.name}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${form.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
                <span className="text-xs text-slate-400">{form.is_active ? 'Đang hoạt động' : 'Tắt'}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary shrink-0"
          >
            {saving
              ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
              : <HiOutlineSave className="w-4 h-4" />
            }
            <span>{saving ? 'Đang lưu...' : 'Lưu'}</span>
          </button>
        </div>

        {/* Tab pills */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* ── GENERAL ── */}
          {activeTab === 'general' && (
            <div className="space-y-5">

              {/* Thông tin cơ bản */}
              <SectionCard
                icon={HiOutlineChatAlt2}
                title="Thông tin cơ bản"
                subtitle="Tên, mô tả và lời chào mặc định"
                accent="purple"
              >
                <div className="space-y-4">
                  <FieldRow label="Tên chatbot" hint="Tên hiển thị của chatbot trên website">
                    <TextInput
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="VD: Trợ lý AI"
                    />
                  </FieldRow>
                  <FieldRow label="Mô tả ngắn">
                    <Textarea
                      value={form.description}
                      onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Mô tả chatbot giúp gì cho người dùng..."
                      rows={2}
                    />
                  </FieldRow>
                  <FieldRow label="Tin nhắn chào mừng">
                    <Textarea
                      value={form.greeting_msg}
                      onChange={e => setForm(p => ({ ...p, greeting_msg: e.target.value }))}
                      placeholder="VD: Xin chào! Tôi có thể giúp gì cho bạn?"
                      rows={2}
                    />
                  </FieldRow>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Trạng thái hoạt động</p>
                      <p className="text-xs text-slate-400">Bật để chatbot nhận và trả lời tin nhắn</p>
                    </div>
                    <Toggle
                      checked={form.is_active}
                      onChange={val => setForm(p => ({ ...p, is_active: val }))}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* Hành vi AI */}
              <SectionCard
                icon={HiOutlineSparkles}
                title="Hành vi AI"
                subtitle="System prompt và tham số mô hình"
                accent="blue"
              >
                <div className="space-y-4">
                  <FieldRow label="System Instructions" hint={`${form.system_instruction?.length || 0} / 2000 ký tự`}>
                    <Textarea
                      value={form.system_instruction}
                      onChange={e => setForm(p => ({ ...p, system_instruction: e.target.value }))}
                      placeholder="Nhập prompt hướng dẫn chi tiết (Ví dụ: Bạn là một trợ lý ảo thân thiện...)"
                      rows={5}
                    />
                  </FieldRow>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Độ sáng tạo (Temperature)</label>
                      <span className="text-xs font-mono text-slate-500">{form.temperature}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={form.temperature}
                      onChange={e => setForm(p => ({ ...p, temperature: parseFloat(e.target.value) }))}
                      className="w-full accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>Chính xác</span>
                      <span>Sáng tạo</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Giao diện Widget */}
              <SectionCard
                icon={HiOutlineColorSwatch}
                title="Giao diện Widget"
                subtitle="Màu sắc, vị trí và thành phần hiển thị"
                accent="orange"
              >
                <div className="space-y-5">
                  {/* Avatar & Logo URLs */}
                  <div className="grid grid-cols-1 gap-4">
                    <FieldRow label="Avatar URL">
                      <TextInput
                        type="url"
                        value={form.avatar_url}
                        onChange={e => setForm(p => ({ ...p, avatar_url: e.target.value }))}
                        placeholder="https://example.com/avatar.png"
                      />
                    </FieldRow>
                    <FieldRow label="Logo URL">
                      <TextInput
                        type="url"
                        value={form.logo_url}
                        onChange={e => setForm(p => ({ ...p, logo_url: e.target.value }))}
                        placeholder="https://example.com/logo.png"
                      />
                    </FieldRow>
                  </div>

                  {/* Position */}
                  <div>
                    <label className="label mb-2.5">Vị trí hiển thị</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'bottom-right', label: 'Dưới phải' },
                        { key: 'bottom-left',  label: 'Dưới trái' },
                        { key: 'top-right',    label: 'Trên phải' },
                        { key: 'top-left',     label: 'Trên trái' },
                      ].map(pos => (
                        <button
                          key={pos.key}
                          type="button"
                          onClick={() => setForm(p => ({ ...p, position: pos.key }))}
                          className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                            form.position === pos.key
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color palette */}
                  <div>
                    <label className="label mb-2.5">Bảng màu</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'primary_color',   label: 'Màu chính' },
                        { key: 'background_color', label: 'Màu nền' },
                        { key: 'text_color',      label: 'Màu chữ' },
                        { key: 'accent_color',    label: 'Màu nhấn' },
                      ].map(c => (
                        <div key={c.key} className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <input type="color"
                            value={form[c.key]}
                            onChange={e => setForm(p => ({ ...p, [c.key]: e.target.value }))}
                            className="w-9 h-9 rounded-lg cursor-pointer border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">{c.label}</p>
                            <p className="text-xs font-mono text-slate-700 truncate">{form[c.key]}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Hiển thị Avatar trong tin nhắn</p>
                      <p className="text-xs text-slate-400">Avatar hiển thị bên cạnh tin nhắn chatbot</p>
                    </div>
                    <Toggle
                      checked={form.show_avatar}
                      onChange={val => setForm(p => ({ ...p, show_avatar: val }))}
                    />
                  </div>

                  {/* Suggested Questions */}
                  <div>
                    <label className="label mb-2.5">Câu hỏi gợi ý <span className="text-slate-400 font-normal">(tối đa 5)</span></label>
                    <div className="flex gap-2 mb-3">
                      <TextInput
                        value={newQuestion}
                        onChange={e => setNewQuestion(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSuggestedQuestion())}
                        placeholder="Nhập câu hỏi gợi ý..."
                      />
                      <button type="button" onClick={addSuggestedQuestion}
                        className="btn btn-secondary shrink-0">
                        <HiOutlinePlus className="w-4 h-4" /> Thêm
                      </button>
                    </div>
                    {form.suggested_questions?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {form.suggested_questions.map((q, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 pr-1.5 pl-3 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-full border border-primary-100">
                            <span className="max-w-[160px] truncate">{q}</span>
                            <button type="button" onClick={() => removeSuggestedQuestion(i)}
                              className="p-0.5 rounded-full hover:bg-primary-100 transition-colors">
                              <HiOutlineX className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── KNOWLEDGE ── */}
          {activeTab === 'knowledge' && (
            <div className="space-y-5">
              <SectionCard
                icon={HiOutlineBookOpen}
                title="Tài liệu Kiến thức"
                subtitle="Upload file hoặc thêm văn bản để chatbot trả lời chính xác"
                accent="green"
              >
                <div className="space-y-4">
                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowUploadModal(true)}
                      className="btn btn-secondary">
                      <HiOutlineUpload className="w-4 h-4" /> Upload File
                    </button>
                    <button type="button" onClick={() => setShowTextModal(true)}
                      className="btn btn-secondary">
                      <HiOutlinePlus className="w-4 h-4" /> Thêm Văn Bản
                    </button>
                  </div>

                  {/* Document list */}
                  {documents.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <HiOutlineDocumentText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Chưa có tài liệu nào.</p>
                      <p className="text-xs text-slate-400 mt-1">Hãy thêm tài liệu để chatbot thông minh hơn.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {documents.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                              <HiOutlineDocumentText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-700 truncate">{doc.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-slate-400">{doc.chunk_count || 0} chunks</span>
                                {doc.status && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                    doc.status === 'ready'
                                      ? 'bg-green-100 text-green-700'
                                      : doc.status === 'processing'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-amber-100 text-amber-700'
                                  }`}>
                                    {doc.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button type="button" onClick={() => handleDeleteDoc(doc)}
                            disabled={deletingDoc === doc.id}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50">
                            {deletingDoc === doc.id
                              ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                              : <HiOutlineTrash className="w-4 h-4" />
                            }
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── DEPLOY ── */}
          {activeTab === 'deploy' && (
            <div className="space-y-5">
              <SectionCard
                icon={HiOutlineGlobeAlt}
                title="Tùy chọn Triển khai"
                subtitle="Nhúng chatbot lên website hoặc kết nối kênh"
                accent="blue"
              >
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Chọn phương thức triển khai</p>
                        <p className="text-xs text-slate-400 mt-1">Nhúng chatbot lên website hoặc kết nối kênh hội thoại bên ngoài.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-start lg:justify-end">
                        {[
                          { id: 'script',    label: 'Website Script' },
                          { id: 'iframe',    label: 'iFrame' },
                          { id: 'zalo',      label: 'Zalo OA' },
                          { id: 'facebook',  label: 'Facebook' },
                        ].map(tab => (
                          <button key={tab.id} type="button" onClick={() => setDeployTab(tab.id)}
                            className={`min-w-0 px-4 py-2 rounded-xl text-xs font-medium transition-colors border ${
                              deployTab === tab.id
                                ? 'bg-white text-slate-800 border-slate-200 shadow-sm'
                                : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700 hover:bg-white/70'
                            }`}
                          >
                            <span className="truncate block">{tab.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {deployTab === 'script' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0 w-full space-y-3">
                      <p className="text-xs text-slate-500">
                        Copy đoạn mã bên dưới và dán vào thẻ <code className="bg-slate-100 px-1 rounded">&#x3C;head&#x3E;</code> hoặc trước thẻ đóng <code className="bg-slate-100 px-1 rounded">&#x3C;/body&#x3E;</code> trên website.
                      </p>
                      <div className="relative">
                        <pre className="bg-slate-900 text-green-400 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                          {`<script>
  window.customChatbotConfig = {
    token: '${chatbot.widget_key || chatbot.id}',
    baseUrl: '${typeof window !== 'undefined' ? window.location.origin : ''}',
    primaryColor: '${form.primary_color}',
    backgroundColor: '${form.background_color}',
    textColor: '${form.text_color}',
    accentColor: '${form.accent_color}',
    position: '${form.position}',
    welcomeMessage: '${form.greeting_msg || 'Xin chào!'}'
  };
</script>
<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" defer></script>`}
                        </pre>
                        <button type="button" onClick={copyWidgetCode}
                          className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                          {widgetCopied
                            ? <><HiOutlineCheck className="w-3.5 h-3.5" /> Đã copy</>
                            : <><HiOutlineCode className="w-3.5 h-3.5" /> Copy code</>
                          }
                        </button>
                      </div>
                    </div>
                  )}

                  {deployTab === 'iframe' && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0 w-full space-y-3">
                      <p className="text-xs text-slate-500">
                        Sử dụng iFrame để nhúng giao diện chat vào một trang cố định trên website.
                      </p>
                      <div className="relative">
                        <pre className="bg-slate-900 text-blue-400 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                          {`<iframe
  src="${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${chatbot.id}"
  width="100%" height="600"
  style="border:none;border-radius:12px;"
  allow="microphone;camera"
></iframe>`}
                        </pre>
                        <button type="button" onClick={copyIframeCode}
                          className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                          <HiOutlineCode className="w-3.5 h-3.5" /> Copy code
                        </button>
                      </div>
                    </div>
                  )}

                  {deployTab === 'zalo' && (
                    <ZaloChannelCard
                      channel={zaloChannel}
                      onConnect={() => setShowZaloConnectModal(true)}
                      onDisconnect={() => handleDisconnectChannel('zalo_oa')}
                      onOpenGuide={() => setShowChannelGuideModal('zalo')}
                      webhookUrl={zaloWebhookUrl}
                      chatbotId={chatbot.id}
                    />
                  )}

                  {deployTab === 'facebook' && (
                    <FacebookChannelCard
                      channel={facebookChannel}
                      onConnect={() => setShowFacebookConnectModal(true)}
                      onDisconnect={() => handleDisconnectChannel('facebook')}
                      onOpenGuide={() => setShowChannelGuideModal('facebook')}
                      webhookUrl={facebookWebhookUrl}
                      verifyToken={facebookVerifyToken}
                    />
                  )}
                </div>
              </SectionCard>
            </div>
          )}

        </div>
      </div>

      {showFacebookConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Kết nối Facebook Messenger</h3>
                <p className="text-xs text-slate-400 mt-1">Nhập Page ID và Page Access Token để kết nối chatbot với Fanpage của bạn.</p>
              </div>
              <button type="button" onClick={() => setShowFacebookConnectModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConnectFacebookChannel} className="p-5 space-y-4">
              <FieldRow label="Tên hiển thị">
                <TextInput
                  value={facebookConnectForm.display_name}
                  onChange={e => setFacebookConnectForm(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="VD: Facebook Page bán hàng"
                />
              </FieldRow>
              <FieldRow label="Facebook Page ID">
                <TextInput
                  value={facebookConnectForm.page_id}
                  onChange={e => setFacebookConnectForm(prev => ({ ...prev, page_id: e.target.value }))}
                  placeholder="Nhập Page ID (số)"
                  required
                />
              </FieldRow>
              <FieldRow label="Page Access Token" hint="Token phải có quyền pages_messaging và không hết hạn">
                <Textarea
                  value={facebookConnectForm.page_access_token}
                  onChange={e => setFacebookConnectForm(prev => ({ ...prev, page_access_token: e.target.value }))}
                  placeholder="EAAxxxxxxxxxxxxx..."
                  rows={4}
                  required
                />
              </FieldRow>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 leading-5">
                Sau khi kết nối thành công, webhook URL sẽ được sinh để bạn cấu hình trên Facebook Developer Console.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowFacebookConnectModal(false)}
                  className="btn btn-ghost">Hủy</button>
                <button type="submit" disabled={channelConnecting}
                  className="btn btn-primary disabled:opacity-50">
                  {channelConnecting ? 'Đang kết nối...' : 'Kết nối Facebook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showZaloConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Kết nối Zalo Official Account</h3>
                <p className="text-xs text-slate-400 mt-1">Nhập App ID và App Secret để kết nối thật với chatbot này.</p>
              </div>
              <button type="button" onClick={() => setShowZaloConnectModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConnectZaloChannel} className="p-5 space-y-4">
              <FieldRow label="Tên hiển thị">
                <TextInput
                  value={zaloConnectForm.display_name}
                  onChange={e => setZaloConnectForm(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="VD: Zalo OA bán hàng"
                />
              </FieldRow>
              <FieldRow label="Zalo App ID">
                <TextInput
                  value={zaloConnectForm.zalo_app_id}
                  onChange={e => setZaloConnectForm(prev => ({ ...prev, zalo_app_id: e.target.value }))}
                  placeholder="Nhập App ID"
                  required
                />
              </FieldRow>
              <FieldRow label="Zalo App Secret">
                <TextInput
                  type="password"
                  value={zaloConnectForm.zalo_app_secret}
                  onChange={e => setZaloConnectForm(prev => ({ ...prev, zalo_app_secret: e.target.value }))}
                  placeholder="Nhập App Secret"
                  required
                />
              </FieldRow>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 leading-5">
                Sau khi kết nối thành công, hệ thống sẽ sinh webhook URL riêng cho chatbot này để bạn cấu hình trong Zalo Developer.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowZaloConnectModal(false)}
                  className="btn btn-ghost">Hủy</button>
                <button type="submit" disabled={channelConnecting}
                  className="btn btn-primary disabled:opacity-50">
                  {channelConnecting ? 'Đang kết nối...' : 'Kết nối Zalo OA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showChannelGuideModal === 'zalo' && (
        <ChannelGuideModal
          open={showChannelGuideModal === 'zalo'}
          onClose={() => setShowChannelGuideModal(null)}
          accent="blue"
          icon="Z"
          title="Zalo Official Account"
          summary="Kết nối chatbot với Zalo OA để tự động nhận, phân luồng và phản hồi hội thoại từ khách hàng ngay trong chatbot studio."
          docsUrl="https://developers.zalo.me/"
          techDetails={(
            <>
              <CopyField label="Webhook URL" value={zaloWebhookUrl} tone="blue" />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-700">
                  <HiOutlineShieldCheck className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-semibold">Thông tin cần chuẩn bị</span>
                </div>
                <ul className="text-xs text-slate-500 space-y-1 leading-5">
                  <li>• Zalo App ID</li>
                  <li>• Zalo App Secret</li>
                  <li>• Quyền quản trị OA để xác nhận webhook</li>
                </ul>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700 leading-5">
                Sau khi hoàn tất trên trang kết nối, webhook sẽ được dùng để nhận message, follow event và các callback từ OA.
              </div>
              <ChannelQuickTest channelType="zalo" channelLabel="Zalo OA" connected={!!zaloChannel} />
            </>
          )}
          setupChecklist={(
            <div className="space-y-3">
              <ChannelOverview
                accent="blue"
                icon="Z"
                title="Kết nối Zalo OA"
                subtitle="Biến chatbot thành đầu mối tiếp nhận và phản hồi khách hàng trên Official Account một cách tập trung."
                bullets={[
                  'Nhận tin nhắn và callback từ Zalo OA theo thời gian thực.',
                  'Dùng chung luồng quản trị với chatbot đang chọn trong studio.',
                  'Dễ kiểm tra webhook, thông tin app và trạng thái vận hành.',
                ]}
              />

              <ChecklistStep
                index={1}
                accent="blue"
                title="Tạo hoặc chọn một Zalo OA đang hoạt động"
                description="Đăng nhập vào Zalo Developer, đảm bảo bạn đã có Official Account và ứng dụng liên kết với OA cần dùng cho chatbot này."
                expanded={expandedGuideStep.zalo === 1}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, zalo: prev.zalo === 1 ? 0 : 1 }))}
              >
                <a
                  href="https://developer.zalo.me/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  <HiOutlineExternalLink className="w-3.5 h-3.5" /> Mở Zalo Developer
                </a>
              </ChecklistStep>

              <ChecklistStep
                index={2}
                accent="blue"
                title="Lấy App ID và App Secret"
                description="Trong phần thông tin ứng dụng, copy chính xác App ID và App Secret. Hai giá trị này sẽ được dùng để xác thực kết nối từ hệ thống sang Zalo OA."
                expanded={expandedGuideStep.zalo === 2}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, zalo: prev.zalo === 2 ? 0 : 2 }))}
              >
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700 leading-5">
                  App Secret là dữ liệu nhạy cảm. Không chia sẻ ra ngoài team vận hành và chỉ nhập tại trang kết nối chính thức của hệ thống.
                </div>
              </ChecklistStep>

              <ChecklistStep
                index={3}
                accent="blue"
                title="Cấu hình webhook trong Zalo Developer"
                description="Dán Webhook URL ở cột bên phải vào phần callback/webhook của ứng dụng Zalo. Hệ thống sẽ dùng URL này để nhận tin nhắn và sự kiện từ OA."
                expanded={expandedGuideStep.zalo === 3}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, zalo: prev.zalo === 3 ? 0 : 3 }))}
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 leading-5">
                  Nếu Zalo yêu cầu kiểm tra callback, hãy chắc chắn server public của bạn đang hoạt động và endpoint webhook chưa bị chặn bởi firewall/WAF.
                </div>
              </ChecklistStep>

              <ChecklistStep
                index={4}
                accent="blue"
                title="Thực hiện kết nối tại trang quản lý kênh"
                description="Nhấn nút “Kết nối Zalo OA”, nhập App ID và App Secret, sau đó kiểm tra kết nối thành công trước khi sử dụng chatbot trên OA thực tế."
                expanded={expandedGuideStep.zalo === 4}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, zalo: prev.zalo === 4 ? 0 : 4 }))}
              >
                <a href="/settings/channel-connections" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                  <HiOutlineLink className="w-3.5 h-3.5" /> Đi tới trang cấu hình kênh
                </a>
              </ChecklistStep>
            </div>
          )}
          footer={(
            <>
              <p className="font-medium text-slate-700 mb-1">Gợi ý kiểm tra sau khi kết nối</p>
              <ul className="space-y-1">
                <li>• Gửi thử một tin nhắn mới từ tài khoản Zalo cá nhân.</li>
                <li>• Kiểm tra xem hội thoại đã xuất hiện trong luồng chatbot đúng bot chưa.</li>
                <li>• Nếu không thấy phản hồi, kiểm tra lại webhook URL, App Secret và quyền của OA.</li>
              </ul>
            </>
          )}
        />
      )}

      {showChannelGuideModal === 'facebook' && (
        <ChannelGuideModal
          open={showChannelGuideModal === 'facebook'}
          onClose={() => setShowChannelGuideModal(null)}
          accent="indigo"
          icon="f"
          title="Facebook Messenger"
          summary="Kết nối chatbot với Facebook Fanpage để tự động trả lời tin nhắn Messenger, đồng bộ hội thoại và triển khai kịch bản CSKH nhanh hơn."
          docsUrl="https://developers.facebook.com/"
          techDetails={(
            <>
              <CopyField label="Webhook URL" value={facebookWebhookUrl} tone="blue" />
              <CopyField label="Verify Token" value={facebookVerifyToken} tone="orange" />
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-700">
                  <HiOutlineShieldCheck className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-semibold">Thông tin cần chuẩn bị</span>
                </div>
                <ul className="text-xs text-slate-500 space-y-1 leading-5">
                  <li>• Facebook App có product Messenger</li>
                  <li>• Quyền admin hoặc developer trên app</li>
                  <li>• Quyền quản trị Fanpage cần kết nối</li>
                </ul>
              </div>
              <ChannelQuickTest channelType="facebook" channelLabel="Facebook Messenger" connected={!!facebookChannel} />
            </>
          )}
          setupChecklist={(
            <div className="space-y-3">
              <ChannelOverview
                accent="indigo"
                icon="f"
                title="Kết nối Facebook Messenger"
                subtitle="Liên kết Fanpage với chatbot để gom hội thoại, phản hồi khách hàng nhanh và duy trì trải nghiệm chăm sóc thống nhất."
                bullets={[
                  'Nhận tin nhắn Messenger trực tiếp từ Fanpage đã chọn.',
                  'Dùng OAuth để chọn đúng page thay vì dán token thủ công.',
                  'Quản lý webhook, verify token và trạng thái kết nối tập trung.',
                ]}
              />

              <ChecklistStep
                index={1}
                accent="indigo"
                title="Tạo Facebook App và thêm Messenger Product"
                description="Vào Facebook Developers, tạo app phù hợp cho doanh nghiệp rồi thêm product Messenger để mở các mục cấu hình webhook, page token và subscriptions."
                expanded={expandedGuideStep.facebook === 1}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, facebook: prev.facebook === 1 ? 0 : 1 }))}
              >
                <a
                  href="https://developers.facebook.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                >
                  <HiOutlineExternalLink className="w-3.5 h-3.5" /> Mở Facebook Developers
                </a>
              </ChecklistStep>

              <ChecklistStep
                index={2}
                accent="indigo"
                title="Cấu hình webhook cho Messenger"
                description="Trong phần Messenger settings, dán Webhook URL và Verify Token ở cột bên phải. Facebook sẽ xác minh webhook ngay khi bạn lưu cấu hình."
                expanded={expandedGuideStep.facebook === 2}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, facebook: prev.facebook === 2 ? 0 : 2 }))}
              >
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-700 leading-5">
                  Sau khi verify thành công, hãy bật subscription cho các sự kiện message, messaging_postbacks và các event bạn muốn chatbot xử lý.
                </div>
              </ChecklistStep>

              <ChecklistStep
                index={3}
                accent="indigo"
                title="Đăng nhập Facebook và chọn Fanpage"
                description="Nhấn “Kết nối Facebook” để bắt đầu OAuth. Hệ thống sẽ đưa bạn tới trang xác thực, sau đó bạn chọn Fanpage muốn chatbot xử lý tin nhắn."
                expanded={expandedGuideStep.facebook === 3}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, facebook: prev.facebook === 3 ? 0 : 3 }))}
              >
                <a href="/settings/channel-connections" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                  <HiOutlineLink className="w-3.5 h-3.5" /> Đi tới trang cấu hình kênh
                </a>
              </ChecklistStep>

              <ChecklistStep
                index={4}
                accent="indigo"
                title="Kiểm tra quyền và gửi thử tin nhắn"
                description="Đảm bảo page đã cấp đủ quyền cho app. Sau khi kết nối xong, gửi thử một tin nhắn từ tài khoản khác để xác nhận chatbot nhận message đúng page."
                expanded={expandedGuideStep.facebook === 4}
                onToggle={() => setExpandedGuideStep(prev => ({ ...prev, facebook: prev.facebook === 4 ? 0 : 4 }))}
              >
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700 leading-5">
                  Nếu OAuth thành công nhưng page không xuất hiện, thường là do tài khoản chưa có quyền admin/editor phù hợp hoặc app chưa được cấp đúng quyền Messenger.
                </div>
              </ChecklistStep>
            </div>
          )}
          footer={(
            <>
              <p className="font-medium text-slate-700 mb-1">Checklist sau khi go-live</p>
              <ul className="space-y-1">
                <li>• Gửi thử tin nhắn mới từ user Facebook khác với tài khoản quản trị.</li>
                <li>• Kiểm tra chatbot phản hồi đúng nội dung và đúng bot đang chọn.</li>
                <li>• Theo dõi lại webhook subscriptions nếu có thay đổi app hoặc page ownership.</li>
              </ul>
            </>
          )}
        />
      )}

      {/* ── Modals ── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Upload Tài Liệu</h3>
              <button type="button" onClick={() => setShowUploadModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUploadFile} className="p-5 space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xls"
                  className="hidden" onChange={handleFileSelect} />
                {uploadForm.file ? (
                  <>
                    <HiOutlineDocumentText className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">{uploadForm.file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {(uploadForm.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <HiOutlineUpload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">Click hoặc kéo thả file vào đây</p>
                    <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, CSV (tối đa 10MB)</p>
                  </>
                )}
              </div>
              <FieldRow label="Tiêu đề (tùy chọn)">
                <TextInput
                  value={uploadForm.title}
                  onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Nhập tiêu đề tài liệu"
                />
              </FieldRow>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowUploadModal(false)}
                  className="btn btn-ghost">Hủy</button>
                <button type="submit" disabled={uploading || !uploadForm.file}
                  className="btn btn-primary disabled:opacity-50">
                  {uploading ? 'Đang tải...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Thêm Văn Bản Kiến Thức</h3>
              <button type="button" onClick={() => setShowTextModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <HiOutlineX className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddText} className="p-5 space-y-4">
              <FieldRow label="Tiêu đề (tùy chọn)">
                <TextInput
                  value={textForm.title}
                  onChange={e => setTextForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="VD: FAQ về sản phẩm"
                />
              </FieldRow>
              <FieldRow label="Nội dung">
                <Textarea
                  value={textForm.content}
                  onChange={e => setTextForm(p => ({ ...p, content: e.target.value }))}
                  rows={8}
                  placeholder="Dán nội dung văn bản, FAQ, thông tin sản phẩm..."
                  required
                />
              </FieldRow>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTextModal(false)}
                  className="btn btn-ghost">Hủy</button>
                <button type="submit" disabled={addingText || !textForm.content.trim()}
                  className="btn btn-primary disabled:opacity-50">
                  {addingText ? 'Đang thêm...' : 'Lưu lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
