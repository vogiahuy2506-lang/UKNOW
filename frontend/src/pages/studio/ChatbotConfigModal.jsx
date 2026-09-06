import { useState, useEffect, useRef } from 'react';
import {
  HiOutlineX,
  HiOutlineSave,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineChatAlt2,
  HiOutlineQuestionMarkCircle,
  HiOutlineShieldCheck,
  HiOutlinePlus,
  HiOutlineChevronDown,
  HiOutlineBookOpen,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import ChatbotReplyLimitsCard from '../../features/chatbot/components/ChatbotReplyLimitsCard';
import AiHandoffAutoResumeCard from '../../features/billing/AiHandoffAutoResumeCard';
import ImageUrlInput from '../../features/chatbot/components/AvatarUploader';
import KnowledgeTab from './KnowledgeTab';
import { getMyProfile } from '../../features/auth/services/authApi.service';
import {
  SectionCard,
  FieldRow,
  TextInput,
  Textarea,
  Toggle,
  AIConfig,
} from '../../features/chatbot/components/ChatbotSettingsComponents';
import { useI18n } from '../../i18n';

const ANCHOR_SECTIONS = [
  { id: 'basic',     label: 'Thông tin cơ bản',  icon: HiOutlineChatAlt2 },
  { id: 'ai',        label: 'Hướng dẫn AI',      icon: HiOutlineSparkles },
  { id: 'knowledge', label: 'Kiến thức',          icon: HiOutlineBookOpen },
  { id: 'questions', label: 'Câu hỏi gợi ý',     icon: HiOutlineQuestionMarkCircle },
  { id: 'limits',    label: 'Giới hạn',          icon: HiOutlineShieldCheck },
];

export default function ChatbotConfigModal({ open, chatbot, onClose, onUpdate }) {
  const { t } = useI18n();
  const [activeAnchor, setActiveAnchor] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [profileData, setProfileData] = useState(null);
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const contentRef = useRef(null);

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
    allow_attachments: false,
    suggested_questions: [],
    reply_limit_config: null,
  });

  useEffect(() => {
    if (!open || !chatbot?.id) return;
    (async () => {
      try {
        const response = await getMyProfile();
        setProfileData(response?.data || null);
      } catch {
        setProfileData(null);
      }
    })();
  }, [open, chatbot?.id]);

  useEffect(() => {
    if (!open || !chatbot?.id) return;
    // custom_chatbots co cot truc tiep suggested_questions TEXT[] (migration 040/041)
    // nen doc truc tiep tu chatbot.suggested_questions. Khong dung widget_settings
    // (vi widget_settings chi la JSON nested chua primary_color, ... khong co
    // suggested_questions -> truoc day luon fallback [] lam mat data user da luu).
    const loadedForm = {
      name: chatbot.name || '',
      description: chatbot.description || '',
      avatar_url: chatbot.avatar_url || chatbot.logo_url || '',
      system_instruction: chatbot.system_instruction || '',
      ai_model: chatbot.ai_model || 'gemini-2.5-flash',
      temperature: chatbot.temperature || 0.7,
      max_tokens: chatbot.max_tokens || 2048,
      response_style: chatbot.response_style || 'friendly',
      welcome_message: chatbot.welcome_message || chatbot.greeting_msg || '',
      is_active: chatbot.is_active !== false,
      allow_attachments: chatbot.allow_attachments === true,
      suggested_questions: chatbot.suggested_questions || [],
      reply_limit_config: chatbot.reply_limit_config || null,
    };
    setForm(loadedForm);
    setInitialSnapshot(loadedForm);
    setHydrated(true);
  }, [open, chatbot]);

  // Load knowledge documents
  useEffect(() => {
    if (!open || !chatbot?.id) return;
    setKnowledgeDocs([]); // Reset first
    console.log('[ChatbotConfigModal] Loading documents for chatbot:', chatbot.id);
    (async () => {
      try {
        const res = await chatbotApi.listCustomChatDocuments(chatbot.id);
        console.log('[ChatbotConfigModal] API response:', res);
        console.log('[ChatbotConfigModal] res.data:', res.data);
        const list = res?.data?.documents || res?.documents || res?.data || [];
        console.log('[ChatbotConfigModal] Parsed documents list:', list);
        setKnowledgeDocs(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('[ChatbotConfigModal] Load docs error:', err);
        setKnowledgeDocs([]);
      }
    })();
  }, [open, chatbot?.id]);

  if (!open || !chatbot) return null;

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

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
        avatar_url: form.avatar_url || null,
        system_instruction: form.system_instruction,
        ai_model: form.ai_model,
        temperature: form.temperature,
        max_tokens: form.max_tokens,
        response_style: form.response_style,
        welcome_message: form.welcome_message,
        is_active: form.is_active,
        allow_attachments: form.allow_attachments === true,
        widget_key: chatbot.widget_key || form.widget_key,
        suggested_questions: form.suggested_questions || [],
        reply_limit_config: form.reply_limit_config,
      };

      let updatedBot;
      try {
        const res = await chatbotApi.updateChatbot(chatbot.id, updateData);
        if (res.success && res.data) {
          updatedBot = { ...chatbot, ...res.data, suggested_questions: form.suggested_questions || [] };
        } else {
          throw new Error(res.message || 'Save failed');
        }

        const aiSettings = {
          system_instruction: form.system_instruction,
          ai_model: form.ai_model,
          temperature: form.temperature,
          max_tokens: form.max_tokens,
          response_style: form.response_style,
          welcome_message: form.welcome_message,
          is_enabled: form.is_active,
        };
        const ALL_CHANNELS = ['zalo_personal', 'zalo_oa', 'facebook', 'web', 'script', 'iframe', 'public_link'];
        try {
          await Promise.all(ALL_CHANNELS.map((channel) =>
            chatbotApi.updateChatbotSettings(channel, aiSettings)
          ));
        } catch (aiErr) {
          console.warn('[ChatbotConfigModal] AI settings save failed:', aiErr.message);
        }
      } catch (apiError) {
        console.warn('[ChatbotConfigModal] API save failed:', apiError.message);
        updatedBot = {
          ...chatbot,
          ...updateData,
          suggested_questions: form.suggested_questions || [],
        };
      }

      onUpdate?.(updatedBot);
      setInitialSnapshot(form);
      toast.success(t('common.success') || 'Đã lưu cấu hình');
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (initialSnapshot) setForm(initialSnapshot);
    onClose?.();
  };

  const addSuggestedQuestion = () => {
    if (!newQuestion.trim()) return;
    if ((form.suggested_questions || []).length >= 5) {
      toast.error('Tối đa 5 câu hỏi gợi ý');
      return;
    }
    update({ suggested_questions: [...(form.suggested_questions || []), newQuestion.trim()] });
    setNewQuestion('');
  };

  const removeSuggestedQuestion = (index) => {
    update({ suggested_questions: form.suggested_questions.filter((_, i) => i !== index) });
  };

  const scrollToAnchor = (id) => {
    setActiveAnchor(id);
    const el = document.getElementById(`config-anchor-${id}`);
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full h-full md:h-[90vh] md:w-[90vw] max-w-[1400px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center text-white text-base font-bold shrink-0">
              {chatbot.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 truncate">
                Cấu hình chatbot
              </h2>
              <p className="text-xs text-slate-500 truncate">{chatbot.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Đóng"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <nav className="hidden md:flex flex-col w-60 lg:w-64 border-r border-slate-100 bg-slate-50/50 px-3 py-4 gap-0.5 overflow-y-auto shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
              Cấu hình
            </p>
            {ANCHOR_SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = activeAnchor === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToAnchor(section.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-white text-primary-700 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-600' : 'text-slate-400'}`} />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="md:hidden border-b border-slate-100 bg-white px-4 py-2 shrink-0">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Cấu hình
            </label>
            <div className="relative">
              <select
                value={activeAnchor}
                onChange={(e) => scrollToAnchor(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-9 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
                aria-label="Chuyển nhanh đến mục cấu hình"
              >
                {ANCHOR_SECTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <HiOutlineChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            <div className="p-6 md:p-8 space-y-5 max-w-3xl mx-auto">
              {/* Thông tin cơ bản */}
              <section id="config-anchor-basic">
                <SectionCard
                  icon={HiOutlineChatAlt2}
                  title="Thông tin cơ bản"
                  subtitle="Tên, mô tả và ảnh đại diện chatbot"
                  accent="purple"
                >
                  <div className="space-y-4">
                    <div className="flex items-start gap-5 pb-4 border-b border-slate-100">
                      <div className="shrink-0">
                        <ImageUrlInput
                          value={form.avatar_url}
                          onChange={(url) => update({ avatar_url: url })}
                          label="Ảnh đại diện"
                          placeholder="https://example.com/avatar.png"
                          help="Hiển thị trong danh sách chatbot và tiện ích chat nhúng."
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <FieldRow label="Tên chatbot" hint="Tên hiển thị của chatbot">
                          <TextInput
                            value={form.name}
                            onChange={(e) => update({ name: e.target.value })}
                            placeholder="VD: Trợ lý AI"
                          />
                        </FieldRow>
                      </div>
                    </div>
                    <FieldRow label="Mô tả" hint="Mô tả ngắn về chatbot">
                      <Textarea
                        value={form.description}
                        onChange={(e) => update({ description: e.target.value })}
                        placeholder="VD: Hỗ trợ tư vấn sản phẩm..."
                        rows={2}
                      />
                    </FieldRow>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Trạng thái hoạt động</p>
                        <p className="text-xs text-slate-400">Bật để chatbot nhận và trả lời</p>
                      </div>
                      <Toggle
                        checked={form.is_active}
                        onChange={(val) => update({ is_active: val })}
                      />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Cho khách gửi tệp đính kèm</p>
                        <p className="text-xs text-slate-400">PDF, Word, Excel, ảnh...</p>
                      </div>
                      <Toggle
                        checked={form.allow_attachments === true}
                        onChange={(val) => update({ allow_attachments: val })}
                      />
                    </div>
                  </div>
                </SectionCard>
              </section>

              {/* Hướng dẫn AI */}
              <section id="config-anchor-ai">
                <SectionCard
                  icon={HiOutlineSparkles}
                  title="Hướng dẫn AI"
                  subtitle="Cấu hình model, phong cách và hướng dẫn"
                  accent="blue"
                >
                  <AIConfig
                    config={{
                      ai_model: form.ai_model,
                      temperature: form.temperature,
                      max_tokens: form.max_tokens,
                      response_style: form.response_style,
                      welcome_message: form.welcome_message,
                      system_instruction: form.system_instruction,
                    }}
                    onChange={(updated) => update(updated)}
                    showSystemInstruction={true}
                  />
                </SectionCard>
              </section>

              {/* Kiến thức */}
              <section id="config-anchor-knowledge">
                <SectionCard
                  icon={HiOutlineBookOpen}
                  title="Kiến thức chatbot"
                  subtitle="Quản lý tài liệu và nguồn kiến thức cho AI"
                  accent="green"
                >
                  <KnowledgeTab
                    chatbot={chatbot}
                    initialDocuments={knowledgeDocs}
                    onDocumentsChange={() => {
                      chatbotApi.listCustomChatDocuments(chatbot.id)
                        .then(res => {
                          const list = res?.data?.documents || res?.documents || res?.data || [];
                          setKnowledgeDocs(Array.isArray(list) ? list : []);
                        })
                        .catch(() => {});
                    }}
                  />
                </SectionCard>
              </section>

              {/* Câu hỏi gợi ý */}
              <section id="config-anchor-questions">
                <SectionCard
                  icon={HiOutlineQuestionMarkCircle}
                  title="Câu hỏi gợi ý"
                  subtitle="Hiển thị khi người dùng bắt đầu chat"
                  accent="purple"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        (form.suggested_questions || []).length >= 5
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-violet-100 text-violet-600'
                      }`}>
                        {(form.suggested_questions || []).length}/5
                      </span>
                      {(form.suggested_questions || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => update({ suggested_questions: [] })}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <TextInput
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); addSuggestedQuestion(); }
                          if (e.key === 'Escape') { setNewQuestion(''); }
                        }}
                        placeholder="Nhập câu hỏi gợi ý..."
                        disabled={(form.suggested_questions || []).length >= 5}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={addSuggestedQuestion}
                        disabled={(form.suggested_questions || []).length >= 5}
                        className="btn btn-secondary shrink-0 disabled:opacity-50"
                      >
                        <HiOutlinePlus className="w-4 h-4" />
                      </button>
                    </div>

                    {(form.suggested_questions || []).length > 0 ? (
                      <div className="space-y-1.5">
                        {form.suggested_questions.map((q, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-200 group hover:border-slate-300 transition-colors"
                          >
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
                        <HiOutlineQuestionMarkCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Chưa có câu hỏi gợi ý</p>
                      </div>
                    )}
                  </div>
                </SectionCard>
              </section>

              {/* Giới hạn */}
              <section id="config-anchor-limits">
                {hydrated && (
                  <ChatbotReplyLimitsCard
                    value={form.reply_limit_config}
                    onChange={(newConfig) => update({ reply_limit_config: newConfig })}
                  />
                )}
                {profileData && (
                  <div className="mt-5">
                    <AiHandoffAutoResumeCard
                      data={profileData}
                      t={t}
                      onSaved={(next) => {
                        setProfileData((prev) =>
                          prev ? { ...prev, aiHandoffAutoResumeMinutes: next } : prev
                        );
                      }}
                    />
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
          <p className="text-xs text-slate-500 hidden md:block">
            Thay đổi sẽ được áp dụng sau khi bấm Lưu
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <HiOutlineSave className="w-4 h-4" />
                  Lưu cấu hình
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}