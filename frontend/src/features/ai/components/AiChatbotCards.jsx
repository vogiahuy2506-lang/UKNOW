import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  HiOutlineSparkles, HiOutlineX, HiOutlineChevronRight, HiOutlinePlay,
  HiOutlineTerminal, HiOutlinePencilAlt, HiOutlineCheck, HiOutlineQuestionMarkCircle,
  HiOutlineMail, HiOutlineChat, HiOutlineFolderOpen, HiOutlineGlobeAlt, HiOutlinePaperClip,
  HiOutlineDocumentText, HiOutlineSearch, HiOutlineExclamationCircle, HiOutlineLightningBolt,
} from 'react-icons/hi';
import api from '../../../services/api';
import aiApi from '../../../services/aiApi';
import templateLabelApiService from '../../templates/services/templateLabelApi.service';
import { foldDiacritics } from '../utils/foldDiacritics.js';
import { isValidGoogleSheetUrl } from '../utils/googleSheetUrl.js';
import {
  isOtherProductDescriptionValid,
  isOtherProductNameValid,
} from '../utils/landingBrief.js';
import {
  isCampaignBriefAnswersValid,
  isProductDescriptionValid,
  isProductNameValid,
  isTopicTextValid,
  PRODUCT_DESC_MAX,
  PRODUCT_NAME_MAX,
  TOPIC_MAX,
  buildCampaignBriefSummaryLine,
} from '../utils/campaignBrief.js';

// Đổi ký hiệu LaTeX model hay chèn (vd "$\rightarrow$") thành mũi tên thường.
function deLatexArrows(s) {
  return String(s)
    .replace(/\$\s*\\(?:rightarrow|longrightarrow|to|Rightarrow|mapsto)\s*\$/g, '→')
    .replace(/\\(?:rightarrow|longrightarrow)\b/g, '→')
    .replace(/\\to\b/g, '→');
}

// Model đôi khi bịa tên miền (vd founder.ai) cho link hướng dẫn — ép về path tương đối chuẩn.
function normalizeHref(href) {
  const guide = href.match(/huong-dan\/[A-Za-z0-9-]+/);
  if (guide) return `/${guide[0]}`;
  const app = href.match(/\/app\/[A-Za-z0-9/-]+/);
  if (app) return app[0];
  return href;
}

// Link tô xanh, LUÔN mở tab mới để không mất đoạn chat trợ lý.
function InlineLink({ href, children }) {
  return (
    <a
      href={normalizeHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-700 break-words"
    >
      {children}
    </a>
  );
}

// Tách một đoạn thành **đậm**, [nhãn](url), email@domain và text thường.
const INLINE_RE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

// Email regex - detect plain email addresses not already in markdown link format
const EMAIL_RE = /(?<![a-zA-Z0-9@.])([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?![a-zA-Z0-9@])/g;

// Render AI message content — convert basic markdown to JSX
export function AiContent({ text }) {
  if (!text) return null;
  const lines = deLatexArrows(text).split('\n');
  const renderInline = (str, baseKey) =>
    str.split(INLINE_RE).map((part, j) => {
      const key = `${baseKey}-${j}`;
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        return <InlineLink key={key} href={link[2]}>{link[1]}</InlineLink>;
      }
      // Convert plain email addresses to mailto links
      const segments = part.split(EMAIL_RE);
      if (segments.length > 1) {
        return segments.map((seg, k) => {
          if (seg.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
            return (
              <a
                key={`${key}-email-${k}`}
                href={`mailto:${seg}`}
                className="text-blue-600 underline hover:text-blue-700 break-words"
              >
                {seg}
              </a>
            );
          }
          return seg;
        });
      }
      return part;
    });
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
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    templateLabelApiService.getLabels()
      .then((res) => setLabels(res.data?.data ?? []))
      .catch(() => setLabels([]));
  }, []);

  const categories = labels && labels.length > 0
    ? labels.map((l) => ({ id: l.name, name: l.name, color: l.color }))
    : DEFAULT_CATEGORIES(t);

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error(t('aiChatbot.newCategoryEmpty') || 'Bạn nhập tên danh mục trước nhé.');
      return;
    }
    setCreatingCategory(true);
    try {
      await templateLabelApiService.createLabel({ name });
      onSelect(name);
    } catch (e) {
      if (e.response?.status === 409) {
        // Nhãn đã tồn tại — dùng luôn để lưu template
        onSelect(name);
      } else {
        toast.error(e.response?.data?.message || t('aiChatbot.createCategoryFailed') || 'Không tạo được danh mục.');
      }
    } finally {
      setCreatingCategory(false);
    }
  };

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
          {!showNewCategoryInput && (
            <button
              onClick={() => setShowNewCategoryInput(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full border border-dashed border-orange-300 text-orange-600 bg-white transition-all hover:bg-orange-100"
            >
              ＋ {t('aiChatbot.createNewCategory') || 'Tạo danh mục mới'}
            </button>
          )}
        </div>
      )}
      {showNewCategoryInput && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory(); } }}
            placeholder={t('aiChatbot.newCategoryPlaceholder') || 'Tên danh mục mới...'}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-orange-400 focus:outline-none"
          />
          <button
            onClick={handleCreateCategory}
            disabled={creatingCategory}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingCategory
              ? (t('aiChatbot.saving') || 'Đang lưu...')
              : (t('aiChatbot.createCategoryAndSave') || 'Tạo & lưu')}
          </button>
        </div>
      )}
      <button onClick={onCancel} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600">{t('aiChatbot.cancel')}</button>
    </div>
  );
};

