import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  HiOutlineSparkles, HiOutlineX, HiOutlineChevronRight, HiOutlinePlay,
  HiOutlineTerminal, HiOutlinePencilAlt, HiOutlineCheck, HiOutlineQuestionMarkCircle,
  HiOutlineMail, HiOutlineChat, HiOutlineFolderOpen, HiOutlineGlobeAlt,
} from 'react-icons/hi';
import api from '../../../services/api';
import templateLabelApiService from '../../templates/services/templateLabelApi.service';

// Render AI message content — convert basic markdown to JSX
export function AiContent({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  const renderInline = (str, baseKey) =>
    str.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={`${baseKey}-${j}`}>{part.slice(2, -2)}</strong>
        : part
    );
  return (
    <div className="text-sm leading-relaxed text-slate-800 space-y-1 break-words">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // Bullet: lines starting with - or *
        if (/^[-*]\s/.test(line)) {
          const content = line.replace(/^[-*]\s/, '');
          return <div key={i} className="flex gap-1.5"><span className="text-slate-400 shrink-0 mt-0.5">•</span><span>{renderInline(content, i)}</span></div>;
        }
        return <p key={i}>{renderInline(line, i)}</p>;
      })}
    </div>
  );
}
// Fallback khi user chưa tạo nhãn nào
const DEFAULT_CATEGORIES = (t) => [
  { id: 'marketing', name: '📢 Marketing', color: '#3b82f6' },
  { id: 'notification', name: t('aiChatbot.notificationCategory'), color: '#f59e0b' },
];

// Category picker overlay — lấy danh mục (nhãn template) thực tế của user
const CategoryPicker = ({ onSelect, onCancel, t }) => {
  const [labels, setLabels] = useState(null); // null = đang tải

  useEffect(() => {
    templateLabelApiService.getLabels()
      .then((res) => setLabels(res.data?.data ?? []))
      .catch(() => setLabels([]));
  }, []);

  const categories = labels && labels.length > 0
    ? labels.map((l) => ({ id: l.name, name: l.name, color: l.color }))
    : DEFAULT_CATEGORIES(t);

  return (
    <div className="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
      <p className="text-xs font-bold text-orange-700 mb-2">📂 {t('aiChatbot.saveToCategory')}</p>
      {labels === null ? (
        <p className="text-xs text-slate-400">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all hover:opacity-75"
              style={{
                borderColor: cat.color + '60',
                backgroundColor: cat.color + '18',
                color: cat.color,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </button>
          ))}
        </div>
      )}
      <button onClick={onCancel} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600">{t('aiChatbot.cancel')}</button>
    </div>
  );
};

