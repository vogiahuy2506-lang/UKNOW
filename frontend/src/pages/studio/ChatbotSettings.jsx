/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from 'react';
import {
  HiOutlineSave,
  HiOutlineRefresh,
  HiOutlineUpload,
  HiOutlineDocumentText,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineX,
  HiOutlineChatAlt2,
  HiOutlineSparkles,
  HiOutlineGlobeAlt,
  HiOutlineColorSwatch,
  HiOutlineBookOpen,
  HiOutlineQrcode,
  HiOutlinePlay,
  HiOutlinePause,
  HiOutlineCode,
  HiOutlineLink,
  HiOutlineExternalLink,
  HiOutlineClipboardCopy,
  HiOutlineCheck,
} from 'react-icons/hi';

import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { useI18n } from '../../i18n';

// ── Icons ──────────────────────────────────────────────────────────────────────
const icons = {
  ChatAlt2: HiOutlineChatAlt2,
  Sparkles: HiOutlineSparkles,
  ColorSwatch: HiOutlineColorSwatch,
  BookOpen: HiOutlineBookOpen,
  GlobeAlt: HiOutlineGlobeAlt,
  Qrcode: HiOutlineQrcode,
  DocumentText: HiOutlineDocumentText,
  Save: HiOutlineSave,
  Trash: HiOutlineTrash,
  Upload: HiOutlineUpload,
  Plus: HiOutlinePlus,
  X: HiOutlineX,
  Play: HiOutlinePlay,
  Pause: HiOutlinePause,
  Code: HiOutlineCode,
  Link: HiOutlineLink,
  ExternalLink: HiOutlineExternalLink,
  ClipboardCopy: HiOutlineClipboardCopy,
  Check: HiOutlineCheck,
};