// Template preview card
export const TemplateDraftCard = ({ draft, onSave, onEdit, onUseExisting, t, autoSaveCategory = null, fromLibrary = false, externallySaved = false }) => {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isSaved = saved || externallySaved;

  useEffect(() => {
    setSaved(false);
    setShowCategoryPicker(false);
  }, [draft?.templateName, draft?.subject, draft?.bodyHtml, draft?.bodyText, draft?.channel, draft?._planSlotKey]);

  const isLibraryTemplate = fromLibrary || Boolean(draft?._fromLibrary);
  const libraryTemplateId = draft?._libraryTemplateId;

  const handleSave = async (category) => {
    if (isLibraryTemplate && libraryTemplateId) {
      setSaved(true);
      onSave?.({
        id: libraryTemplateId,
        templateName: draft.templateName,
        subject: draft.subject || '',
        bodyHtml: draft.bodyHtml || '',
        bodyText: draft.bodyText || '',
      });
      toast.success(t('aiChatbot.templateLinked') || 'Đã gắn template vào kế hoạch.');
      return;
    }
    setSaving(true);
    setShowCategoryPicker(false);
    try {
      const endpoint = draft.channel === 'email' ? '/email-templates' : '/zalo-templates';
      const response = await api.post(endpoint, {
        templateName: draft.templateName,
        subject: draft.subject || '',
        bodyHtml: draft.bodyHtml || '',
        bodyText: draft.bodyText || '',
        category,
        variables: [],
      });
      const savedTemplate = response?.data?.data || null;
      setSaved(true);
      toast.success(t('aiChatbot.templateSaved'));
      onSave?.(savedTemplate);
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
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isSaved) return;
                  if (isLibraryTemplate) {
                    handleSave();
                    return;
                  }
                  if (autoSaveCategory) {
                    handleSave(autoSaveCategory);
                  } else {
                    setShowCategoryPicker(true);
                  }
                }}
                disabled={saving || isSaved}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:cursor-default ${
                  isSaved
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60'
                }`}
              >
                <HiOutlineCheck className="w-4 h-4" />
                {isSaved
                  ? (t('aiChatbot.savedToLibrary') || 'Đã lưu')
                  : (saving
                    ? (t('aiChatbot.saving') || 'Đang lưu...')
                    : (isLibraryTemplate
                      ? (t('aiChatbot.confirmUseTemplate') || 'Xác nhận dùng template này')
                      : (t('aiChatbot.saveToLibrary') || 'Lưu vào thư viện')))}
              </button>
              <button
                onClick={() => onEdit?.(draft)}
                className="flex-1 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-black rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-all"
              >
                <HiOutlinePencilAlt className="w-4 h-4 text-orange-500" />
                {t('aiChatbot.edit')}
              </button>
            </div>
            {typeof onUseExisting === 'function' && !isSaved && (
              <button
                type="button"
                onClick={() => onUseExisting(draft)}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-black text-slate-700 transition-all hover:border-orange-300 hover:bg-orange-50"
              >
                {t('aiChatbot.useExistingTemplate') || 'Dùng mẫu có sẵn'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ContentPlanCard = ({ data, workflow, approvalMode = false, t }) => {
  const days = Array.isArray(data?.days) ? data.days : [];
  const totalDays = data?.totalDays || days.length;
  if (!days.length) return null;

  const channelIcon = (channel) => (
    channel === 'email'
      ? <HiOutlineMail className="w-4 h-4 text-orange-500" />
      : <HiOutlineChat className="w-4 h-4 text-blue-500" />
  );

  const channelLabel = (channel) => {
    if (approvalMode) {
      if (channel === 'email') return t('aiChatbot.channelEmail') || 'Email';
      if (channel === 'zalo_group') return t('aiChatbot.channelZaloGroup') || 'Zalo nhóm';
      return t('aiChatbot.channelZaloPersonal') || 'Zalo cá nhân';
    }
    return channel === 'email' ? t('aiChatbot.emailTemplate') : t('aiChatbot.zaloTemplate');
  };

  const isDayCompleted = (day) => workflow?.completedDays?.includes(day);
  const getSavedCount = (day) => Number(workflow?.savedCountByDay?.[String(day)] || 0);
  const getDraftCount = (day) => (
    (workflow?.draftTemplates || []).filter((item) => Number(item._planDay) === Number(day)).length
  );
  const pendingDay = workflow?.pendingDay ?? null;
  const failedDay = workflow?.failedDay ?? null;
  const generatingDay = workflow?.generatingDay ?? null;

  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100">
        <HiOutlineSparkles className="w-5 h-5 text-blue-500" />
        <div className="min-w-0">
          <span className="text-[11px] font-black uppercase tracking-widest text-blue-600">
            {t('aiChatbot.contentPlanTitle', { count: totalDays })}
          </span>
          {approvalMode && (
            <p className="mt-0.5 text-[11px] font-medium text-blue-700/80">
              {t('aiChatbot.contentPlanApprovalSubtitle')}
            </p>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {days.map((dayItem) => {
          const day = Number(dayItem.day) || dayItem.day;
          const loading = generatingDay === day;
          const completed = isDayCompleted(day);
          const draftCount = getDraftCount(day);
          const savedCount = getSavedCount(day);
          const waitingForSave = draftCount > savedCount && !completed;
          const actionable = pendingDay === day && !loading && !waitingForSave;
          const waiting = !completed && !actionable && !loading;
          const isRetry = failedDay === day;
          const slots = Array.isArray(dayItem.slots) ? dayItem.slots : [];
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
                  {slots.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {slots.map((slot, idx) => (
                        <p key={`${day}-slot-${slot.slotId || idx}`} className="text-[11px] text-slate-500">
                          #{slot.slotIndex || idx + 1}
                          {slot.sendTime ? ` • ${slot.sendTime}` : ''}
                          {slot.summary ? ` • ${slot.summary}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                {!approvalMode && (
                <span className={`shrink-0 inline-flex items-center rounded-xl px-3 py-2 text-xs font-black ${
                  completed
                    ? 'bg-emerald-100 text-emerald-700'
                    : loading
                      ? 'bg-blue-100 text-blue-700'
                      : isRetry
                        ? 'bg-rose-100 text-rose-700'
                        : actionable
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-slate-200 text-slate-500'
                }`}
                >
                  {completed
                    ? `Đã lưu ${savedCount} template`
                    : loading
                      ? t('aiChatbot.generatingTemplate')
                      : isRetry
                        ? 'Cần thử lại'
                        : waitingForSave
                          ? `Chờ lưu ${draftCount - savedCount} template`
                        : actionable
                          ? 'Sẵn sàng'
                          : 'Chờ'}
                </span>
                )}
              </div>
              {!approvalMode && waiting && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Hãy hoàn tất Ngày {pendingDay} trước.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ContentPlanActionsCard = ({
  data,
  workflow,
  approvalMode = false,
  onApprove,
  onRevise,
  onGenerateAll,
  onUseExisting,
  t,
}) => {
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reviseText, setReviseText] = useState('');
  const [submittingRevise, setSubmittingRevise] = useState(false);
  const firstDay = Number(data?.firstDay || workflow?.pendingDay);
  const busy = workflow?.generatingDay !== null || Boolean(workflow?.isGeneratingAll) || submittingRevise;

  const handleReviseSubmit = async () => {
    const trimmed = reviseText.trim();
    if (!trimmed) {
      toast.error(t('aiChatbot.planReviseEmpty') || 'Bạn ghi góp ý cần chỉnh trước nhé.');
      return;
    }
    setSubmittingRevise(true);
    try {
      await onRevise(trimmed);
      setReviseOpen(false);
      setReviseText('');
    } finally {
      setSubmittingRevise(false);
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy || !firstDay}
          className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approvalMode
            ? (t('aiChatbot.planApproveButton') || 'Đồng ý — soạn từng ngày một')
            : (t('aiChatbot.planApproveStartDay') || 'Đồng ý — tạo template Ngày 1')}
        </button>
        <button
          type="button"
          onClick={() => setReviseOpen((open) => !open)}
          disabled={busy}
          className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-all hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('aiChatbot.planReviseButton') || 'Chỉnh lại kế hoạch'}
        </button>
        {!approvalMode && (
        <button
          type="button"
          onClick={onUseExisting}
          disabled={busy || !firstDay || typeof onUseExisting !== 'function'}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-all hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('aiChatbot.useExistingTemplate') || 'Dùng mẫu có sẵn'}
        </button>
        )}
        <button
          type="button"
          onClick={onGenerateAll}
          disabled={busy}
          className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black text-orange-700 transition-all hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {workflow?.isGeneratingAll
            ? (t('aiChatbot.planGeneratingAll') || 'Đang tạo tất cả...')
            : (approvalMode
              ? (t('aiChatbot.planApproveGenerateAll') || 'Đồng ý — soạn tất cả các ngày 1 lượt')
              : (t('aiChatbot.planGenerateAllDays') || 'Tạo 1 lúc tất cả các ngày'))}
        </button>
      </div>

      {!reviseOpen && (
        <p className="text-[11px] text-slate-500">
          {approvalMode
            ? (t('aiChatbot.planApprovalNextStep') || 'Cả 2 nút «Đồng ý» đều duyệt kế hoạch — khác nhau ở cách soạn template: soạn lần lượt từng ngày để bạn duyệt từng tin, hoặc soạn sẵn tất cả các ngày trong 1 lượt.')
            : (t('aiChatbot.planReviseTeaser') || 'Kế hoạch chưa ổn? Bấm «Chỉnh lại kế hoạch» để ghi góp ý.')}
        </p>
      )}

      {reviseOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">
            {t('aiChatbot.planReviseHint') || 'Ghi ngắn gọn phần cần đổi (ngày nào, giờ gửi, nội dung, số tin...):'}
          </p>
          <textarea
            value={reviseText}
            onChange={(event) => setReviseText(event.target.value)}
            rows={3}
            placeholder={t('aiChatbot.planRevisePlaceholder') || 'Ví dụ: Ngày 2 gửi 9h thay vì 8h, Ngày 4 nhắc ưu đãi thay vì chào hỏi...'}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleReviseSubmit}
              disabled={busy}
              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white transition-all hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('aiChatbot.planReviseSubmit') || 'Gửi góp ý chỉnh kế hoạch'}
            </button>
            <button
              type="button"
              onClick={() => { setReviseOpen(false); setReviseText(''); }}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition-all hover:bg-slate-50"
            >
              {t('common.cancel') || 'Hủy'}
            </button>
          </div>
        </div>
      )}
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
export const AskCampaignTypeCard = ({ data, onSelect, onDismiss, isActive = true, t }) => {
  if (!data?.campaignOptions) return null;

  return (
    <div className={`mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
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
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 transition-colors"
        >
          {t('aiChatbot.wizardDismiss') || 'Không phải, tôi chỉ hỏi thôi'}
        </button>
      )}
    </div>
  );
};

// Ask campaign details - hỏi gộp tất cả câu hỏi cần thiết trong 1 lần
export const AskCampaignDetailsCard = ({
  data,
  onSubmit,
  onDismiss,
  onAttachClick,
  uploadedFiles = [],
  onRemoveFile,
  onShowingFilesChange,
  isActive = true,
  t,
}) => {
  const [answers, setAnswers] = useState(() => {
    const preferred = data?.preferredContentMode;
    return preferred ? { campaignBrief: preferred } : {};
  });
  const [emailChoice, setEmailChoice] = useState(null); // 'new' | 'existing'
  const [emailTemplateName, setEmailTemplateName] = useState('');
  const [manualRecipients, setManualRecipients] = useState('');
  const [productName, setProductName] = useState(data.defaults?.productName || '');
  const [productDescription, setProductDescription] = useState(data.defaults?.productDescription || '');
  const [topicText, setTopicText] = useState(data.defaults?.topicText || '');
  const [sheetUrl, setSheetUrl] = useState(data.defaults?.sheetUrl || answers.sheetUrl || '');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [extractedRecipients, setExtractedRecipients] = useState(null);
  const [isExtractingRecipients, setIsExtractingRecipients] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [showSampleRows, setShowSampleRows] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState(() => {
    if (Array.isArray(answers.campaignProductIds) && answers.campaignProductIds.length > 0) {
      return answers.campaignProductIds;
    }
    if (answers.campaignProduct && answers.campaignProduct !== 'other') {
      return [answers.campaignProduct];
    }
    return [];
  });

  useEffect(() => {
    const spreadsheetFile = (uploadedFiles || []).find((f) => {
      const name = String(f.name || f.originalName || '').toLowerCase();
      return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
    });

    if (answers.dataSource === 'sheet') {
      if (spreadsheetFile && spreadsheetFile.tempId) {
        setIsExtractingRecipients(true);
        setExtractError(null);
        aiApi.extractRecipients({
          tempId: spreadsheetFile.tempId,
          originalName: spreadsheetFile.name || spreadsheetFile.originalName,
          contentType: spreadsheetFile.contentType,
        })
          .then((res) => {
            if (res?.data) {
              setExtractedRecipients(res.data);
            }
          })
          .catch((err) => {
            setExtractError(err.response?.data?.message || err.message || 'Không thể đọc danh sách người nhận từ tệp');
          })
          .finally(() => {
            setIsExtractingRecipients(false);
          });
      } else if (isValidGoogleSheetUrl(sheetUrl)) {
        const timer = setTimeout(() => {
          setIsExtractingRecipients(true);
          setExtractError(null);
          aiApi.extractRecipients({
            sheetUrl: sheetUrl.trim(),
          })
            .then((res) => {
              if (res?.data) {
                setExtractedRecipients(res.data);
              }
            })
            .catch((err) => {
              setExtractError(err.response?.data?.message || err.message || 'Không thể đọc danh sách người nhận từ Google Sheet');
            })
            .finally(() => {
              setIsExtractingRecipients(false);
            });
        }, 500);
        return () => clearTimeout(timer);
      } else {
        setExtractedRecipients(null);
        setExtractError(null);
      }
    } else {
      setExtractedRecipients(null);
      setExtractError(null);
    }
  }, [uploadedFiles, answers.dataSource, sheetUrl]);

  const questions = data?.questions || [];
  const isWizardQuestion = questions.some((q) => q.wizardGate);
  const effectiveChannel = data?.channel || answers.channel || data?.wizardState?.channel || 'zalo';
  const isEmailChannel = effectiveChannel === 'email';
  const isZaloChannel = effectiveChannel === 'zalo' || effectiveChannel === 'zalo_group';
  const emailChoiceRequired = isEmailChannel && !isWizardQuestion;
  const emailTemplateRequired = isEmailChannel && emailChoice === 'existing';
  const manualRecipientsRequired = answers.dataSource === 'manual';
  const briefQuestion = questions.find((q) => q.inputType === 'campaign_brief' || q.wizardGate === 'campaignBrief');

  const isScheduleQuestion = (question) => question.wizardGate === 'schedule' || question.inputType === 'schedule';
  const isBriefQuestion = (question) => question.inputType === 'campaign_brief' || question.wizardGate === 'campaignBrief';

  const briefAnswers = {
    ...answers,
    sheetUrl,
    campaignProductIds: selectedProductIds,
    productName,
    productDescription,
    topicText,
  };

  let recipientChannelMismatch = false;
  let mismatchWarning = '';

  if (extractedRecipients && answers.dataSource === 'sheet') {
    const spreadsheetFile = (uploadedFiles || []).find((f) => {
      const name = String(f.name || f.originalName || '').toLowerCase();
      return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
    });
    const sourceName = spreadsheetFile ? `Tệp ${spreadsheetFile.name || spreadsheetFile.originalName}` : 'Google Sheet';

    if (isZaloChannel && (!extractedRecipients.phones || extractedRecipients.phones.length === 0)) {
      recipientChannelMismatch = true;
      mismatchWarning = `${sourceName} có ${extractedRecipients.rowCount} dòng nhưng không có cột số điện thoại. Chiến dịch Zalo cần SĐT để gửi. Bạn vui lòng tải tệp/sheet khác có cột SĐT, hoặc đổi kênh sang Email (${sourceName} có ${extractedRecipients.emails?.length || 0} email).`;
    } else if (isEmailChannel && (!extractedRecipients.emails || extractedRecipients.emails.length === 0)) {
      recipientChannelMismatch = true;
      mismatchWarning = `${sourceName} có ${extractedRecipients.rowCount} dòng nhưng không có cột email. Chiến dịch Email cần địa chỉ email để gửi. Bạn vui lòng tải tệp/sheet khác có cột email, hoặc đổi kênh sang Zalo (${sourceName} có ${extractedRecipients.phones?.length || 0} SĐT).`;
    }
  }

  let manualRecipientsError = null;
  if (manualRecipientsRequired && manualRecipients.trim().length > 0) {
    const rawItems = manualRecipients.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (rawItems.length === 0) {
      manualRecipientsError = 'Vui lòng nhập ít nhất một người nhận.';
    } else {
      for (const item of rawItems) {
        if (isZaloChannel) {
          if (item.includes('@')) {
            manualRecipientsError = `Kênh Zalo cần số điện thoại. '${item}' là địa chỉ email.`;
            break;
          }
          const cleaned = item.replace(/[\s().-]/g, '');
          // Kiểm tra thiếu số 0 đầu: 9 chữ số bắt đầu bằng 3, 5, 7, 8, 9
          if (/^[35789]\d{8}$/.test(cleaned)) {
            manualRecipientsError = `Số ${item} thiếu số 0 đầu — ý bạn là 0${item}?`;
            break;
          }
          // Kiểm tra đầu số di động không hợp lệ
          if (/^0[0-246]\d{7,8}$/.test(cleaned)) {
            manualRecipientsError = `Số điện thoại '${item}' không hợp lệ (cần là số di động 10 chữ số đầu 03, 05, 07, 08, 09).`;
            break;
          }
          // Kiểm tra định dạng số di động Việt Nam hợp lệ
          if (!/^(?:\+?84|0)[35789]\d{8}$/.test(cleaned)) {
            manualRecipientsError = `Số điện thoại '${item}' không hợp lệ.`;
            break;
          }
        } else if (isEmailChannel) {
          const cleaned = item.replace(/[\s().-]/g, '');
          if (/^(?:\+?84|0)\d{8,11}$/.test(cleaned)) {
            manualRecipientsError = `Kênh Email cần địa chỉ email. '${item}' là số điện thoại.`;
            break;
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) {
            manualRecipientsError = `Email '${item}' không đúng định dạng.`;
            break;
          }
        }
      }
    }
  }

  const isCardActuallyShowingFiles = Boolean(
    isActive
    && uploadedFiles.length > 0
    && (
      (questions.some(isBriefQuestion) && answers.campaignBrief === 'attached_file')
      || (questions.some((q) => q.id === 'dataSource') && answers.dataSource === 'sheet')
    )
  );

  useEffect(() => {
    if (isActive && onShowingFilesChange) {
      onShowingFilesChange(isCardActuallyShowingFiles);
    }
    return () => {
      if (isActive && onShowingFilesChange) {
        onShowingFilesChange(false);
      }
    };
  }, [isActive, isCardActuallyShowingFiles, onShowingFilesChange]);

  if (!questions.length) return null;

  const isQuestionAnswered = (question) => {
    if (isScheduleQuestion(question)) {
      if (!answers[question.id]) return false;
      if (answers[question.id] === 'drip') {
        const days = Number(answers.scheduleDays);
        const slotsPerDay = Number(answers.scheduleSlotsPerDay);
        return days >= 1 && days <= 30 && slotsPerDay >= 1 && slotsPerDay <= 5;
      }
      return true;
    }
    if (isBriefQuestion(question)) {
      return isCampaignBriefAnswersValid(briefAnswers, question);
    }
    if (question.id === 'dataSource') {
      if (answers.dataSource === 'sheet') {
        return isValidGoogleSheetUrl(sheetUrl) || (uploadedFiles && uploadedFiles.length > 0);
      }
      if (answers.dataSource === 'manual') {
        return manualRecipients.trim().length > 0 && !manualRecipientsError;
      }
    }
    return Boolean(answers[question.id]);
  };

  /**
   * "Dùng dữ liệu từ file đính kèm": bắt buộc có tệp đính kèm.
   * "File Excel / Google Sheet": có thể dán link Google Sheet hợp lệ HOẶC tải tệp đính kèm.
   */
  const attachedFileRequired = questions.some(isBriefQuestion)
    && answers.campaignBrief === 'attached_file';

  const sheetSourceRequired = answers.dataSource === 'sheet';
  const hasValidSheetUrl = isValidGoogleSheetUrl(sheetUrl);
  const hasUploadedFile = uploadedFiles && uploadedFiles.length > 0;
  const sheetSourceValid = !sheetSourceRequired || hasValidSheetUrl || hasUploadedFile;

  const allAnswered =
    data.questions.every(isQuestionAnswered) &&
    (!emailChoiceRequired || emailChoice !== null) &&
    (!emailTemplateRequired || emailTemplateName.trim().length > 0) &&
    (!manualRecipientsRequired || (manualRecipients.trim().length > 0 && !manualRecipientsError)) &&
    (!attachedFileRequired || hasUploadedFile) &&
    sheetSourceValid &&
    !recipientChannelMismatch &&
    !manualRecipientsError &&
    !extractError;

  const toggleProduct = (productId) => {
    if (productId === 'other') {
      setSelectedProductIds([]);
      pick('campaignProduct', 'other');
      return;
    }
    if (answers.campaignProduct === 'other') {
      setProductName('');
      setProductDescription('');
    }
    setSelectedProductIds((prev) => {
      const exists = prev.includes(productId);
      const next = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
      setAnswers((a) => ({
        ...a,
        campaignProductIds: next,
        campaignProduct: next.length === 1 ? next[0] : (next.length > 1 ? next[0] : undefined),
      }));
      return next;
    });
  };

  const pick = (qId, val) => setAnswers((prev) => {
    const next = { ...prev, [qId]: val };
    if (qId === 'schedule' && val === 'drip') {
      const scheduleQuestion = data.questions.find((question) => question.id === 'schedule');
      next.scheduleDays = prev.scheduleDays || String(scheduleQuestion?.defaults?.days || 3);
      next.scheduleSlotsPerDay = prev.scheduleSlotsPerDay || String(scheduleQuestion?.defaults?.slotsPerDay || 1);
    }
    if (qId === 'campaignBrief') {
      delete next.campaignProduct;
      delete next.campaignProductIds;
      setSelectedProductIds([]);
      setProductSearchQuery('');
      setProductName('');
      setProductDescription('');
      setTopicText('');
    }
    if (qId === 'campaignProduct' && val !== 'other') {
      setProductName('');
      setProductDescription('');
    }
    return next;
  });

  const scheduleQuestion = data.questions.find((q) => isScheduleQuestion(q));
  const dripDays = Number(answers.scheduleDays);
  const dripSlotsPerDay = Number(answers.scheduleSlotsPerDay);
  const isDripSchedule = scheduleQuestion && answers[scheduleQuestion.id] === 'drip';
  const otherNameInvalid = answers.campaignProduct === 'other' && !isProductNameValid(productName);
  const otherDescInvalid = answers.campaignProduct === 'other' && !isProductDescriptionValid(productDescription);
  const topicInvalid = answers.campaignBrief === 'custom_topic' && topicText.trim().length > 0 && !isTopicTextValid(topicText);

  const submitLabel = (() => {
    if (!allAnswered) {
      if (briefQuestion && answers.campaignBrief === 'single_product' && answers.campaignProduct === 'other' && otherNameInvalid) {
        return productName.trim().length === 0
          ? (t('aiChatbot.otherProductNameRequired') || 'Nhập tên sản phẩm')
          : (t('aiChatbot.otherProductNameLength') || 'Tên sản phẩm 2–160 ký tự');
      }
      if (briefQuestion && answers.campaignBrief === 'custom_topic' && !isTopicTextValid(topicText)) {
        return t('aiChatbot.campaignTopicRequired') || 'Nhập chủ đề / mục đích (2–500 ký tự)';
      }
      if (attachedFileRequired && uploadedFiles.length === 0) {
        return t('aiChatbot.attachFileRequired') || 'Đính kèm file để tiếp tục';
      }
      return t('aiChatbot.selectAllAbove');
    }
    if (isDripSchedule && dripDays >= 1 && dripSlotsPerDay >= 1) {
      return t('aiChatbot.wizardScheduleContinueDrip', {
        days: dripDays,
        slots: dripSlotsPerDay,
      }) || `Tiếp tục — ${dripDays} ngày, ${dripSlotsPerDay} tin/ngày`;
    }
    if (scheduleQuestion && answers[scheduleQuestion.id] === 'once') {
      return t('aiChatbot.wizardScheduleContinueOnce') || 'Tiếp tục — Gửi một lần';
    }
    if (briefQuestion) {
      return t('aiChatbot.campaignBriefContinue') || 'Tiếp tục';
    }
    return t('aiChatbot.createCampaignWithOptions');
  })();

  const handleSubmit = () => {
    if (!allAnswered) return;
    const lines = data.questions.map((q) => {
      if (isScheduleQuestion(q)) {
        if (answers[q.id] === 'once') return `${q.label}: Gửi một lần`;
        return `${q.label}: ${answers.scheduleDays} ngày, mỗi ngày ${answers.scheduleSlotsPerDay} tin`;
      }
      if (isBriefQuestion(q)) {
        return buildCampaignBriefSummaryLine(briefAnswers, q, t);
      }
      const opt = q.options.find((o) => o.value === answers[q.id]);
      return q.id === 'dataSource' && answers[q.id] === 'manual'
        ? `${q.label} ${opt?.label || answers[q.id]}`
        : `${q.label} ${opt?.label || answers[q.id]}`;
    });
    if (isEmailChannel) {
      if (emailChoice === 'existing') {
        lines.push(`Nội dung email: Dùng mẫu email có sẵn tên "${emailTemplateName.trim()}"`);
      } else {
        lines.push('Nội dung email: Tạo nội dung mới bằng AI');
      }
    }
    onSubmit(lines.join('\n'), {
      ...briefAnswers,
      emailChoice,
      emailTemplateName: emailTemplateName.trim(),
      directRecipients: manualRecipients.trim(),
      extractedRecipients,
    });
  };

  return (
    <div className={`mt-4 bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 space-y-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
      <div className="flex items-center gap-2">
        <HiOutlineSparkles className="w-5 h-5 text-orange-500" />
        <span className="font-black text-[10px] uppercase tracking-[0.2em] text-orange-600">
          {t('aiChatbot.designCampaign')}
        </span>
      </div>

      {data.campaignName && (
        <p className="text-sm font-bold text-slate-800">{data.campaignName}</p>
      )}

      {data.questions.map((q) => (
        <div key={q.id}>
          <p className="text-xs font-semibold text-slate-600 mb-2">{q.label}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(q.id, opt.value)}
                className={`max-w-full px-3 py-2 rounded-xl text-left text-xs font-medium border transition-all ${
                  answers[q.id] === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                }`}
              >
                <span className="font-semibold">{opt.label}</span>
                {opt.description && (
                  <span className={`mt-0.5 block text-[10px] leading-snug ${
                    answers[q.id] === opt.value ? 'text-orange-50' : 'text-slate-500'
                  }`}
                  >
                    {opt.description}
                  </span>
                )}
              </button>
            ))}
          </div>
          {isBriefQuestion(q) && answers.campaignBrief === 'single_product' && (
            <div className="mt-3 space-y-2 rounded-xl border border-orange-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-orange-800">
                  {t('aiChatbot.campaignPickProduct') || 'Chọn sản phẩm / khóa học:'}
                </p>
                {selectedProductIds.length > 0 && (
                  <span className="text-[10px] font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    Đã chọn {selectedProductIds.length}
                  </span>
                )}
              </div>

              {/* Search bar */}
              {(q.courseOptions || []).length > 3 && (
                <div className="relative">
                  <HiOutlineSearch className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm sản phẩm..."
                    className="w-full text-xs rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-slate-700 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  {productSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setProductSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}

              {/* Product list */}
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {(() => {
                  const filtered = (q.courseOptions || []).filter((opt) => {
                    if (opt.value === 'other') return true;
                    if (!productSearchQuery.trim()) return true;
                    return foldDiacritics(opt.label).includes(foldDiacritics(productSearchQuery));
                  });

                  const catalogFiltered = filtered.filter((opt) => opt.value !== 'other');
                  const otherOption = (q.courseOptions || []).find((opt) => opt.value === 'other');

                  if (productSearchQuery.trim() && catalogFiltered.length === 0) {
                    return (
                      <div className="text-center py-3 text-xs text-slate-500">
                        Không khớp «{productSearchQuery}».{' '}
                        <button
                          type="button"
                          onClick={() => setProductSearchQuery('')}
                          className="text-orange-600 hover:underline font-medium"
                        >
                          Xóa tìm kiếm
                        </button>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {catalogFiltered.map((opt) => {
                          const isSelected = selectedProductIds.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => toggleProduct(opt.value)}
                              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                              }`}
                            >
                              {isSelected && <HiOutlineCheck className="w-3.5 h-3.5 shrink-0" />}
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {otherOption && (
                        <div className="pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => toggleProduct('other')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                              answers.campaignProduct === 'other'
                                ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:bg-orange-50'
                            }`}
                          >
                            {otherOption.label || 'Khác'}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {answers.campaignProduct === 'other' && (
                <div className="space-y-2 pt-2 border-t border-orange-100">
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder={t('aiChatbot.otherProductNamePlaceholder')}
                    maxLength={PRODUCT_NAME_MAX}
                    className="w-full text-xs rounded-xl border border-orange-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  {otherNameInvalid && (
                    <p className="text-[10px] text-amber-600">
                      {productName.trim().length === 0
                        ? t('aiChatbot.otherProductNameRequired')
                        : t('aiChatbot.otherProductNameLength')}
                    </p>
                  )}
                  <textarea
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder={t('aiChatbot.otherProductDescPlaceholder')}
                    rows={2}
                    maxLength={PRODUCT_DESC_MAX}
                    className="w-full text-xs rounded-xl border border-orange-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                  {otherDescInvalid && (
                    <p className="text-[10px] text-amber-600">{t('aiChatbot.otherProductDescLength')}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {isBriefQuestion(q) && answers.campaignBrief === 'custom_topic' && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3">
              <textarea
                value={topicText}
                onChange={(e) => setTopicText(e.target.value)}
                placeholder={t('aiChatbot.campaignTopicPlaceholder') || 'Ví dụ: Email cảm ơn sau mua hàng, thông báo nghỉ lễ…'}
                rows={3}
                maxLength={TOPIC_MAX}
                className="w-full text-xs rounded-xl border border-orange-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              {topicInvalid && (
                <p className="mt-1 text-[10px] text-amber-600">
                  {t('aiChatbot.campaignTopicLength') || 'Chủ đề cần từ 2 đến 500 ký tự'}
                </p>
              )}
            </div>
          )}
          {isBriefQuestion(q) && answers.campaignBrief === 'multiple_products' && (
            <p className="mt-2 text-[11px] text-slate-500">
              {t('aiChatbot.campaignMultipleHint') || 'Sẽ dùng danh sách sản phẩm hiện có trong tài khoản để soạn nội dung.'}
            </p>
          )}
          {isBriefQuestion(q) && answers.campaignBrief === 'attached_file' && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-4 flex flex-col items-center justify-center text-center">
              <p className="text-xs text-orange-800 leading-relaxed mb-3">
                Bạn có thể bấm nút bên dưới để chọn file (Excel, Word, PDF...) chứa danh sách sản phẩm hoặc nội dung chiến dịch.
              </p>
              <button
                type="button"
                onClick={onAttachClick}
                className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-medium rounded-lg transition-colors border border-orange-300 shadow-sm"
              >
                <HiOutlinePaperClip className="w-4 h-4" />
                Chọn file đính kèm
              </button>
              {uploadedFiles && uploadedFiles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 justify-center">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-orange-200 rounded-lg text-xs text-orange-900 font-medium shadow-xs">
                      <HiOutlineDocumentText className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                      <span className="truncate max-w-[180px]">{f.name || f.originalName}</span>
                      {onRemoveFile && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }}
                          className="text-orange-400 hover:text-red-500 ml-1 p-0.5 rounded transition-colors"
                          title="Gỡ file"
                        >
                          <HiOutlineX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {q.id === 'dataSource' && answers[q.id] === 'sheet' && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-orange-900 mb-1">
                  Dán link Google Sheet:
                </label>
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full text-xs rounded-xl border border-orange-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                {sheetUrl.trim().length > 0 && !hasValidSheetUrl && (
                  <p className="mt-1 text-[10px] text-amber-600">
                    Link không đúng định dạng Google Sheet (cần có dạng https://docs.google.com/spreadsheets/...)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="h-px bg-orange-200 flex-1" />
                <span className="text-[10px] font-semibold text-orange-600 uppercase">HOẶC</span>
                <div className="h-px bg-orange-200 flex-1" />
              </div>
              <div className="flex flex-col items-center justify-center text-center">
                <p className="text-xs text-orange-800 leading-relaxed mb-2">
                  Tải lên tệp bảng tính (.xlsx, .xls, .csv) chứa danh sách người nhận:
                </p>
                <button
                  type="button"
                  onClick={onAttachClick}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 text-sm font-medium rounded-lg transition-colors border border-orange-300 shadow-sm"
                >
                  <HiOutlinePaperClip className="w-4 h-4" />
                  Chọn file đính kèm
                </button>
                {uploadedFiles && uploadedFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 justify-center">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-orange-200 rounded-lg text-xs text-orange-900 font-medium shadow-xs">
                        <HiOutlineDocumentText className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                        <span className="truncate max-w-[180px]">{f.name || f.originalName}</span>
                        {onRemoveFile && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }}
                            className="text-orange-400 hover:text-red-500 ml-1 p-0.5 rounded transition-colors"
                            title="Gỡ file"
                          >
                            <HiOutlineX className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {isExtractingRecipients && (
                  <p className="mt-2 text-xs text-orange-700 animate-pulse">
                    Đang đọc danh sách người nhận từ tệp / Google Sheet...
                  </p>
                )}
                {extractError && (
                  <p className="mt-2 text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-200">
                    {extractError}
                  </p>
                )}
                {recipientChannelMismatch && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-left text-xs text-amber-900 flex items-start gap-2">
                    <HiOutlineExclamationCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">{t('aiChatbot.recipientColumnMismatchTitle') || 'Thiếu cột dữ liệu cần thiết cho kênh gửi'}</p>
                      <p className="mt-1 text-[11px] leading-relaxed">{mismatchWarning}</p>
                    </div>
                  </div>
                )}
                {extractedRecipients && !recipientChannelMismatch && (
                  <div className="mt-3 p-3 bg-white border border-orange-200 rounded-xl text-left w-full space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-green-700 flex items-center gap-1.5">
                        <HiOutlineCheck className="w-4 h-4 text-green-600" />
                        Đã đọc {extractedRecipients.rowCount} người nhận ({extractedRecipients.emails?.length || 0} email, {extractedRecipients.phones?.length || 0} SĐT)
                      </span>
                      {extractedRecipients.sampleRows?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowSampleRows((v) => !v)}
                          className="text-[11px] text-orange-600 hover:underline font-medium"
                        >
                          {showSampleRows ? 'Ẩn' : `Xem trước ${Math.min(5, extractedRecipients.sampleRows.length)} dòng`}
                        </button>
                      )}
                    </div>
                    {showSampleRows && extractedRecipients.sampleRows?.length > 0 && (
                      <div className="border border-slate-200 rounded-lg overflow-x-auto text-[11px] bg-slate-50 p-1.5 space-y-1">
                        {extractedRecipients.sampleRows.map((row, idx) => (
                          <div key={idx} className="flex gap-2 text-slate-700">
                            <span className="font-mono text-slate-400">{idx + 1}.</span>
                            {row.name && <span className="font-medium">{row.name}</span>}
                            {row.email && <span className="text-blue-600">{row.email}</span>}
                            {row.phone && <span className="text-green-600">{row.phone}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {/*
                      Dòng bị loại phải nói thành lời. Trước đây chỉ hiện số đọc ĐƯỢC, nên một ô
                      gõ nhầm dấu phẩy làm mất người nhận mà không ai biết — người dùng tưởng bộ
                      đọc tệp hỏng. Bug thật 25/08/2026.
                    */}
                    {extractedRecipients.skipped > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
                        <p className="font-semibold">
                          Bỏ qua {extractedRecipients.skipped} dòng không dùng được
                        </p>
                        {extractedRecipients.skippedSamples?.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {extractedRecipients.skippedSamples.map((item, idx) => (
                              <li key={idx} className="flex gap-1.5">
                                <span className="text-amber-500">•</span>
                                <span className="break-all">
                                  {item.row ? `Dòng ${item.row}: ` : ''}
                                  {item.value ? (
                                    <code className="rounded bg-amber-100 px-1 font-mono">{item.value}</code>
                                  ) : (
                                    'không có email/SĐT'
                                  )}
                                  {item.reason === 'email_invalid' && ' — email sai định dạng'}
                                  {item.reason === 'phone_invalid' && ' — SĐT sai định dạng'}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {extractedRecipients.skipped > (extractedRecipients.skippedSamples?.length || 0) && (
                          <p className="mt-1 text-amber-700">
                            …và {extractedRecipients.skipped - (extractedRecipients.skippedSamples?.length || 0)} dòng khác.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {isScheduleQuestion(q) && answers[q.id] === 'drip' && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3">
              <p className="mb-2 text-xs font-semibold text-orange-800">
                {t('aiChatbot.wizardScheduleDripHint') || 'Chọn số ngày và số tin mỗi ngày cho chuỗi gửi:'}
              </p>
              <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  {t('aiChatbot.wizardScheduleDays') || 'Số ngày'}
                </span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={answers.scheduleDays || ''}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, scheduleDays: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  {t('aiChatbot.wizardScheduleSlotsPerDay') || 'Số tin mỗi ngày'}
                </span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={answers.scheduleSlotsPerDay || ''}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, scheduleSlotsPerDay: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none"
                />
              </label>
              </div>
            </div>
          )}
          {q.id === 'dataSource' && answers[q.id] === 'manual' && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-white p-3">
              <label className="block text-xs font-semibold text-slate-700">
                {t('aiChatbot.manualRecipientsLabel') || 'Email hoặc số điện thoại người nhận'}
                <textarea
                  value={manualRecipients}
                  onChange={(event) => setManualRecipients(event.target.value)}
                  rows={4}
                  placeholder={t('aiChatbot.manualRecipientsPlaceholder') || 'Dán mỗi email hoặc số điện thoại trên một dòng'}
                  className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs font-normal text-slate-700 focus:border-orange-400 focus:outline-none"
                />
              </label>
              {manualRecipientsError && (
                <p className="mt-2 text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-200">
                  {manualRecipientsError}
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      {isEmailChannel && !isWizardQuestion && (
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
        {allAnswered ? `✓ ${submitLabel}` : submitLabel}
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-1 transition-colors"
        >
          {t('aiChatbot.wizardDismiss') || 'Không phải, tôi chỉ hỏi thôi'}
        </button>
      )}
    </div>
  );
};

// Ask landing details card - hỏi gộp thông tin để tạo landing page
export const AskLandingDetailsCard = ({ data, onSubmit, isActive = true, t }) => {
  // formFields mặc định 'basic' — không bắt buộc thay đổi
  const [answers, setAnswers] = useState({ formFields: 'basic' });
  const [customFieldsText, setCustomFieldsText] = useState('');
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  if (!data?.questions?.length) return null;

  const allAnswered = data.questions.every(q => answers[q.id]);
  const otherName = productName.trim();
  const otherDesc = productDescription.trim();
  const otherNameInvalid = answers.product === 'other' && !isOtherProductNameValid(otherName);
  const otherDescInvalid = answers.product === 'other' && !isOtherProductDescriptionValid(otherDesc);
  const canSubmit = allAnswered
    && (answers.formFields !== 'custom' || customFieldsText.trim().length > 0)
    && !otherNameInvalid
    && !otherDescInvalid;

  const pick = (qId, val) => {
    setAnswers((prev) => ({ ...prev, [qId]: val }));
    if (qId === 'product' && val !== 'other') {
      setProductName('');
      setProductDescription('');
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const lines = data.questions.map(q => {
      const opt = q.options.find(o => o.value === answers[q.id]);
      if (q.id === 'product' && answers.product === 'other') {
        const desc = productDescription.trim();
        return `${q.label} ${productName.trim()}${desc ? ` — ${desc}` : ''}`;
      }
      return `${q.label} ${opt?.label || answers[q.id]}`;
    });
    if (answers.formFields === 'extended') {
      lines.push('Form thu thập thêm: Nghề nghiệp (occupation) và Lĩnh vực quan tâm (interestArea)');
    } else if (answers.formFields === 'custom' && customFieldsText.trim()) {
      lines.push(`Form thu thập thêm các trường tùy chỉnh: ${customFieldsText.trim()}`);
    }
    onSubmit(lines.join('\n'), {
      ...answers,
      customFields: customFieldsText.trim(),
      productName: answers.product === 'other' ? productName.trim() : undefined,
      productDescription: answers.product === 'other' ? (productDescription.trim() || undefined) : undefined,
    });
  };

  return (
    <div className={`mt-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4 space-y-4 ${isActive ? '' : 'opacity-60 pointer-events-none'}`}>
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
          {q.id === 'product' && answers.product === 'other' && (
            <div className="mt-2 space-y-2">
              <div>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder={t('aiChatbot.otherProductNamePlaceholder')}
                  maxLength={160}
                  className="w-full text-xs rounded-xl border border-indigo-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {otherNameInvalid && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    {otherName.length === 0
                      ? t('aiChatbot.otherProductNameRequired')
                      : t('aiChatbot.otherProductNameLength')}
                  </p>
                )}
              </div>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder={t('aiChatbot.otherProductDescPlaceholder')}
                rows={2}
                maxLength={2000}
                className="w-full text-xs rounded-xl border border-indigo-200 bg-white px-3 py-2 text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {otherDescInvalid && (
                <p className="text-[10px] text-amber-600">{t('aiChatbot.otherProductDescLength')}</p>
              )}
            </div>
          )}
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
        {canSubmit
          ? `✓ ${t('aiChatbot.createLandingWithOptions')}`
          : otherNameInvalid
            ? (otherName.length === 0
              ? t('aiChatbot.otherProductNameRequired')
              : t('aiChatbot.otherProductNameLength'))
            : otherDescInvalid
              ? t('aiChatbot.otherProductDescLength')
              : answers.formFields === 'custom'
                ? t('aiChatbot.enterFieldNameToContinue')
                : t('aiChatbot.selectAllAbove')}
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

const formatPreviewTiming = (timing, locale) => {
  const value = Number(timing?.value || 0);
  if (!value) return locale === 'en' ? 'Send immediately' : 'Gửi ngay';
  const units = locale === 'en'
    ? { minutes: 'minute', hours: 'hour', days: 'day', weeks: 'week' }
    : { minutes: 'phút', hours: 'giờ', days: 'ngày', weeks: 'tuần' };
  const unit = units[timing?.unit] || timing?.unit || (locale === 'en' ? 'day' : 'ngày');
  const label = locale === 'en' && value !== 1 ? `${unit}s` : unit;
  const anchor = timing?.anchor === 'prev'
    ? (locale === 'en' ? ' from the previous step' : ' từ bước trước')
    : (locale === 'en' ? ' from the start' : ' từ lúc bắt đầu');
  return locale === 'en' ? `After ${value} ${label}${anchor}` : `Sau ${value} ${label}${anchor}`;
};

const previewChannelLabel = (channel, locale) => {
  if (channel === 'email') return 'Email';
  if (channel === 'zalo_group') return locale === 'en' ? 'Zalo group' : 'Zalo nhóm';
  return locale === 'en' ? 'Zalo personal' : 'Zalo cá nhân';
};

// The server supplies this semantic view. Model-provided summary.steps is intentionally never rendered here.
export const ConfirmCreateCard = ({ confirmationView, onConfirm, onQuickSend, onEdit, onCancel, onRetry, isPreparing, prepareError, isActive = true, t, locale = 'vi' }) => {
  const [expandedSteps, setExpandedSteps] = useState(new Set());
  const steps = confirmationView?.steps || [];
  const blockingIssues = confirmationView?.blockingIssues || [];
  const canCreate = isActive && !isPreparing && !prepareError && confirmationView?.readyToCreate;
  const toggleStep = (key) => setExpandedSteps((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  // Điều kiện hiển thị nút Gửi nhanh:
  // - Đúng 1 bước gửi
  // - Kênh email hoặc zalo (chỉ áp dụng phone, không áp dụng UID)
  // - Người nhận thủ công (recipients.mode === 'manual')
  // - Gửi 1 lần / gửi ngay (timing anchor 'start' và value 0)
  // - Có callback onQuickSend và canCreate
  const singleStep = steps.length === 1 ? steps[0] : null;
  const isOnceTiming = singleStep?.timing
    ? (singleStep.timing.anchor === 'start' && Number(singleStep.timing.value || 0) === 0)
    : true;
  const isManualRecipient = singleStep?.recipients?.mode === 'manual';
  const isAllowedChannel = singleStep && ['email', 'zalo'].includes(singleStep.channel);
  const isPhoneRecipient = singleStep?.channel !== 'zalo' || (singleStep?.recipients?.type || 'phone') === 'phone';
  const canQuickSend = Boolean(
    canCreate &&
    onQuickSend &&
    isAllowedChannel &&
    isPhoneRecipient &&
    isManualRecipient &&
    isOnceTiming
  );

  return (
    <div className="mt-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-emerald-500 text-white">
        <div className="flex items-center gap-2 mb-2">
          <HiOutlineSparkles className="w-5 h-5" />
          <span className="font-black text-[10px] uppercase tracking-[0.2em]">{t('aiChatbot.confirmCreateCampaign')}</span>
        </div>
        <h4 className="font-bold text-lg">{confirmationView?.campaign?.name || (locale === 'en' ? 'Campaign preview' : 'Xem trước chiến dịch')}</h4>
        {confirmationView?.campaign?.description && (
          <p className="text-xs text-emerald-100 mt-1">{confirmationView.campaign.description}</p>
        )}
      </div>
      <div className="p-4 space-y-3">
        {isPreparing && <p className="text-sm text-emerald-700">{locale === 'en' ? 'Preparing the delivery preview...' : 'Đang chuẩn bị bản xem trước gửi tin...'}</p>}
        {prepareError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><p>{prepareError}</p>{isActive && <button onClick={onRetry} className="mt-2 font-bold underline">{locale === 'en' ? 'Retry' : 'Thử lại'}</button>}</div>}
        {!isPreparing && !prepareError && confirmationView && <>
          <div className="flex items-center justify-between text-xs text-emerald-700"><span>{locale === 'en' ? 'Messages to send' : 'Tin sẽ gửi'}</span><strong>{confirmationView.totals?.sendSteps || 0}</strong></div>
          {blockingIssues.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><p className="font-bold">{locale === 'en' ? 'Fix these items before creating:' : 'Cần sửa trước khi tạo:'}</p><ul className="mt-1 list-disc pl-4">{blockingIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{locale === 'en' ? 'A send step is incomplete or unavailable.' : 'Một bước gửi chưa đủ nội dung, mẫu tin hoặc tài khoản gửi.'}</li>)}</ul></div>}
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {steps.map((step, index) => {
              const expanded = expandedSteps.has(step.key);
              return <div key={step.key} className="rounded-lg border border-emerald-100 bg-white/75 p-3"><div className="flex items-start gap-2"><div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0">{index + 1}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-800 break-words">{step.title}</p><p className="text-[10px] text-slate-500">{previewChannelLabel(step.channel, locale)} · {formatPreviewTiming(step.timing, locale)}</p>{step.sender?.label && <p className="text-[10px] text-slate-500">{locale === 'en' ? 'Sender' : 'Tài khoản gửi'}: {step.sender.label}</p>}{step.recipients?.sourceLabel && <p className="text-[10px] text-slate-500">{locale === 'en' ? 'Recipients' : 'Người nhận'}: {step.recipients.sourceLabel}</p>}{step.content?.subject && <p className="mt-2 text-xs font-semibold text-slate-700 break-words">{step.content.subject}</p>}<p className={`mt-1 whitespace-pre-wrap break-words text-xs text-slate-600 ${expanded ? '' : 'line-clamp-3'}`}>{step.content?.bodyText || (locale === 'en' ? 'No message body' : 'Chưa có nội dung tin')}</p>{step.content?.bodyText && <button onClick={() => toggleStep(step.key)} className="mt-1 text-[10px] font-bold text-emerald-700">{expanded ? (locale === 'en' ? 'Collapse' : 'Thu gọn') : (locale === 'en' ? 'Show more' : 'Xem thêm')}</button>}{step.content?.attachments?.length > 0 && <p className="mt-1 text-[10px] text-slate-500">{locale === 'en' ? 'Attachments' : 'Tệp đính kèm'}: {step.content.attachments.map((file) => file.name || file.contentType).filter(Boolean).join(', ')}</p>}</div></div></div>;
            })}
          </div>
        </>}
        {!isActive && <p className="text-xs text-slate-500">{locale === 'en' ? 'This is an earlier confirmation and is read-only.' : 'Đây là bản xác nhận cũ, chỉ để xem.'}</p>}
      </div>

      <div className="p-4 bg-white/50 border-t border-emerald-100">
        {isActive && <div className="space-y-2">
          <button 
            onClick={onConfirm}
            disabled={!canCreate}
            className="w-full py-3 bg-emerald-500 text-white font-black text-sm uppercase tracking-widest rounded-xl hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30"
          >
            <HiOutlineCheck className="w-5 h-5" />
            {t('aiChatbot.createCampaignBtn')}
          </button>
          {canQuickSend && (
            <button
              type="button"
              onClick={onQuickSend}
              className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:from-teal-600 hover:to-emerald-700 flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition"
            >
              <HiOutlineLightningBolt className="w-4 h-4" />
              {t('aiChatbot.quickSendBtn')}
            </button>
          )}
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
        </div>}
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

// Template library picker for content-plan days
export const TemplatePickerModal = ({ isOpen, onClose, onSelect, channel = 'zalo', slotLabel = '', t }) => {
  const [templates, setTemplates] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const templateChannel = channel === 'email' ? 'email' : 'zalo';
  const endpoint = templateChannel === 'email' ? '/email-templates' : '/zalo-templates';

  useEffect(() => {
    if (!isOpen) return;
    setLoadingTemplates(true);
    api.get(endpoint, { params: { limit: 100 } })
      .then((res) => setTemplates(res.data?.data?.items || res.data?.data || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, [isOpen, endpoint]);

  const filtered = templates.filter((item) => {
    const name = String(item.templateName || item.name || '').toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[70vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HiOutlineFolderOpen className="h-5 w-5 shrink-0 text-orange-500" />
              <h3 className="font-bold text-slate-800">{t('aiChatbot.selectTemplate') || 'Chọn template'}</h3>
            </div>
            {slotLabel && (
              <p className="mt-1 truncate text-[11px] text-slate-500">{slotLabel}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-50">
            <HiOutlineX className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        <div className="border-b border-slate-100 p-4">
          <input
            type="text"
            placeholder={t('aiChatbot.searchTemplatePlaceholder') || 'Tìm theo tên template...'}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-orange-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadingTemplates ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('aiChatbot.noTemplates') || 'Chưa có template nào.'}</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    templateChannel === 'email' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                  }`}
                  >
                    {templateChannel === 'email' ? 'E' : 'Z'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.templateName || item.name}</p>
                    {item.subject && (
                      <p className="truncate text-[10px] text-slate-400">{item.subject}</p>
                    )}
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