// Template preview card
export const TemplateDraftCard = ({ draft, onSave, onEdit, t }) => {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(false);
    setShowCategoryPicker(false);
  }, [draft?.templateName, draft?.subject, draft?.bodyHtml, draft?.bodyText, draft?.channel]);

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
      setSaved(true);
      toast.success(t('aiChatbot.templateSaved'));
      onSave?.();
    } catch (e) {
      toast.error(e.response?.data?.message || t('aiChatbot.saveFailed'));
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
          {draft.channel === 'email' ? t('aiChatbot.emailTemplate') : t('aiChatbot.zaloTemplate')}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{t('aiChatbot.templateName')}</p>
          <p className="text-sm font-bold text-slate-800">{draft.templateName}</p>
        </div>

        {draft.subject && (
          <div>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{t('aiChatbot.subject')}</p>
            <p className="text-sm text-slate-700">{draft.subject}</p>
          </div>
        )}

        <div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">{t('aiChatbot.content')}</p>
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
          <CategoryPicker onSelect={handleSave} onCancel={() => setShowCategoryPicker(false)} t={t} />
        ) : (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                if (!saved) setShowCategoryPicker(true);
              }}
              disabled={saving || saved}
              className={`flex-1 py-2.5 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:cursor-default ${
                saved
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60'
              }`}
            >
              <HiOutlineCheck className="w-4 h-4" />
              {saved ? t('aiChatbot.savedToLibrary') : (saving ? t('aiChatbot.saving') : t('aiChatbot.saveToLibrary'))}
            </button>
            <button
              onClick={() => onEdit?.(draft)}
              className="flex-1 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-all"
            >
              <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" />
              {t('aiChatbot.edit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const ContentPlanCard = ({ data, onGenerateTemplate, generatingDay, t }) => {
  const days = Array.isArray(data?.days) ? data.days : [];
  const totalDays = data?.totalDays || days.length;
  if (!days.length) return null;

  const channelIcon = (channel) => (
    channel === 'email'
      ? <HiOutlineMail className="w-4 h-4 text-orange-500" />
      : <HiOutlineChat className="w-4 h-4 text-blue-500" />
  );

  const channelLabel = (channel) => (
    channel === 'email' ? t('aiChatbot.emailTemplate') : t('aiChatbot.zaloTemplate')
  );

  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100">
        <HiOutlineSparkles className="w-5 h-5 text-blue-500" />
        <span className="text-[11px] font-black uppercase tracking-widest text-blue-600">
          {t('aiChatbot.contentPlanTitle', { count: totalDays })}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {days.map((dayItem) => {
          const day = Number(dayItem.day) || dayItem.day;
          const loading = generatingDay === dayItem.day;
          return (
            <div key={`${dayItem.day}-${dayItem.channel}-${dayItem.goal}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 border border-slate-200">
                      {t('aiChatbot.dayLabel', { day })}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 border border-slate-200">
                      {channelIcon(dayItem.channel)}
                      {channelLabel(dayItem.channel)}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-800">{dayItem.goal}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{dayItem.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onGenerateTemplate?.(dayItem)}
                  disabled={generatingDay !== null}
                  className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? t('aiChatbot.generatingTemplate') : t('aiChatbot.generateTemplate')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Ask-more card
export const AskMoreCard = ({ missingFields, t }) => (
  <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
    <HiOutlineQuestionMarkCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
    <div>
      <p className="text-xs font-bold text-amber-800 mb-1">{t('aiChatbot.needMoreInfo')}</p>
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

// Ask campaign type card - hỏi user chọn kênh
export const AskCampaignTypeCard = ({ data, onSelect, t }) => {
  if (!data?.campaignOptions) return null;

  return (
    <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineSparkles className="w-5 h-5 text-blue-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-blue-600">{t('aiChatbot.selectCampaignChannel')}</span>
      </div>
      {data.campaignName && (
        <h4 className="font-bold text-slate-900 text-sm mb-1">{data.campaignName}</h4>
      )}
      {data.description && (
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">{data.description}</p>
      )}
      <p className="text-xs text-slate-600 mb-3">{t('aiChatbot.whichChannel')}</p>
      <div className="space-y-2">
        {data.campaignOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{
                backgroundColor: option.value === 'email' ? '#fff7ed' : option.value === 'zalo' ? '#eff6ff' : '#faf5ff'
              }}
            >
              {option.value === 'email' ? '📧' : option.value === 'zalo' ? '💬' : '👥'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700">{option.label}</p>
              <p className="text-[10px] text-slate-500">{option.description}</p>
            </div>
            <HiOutlineChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
          </button>
        ))}
      </div>
    </div>
  );
};

// Ask campaign details - hỏi gộp tất cả câu hỏi cần thiết trong 1 lần
export const AskCampaignDetailsCard = ({ data, onSubmit, t }) => {
  const [answers, setAnswers] = useState({});
  const [emailChoice, setEmailChoice] = useState(null); // 'new' | 'existing'
  const [emailTemplateName, setEmailTemplateName] = useState('');
  if (!data?.questions?.length) return null;

  const isEmailChannel = answers.channel === 'email';
  const emailChoiceRequired = isEmailChannel;
  const emailTemplateRequired = isEmailChannel && emailChoice === 'existing';

  const allAnswered =
    data.questions.every(q => answers[q.id]) &&
    (!emailChoiceRequired || emailChoice !== null) &&
    (!emailTemplateRequired || emailTemplateName.trim().length > 0);

  const pick = (qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }));

  const handleSubmit = () => {
    if (!allAnswered) return;
    const lines = data.questions.map(q => {
      const opt = q.options.find(o => o.value === answers[q.id]);
      return `${q.label} ${opt?.label || answers[q.id]}`;
    });
    if (isEmailChannel) {
      if (emailChoice === 'existing') {
        lines.push(`Nội dung email: Dùng mẫu email có sẵn tên "${emailTemplateName.trim()}"`);
      } else {
        lines.push('Nội dung email: Tạo nội dung mới bằng AI');
      }
    }
    onSubmit(lines.join('\n'), { ...answers, emailChoice, emailTemplateName: emailTemplateName.trim() });
  };

  return (
    <div className="mt-4 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <HiOutlineSparkles className="w-5 h-5 text-orange-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-orange-600">
          {t('aiChatbot.designCampaign')}
        </span>
      </div>

      {data.campaignName && (
        <p className="text-sm font-bold text-slate-800">{data.campaignName}</p>
      )}

      {data.questions.map(q => (
        <div key={q.id}>
          <p className="text-xs font-semibold text-slate-600 mb-2">{q.label}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => pick(q.id, opt.value)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  answers[q.id] === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {isEmailChannel && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">{t('aiChatbot.emailContent')}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'new', label: t('aiChatbot.createNewContent') },
              { value: 'existing', label: t('aiChatbot.useExistingTemplate') },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setEmailChoice(opt.value)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  emailChoice === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {emailChoice === 'existing' && (
            <input
              type="text"
              placeholder={t('aiChatbot.enterEmailTemplateName')}
              value={emailTemplateName}
              onChange={e => setEmailTemplateName(e.target.value)}
              className="mt-2 w-full px-3 py-2 text-xs border border-orange-200 rounded-xl bg-white focus:outline-none focus:border-orange-400 placeholder-slate-400"
            />
          )}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-orange-500 hover:bg-orange-600 text-white"
      >
        {allAnswered ? '✓ ' + t('aiChatbot.createCampaignWithOptions') : t('aiChatbot.selectAllAbove')}
      </button>
    </div>
  );
};

// Ask landing details card - hỏi gộp thông tin để tạo landing page
export const AskLandingDetailsCard = ({ data, onSubmit, t }) => {
  // formFields mặc định 'basic' — không bắt buộc thay đổi
  const [answers, setAnswers] = useState({ formFields: 'basic' });
  const [customFieldsText, setCustomFieldsText] = useState('');
  if (!data?.questions?.length) return null;

  const allAnswered = data.questions.every(q => answers[q.id]);
  const canSubmit = allAnswered && (answers.formFields !== 'custom' || customFieldsText.trim().length > 0);
  const pick = (qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }));

  const handleSubmit = () => {
    if (!canSubmit) return;
    const lines = data.questions.map(q => {
      const opt = q.options.find(o => o.value === answers[q.id]);
      return `${q.label} ${opt?.label || answers[q.id]}`;
    });
    if (answers.formFields === 'extended') {
      lines.push('Form thu thập thêm: Nghề nghiệp (occupation) và Lĩnh vực quan tâm (interestArea)');
    } else if (answers.formFields === 'custom' && customFieldsText.trim()) {
      lines.push(`Form thu thập thêm các trường tùy chỉnh: ${customFieldsText.trim()}`);
    }
    onSubmit(lines.join('\n'), { ...answers, customFields: customFieldsText.trim() });
  };

  return (
    <div className="mt-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <HiOutlineGlobeAlt className="w-5 h-5 text-indigo-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-indigo-600">
          {t('aiChatbot.designLandingPage')}
        </span>
      </div>

      {data.pageTitle && (
        <p className="text-sm font-bold text-slate-800">{data.pageTitle}</p>
      )}

      {data.questions.map(q => (
        <div key={q.id}>
          <p className="text-xs font-semibold text-slate-600 mb-2">{q.label}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => pick(q.id, opt.value)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  answers[q.id] === opt.value
                    ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Câu hỏi cố định: form fields — luôn hiển thị */}
      <div className="pt-1 border-t border-indigo-100">
        <p className="text-xs font-semibold text-slate-600 mb-1">{t('aiChatbot.formFieldsLabel')}</p>
        <p className="text-[10px] text-slate-400 mb-2">{t('aiChatbot.formFieldsDefault')}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => pick('formFields', 'basic')}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              answers.formFields === 'basic'
                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            {t('aiChatbot.formFieldsBasic')}
          </button>
          <button
            onClick={() => pick('formFields', 'extended')}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              answers.formFields === 'extended'
                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            {t('aiChatbot.formFieldsExtended')}
          </button>
          <button
            onClick={() => pick('formFields', 'custom')}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
              answers.formFields === 'custom'
                ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
            }`}
          >
            {t('aiChatbot.formFieldsCustom')}
          </button>
        </div>
        {answers.formFields === 'custom' && (
          <div className="mt-2">
            <textarea
              value={customFieldsText}
              onChange={e => setCustomFieldsText(e.target.value)}
              placeholder={t('aiChatbot.customFieldsPlaceholder')}
              rows={2}
              className="w-full text-xs rounded-xl border border-indigo-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-[10px] text-slate-400 mt-1">{t('aiChatbot.customFieldsHint')}</p>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-500 hover:bg-indigo-600 text-white"
      >
        {canSubmit ? '✓ ' + t('aiChatbot.createLandingWithOptions') : answers.formFields === 'custom' ? t('aiChatbot.enterFieldNameToContinue') : t('aiChatbot.selectAllAbove')}
      </button>
    </div>
  );
};

// Ask audience card - hỏi user chọn đối tượng khách hàng
export const AskAudienceCard = ({ data, onSelect, t }) => {
  if (!data?.campaignOptions) return null;

  return (
    <div className="mt-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <HiOutlineSparkles className="w-5 h-5 text-purple-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-purple-600">{t('aiChatbot.selectAudience')}</span>
      </div>
      {data.campaignName && (
        <h4 className="font-bold text-slate-900 text-sm mb-1">{data.campaignName}</h4>
      )}
      {data.description && (
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">{data.description}</p>
      )}
      <p className="text-xs text-slate-600 mb-3">{t('aiChatbot.sendToAudience')}</p>
      <div className="space-y-2">
        {data.campaignOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
              style={{
                backgroundColor: option.value === 'all' ? '#e0e7ff' : option.value === 'has_email' ? '#fff7ed' : '#eff6ff'
              }}
            >
              {option.value === 'all' ? '👥' : option.value === 'has_email' ? '📧' : '💬'}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800 group-hover:text-purple-700">{option.label}</p>
              <p className="text-[10px] text-slate-500">{option.description}</p>
            </div>
            <HiOutlineChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-500" />
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-3">
        {t('aiChatbot.zaloGroupNote').replace(/\*\*/g, '')}
      </p>
    </div>
  );
};

// Campaign Draft Editor - Chỉnh sửa draft ngay trong chatbot
export const CampaignDraftEditor = ({ script, onSave, onCancel, t }) => {
  // AI có thể trả về nodes hoặc summary.steps
  const rawNodes = script?.nodes || [];
  const rawSteps = script?.summary?.steps || [];
  
  const [editedScript, setEditedScript] = useState({
    campaignName: script?.campaignName || '',
    description: script?.description || '',
    nodes: rawNodes,
    connections: script?.connections || [],
    // Lưu steps để hiển thị
    steps: rawSteps,
  });
  const [activeTab, setActiveTab] = useState('basic'); // 'basic' | 'nodes'

  // Get action nodes (non-trigger) - mở rộng điều kiện lọc
  const actionNodes = editedScript.nodes.filter(n => {
    if (!n) return false;
    const type = n.nodeType || '';
    const subtype = n.nodeSubtype || n.subtype || '';
    return type === 'action' || type === 'send_email' || type === 'send_zalo_personal' || 
           type === 'send_zalo_group' || subtype.includes('send_') || 
           subtype.includes('email') || subtype.includes('zalo');
  });

  // Nếu không có nodes thì dùng steps
  const displayItems = actionNodes.length > 0 ? actionNodes : editedScript.steps;

  const handleNodeConfigChange = (tempId, field, value) => {
    setEditedScript(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.tempId === tempId || node.id === tempId
          ? { ...node, config: { ...node.config, [field]: value } }
          : node
      )
    }));
  };

  const handleNodeNameChange = (tempId, name) => {
    setEditedScript(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.tempId === tempId || node.id === tempId
          ? { ...node, nodeName: name }
          : node
      )
    }));
  };

  const getNodeIcon = (node) => {
    const subtype = node.nodeSubtype || node.subtype || '';
    if (subtype.includes('email')) return '📧';
    if (subtype.includes('zalo_personal') || subtype === 'zalo') return '💬';
    if (subtype.includes('zalo_group') || subtype === 'zalo_group') return '👥';
    return '⚡';
  };

  const handleSave = () => {
    onSave(editedScript);
  };

  return (
    <div className="mt-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-orange-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HiOutlinePencilAlt className="w-5 h-5" />
            <span className="font-black text-[10px] uppercase tracking-[0.2em]">{t('aiChatbot.editDraft')}</span>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-orange-400 rounded-lg">
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-orange-100">
        <button
          onClick={() => setActiveTab('basic')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'basic' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-slate-400'
          }`}
        >
          📝 {t('aiChatbot.basic')}
        </button>
        <button
          onClick={() => setActiveTab('nodes')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'nodes' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-slate-400'
          }`}
        >
          📋 {t('aiChatbot.nodes')} ({displayItems.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'basic' && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {t('aiChatbot.campaignName')}
              </label>
              <input
                type="text"
                value={editedScript.campaignName}
                onChange={(e) => setEditedScript(prev => ({ ...prev, campaignName: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 outline-none"
                placeholder={t('aiChatbot.enterCampaignName')}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                {t('aiChatbot.description')}
              </label>
              <textarea
                value={editedScript.description}
                onChange={(e) => setEditedScript(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-orange-400 focus:ring-1 focus:ring-orange-400/20 outline-none resize-none"
                rows={3}
                placeholder={t('aiChatbot.enterDescription')}
              />
            </div>
          </div>
        )}

        {activeTab === 'nodes' && (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {displayItems.length > 0 ? displayItems.map((item, i) => {
              const isStep = item.step !== undefined; // Là step hay node
              const nodeId = item.tempId || item.id || i;
              return (
                <div key={nodeId} className="bg-white rounded-lg p-3 border border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{isStep ? '📝' : getNodeIcon(item)}</span>
                    <span className="text-xs font-bold text-slate-600">{t('aiChatbot.step')} {item.step || i + 1}</span>
                    <span className="text-[10px] text-slate-400">
                      {isStep ? (item.action || '') : (item.nodeSubtype || item.subtype || 'action')}
                    </span>
                  </div>
                  {isStep ? (
                    // Hiển thị step (text-only)
                    <div className="space-y-1">
                      <p className="text-xs text-slate-700">{item.action || item.description || ''}</p>
                      <p className="text-[10px] text-slate-400">{item.timing || ''}</p>
                    </div>
                  ) : (
                    // Hiển thị node
                    <>
                      <input
                        type="text"
                        value={item.nodeName || ''}
                        onChange={(e) => handleNodeNameChange(nodeId, e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs mb-2 focus:border-orange-400 outline-none"
                        placeholder={t('aiChatbot.nodeName')}
                      />
                      {/* Email config */}
                      {(item.nodeSubtype || item.subtype || '').includes('email') && (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={item.config?.emailSubject || ''}
                            onChange={(e) => handleNodeConfigChange(nodeId, 'emailSubject', e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:border-orange-400 outline-none"
                            placeholder={t('aiChatbot.emailSubject')}
                          />
                        </div>
                      )}
                      {/* Zalo config */}
                      {(item.nodeSubtype || item.subtype || '').includes('zalo') && (
                        <textarea
                          value={item.config?.message || ''}
                          onChange={(e) => handleNodeConfigChange(nodeId, 'message', e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs resize-none focus:border-orange-400 outline-none"
                          rows={3}
                          placeholder={t('aiChatbot.zaloMessage')}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            }) : (
              <p className="text-xs text-slate-400 text-center py-4">{t('aiChatbot.noNodesToEdit')}</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-white/50 border-t border-orange-100 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 bg-slate-100 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-slate-200 transition-colors"
        >
          {t('aiChatbot.cancelAction')}
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 bg-orange-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-orange-600 transition-colors"
        >
          {t('aiChatbot.saveChanges')}
        </button>
      </div>
    </div>
  );
};

// Confirm create card - hiển thị summary và hỏi xác nhận
export const ConfirmCreateCard = ({ script, onConfirm, onEdit, onCancel, t }) => {
  const summary = script?.summary || {};
  const steps = summary.steps || [];
  
  return (
    <div className="mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-emerald-500 text-white">
        <div className="flex items-center gap-2 mb-2">
          <HiOutlineSparkles className="w-5 h-5" />
          <span className="font-black text-[10px] uppercase tracking-[0.2em]">{t('aiChatbot.confirmCreateCampaign')}</span>
        </div>
        <h4 className="font-bold text-lg">{script?.campaignName}</h4>
        {script?.description && (
          <p className="text-xs text-emerald-100 mt-1">{script.description}</p>
        )}
      </div>
      
      {/* Summary stats */}
      <div className="p-4 border-b border-emerald-100">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-lg font-black text-emerald-700">{summary.totalSteps || script?.nodes?.length || 0}</p>
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">{t('aiChatbot.steps')}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-lg font-black text-emerald-700">{summary.duration || 'N/A'}</p>
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">{t('aiChatbot.duration')}</p>
          </div>
          <div className="bg-white/60 rounded-lg p-2 text-center">
            <p className="text-lg font-black text-emerald-700">
              {script?.campaignType === 'email' ? '📧' : 
               script?.campaignType === 'zalo' ? '💬' : 
               script?.campaignType === 'zalo_group' ? '👥' : '📱'}
            </p>
            <p className="text-[10px] text-emerald-600 uppercase tracking-wider">
              {script?.campaignType === 'email' ? 'Email' : 
               script?.campaignType === 'zalo' ? 'Zalo' : 
               script?.campaignType === 'zalo_group' ? t('aiChatbot.zaloGroup') : t('aiChatbot.multiChannel')}
            </p>
          </div>
        </div>
      </div>
      
      {/* Steps preview */}
      <div className="p-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{t('aiChatbot.stepsLabel')}</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {steps.length > 0 ? steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                {step.step}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-700">{step.action}</p>
                <p className="text-[10px] text-slate-400">{step.timing}</p>
              </div>
            </div>
          )) : (
            script?.nodes?.filter(n => n.nodeType !== 'trigger' && n.nodeType !== 'start').slice(0, 5).map((node, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-700">{node.nodeName || node.nodeSubtype}</p>
                  <p className="text-[10px] text-slate-400">
                    {node.nodeType === 'action' ? (
                      node.nodeSubtype === 'send_email' ? '📧 Email' :
                      node.nodeSubtype === 'send_zalo_personal' ? '💬 ' + t('aiChatbot.zaloPersonal') :
                      node.nodeSubtype === 'send_zalo_group' ? '👥 ' + t('aiChatbot.zaloGroup') :
                      node.nodeSubtype === 'delay' || node.nodeSubtype === 'wait_time' ? '⏰ ' + t('aiChatbot.delay') :
                      '⚡ ' + t('aiChatbot.action')
                    ) : node.nodeType === 'logic' ? '⏰ ' + t('aiChatbot.delay') : '▶️ ' + t('aiChatbot.step')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Actions */}
      <div className="p-4 bg-white/50 border-t border-emerald-100">
        <div className="space-y-2">
          <button 
            onClick={onConfirm}
            className="w-full py-3 bg-emerald-500 text-white font-black text-sm uppercase tracking-widest rounded-xl hover:bg-emerald-600 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30"
          >
            <HiOutlineCheck className="w-5 h-5" />
            {t('aiChatbot.createCampaignBtn')}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onEdit}
              className="py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1.5"
            >
              <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" />
              {t('aiChatbot.editCampaign')}
            </button>
            <button
              onClick={onCancel}
              className="py-2.5 bg-slate-50 border border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5"
            >
              {t('aiChatbot.cancelAction')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Auto-creating campaign progress card
export const AutoCreatingCard = ({ campaignName, onView, t }) => (
  <div className="mt-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center animate-pulse">
        <HiOutlinePlay className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-green-800">{t('aiChatbot.creatingCampaign')}</p>
        <p className="text-xs text-green-600">{campaignName}</p>
      </div>
    </div>
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 h-2 bg-green-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 rounded-full animate-pulse w-full" />
      </div>
    </div>
    <p className="text-xs text-green-700 mb-3">{t('aiChatbot.autoCreateNotice')}</p>
    {onView && (
      <button
        onClick={onView}
        className="w-full py-2.5 bg-green-500 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-green-600 flex items-center justify-center gap-2"
      >
        <HiOutlineTerminal className="w-4 h-4" />
        {t('aiChatbot.viewCampaign')}
      </button>
    )}
  </div>
);

// Success card after auto-creating campaign
export const AutoCreatedSuccessCard = ({ result, onView, t }) => (
  <div className="mt-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
        <HiOutlineCheck className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-green-800">{t('aiChatbot.campaignRunning')}</p>
        <p className="text-xs text-green-600">{result.campaignName}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mb-3">
      <div className="bg-white/60 rounded-lg p-2">
        <p className="text-[10px] text-green-600 uppercase tracking-wider">{t('aiChatbot.campaignId')}</p>
        <p className="text-sm font-bold text-green-800">#{result.campaignId}</p>
      </div>
      {result.runId && (
        <div className="bg-white/60 rounded-lg p-2">
          <p className="text-[10px] text-green-600 uppercase tracking-wider">{t('aiChatbot.runId')}</p>
          <p className="text-sm font-bold text-green-800">#{result.runId}</p>
        </div>
      )}
    </div>
    <div className="flex items-center gap-2 text-xs text-green-700 mb-3">
      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      <span>{t('aiChatbot.sendingMessages')}</span>
    </div>
    {onView && (
      <button
        onClick={onView}
        className="w-full py-2.5 bg-white border border-green-300 text-green-700 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-green-50 flex items-center justify-center gap-2"
      >
        <HiOutlineTerminal className="w-4 h-4" />
        {t('aiChatbot.viewCampaign')}
      </button>
    )}
  </div>
);

// Campaign picker modal
export const CampaignPickerModal = ({ isOpen, onClose, onSelect, t }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoadingCampaigns(true);
      api.get('/campaigns', { params: { status: 'draft,active,paused', limit: 50 } })
        .then(res => setCampaigns(res.data.data || []))
        .catch(() => setCampaigns([]))
        .finally(() => setLoadingCampaigns(false));
    }
  }, [isOpen]);

  const filtered = campaigns.filter(c =>
    c.campaignName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <HiOutlineFolderOpen className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-slate-800">{t('aiChatbot.selectCampaign')}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-4 border-b border-slate-100">
          <input
            type="text"
            placeholder={t('aiChatbot.searchCampaignPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingCampaigns ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">{t('aiChatbot.noCampaigns')}</p>
          ) : (
            <div className="space-y-1">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-left transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    c.campaignType === 'email' ? 'bg-orange-100 text-orange-600' :
                    c.campaignType === 'zalo' ? 'bg-blue-100 text-blue-600' :
                    c.campaignType === 'zalo_group' ? 'bg-purple-100 text-purple-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    {c.campaignType?.charAt(0).toUpperCase() || 'M'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.campaignName}</p>
                    <p className="text-[10px] text-slate-400">{c.campaignType} • {c.status}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