// ── Toggle Component ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[#1F2937]">{label}</p>
        {description && <p className="text-xs text-[#6B7280]">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          checked ? 'bg-[#F97316]' : 'bg-[#FED7AA]'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-colors ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────────
function SectionCard({ title, subtitle, icon, children, actions }) {
  const Icon = icons[icon] || HiOutlineChatAlt2;
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#FFF7ED]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[#FFF7ED] flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-[#6B7280]" />
          </div>
          <div>
            <h3 className="text-[14px] font-medium text-[#1F2937]">{title}</h3>
            {subtitle && <p className="text-[11px] text-[#6B7280] mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Form Field ─────────────────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-[#6B7280]">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, ...props }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-[#FED7AA] rounded-lg px-3 py-2 text-[14px] text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 transition-colors"
      {...props}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3, ...props }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full border border-[#FED7AA] rounded-lg px-3 py-2 text-[14px] text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 transition-colors resize-none"
      {...props}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-[#FED7AA] rounded-lg px-3 py-2 text-[14px] text-[#1F2937] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 transition-colors bg-white"
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'general', label: 'Cấu hình', icon: 'ChatAlt2' },
  { id: 'knowledge', label: 'Kiến thức', icon: 'BookOpen' },
  { id: 'deploy', label: 'Triển khai', icon: 'GlobeAlt' },
];

export default function ChatbotSettings({ chatbot, onUpdate }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deployModal, setDeployModal] = useState(null); // 'iframe' | 'embed' | 'link' | 'zalo-oa' | 'facebook' | 'zalo-personal' | 'widget' | null
  const [copiedId, setCopiedId] = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    is_active: true,
    system_instruction: '',
    response_style: 'friendly',
    temperature: 0.7,
    max_tokens: 2048,
    welcome_message: '',
    primary_color: '#F97316',
    position: 'bottom-right',
    show_avatar: true,
    suggested_questions: [],
  });
  const [pristineForm, setPristineForm] = useState(null);

  const [newQuestion, setNewQuestion] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState(null);

  // Load form from chatbot
  useEffect(() => {
    if (chatbot) {
      const ws = chatbot.widget_settings || {};
      const initial = {
        name: chatbot.name || '',
        description: chatbot.description || '',
        is_active: chatbot.is_active !== false,
        system_instruction: chatbot.system_instruction || '',
        response_style: chatbot.response_style || 'friendly',
        temperature: chatbot.temperature || 0.7,
        max_tokens: chatbot.max_tokens || 2048,
        welcome_message: chatbot.welcome_message || chatbot.greeting_msg || '',
        primary_color: ws.primary_color || '#F97316',
        position: ws.position || 'bottom-right',
        show_avatar: ws.show_avatar !== false,
        suggested_questions: ws.suggested_questions || [],
      };
      setForm(initial);
      setPristineForm(initial);
      loadDocuments();
    }
  }, [chatbot?.id]);

  // Auto-save to localStorage
  useEffect(() => {
    if (!chatbot?.id) return;
    const timeout = setTimeout(() => {
      localStorage.setItem(`chatbot_form_${chatbot.id}`, JSON.stringify(form));
    }, 500);
    return () => clearTimeout(timeout);
  }, [form, chatbot?.id]);

  const loadDocuments = async () => {
    if (!chatbot?.id) return;
    setLoadingDocs(true);
    try {
      const res = await chatbotApi.listCustomChatDocuments(chatbot.id);
      setDocuments(res.data?.documents || chatbot?.documents || []);
    } catch {
      setDocuments(chatbot?.documents || []);
    } finally {
      setLoadingDocs(false);
    }
  };

  const updateForm = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Vui lòng nhập tên chatbot');
      return;
    }
    setSaving(true);
    try {
      const updateData = {
        name: form.name,
        description: form.description,
        is_active: form.is_active,
        system_instruction: form.system_instruction,
        response_style: form.response_style,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        welcome_message: form.welcome_message,
        widget_settings: {
          primary_color: form.primary_color,
          position: form.position,
          show_avatar: form.show_avatar,
          suggested_questions: form.suggested_questions,
        },
      };

      let updatedBot;
      try {
        const res = await chatbotApi.updateChatbot(chatbot.id, updateData);
        if (res.success && res.data) {
          updatedBot = { ...chatbot, ...res.data };
        } else throw new Error(res.message);
      } catch {
        updatedBot = { ...chatbot, ...updateData };
        const bots = JSON.parse(localStorage.getItem('uknow_chatbots') || '[]');
        const idx = bots.findIndex(b => b.id === chatbot.id);
        if (idx >= 0) { bots[idx] = updatedBot; localStorage.setItem('uknow_chatbots', JSON.stringify(bots)); }
      }
      onUpdate(updatedBot);
      toast.success('Đã lưu thành công');
    } catch (err) {
      toast.error(err.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  // Reset form về trạng thái ban đầu (Hủy)
  const handleCancel = () => {
    if (pristineForm) {
      setForm(pristineForm);
      toast.success('Đã hủy thay đổi');
    }
  };

  // Toggle active nhanh (Vô hiệu hóa)
  const handleToggleActive = () => {
    const newActive = !form.is_active;
    updateForm('is_active', newActive);
    toast.success(newActive ? 'Chatbot đã được kích hoạt' : 'Chatbot đã bị vô hiệu hóa');
  };

  // Suggested questions
  const addQuestion = () => {
    if (!newQuestion.trim() || form.suggested_questions.length >= 5) return;
    updateForm('suggested_questions', [...form.suggested_questions, newQuestion.trim()]);
    setNewQuestion('');
  };

  const removeQuestion = (i) => {
    updateForm('suggested_questions', form.suggested_questions.filter((_, idx) => idx !== i));
  };

  // File upload
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { toast.error('File quá lớn (max 10MB)'); return; }
      setUploadFile(file);
      setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
    }
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('chatbot_id', chatbot.id.toString());
      const res = await chatbotApi.uploadCustomChatDocument(fd);
      if (res.data?.success) {
        toast.success(`Đã upload: ${res.data.chunks || 0} chunks`);
        loadDocuments();
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadTitle('');
      } else {
        toast.error(res.data?.message || 'Upload thất bại');
      }
    } catch (err) {
      toast.error(err.message || 'Upload thất bại');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (doc) => {
    try {
      await chatbotApi.deleteDocument(chatbot.id, doc.title);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast.success('Đã xóa');
    } catch {
      toast.error('Xóa thất bại');
    }
  };

  const copyEmbedCode = () => {
    const baseUrl = window.location.origin;
    const code = `<script>
  window.customChatbotConfig = { token: '${chatbot.widget_key || chatbot.id}', baseUrl: '${baseUrl}', primaryColor: '${form.primary_color}' };
</script>
<script src="${baseUrl}/widget.js" defer></script>`;
    navigator.clipboard.writeText(code);
    toast.success('Đã copy code');
  };

  const copyPublicLink = () => {
    const link = `${window.location.origin}/chat/${chatbot.widget_key || chatbot.id}`;
    navigator.clipboard.writeText(link);
    toast.success('Đã copy link');
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Tabs — cố định ở trên */}
      <div className="sticky top-0 z-10 bg-[#FFFBF5] px-5 pt-4 pb-0">
        <div className="relative border-b border-[#E5E7EB]">
          <div className="flex gap-0">
            {TABS.map(tab => {
              const Icon = icons[tab.icon];
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    isActive ? 'text-[#F97316]' : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {isActive && (
                    <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-[#F97316] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── GENERAL TAB ── */}
      {activeTab === 'general' && (
        <div className="space-y-6 pb-24 px-5">
          {/* Basic Info */}
          <SectionCard title="Thông tin cơ bản" icon="ChatAlt2" subtitle="Tên và trạng thái chatbot">
            <div className="space-y-4">
              <Field label="Tên chatbot">
                <Input
                  value={form.name}
                  onChange={v => updateForm('name', v)}
                  placeholder="VD: Hỗ trợ khách hàng"
                />
              </Field>
              <Field label="Mô tả">
                <Input
                  value={form.description}
                  onChange={v => updateForm('description', v)}
                  placeholder="Mô tả ngắn về chatbot"
                />
              </Field>
              <Toggle
                label="Trạng thái hoạt động"
                description="Bật/Tắt chatbot nhận tin nhắn"
                checked={form.is_active}
                onChange={v => updateForm('is_active', v)}
              />
            </div>
          </SectionCard>

          {/* AI Settings */}
          <SectionCard title="Cấu hình AI" icon="Sparkles" subtitle="Cách chatbot trả lời">
            <div className="space-y-4">
              <Field label="Phong cách trả lời">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'friendly', label: 'Thân thiện' },
                    { value: 'professional', label: 'Chuyên nghiệp' },
                    { value: 'casual', label: 'Thoải mái' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateForm('response_style', opt.value)}
                      className={`py-2 px-3 text-[13px] font-medium rounded-full border transition-colors ${
                        form.response_style === opt.value
                          ? 'border-[#F97316] bg-[#FFEDD5] text-[#EA580C]'
                          : 'border-[#FED7AA] text-[#6B7280] hover:bg-[#FFF7ED]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={`Độ sáng tạo: ${form.temperature}`}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={form.temperature}
                  onChange={e => updateForm('temperature', parseFloat(e.target.value))}
                  className="w-full accent-[#F97316]"
                />
                <div className="flex justify-between text-xs text-[#6B7280]">
                  <span>Chính xác</span>
                  <span>Sáng tạo</span>
                </div>
              </Field>

              <Field label="Giới hạn phản hồi">
                <Select
                  value={form.max_tokens}
                  onChange={v => updateForm('max_tokens', parseInt(v))}
                  options={[
                    { value: 512, label: 'Ngắn (512 tokens)' },
                    { value: 1024, label: 'Vừa (1024 tokens)' },
                    { value: 2048, label: 'Tiêu chuẩn (2048 tokens)' },
                    { value: 4096, label: 'Dài (4096 tokens)' },
                  ]}
                />
              </Field>

              <Field label="Tin nhắn chào mở đầu">
                <Textarea
                  value={form.welcome_message}
                  onChange={v => updateForm('welcome_message', v)}
                  placeholder="VD: Xin chào! Tôi có thể giúp gì cho bạn?"
                  rows={2}
                />
              </Field>

              <Field label="Hướng dẫn AI" hint="Hướng dẫn chi tiết giúp AI hiểu vai trò của mình">
                <Textarea
                  value={form.system_instruction}
                  onChange={v => updateForm('system_instruction', v)}
                  placeholder="VD: Bạn là trợ lý thân thiện của công ty ABC, chuyên tư vấn về sản phẩm..."
                  rows={4}
                />
              </Field>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── KNOWLEDGE TAB ── */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6 pb-24 px-5">
          <SectionCard
            title="Tài liệu kiến thức"
            icon="BookOpen"
            subtitle="Upload tài liệu để chatbot học và trả lời chính xác hơn"
            actions={
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-[#F97316] text-white text-[13px] font-medium rounded-full hover:bg-[#EA580C] transition-colors"
              >
                <HiOutlineUpload className="w-3.5 h-3.5 inline mr-1" />
                Upload
              </button>
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.html,.pdf,.doc,.docx"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="space-y-3">
              {uploadFile && (
                <div className="flex items-center gap-3 bg-[#FFF7ED] rounded-lg px-3 py-2.5">
                  <HiOutlineDocumentText className="w-5 h-5 text-[#6B7280] shrink-0" />
                  <span className="flex-1 text-[14px] text-[#6B7280] truncate">{uploadTitle}</span>
                  <span className="text-xs text-[#6B7280]">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleUpload}
                      disabled={uploading}
                      className="px-3 py-1.5 bg-[#F97316] text-white text-[13px] font-medium rounded-full hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
                    >
                      {uploading ? 'Đang upload...' : 'Upload'}
                    </button>
                    <button
                      onClick={() => { setUploadFile(null); setUploadTitle(''); }}
                      className="p-1.5 text-[#6B7280] hover:text-[#DC2626]"
                    >
                      <HiOutlineX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {loadingDocs ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-[#FFEDD5] border-t-[#F97316] rounded-full animate-spin" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-[#FED7AA] rounded-xl">
                  <HiOutlineBookOpen className="w-10 h-10 text-[#9CA3AF] mx-auto mb-2" />
                  <p className="text-[14px] text-[#6B7280]">Chưa có tài liệu nào</p>
                  <p className="text-xs text-[#6B7280] mt-1">Click "Upload" để thêm tài liệu</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 bg-[#FFF7ED] rounded-lg px-3 py-2.5 group">
                      <HiOutlineDocumentText className="w-5 h-5 text-[#6B7280] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1F2937] truncate">{doc.title}</p>
                        <p className="text-xs text-[#6B7280]">{doc.chunk_count || doc.chunks || 0} chunks</p>
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FFEDD5] rounded-lg transition-colors"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── DEPLOY TAB ── */}
      {activeTab === 'deploy' && (
        <div className="space-y-4 pb-6 px-5">
          {/* Header info */}
          <div className="pt-2">
            <p className="text-[13px] text-[#6B7280]">
              Chọn cách triển khai chatbot của bạn. Mỗi tùy chọn sẽ mở hộp thoại hướng dẫn chi tiết.
            </p>
          </div>

          {/* Deploy methods grid */}
          <div className="grid grid-cols-2 gap-3">
            <DeployCard
              icon={<HiOutlineCode className="w-5 h-5" />}
              title="Nhúng (Embed)"
              desc="Dán script vào website"
              color="blue"
              onClick={() => setDeployModal('embed')}
            />
            <DeployCard
              icon={<HiOutlineExternalLink className="w-5 h-5" />}
              title="iFrame"
              desc="Nhúng qua iframe"
              color="indigo"
              onClick={() => setDeployModal('iframe')}
            />
            <DeployCard
              icon={<HiOutlineLink className="w-5 h-5" />}
              title="Link công khai"
              desc="Chia sẻ qua URL"
              color="green"
              onClick={() => setDeployModal('link')}
            />
            <DeployCard
              icon={<HiOutlineColorSwatch className="w-5 h-5" />}
              title="Tùy chỉnh Widget"
              desc="Màu sắc & vị trí"
              color="purple"
              onClick={() => setDeployModal('widget')}
            />
          </div>

          {/* Channel integrations */}
          <div className="pt-4">
            <h4 className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3 px-1">
              Kết nối kênh
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <ChannelRow
                icon={<span className="font-bold text-[15px]">Z</span>}
                iconBg="bg-[#0068FF]"
                iconColor="text-white"
                name="Zalo OA"
                desc="Tích hợp với Zalo Official Account"
                onClick={() => navigate('/app/settings/channels')}
              />
              <ChannelRow
                icon={<span className="font-bold text-[15px]">f</span>}
                iconBg="bg-[#1877F2]"
                iconColor="text-white"
                name="Facebook Messenger"
                desc="Tích hợp fanpage Facebook"
                onClick={() => navigate('/app/settings/channels')}
              />
              <ChannelRow
                icon={<span className="font-bold text-[15px]">Z+</span>}
                iconBg="bg-[#00B5E2]"
                iconColor="text-white"
                name="Zalo cá nhân"
                desc="Quản lý & đăng nhập tài khoản Zalo cá nhân"
                connectedLabel="Đã kết nối"
                onClick={() => navigate('/app/settings/channels')}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── DEPLOY MODALS ── */}
      {deployModal === 'embed' && (
        <DeployModal onClose={() => setDeployModal(null)} title="Nhúng vào Website">
          <EmbedCodeContent chatbot={chatbot} form={form} copiedId={copiedId} setCopiedId={setCopiedId} />
        </DeployModal>
      )}
      {deployModal === 'iframe' && (
        <DeployModal onClose={() => setDeployModal(null)} title="Nhúng qua iFrame">
          <IframeContent chatbot={chatbot} copiedId={copiedId} setCopiedId={setCopiedId} />
        </DeployModal>
      )}
      {deployModal === 'link' && (
        <DeployModal onClose={() => setDeployModal(null)} title="Link công khai">
          <PublicLinkContent chatbot={chatbot} copiedId={copiedId} setCopiedId={setCopiedId} />
        </DeployModal>
      )}
      {deployModal === 'widget' && (
        <DeployModal onClose={() => setDeployModal(null)} title="Tùy chỉnh Widget" wide>
          <WidgetCustomizeContent
            form={form}
            updateForm={updateForm}
            newQuestion={newQuestion}
            setNewQuestion={setNewQuestion}
            addQuestion={addQuestion}
            removeQuestion={removeQuestion}
          />
        </DeployModal>
      )}

      {/* ── BOTTOM ACTION BAR (cố định, không scroll) ── */}
      <div className="sticky bottom-0 z-20 bg-white border-t border-[#FED7AA]/60">
        <div className="px-5 py-3 flex items-center gap-2.5 shadow-[0_-4px_16px_rgba(249,115,22,0.06)]">
          <button
            onClick={handleToggleActive}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold rounded-full border-2 transition-all ${
              form.is_active
                ? 'bg-white border-[#FED7AA] text-[#6B7280] hover:border-[#F59E0B] hover:bg-[#FFFBEB] hover:text-[#B45309]'
                : 'bg-[#FFEDD5] border-[#F97316] text-[#EA580C] hover:bg-[#FED7AA]'
            }`}
          >
            {form.is_active ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span>Vô hiệu hóa</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Kích hoạt</span>
              </>
            )}
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-[1.3] flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-[#F97316] to-[#FB923C] hover:from-[#EA580C] hover:to-[#F97316] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-full transition-all shadow-[0_2px_8px_rgba(249,115,22,0.35)] hover:shadow-[0_4px_14px_rgba(249,115,22,0.5)]"
          >
            {saving ? (
              <>
                <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <HiOutlineSave className="w-4 h-4" />
                <span>Lưu thay đổi</span>
              </>
            )}
          </button>

          <button
            onClick={handleCancel}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold rounded-full border-2 border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6] hover:border-[#D1D5DB] transition-all disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Hủy</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper Components ─────────────────────────────────────────────────────────
function DeployCard({ icon, title, desc, color, onClick }) {
  // Tất cả tone cam - đồng bộ theme
  const colorMap = {
    blue:   { bg: 'bg-[#FFEDD5]', text: 'text-[#F97316]' },
    indigo: { bg: 'bg-[#FED7AA]', text: 'text-[#EA580C]' },
    green:  { bg: 'bg-[#FFF7ED]', text: 'text-[#F97316]' },
    purple: { bg: 'bg-[#FFEDD5]', text: 'text-[#FB923C]' },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-2.5 p-4 bg-white border border-[#E5E7EB] rounded-xl hover:border-[#F97316] hover:shadow-[0_2px_8px_rgba(249,115,22,0.18),0_4px_12px_rgba(249,115,22,0.08)] transition-all text-left"
    >
      <div className={`w-10 h-10 rounded-full ${c.bg} ${c.text} flex items-center justify-center group-hover:scale-105 transition-transform`}>
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-medium text-[#1F2937]">{title}</p>
        <p className="text-[12px] text-[#6B7280] mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

function ChannelRow({ icon, iconBg, iconColor, name, desc, beta, connectedLabel, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 bg-white border border-[#FED7AA]/60 rounded-xl hover:border-[#F97316] hover:shadow-[0_2px_8px_rgba(249,115,22,0.18),0_4px_12px_rgba(249,115,22,0.08)] transition-all text-left group"
    >
      <div className={`w-10 h-10 rounded-full ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-semibold text-[#1F2937]">{name}</p>
          {beta && (
            <span className="px-1.5 py-0.5 bg-[#FFEDD5] text-[#EA580C] text-[10px] font-semibold rounded-full">
              Beta
            </span>
          )}
          {connectedLabel && !beta && (
            <span className="px-1.5 py-0.5 bg-[#DCFCE7] text-[#166534] text-[10px] font-semibold rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
              {connectedLabel}
            </span>
          )}
        </div>
        <p className="text-[12px] text-[#6B7280] truncate">{desc}</p>
      </div>
      <HiOutlineExternalLink className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#F97316] shrink-0 transition-colors" />
    </button>
  );
}


function DeployModal({ children, onClose, title, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-[0_8px_24px_rgba(249,115,22,0.18),0_2px_8px_rgba(0,0,0,0.08)] w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[85vh] overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 flex items-start justify-between border-b border-[#FFF7ED]">
          <h3 className="text-[18px] font-medium text-[#1F2937]">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#6B7280] hover:bg-[#FFF7ED] -mr-1 -mt-1"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text, id, copiedId, setCopiedId }) {
  const isCopied = copiedId === id;
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors flex items-center gap-1.5 shrink-0 ${
        isCopied
          ? 'bg-[#FFEDD5] text-[#EA580C]'
          : 'bg-[#F97316] text-white hover:bg-[#EA580C]'
      }`}
    >
      {isCopied ? (
        <>
          <HiOutlineCheck className="w-3.5 h-3.5" />
          Đã copy
        </>
      ) : (
        <>
          <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

function EmbedCodeContent({ chatbot, form, copiedId, setCopiedId }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const token = chatbot?.widget_key || chatbot?.id || 'YOUR_TOKEN';
  const code = `<script>
  window.customChatbotConfig = {
    token: '${token}',
    primaryColor: '${form.primary_color}'
  };
</script>
<script src="${origin}/widget.js" defer></script>`;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#6B7280]">
        Copy đoạn code bên dưới và dán vào trước thẻ <code className="bg-[#FFF7ED] px-1 rounded text-[12px]">&lt;/body&gt;</code> của website.
      </p>
      <div className="flex items-center gap-2">
        <HiOutlineCode className="w-4 h-4 text-[#6B7280]" />
        <span className="text-[12px] font-medium text-[#6B7280] uppercase tracking-wide">Mã nhúng</span>
      </div>
      <div className="relative bg-[#1F2937] rounded-xl overflow-hidden">
        <div className="absolute top-2 right-2 z-10">
          <CopyButton text={code} id="embed-code" copiedId={copiedId} setCopiedId={setCopiedId} />
        </div>
        <pre className="p-4 text-[12px] text-[#FED7AA] whitespace-pre-wrap break-all font-mono leading-relaxed overflow-x-auto">
{code}
        </pre>
      </div>
      <div className="flex items-start gap-2 p-3 bg-[#FFEDD5] rounded-lg">
        <HiOutlineSparkles className="w-4 h-4 text-[#F97316] mt-0.5 shrink-0" />
        <p className="text-[12px] text-[#EA580C]">
          Mã nhúng sẽ tự động tải widget và hiển thị chatbot trên website của bạn.
        </p>
      </div>
    </div>
  );
}

function IframeContent({ chatbot, copiedId, setCopiedId }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const token = chatbot?.widget_key || chatbot?.id || 'YOUR_TOKEN';
  const url = `${origin}/chat/${token}`;
  const iframeCode = `<iframe
  src="${url}"
  width="400"
  height="600"
  style="border:0; border-radius:12px;"
  allow="microphone">
</iframe>`;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B7280]">
        Nhúng chatbot vào bất kỳ trang web nào thông qua iframe. Phù hợp với các hệ thống CMS không cho phép chèn JavaScript.
      </p>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <HiOutlineExternalLink className="w-4 h-4 text-[#6B7280]" />
          <span className="text-[12px] font-medium text-[#6B7280] uppercase tracking-wide">URL Chatbot</span>
        </div>
        <div className="flex items-center gap-2 bg-[#FFF7ED] rounded-lg px-3 py-2">
          <code className="flex-1 text-[12px] text-[#1F2937] break-all">{url}</code>
          <CopyButton text={url} id="iframe-url" copiedId={copiedId} setCopiedId={setCopiedId} />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <HiOutlineCode className="w-4 h-4 text-[#6B7280]" />
          <span className="text-[12px] font-medium text-[#6B7280] uppercase tracking-wide">Mã iframe</span>
        </div>
        <div className="relative bg-[#1F2937] rounded-xl overflow-hidden">
          <div className="absolute top-2 right-2 z-10">
            <CopyButton text={iframeCode} id="iframe-code" copiedId={copiedId} setCopiedId={setCopiedId} />
          </div>
          <pre className="p-4 text-[12px] text-[#FED7AA] whitespace-pre-wrap break-all font-mono leading-relaxed overflow-x-auto">
{iframeCode}
          </pre>
        </div>
      </div>
    </div>
  );
}

function PublicLinkContent({ chatbot, copiedId, setCopiedId }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const token = chatbot?.widget_key || chatbot?.id || 'YOUR_TOKEN';
  const url = `${origin}/chat/${token}`;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B7280]">
        Chia sẻ link này để khách hàng truy cập và chat trực tiếp với chatbot của bạn.
      </p>
      <div className="flex items-center gap-2 bg-[#FFF7ED] rounded-lg px-3 py-2">
        <HiOutlineLink className="w-4 h-4 text-[#6B7280] shrink-0" />
        <code className="flex-1 text-[13px] text-[#1F2937] break-all">{url}</code>
        <CopyButton text={url} id="public-link" copiedId={copiedId} setCopiedId={setCopiedId} />
      </div>
      <div className="flex items-center justify-center gap-3 p-4 bg-[#FFFBF5] border border-[#E5E7EB] rounded-xl">
        <div className="w-32 h-32 bg-white border border-[#E5E7EB] rounded-lg flex items-center justify-center text-[11px] text-[#6B7280]">
          QR Code
        </div>
        <div className="text-[12px] text-[#6B7280] leading-relaxed">
          Quét QR để mở<br/>chatbot trên điện thoại
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#FFF7ED] hover:bg-[#E5E7EB] text-[#1F2937] text-[14px] font-medium rounded-full transition-colors"
      >
        <HiOutlineExternalLink className="w-4 h-4" />
        Mở chatbot trong tab mới
      </a>
    </div>
  );
}

function WidgetCustomizeContent({ form, updateForm, newQuestion, setNewQuestion, addQuestion, removeQuestion }) {
  return (
    <div className="space-y-5">
      {/* Color */}
      <div>
        <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">Màu chủ đạo</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={form.primary_color}
            onChange={e => updateForm('primary_color', e.target.value)}
            className="w-12 h-10 rounded-lg cursor-pointer border border-[#FED7AA]"
          />
          <input
            type="text"
            value={form.primary_color}
            onChange={e => updateForm('primary_color', e.target.value)}
            placeholder="#F97316"
            className="flex-1 px-3 py-2 bg-[#FFF7ED] rounded-lg text-[14px] text-[#1F2937] outline-none focus:bg-white focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/30 transition-colors border border-transparent font-mono"
          />
        </div>
      </div>

      {/* Position */}
      <div>
        <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">Vị trí hiển thị</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'bottom-right', label: '⬇️ Dưới phải' },
            { value: 'bottom-left', label: '⬇️ Dưới trái' },
            { value: 'top-right', label: '⬆️ Trên phải' },
            { value: 'top-left', label: '⬆️ Trên trái' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => updateForm('position', opt.value)}
              className={`py-2 text-[13px] font-medium rounded-full border transition-colors ${
                form.position === opt.value
                  ? 'border-[#F97316] bg-[#FFEDD5] text-[#EA580C]'
                  : 'border-[#FED7AA] text-[#6B7280] hover:bg-[#FFF7ED]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Show avatar */}
      <Toggle
        label="Hiển thị Avatar"
        description="Avatar hiển thị bên cạnh tin nhắn chatbot"
        checked={form.show_avatar}
        onChange={v => updateForm('show_avatar', v)}
      />

      {/* Suggested questions */}
      <div className="pt-2 border-t border-[#FFF7ED]">
        <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5 mt-4">Câu hỏi gợi ý</label>
        <p className="text-[12px] text-[#6B7280] mb-2">Hiển thị khi bắt đầu chat ({form.suggested_questions.length}/5)</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuestion(); }}}
            placeholder="Nhập câu hỏi..."
            className="flex-1 px-3 py-2 bg-[#FFF7ED] rounded-lg text-[14px] text-[#1F2937] outline-none focus:bg-white focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/30 transition-colors border border-transparent"
          />
          <button
            onClick={addQuestion}
            disabled={form.suggested_questions.length >= 5}
            className="px-3 py-2 bg-[#F97316] text-white rounded-full hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" />
          </button>
        </div>
        {form.suggested_questions.length > 0 && (
          <div className="space-y-1.5 mt-3">
            {form.suggested_questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#FFF7ED] rounded-lg px-3 py-2 group">
                <span className="w-5 h-5 bg-[#FFEDD5] text-[#F97316] rounded-full text-[10px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-[13px] text-[#1F2937] truncate">{q}</span>
                <button
                  onClick={() => removeQuestion(i)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#6B7280] hover:text-[#DC2626]"
                >
                  <HiOutlineX className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save button */}
      <button
        className="w-full px-4 py-2.5 bg-[#F97316] text-white text-[14px] font-medium rounded-full hover:bg-[#EA580C] transition-colors mt-4 shadow-[0_2px_8px_rgba(249,115,22,0.25)]"
      >
        Lưu cài đặt widget
      </button>
    </div>
  );
}

function ChannelConnectContent({ platform, description, steps }) {
  return (
    <div className="space-y-5">
      <div className="p-3 bg-[#FFEDD5] border border-[#FED7AA] rounded-lg">
        <p className="text-[12px] text-[#EA580C] font-medium">
          🚧 Tính năng đang phát triển (Beta)
        </p>
      </div>
      <p className="text-[13px] text-[#6B7280]">{description}</p>

      <div>
        <h4 className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
          Các bước thực hiện
        </h4>
        <ol className="space-y-2">
          {steps.map((step, idx) => (
            <li key={idx} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#FFEDD5] text-[#F97316] text-[12px] font-bold flex items-center justify-center">
                {idx + 1}
              </span>
              <p className="text-[13px] text-[#1F2937] leading-relaxed pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-3 pt-3 border-t border-[#FFF7ED]">
        <div>
          <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
            {platform} ID
          </label>
          <input
            type="text"
            placeholder={`Nhập ${platform} ID`}
            disabled
            className="w-full px-3 py-2 bg-[#FFF7ED] rounded-lg text-[14px] text-[#1F2937] placeholder:text-[#9CA3AF] outline-none border border-transparent cursor-not-allowed opacity-60"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#6B7280] mb-1.5">
            Access Token / Secret
          </label>
          <input
            type="password"
            placeholder="Nhập token"
            disabled
            className="w-full px-3 py-2 bg-[#FFF7ED] rounded-lg text-[14px] text-[#1F2937] placeholder:text-[#9CA3AF] outline-none border border-transparent cursor-not-allowed opacity-60"
          />
        </div>
        <button
          disabled
          className="w-full px-4 py-2.5 bg-[#F97316] text-white text-[14px] font-medium rounded-full transition-colors opacity-40 cursor-not-allowed"
        >
          Kết nối (Sắp ra mắt)
        </button>
      </div>
    </div>
  );
}
