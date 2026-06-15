/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
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
  HiOutlineQrcode,
} from 'react-icons/hi';

const normalizeFileName = (name) => name.trim().normalize('NFC');
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';
import {
  ChannelGuideModal,
  ChannelOverview,
  ChannelQuickTest,
  ChecklistStep,
  CopyField,
  DeployScriptModal,
  DeployIframeModal,
  DeployPublicLinkModal,
  ZaloChannelModal,
  FacebookChannelModal,
  ZaloPersonalChannelModal,
  FacebookConnectModal,
  FacebookChannelCard,
  FieldRow,
  PublicLinkCard,
  SectionCard,
  Textarea,
  TextDocumentModal,
  TextInput,
  Toggle,
  UploadDocumentModal,
  ZaloConnectModal,
  ZaloChannelCard,
  AIConfig,
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
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [showIframeModal, setShowIframeModal] = useState(false);
  const [showPublicLinkModal, setShowPublicLinkModal] = useState(false);
  const [showZaloChannelModal, setShowZaloChannelModal] = useState(false);
  const [showFacebookChannelModal, setShowFacebookChannelModal] = useState(false);
  const [showZaloPersonalChannelModal, setShowZaloPersonalChannelModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    avatar_url: '',
    system_instruction: '',
    ai_model: 'gemini-2.5-flash',
    temperature: 0.7,
    max_tokens: 2048,
    response_style: 'friendly',
    welcome_message: '',
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

  // ── localStorage persistence ──────────────────────────────────────────────────

  // Load from localStorage on mount
  useEffect(() => {
    if (!chatbot?.id) return;
    const savedForm = localStorage.getItem(`chatbot_form_${chatbot.id}`);
    if (savedForm) {
      try {
        const parsed = JSON.parse(savedForm);
        setForm(prev => ({ ...prev, ...parsed }));
      } catch (e) {
        console.warn('Failed to load saved form:', e);
      }
    }
  }, [chatbot?.id]);

  // Save form to localStorage whenever it changes (debounced)
  useEffect(() => {
    if (!chatbot?.id) return;
    const timeoutId = setTimeout(() => {
      localStorage.setItem(`chatbot_form_${chatbot.id}`, JSON.stringify(form));
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [form, chatbot?.id]);

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
  const [deletingDocData, setDeletingDocData] = useState(null);
  const fileInputRef = useRef(null);

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoFileRef = useRef(null);

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
        system_instruction: chatbot.system_instruction || '',
        ai_model: chatbot.ai_model || 'gemini-2.5-flash',
        temperature: chatbot.temperature || 0.7,
        max_tokens: chatbot.max_tokens || 2048,
        response_style: chatbot.response_style || 'friendly',
        welcome_message: chatbot.welcome_message || chatbot.greeting_msg || '',
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
        system_instruction: form.system_instruction,
        ai_model: form.ai_model,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        response_style: form.response_style,
        welcome_message: form.welcome_message,
        is_active: form.is_active,
        primary_color: form.primary_color,
        background_color: form.background_color,
        text_color: form.text_color,
        accent_color: form.accent_color,
        position: form.position,
        logo_url: form.logo_url,
        show_avatar: form.show_avatar,
        border_radius: 16,
        widget_key: chatbot.widget_key || form.widget_key,
        chat_height: '600px',
        suggested_questions: form.suggested_questions || [],
      };

      let updatedBot;
      let saveSuccess = false;
      try {
        // 1. Save chatbot basic info to custom_chatbots table
        const res = await chatbotApi.updateChatbot(chatbot.id, updateData);
        if (res.success && res.data) {
          updatedBot = { ...chatbot, ...res.data, suggested_questions: form.suggested_questions || [] };
        } else {
          throw new Error(res.message || 'Save failed');
        }

        // 2. Save AI settings to chatbot_settings table for ALL channels
        // This ensures all channels use the shared AI config from ChatbotSettings
        const aiSettings = {
          system_instruction: form.system_instruction,
          ai_model: form.ai_model,
          temperature: form.temperature,
          max_tokens: form.max_tokens,
          response_style: form.response_style,
          welcome_message: form.welcome_message,
          is_enabled: form.is_active,
        };

        // List of all channels that should share the same AI config
        const ALL_CHANNELS = ['zalo_personal', 'zalo_oa', 'facebook', 'web', 'script', 'iframe', 'public_link'];

        try {
          await Promise.all(
            ALL_CHANNELS.map(channel =>
              chatbotApi.updateChatbotSettings(channel, aiSettings)
            )
          );
        } catch (aiSaveErr) {
          console.warn('[ChatbotSettings] Failed to save AI settings:', aiSaveErr.message);
          // Don't fail the whole save if this fails
        }

        saveSuccess = true;
      } catch (apiError) {
        console.warn('[ChatbotSettings] API save failed, using localStorage:', apiError.message);
        updatedBot = {
          ...chatbot,
          ...updateData,
          suggested_questions: form.suggested_questions || [],
          widget_settings: {
            primary_color: form.primary_color,
            background_color: form.background_color,
            text_color: form.text_color,
            accent_color: form.accent_color,
            position: form.position,
            logo_url: form.logo_url,
            show_avatar: form.show_avatar,
            suggested_questions: form.suggested_questions || [],
          },
        };
        const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
        const idx = bots.findIndex(b => b.id === chatbot.id);
        if (idx >= 0) {
          bots[idx] = updatedBot;
          localStorage.setItem('uknow_chatbots', JSON.stringify(bots));
        }
      }

      // If we got here without error, save was successful
      saveSuccess = true;

      if (saveSuccess) {
        onUpdate(updatedBot);
        toast.success(t('common.success'));
        // Verify by re-reading from localStorage
        const verifyBots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
        const verifyBot = verifyBots.find(b => b.id === chatbot.id);
        if (verifyBot?.widget_settings) {
          const ws = verifyBot.widget_settings;
          if (ws.primary_color !== form.primary_color || ws.text_color !== form.text_color) {
            toast.error('Có lỗi khi lưu cài đặt giao diện. Vui lòng thử lại.');
          }
        }
      }
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

  const handleLogoFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File ảnh vượt quá 2MB. Vui lòng chọn ảnh nhỏ hơn.');
      e.target.value = '';
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      toast.error('Định dạng ảnh không được hỗ trợ. Vui lòng chọn JPG, PNG, WebP, GIF hoặc SVG.');
      e.target.value = '';
      return;
    }
    setUploadingLogo(true);
    const fd = new FormData();
    fd.append('file', file);
    chatbotApi.uploadChatbotLogo(fd)
      .then(res => {
        if (res.data?.success && res.data.data?.url) {
          setForm(p => ({ ...p, logo_url: res.data.data.url }));
          toast.success('Đã tải logo lên thành công');
        } else {
          toast.error(res.data?.message || 'Upload thất bại');
        }
      })
      .catch(err => {
        toast.error(err?.response?.data?.message || 'Upload logo thất bại');
      })
      .finally(() => {
        setUploadingLogo(false);
        e.target.value = '';
      });
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
    // Validate file size (10MB)
    if (uploadForm.file.size > 10 * 1024 * 1024) {
      toast.error('File quá lớn. Vui lòng chọn file nhỏ hơn 10MB.');
      return;
    }
    // Validate file type
    const allowedTypes = ['txt', 'md', 'csv', 'json', 'html', 'htm', 'pdf', 'doc', 'docx'];
    const ext = uploadForm.file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(ext)) {
      toast.error(`Định dạng file không được hỗ trợ. Vui lòng sử dụng: ${allowedTypes.join(', ')}`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadForm.file);
      fd.append('chatbot_id', chatbot.id.toString());
      const res = await chatbotApi.uploadCustomChatDocument(fd);
      if (res.data?.success) {
        setShowUploadModal(false);
        setUploadForm({ title: '', file: null });
        toast.success(`Đã huấn luyện thành công: ${res.data.chunks || 0} đoạn`);
        // Reload documents from backend to ensure sync and correct data
        await loadDocumentsForChatbot(chatbot.id);
      } else {
        toast.error(res.data?.message || t('errors.uploadFailed'));
      }
    } catch (err) {
      console.error('[Upload] Error:', err);
      const errorMsg = err?.response?.data?.message || err?.message || t('errors.uploadFailed');
      toast.error(`Upload thất bại: ${errorMsg}`);
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
      // Create text document via backend API to ensure chunks are stored
      const res = await chatbotApi.addCustomChatTextDocument(chatbot.id, {
        title: textForm.title || 'Text Document',
        content: textForm.content,
      });
      
      if (res.data?.success) {
        setShowTextModal(false);
        setTextForm({ title: '', content: '' });
        toast.success(t('chatbot.knowledgeBase.processing'));
        // Reload documents from backend to ensure sync
        await loadDocumentsForChatbot(chatbot.id);
      } else {
        toast.error(res.data?.message || t('errors.addFailed'));
      }
    } catch (err) {
      console.error('[AddText] Error:', err);
      toast.error(err?.response?.data?.message || t('errors.addFailed'));
    } finally {
      setAddingText(false);
    }
  };

  const handleDeleteDoc = async () => {
    if (!deletingDocData) return;
    setDeletingDoc(deletingDocData.title);
    try {
      await chatbotApi.deleteDocument(chatbot.id, deletingDocData.title);
      toast.success(t('common.success'));
      setDeletingDocData(null);
      loadDocumentsForChatbot(chatbot.id);
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
  const publicChatbotUrl = `${productionApiBase}/chat/${chatbot.widget_key || chatbot.id}`;

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(publicChatbotUrl);
    setWidgetCopied(true);
    toast.success(t('common.copied'));
    setTimeout(() => setWidgetCopied(false), 2000);
  };

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

              {/* Gộp: Thông tin + AI + Câu hỏi gợi ý */}
              <SectionCard
                icon={HiOutlineChatAlt2}
                title="Cấu hình chatbot"
                subtitle="Thông tin cơ bản, AI và giao diện"
                accent="purple"
              >
                <div className="space-y-5">

                  {/* Thông tin cơ bản */}
                  <div className="space-y-4">
                    <FieldRow label="Tên chatbot" hint="Tên hiển thị của chatbot trên website">
                      <TextInput
                        value={form.name}
                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="VD: Trợ lý AI"
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

                  <div className="border-t border-slate-100" />

                  {/* Cấu hình AI */}
                  <AIConfig
                    config={{
                      ai_model: form.ai_model,
                      temperature: form.temperature,
                      max_tokens: form.max_tokens,
                      response_style: form.response_style,
                      welcome_message: form.welcome_message,
                      system_instruction: form.system_instruction,
                    }}
                    onChange={updated => setForm(p => ({ ...p, ...updated }))}
                    showSystemInstruction={true}
                  />

                  <div className="border-t border-slate-100" />

                  {/* Câu hỏi gợi ý */}
                  <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <label className="label mb-0">Câu hỏi gợi ý</label>
                        <p className="text-[11px] text-slate-400 mt-0.5">Hiển thị khi người dùng bắt đầu chat</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        (form.suggested_questions || []).length >= 5
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-violet-100 text-violet-600'
                      }`}>
                        {(form.suggested_questions || []).length}/5
                      </span>
                    </div>

                    {/* Input Row */}
                    <div className="flex gap-2 mb-3">
                      <div className="flex-1 relative">
                        <TextInput
                          value={newQuestion}
                          onChange={e => setNewQuestion(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); addSuggestedQuestion(); }
                            if (e.key === 'Escape') { setNewQuestion(''); }
                          }}
                          placeholder="Nhập câu hỏi gợi ý..."
                          disabled={(form.suggested_questions || []).length >= 5}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addSuggestedQuestion}
                        disabled={(form.suggested_questions || []).length >= 5}
                        className="btn btn-secondary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <HiOutlinePlus className="w-4 h-4" />
                      </button>
                      {(form.suggested_questions || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, suggested_questions: [] }))}
                          className="btn bg-slate-100 text-slate-600 hover:bg-slate-200 shrink-0 text-xs px-3"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Questions List */}
                    {(form.suggested_questions || []).length > 0 ? (
                      <div className="space-y-1.5">
                        {form.suggested_questions.map((q, i) => (
                          <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-violet-100 group hover:border-violet-300 transition-colors">
                            <span className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span className="flex-1 text-sm text-slate-700 truncate">{q}</span>
                            <button
                              type="button"
                              onClick={() => removeSuggestedQuestion(i)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                            >
                              <HiOutlineX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-slate-400">
                        <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs">Chưa có câu hỏi gợi ý nào</p>
                        <p className="text-[10px] mt-0.5">Nhập câu hỏi và nhấn Enter hoặc + để thêm</p>
                      </div>
                    )}
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
                  {/* Icon URL */}
                  <div>
                    <FieldRow label="Icon chatbot" hint="Icon hiển thị trong widget">
                      <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                        {form.logo_url ? (
                          <img src={form.logo_url} alt="icon" className="w-10 h-10 rounded-lg object-cover bg-slate-200" onError={e => e.target.style.display = 'none'} />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-violet-400">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        )}
                        <input
                          ref={logoFileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                          className="hidden"
                          onChange={handleLogoFileSelect}
                        />
                        <button
                          type="button"
                          onClick={() => logoFileRef.current?.click()}
                          disabled={uploadingLogo}
                          className="btn btn-secondary text-xs shrink-0 disabled:opacity-60"
                        >
                          {uploadingLogo
                            ? <><HiOutlineRefresh className="w-3.5 h-3.5 animate-spin inline" /> Đang tải...</>
                            : <><HiOutlineUpload className="w-3.5 h-3.5 inline" /> Tải ảnh lên</>
                          }
                        </button>
                        {form.logo_url && (
                          <button type="button" onClick={() => setForm(p => ({ ...p, logo_url: '' }))}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors shrink-0">
                            <HiOutlineX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {form.logo_url && (
                        <p className="text-[11px] text-slate-400 mt-1 px-1 truncate">{form.logo_url}</p>
                      )}
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
                          <button type="button" onClick={() => setDeletingDocData(doc)}
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
                <div className="space-y-3">
                  {/* Quick Action Buttons for Website/iFrame/PublicLink */}
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setShowScriptModal(true)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                        </svg>
                      </div>
                      <span className="text-xs font-medium text-slate-700">Script</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowIframeModal(true)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                        </svg>
                      </div>
                      <span className="text-xs font-medium text-slate-700">iFrame</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPublicLinkModal(true)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                        <HiOutlineQrcode className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium text-slate-700">Link</span>
                    </button>
                  </div>

                  {/* Channel Connection Cards - Now as buttons to open modals */}
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setShowZaloChannelModal(true)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg font-bold group-hover:bg-blue-200 transition-colors">
                        Z
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-medium text-slate-700">Zalo OA <span className="text-amber-500 font-medium">(Beta)</span></span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{zaloChannel ? 'Đã kết nối' : 'Chưa kết nối'}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFacebookChannelModal(true)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-medium text-slate-700">Facebook <span className="text-amber-500 font-medium">(Beta)</span></span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{facebookChannel ? 'Đã kết nối' : 'Chưa kết nối'}</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowZaloPersonalChannelModal(true)}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                        <svg className="w-6 h-6" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="24" cy="24" r="24" fill="#0068FF"/>
                          <path d="M24 10C15.716 10 9 16.403 9 24.303c0 4.88 2.384 9.197 6.09 12.017V37.5l6.81-3.765C22.56 33.982 23.27 34 24 34c8.284 0 15-6.403 15-14.697S32.284 10 24 10zm1.36 18.57h-.78c-1.19 0-2.16-.965-2.16-2.16 0-1.195.97-2.16 2.16-2.16 1.19 0 2.16.965 2.16 2.16 0 1.195-.97 2.16-2.16 2.16zm-4.5 0h-.78c-1.19 0-2.16-.965-2.16-2.16 0-1.195.97-2.16 2.16-2.16 1.19 0 2.16.965 2.16 2.16 0 1.195-.97 2.16-2.16 2.16zm9 0h-.78c-1.19 0-2.16-.965-2.16-2.16 0-1.195.97-2.16 2.16-2.16 1.19 0 2.16.965 2.16 2.16 0 1.195-.97 2.16-2.16 2.16z" fill="white"/>
                        </svg>
                      </div>
                      <div className="text-center">
                        <span className="text-xs font-medium text-slate-700">Zalo Cá nhân</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Bật chatbot</p>
                      </div>
                    </button>
                  </div>
                </div>
              </SectionCard>

              {/* Script Modal */}
              <DeployScriptModal
                open={showScriptModal}
                chatbot={chatbot}
                form={form}
                onClose={() => setShowScriptModal(false)}
                onCopy={copyWidgetCode}
                copied={widgetCopied}
              />

              {/* iFrame Modal */}
              <DeployIframeModal
                open={showIframeModal}
                chatbot={chatbot}
                onClose={() => setShowIframeModal(false)}
                onCopy={copyIframeCode}
              />

              {/* Public Link Modal */}
              <DeployPublicLinkModal
                open={showPublicLinkModal}
                chatbot={chatbot}
                form={form}
                onClose={() => setShowPublicLinkModal(false)}
              />

              {/* Zalo Channel Modal */}
              <ZaloChannelModal
                open={showZaloChannelModal}
                channel={zaloChannel}
                form={form}
                onClose={() => setShowZaloChannelModal(false)}
                onConnect={() => setShowZaloConnectModal(true)}
                onDisconnect={() => handleDisconnectChannel('zalo_oa')}
                onOpenGuide={() => setShowChannelGuideModal('zalo')}
                webhookUrl={zaloWebhookUrl}
              />

              {/* Facebook Channel Modal */}
              <FacebookChannelModal
                open={showFacebookChannelModal}
                channel={facebookChannel}
                onClose={() => setShowFacebookChannelModal(false)}
                onConnect={() => setShowFacebookConnectModal(true)}
                onDisconnect={() => handleDisconnectChannel('facebook')}
                onOpenGuide={() => setShowChannelGuideModal('facebook')}
                webhookUrl={facebookWebhookUrl}
                verifyToken={facebookVerifyToken}
              />

              {/* Zalo Personal Channel Modal */}
              <ZaloPersonalChannelModal
                open={showZaloPersonalChannelModal}
                onClose={() => setShowZaloPersonalChannelModal(false)}
              />
            </div>
          )}

        </div>
      </div>

      <FacebookConnectModal
        open={showFacebookConnectModal}
        form={facebookConnectForm}
        connecting={channelConnecting}
        onClose={() => setShowFacebookConnectModal(false)}
        onSubmit={handleConnectFacebookChannel}
        onChange={setFacebookConnectForm}
      />

      <ZaloConnectModal
        open={showZaloConnectModal}
        form={zaloConnectForm}
        connecting={channelConnecting}
        onClose={() => setShowZaloConnectModal(false)}
        onSubmit={handleConnectZaloChannel}
        onChange={setZaloConnectForm}
      />

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

      <UploadDocumentModal
        open={showUploadModal}
        form={uploadForm}
        uploading={uploading}
        fileInputRef={fileInputRef}
        onClose={() => setShowUploadModal(false)}
        onSubmit={handleUploadFile}
        onFileSelect={handleFileSelect}
        onChange={setUploadForm}
      />

      <TextDocumentModal
        open={showTextModal}
        form={textForm}
        adding={addingText}
        onClose={() => setShowTextModal(false)}
        onSubmit={handleAddText}
        onChange={setTextForm}
      />

      {/* Delete Document Modal */}
      {deletingDocData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <HiOutlineTrash className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-2">{t('chatbot.knowledgeBase.deleteDoc') || 'Xóa tài liệu'}</h3>
              <p className="text-sm text-slate-500 mb-6">
                Bạn có chắc muốn xóa tài liệu <span className="font-medium text-slate-700">"{deletingDocData.title}"</span>? Hành động này không thể hoàn tác.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingDocData(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleDeleteDoc}
                  disabled={!!deletingDoc}
                  className="flex-1 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 disabled:opacity-60 transition-colors"
                >
                  {deletingDoc ? <><HiOutlineRefresh className="w-4 h-4 animate-spin inline" />{t('common.deleting')}</> : t('common.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
