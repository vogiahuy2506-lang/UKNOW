import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineEye,
  HiOutlineMail,
  HiOutlineRefresh,
  HiOutlineSave,
} from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import { useI18n } from '../../i18n';
import adminSystemEmailTemplateApiService from '../../features/admin/services/adminSystemEmailTemplateApi.service';
import adminSubscriptionReminderSettingsApiService from '../../features/admin/services/adminSubscriptionReminderSettingsApi.service';
import AdminSubscriptionReminderScheduleSection from './AdminSubscriptionReminderScheduleSection';

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — trang này giờ sửa được cả 3 mẫu thư
// hạn gói (không chỉ welcome), qua bộ chọn mẫu bên dưới. Tên file/route/component giữ nguyên
// (welcome-email) — đổi tên không phải yêu cầu của PR này.
const TEMPLATE_KEYS = ['welcome', 'plan_expiring', 'plan_expired', 'employee_invitation'];

const VARIABLE_LABEL_KEYS = {
  user_name: 'userName',
  user_email: 'userEmail',
  plan_name: 'planName',
  plan_section: 'planSection',
  login_url: 'loginUrl',
  sender_name: 'senderName',
  support_email: 'supportEmail',
  docs_url: 'docsUrl',
  expires_at: 'expiresAt',
  days_left: 'daysLeft',
  grace_days: 'graceDays',
  upgrade_url: 'upgradeUrl',
  owner_name: 'ownerName',
  activation_url: 'activationUrl',
  expiry_hours: 'expiryHours',
};

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 5 (PR-2) — chép đúng ba luật từ
// subscriptionReminderSettings.service.js (MAX_MARKS:7, MIN_DAY/MAX_DAY:8-9) để báo lỗi TẠI CHỖ.
// Backend vẫn soi lại — đây chỉ để báo sớm, không thay thế.
const MAX_REMINDER_MARKS = 5;
const MIN_REMINDER_DAY = 1;
const MAX_REMINDER_DAY = 365;

function readTemplate(response) {
  const data = response?.data?.data || {};
  return {
    subject: data.subject || '',
    bodyHtml: data.bodyHtml || '',
    isCustomized: Boolean(data.isCustomized),
    updatedAt: data.updatedAt || null,
    variables: Array.isArray(data.variables) ? data.variables : Object.keys(VARIABLE_LABEL_KEYS),
  };
}

function readScheduleSettings(response) {
  const data = response?.data?.data || {};
  return {
    daysBefore: Array.isArray(data.daysBefore) ? data.daysBefore : [],
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Soi lỗi TẠI CHỖ trước khi bấm Lưu — chép đúng luật ở subscriptionReminderSettings.service.js
 * (không phải, không trùng, tối đa 5 mốc, mỗi mốc 1-365). Trả về cả lỗi (để hiện) và bản đã parse
 * hợp lệ (để tính xem trước + để gửi lên khi Lưu).
 */
function validateScheduleDraft(draftDays, t) {
  const errors = new Set();
  const parsed = [];

  if (draftDays.length > MAX_REMINDER_MARKS) {
    errors.add(t('adminSubscriptionReminderSchedule.errorTooMany'));
  }
  for (const raw of draftDays) {
    const trimmed = String(raw).trim();
    const value = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(value)) {
      errors.add(t('adminSubscriptionReminderSchedule.errorInvalidNumber'));
      continue;
    }
    if (value < MIN_REMINDER_DAY || value > MAX_REMINDER_DAY) {
      errors.add(t('adminSubscriptionReminderSchedule.errorRange'));
      continue;
    }
    parsed.push(value);
  }
  if (new Set(parsed).size !== parsed.length) {
    errors.add(t('adminSubscriptionReminderSchedule.errorDuplicate'));
  }

  return { errors: Array.from(errors), parsed };
}

export default function AdminWelcomeEmailPage() {
  const { t, locale } = useI18n();
  const bodyRef = useRef(null);
  const [activeTab, setActiveTab] = useState('content');
  const [templateKey, setTemplateKey] = useState('welcome');
  const [template, setTemplate] = useState({ subject: '', bodyHtml: '' });
  const [savedTemplate, setSavedTemplate] = useState({ subject: '', bodyHtml: '' });
  const [metadata, setMetadata] = useState({ isCustomized: false, updatedAt: null, variables: [] });
  const [preview, setPreview] = useState({ subject: '', html: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [scheduleDraft, setScheduleDraft] = useState([]);
  const [scheduleSaved, setScheduleSaved] = useState([]);
  const [scheduleUpdatedAt, setScheduleUpdatedAt] = useState(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);

  const isDirty = template.subject !== savedTemplate.subject || template.bodyHtml !== savedTemplate.bodyHtml;
  const scheduleIsDirty = JSON.stringify(scheduleDraft) !== JSON.stringify(scheduleSaved.map(String));
  const { errors: scheduleErrors, parsed: scheduleParsedDays } = validateScheduleDraft(scheduleDraft, t);
  const isScheduleValid = scheduleErrors.length === 0;
  const schedulePreviewText = scheduleParsedDays.length > 0
    ? t('adminSubscriptionReminderSchedule.previewWithDays', {
      days: [...new Set(scheduleParsedDays)].sort((a, b) => b - a).join(', '),
    })
    : t('adminSubscriptionReminderSchedule.previewNoDays');

  const savedDaysText = [...scheduleSaved].sort((x, y) => y - x).join(', ');

  const templateKeyLabels = {
    welcome: t('adminWelcomeEmail.templateKeys.welcome'),
    plan_expiring: t('adminWelcomeEmail.templateKeys.plan_expiring'),
    plan_expired: t('adminWelcomeEmail.templateKeys.plan_expired'),
    employee_invitation: t('adminWelcomeEmail.templateKeys.employee_invitation'),
  };
  const templateMeta = {
    welcome: {
      title: t('adminWelcomeEmail.templateMeta.welcome.title'),
      subtitle: t('adminWelcomeEmail.templateMeta.welcome.subtitle'),
      behaviorNote: t('adminWelcomeEmail.templateMeta.welcome.behaviorNote'),
      previewFrameTitle: t('adminWelcomeEmail.templateMeta.welcome.previewFrameTitle'),
    },
    plan_expiring: {
      title: t('adminWelcomeEmail.templateMeta.plan_expiring.title'),
      // Hai dòng này TỪNG ghi cứng "còn 7 ngày và còn 3 ngày". Từ khi lịch nhắc sửa được
      // (PR-2), ghi cứng là tự mâu thuẫn: sếp đặt [10,5,2] ở tab bên cạnh mà tab này vẫn nói 7/3.
      // Lấy từ scheduleSaved (đã lưu), KHÔNG phải scheduleDraft — tab này mô tả hành vi THẬT.
      subtitle: t('adminWelcomeEmail.templateMeta.plan_expiring.subtitle', { days: savedDaysText }),
      behaviorNote: t('adminWelcomeEmail.templateMeta.plan_expiring.behaviorNote', { days: savedDaysText }),
      previewFrameTitle: t('adminWelcomeEmail.templateMeta.plan_expiring.previewFrameTitle'),
    },
    plan_expired: {
      title: t('adminWelcomeEmail.templateMeta.plan_expired.title'),
      subtitle: t('adminWelcomeEmail.templateMeta.plan_expired.subtitle'),
      behaviorNote: t('adminWelcomeEmail.templateMeta.plan_expired.behaviorNote'),
      previewFrameTitle: t('adminWelcomeEmail.templateMeta.plan_expired.previewFrameTitle'),
    },
    employee_invitation: {
      title: t('adminWelcomeEmail.templateMeta.employee_invitation.title'),
      subtitle: t('adminWelcomeEmail.templateMeta.employee_invitation.subtitle'),
      behaviorNote: t('adminWelcomeEmail.templateMeta.employee_invitation.behaviorNote'),
      previewFrameTitle: t('adminWelcomeEmail.templateMeta.employee_invitation.previewFrameTitle'),
    },
  }[templateKey];

  const requestPreview = useCallback(async (draft, key) => {
    setIsPreviewing(true);
    try {
      const response = await adminSystemEmailTemplateApiService.previewTemplate(key, draft);
      setPreview(response.data?.data || { subject: '', html: '' });
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminWelcomeEmail.previewFailed'));
    } finally {
      setIsPreviewing(false);
    }
  }, [t]);

  const load = useCallback(async (key) => {
    setIsLoading(true);
    try {
      const response = await adminSystemEmailTemplateApiService.getTemplate(key);
      const loaded = readTemplate(response);
      const content = { subject: loaded.subject, bodyHtml: loaded.bodyHtml };
      setTemplate(content);
      setSavedTemplate(content);
      setMetadata({
        isCustomized: loaded.isCustomized,
        updatedAt: loaded.updatedAt,
        variables: loaded.variables,
      });
      await requestPreview(content, key);
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminWelcomeEmail.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [requestPreview, t]);

  const loadSchedule = useCallback(async () => {
    setIsScheduleLoading(true);
    try {
      const response = await adminSubscriptionReminderSettingsApiService.getSettings();
      const loaded = readScheduleSettings(response);
      setScheduleDraft(loaded.daysBefore.map(String));
      setScheduleSaved(loaded.daysBefore);
      setScheduleUpdatedAt(loaded.updatedAt);
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminSubscriptionReminderSchedule.loadFailed'));
    } finally {
      setIsScheduleLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(templateKey);
  }, [load, templateKey]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  const selectTemplateKey = (nextKey) => {
    if (nextKey === templateKey) return;
    if (isDirty && !window.confirm(t('adminWelcomeEmail.switchConfirm'))) return;
    setTemplateKey(nextKey);
  };

  const selectTab = (nextTab) => {
    if (nextTab === activeTab) return;
    const leavingDirty = activeTab === 'content' ? isDirty : scheduleIsDirty;
    if (leavingDirty && !window.confirm(t('adminWelcomeEmail.tabSwitchConfirm'))) return;
    setActiveTab(nextTab);
  };

  const save = async () => {
    if (!template.subject.trim() || !template.bodyHtml.trim()) {
      toast.error(t('adminWelcomeEmail.required'));
      return;
    }
    setIsSaving(true);
    try {
      const response = await adminSystemEmailTemplateApiService.updateTemplate(templateKey, template);
      const saved = readTemplate(response);
      const content = { subject: saved.subject, bodyHtml: saved.bodyHtml };
      setTemplate(content);
      setSavedTemplate(content);
      setMetadata((current) => ({
        ...current,
        isCustomized: saved.isCustomized,
        updatedAt: saved.updatedAt,
      }));
      await requestPreview(content, templateKey);
      toast.success(t('adminWelcomeEmail.saveSuccess'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminWelcomeEmail.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(t('adminWelcomeEmail.resetConfirm'))) return;
    setIsResetting(true);
    try {
      const response = await adminSystemEmailTemplateApiService.resetTemplate(templateKey);
      const restored = readTemplate(response);
      const content = { subject: restored.subject, bodyHtml: restored.bodyHtml };
      setTemplate(content);
      setSavedTemplate(content);
      setMetadata((current) => ({
        ...current,
        isCustomized: false,
        updatedAt: null,
        variables: restored.variables.length ? restored.variables : current.variables,
      }));
      await requestPreview(content, templateKey);
      toast.success(t('adminWelcomeEmail.resetSuccess'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminWelcomeEmail.resetFailed'));
    } finally {
      setIsResetting(false);
    }
  };

  const insertBodyVariable = (variable) => {
    const token = `{{${variable}}}`;
    const input = bodyRef.current;
    const start = input?.selectionStart ?? template.bodyHtml.length;
    const end = input?.selectionEnd ?? start;
    const nextBody = template.bodyHtml.slice(0, start) + token + template.bodyHtml.slice(end);
    setTemplate((current) => ({ ...current, bodyHtml: nextBody }));
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const changeScheduleDay = (index, value) => {
    setScheduleDraft((current) => current.map((day, i) => (i === index ? value : day)));
  };

  // Không chặn cứng ở nút Thêm mốc — cứ cho thêm, validateScheduleDraft() (chép luật MAX_MARKS
  // của backend) tự báo lỗi + chặn nút Lưu khi vượt 5. Chặn cứng ở nút Add sẽ khiến người dùng
  // KHÔNG BAO GIỜ chạm được nhánh lỗi "Tối đa 5 mốc" qua tương tác thật (ca 5 mục 4 của plan).
  const addScheduleDay = () => {
    setScheduleDraft((current) => [...current, '']);
  };

  const removeScheduleDay = (index) => {
    setScheduleDraft((current) => current.filter((_, i) => i !== index));
  };

  const saveSchedule = async () => {
    if (!isScheduleValid) return;
    setIsScheduleSaving(true);
    try {
      const response = await adminSubscriptionReminderSettingsApiService.updateSettings(scheduleParsedDays);
      const saved = readScheduleSettings(response);
      setScheduleDraft(saved.daysBefore.map(String));
      setScheduleSaved(saved.daysBefore);
      setScheduleUpdatedAt(saved.updatedAt);
      toast.success(t('adminSubscriptionReminderSchedule.saveSuccess'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminSubscriptionReminderSchedule.saveFailed'));
    } finally {
      setIsScheduleSaving(false);
    }
  };

  const containerRef = useRef(null);
  const [splitRatio, setSplitRatio] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('founder_ai_welcome_email_split_ratio'));
      if (saved >= 28 && saved <= 72) return saved;
    } catch {}
    return 48;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDownResize = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.round(Math.max(28, Math.min(rawPercent, 72)));
      setSplitRatio(clamped);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      try {
        localStorage.setItem('founder_ai_welcome_email_split_ratio', String(splitRatio));
      } catch {}
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, splitRatio]);

  const handleResetSplit = useCallback(() => {
    setSplitRatio(48);
    try {
      localStorage.setItem('founder_ai_welcome_email_split_ratio', '48');
    } catch {}
  }, []);

  return (
    <PageContainer className="space-y-3 pb-4">
      {/* ── Studio Top Header Bar: Thu gọn tối đa, tích hợp các bộ điều khiển ── */}
      <div className="bg-white dark:bg-dk-surface border border-slate-200/80 dark:border-dk-border rounded-2xl p-3 shadow-xs space-y-2.5">
        {/* Hàng 1: Tabs trang + Icon & H1 + Location chip + Nút hành động */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {/* Tiêu đề trang & Icon (Bên Trái) */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                <HiOutlineMail className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-dk-text truncate">
                  {templateMeta.title}
                </h1>
                <p className="text-xs text-slate-500 dark:text-dk-muted truncate">
                  {templateMeta.subtitle}
                </p>
              </div>
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-dk-raised hidden sm:block shrink-0" />

            {/* Tabs trang (Nội dung thư / Lịch nhắc hạn) */}
            <div
              className="inline-flex bg-slate-100 dark:bg-dk-raised p-0.5 rounded-xl border border-slate-200/60 dark:border-dk-border/80 shrink-0"
              role="group"
              aria-label={t('adminWelcomeEmail.pageTabsLabel')}
            >
              <button
                type="button"
                onClick={() => selectTab('content')}
                aria-pressed={activeTab === 'content'}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'content'
                    ? 'bg-white dark:bg-orange-500 text-orange-600 dark:text-dk-text shadow-xs'
                    : 'text-slate-600 dark:text-dk-text2 hover:text-slate-900 dark:hover:text-dk-text'
                }`}
              >
                {t('adminWelcomeEmail.contentTabLabel')}
              </button>
              <button
                type="button"
                onClick={() => selectTab('schedule')}
                aria-pressed={activeTab === 'schedule'}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'schedule'
                    ? 'bg-white dark:bg-orange-500 text-orange-600 dark:text-dk-text shadow-xs'
                    : 'text-slate-600 dark:text-dk-text2 hover:text-slate-900 dark:hover:text-dk-text'
                }`}
              >
                {t('adminSubscriptionReminderSchedule.tabLabel')}
              </button>
            </div>

            {/* Badge vị trí điều hướng */}
            <p className="inline-flex items-center text-[11px] font-medium text-slate-500 dark:text-dk-text2 bg-slate-100 dark:bg-dk-raised/80 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-dk-border/60 shrink-0">
              {t('adminWelcomeEmail.locationNote')}
            </p>
          </div>

          {/* Cụm nút hành động bên phải */}
          {activeTab === 'content' && (
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-dk-text bg-slate-100 hover:bg-slate-200/80 dark:bg-dk-raised dark:hover:bg-dk-strong border border-slate-200/80 dark:border-dk-border/80 rounded-xl transition-all shadow-2xs"
                onClick={reset}
                disabled={isResetting || isSaving}
              >
                <HiOutlineRefresh className={`h-3.5 w-3.5 text-slate-500 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isResetting ? t('adminWelcomeEmail.resetting') : t('adminWelcomeEmail.restoreDefault')}</span>
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white rounded-xl transition-all shadow-sm ${
                  isSaving || !isDirty
                    ? 'bg-slate-400 dark:bg-dk-strong cursor-not-allowed text-slate-200'
                    : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-orange-500/20 active:scale-[0.98]'
                }`}
                onClick={save}
                disabled={isSaving || !isDirty}
              >
                <HiOutlineSave className="h-3.5 w-3.5" />
                <span>{isSaving ? t('common.saving') : t('common.save')}</span>
                {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
              </button>
            </div>
          )}
        </div>

        {/* Hàng 2: Bộ chọn Mẫu thư & Dòng thông tin giải thích (chỉ ở tab content) */}
        {activeTab === 'content' && (
          <div className="pt-2 border-t border-slate-100 dark:border-dk-border/80 space-y-2">
            {/* Bộ chọn mẫu thư: Hàng riêng đầy đủ không gian, không bị ngắt quãng giữa chừng */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider shrink-0">
                {t('adminWelcomeEmail.templateSelector')}:
              </span>
              <div
                className="flex items-center gap-1.5 flex-wrap"
                role="group"
                aria-label={t('adminWelcomeEmail.templateSelector')}
              >
                {TEMPLATE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectTemplateKey(key)}
                    aria-pressed={key === templateKey}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                      key === templateKey
                        ? 'bg-orange-500 text-white font-semibold shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-dk-raised dark:text-dk-text dark:hover:bg-dk-strong'
                    }`}
                  >
                    {templateKeyLabels[key]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-dk-muted truncate">
                {t('adminWelcomeEmail.templateSelectorHint')}
              </p>
            </div>

            {/* Dòng ghi chú phạm vi / hành vi: Hiển thị đầy đủ câu, không bị truncate */}
            <div className="flex items-start sm:items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300">
              <span className="font-semibold shrink-0 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block shrink-0" />
                {t('adminWelcomeEmail.behaviorTitle')}:
              </span>
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-normal">
                {templateMeta.behaviorNote}
              </p>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'content' && (
        isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400 dark:text-dk-muted">{t('common.loading')}</div>
        ) : (
          <div
            ref={containerRef}
            className={`flex flex-col lg:flex-row gap-0 items-stretch min-h-[580px] lg:h-[calc(100vh-190px)] relative ${
              isResizing ? 'cursor-col-resize select-none' : ''
            }`}
          >
            {/* Cột Trái: Trình soạn thảo (Resizable) */}
            <section
              style={isDesktop ? { width: `${splitRatio}%` } : undefined}
              className="w-full lg:w-auto flex flex-col rounded-2xl border border-slate-200/80 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xs overflow-hidden shrink-0"
            >
              {/* Header Editor */}
              <div className="h-10 px-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-dk-surface">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-dk-text">
                    {t('adminWelcomeEmail.editorTitle')}
                  </h2>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    metadata.isCustomized
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                      : 'bg-slate-100 text-slate-600 dark:bg-dk-raised dark:text-dk-text2 border border-slate-200/60 dark:border-dk-border/60'
                  }`}
                >
                  {metadata.isCustomized
                    ? t('adminWelcomeEmail.customized')
                    : t('adminWelcomeEmail.usingDefault')}
                </span>
              </div>

              {/* Body Editor */}
              <div className="p-3.5 space-y-3 flex-1 flex flex-col min-h-0 overflow-y-auto">
                {/* Tiêu đề email */}
                <label className="block space-y-1 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
                      {t('adminWelcomeEmail.subject')}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {template.subject.length}/200
                    </span>
                  </div>
                  <input
                    aria-label={t('adminWelcomeEmail.subject')}
                    value={template.subject}
                    onChange={(event) =>
                      setTemplate((current) => ({ ...current, subject: event.target.value }))
                    }
                    maxLength={200}
                    className="w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-inset text-slate-900 dark:text-dk-text px-3 py-1.5 text-xs focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                </label>

                {/* Biến cá nhân hóa */}
                <div className="space-y-1 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
                      {t('adminWelcomeEmail.variables')}
                    </span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      {t('adminWelcomeEmail.variablesHint')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-1 bg-slate-50 dark:bg-dk-inset rounded-xl border border-slate-200/60 dark:border-dk-border">
                    {metadata.variables.map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => insertBodyVariable(variable)}
                        title={t(`adminWelcomeEmail.variableLabels.${VARIABLE_LABEL_KEYS[variable] || variable}`)}
                        className="rounded-lg border border-slate-200 dark:border-dk-border/80 bg-white dark:bg-dk-raised px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:text-dk-text hover:border-orange-400 hover:bg-orange-50 dark:hover:border-orange-500/50 dark:hover:bg-orange-950/30 transition-colors shadow-2xs"
                      >
                        {`{{${variable}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nội dung HTML */}
                <label className="flex-1 flex flex-col min-h-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
                      {t('adminWelcomeEmail.bodyHtml')}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {t('adminWelcomeEmail.htmlHint')}
                    </span>
                  </div>
                  <textarea
                    aria-label={t('adminWelcomeEmail.bodyHtml')}
                    ref={bodyRef}
                    value={template.bodyHtml}
                    onChange={(event) =>
                      setTemplate((current) => ({ ...current, bodyHtml: event.target.value }))
                    }
                    rows={16}
                    spellCheck={false}
                    className="flex-1 w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-inset text-slate-900 dark:text-dk-text p-3 font-mono text-xs leading-5 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none min-h-[200px]"
                  />
                </label>

                {metadata.updatedAt && (
                  <p className="text-[11px] text-slate-400 dark:text-dk-muted shrink-0">
                    {t('adminWelcomeEmail.updatedAt', {
                      time: new Date(metadata.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                    })}
                  </p>
                )}
              </div>
            </section>

            {/* Thanh kéo phân cách thay đổi tỷ lệ giữa Editor và Preview */}
            <div
              role="separator"
              aria-orientation="vertical"
              tabIndex={0}
              onMouseDown={handleMouseDownResize}
              onDoubleClick={handleResetSplit}
              title="Kéo qua lại để thu nhỏ / phóng to phần soạn thảo và xem trước (Nhấp đúp để đặt lại 48%)"
              className={`hidden lg:flex w-3 -mx-1.5 z-20 cursor-col-resize select-none shrink-0 items-center justify-center group transition-colors ${
                isResizing ? 'bg-orange-500/20' : 'hover:bg-orange-500/10'
              }`}
            >
              <div
                className={`w-1 h-10 rounded-full transition-colors ${
                  isResizing ? 'bg-orange-500' : 'bg-slate-300 dark:bg-dk-strong group-hover:bg-orange-400'
                }`}
              />
            </div>

            {/* Cột Phải: Xem trước (Live Preview) */}
            <section
              style={isDesktop ? { width: `${100 - splitRatio}%` } : undefined}
              className="w-full lg:w-auto flex-1 flex flex-col rounded-2xl border border-slate-200/80 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xs overflow-hidden shrink-0 mt-4 lg:mt-0"
            >
              {/* Header Preview */}
              <div className="h-10 px-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-dk-surface">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-dk-text shrink-0">
                    {t('adminWelcomeEmail.previewTitle')}
                  </h2>
                  <span className="text-xs text-slate-400 dark:text-dk-muted font-mono truncate max-w-xs">
                    {preview.subject || t('adminWelcomeEmail.noPreview')}
                  </span>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-raised border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-strong rounded-lg transition-all shadow-2xs shrink-0"
                  onClick={() => requestPreview(template, templateKey)}
                  disabled={isPreviewing}
                >
                  <HiOutlineEye className="h-3.5 w-3.5 text-slate-500" />
                  <span>{isPreviewing ? t('adminWelcomeEmail.previewing') : t('adminWelcomeEmail.refreshPreview')}</span>
                </button>
              </div>

              {/* Email Client Mock Frame */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-100 dark:bg-dk-inset p-2.5">
                <div className="flex-1 flex flex-col bg-white rounded-xl shadow-xs overflow-hidden border border-slate-200/80">
                  {/* Email headers info */}
                  <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 text-[11px] text-slate-600 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-semibold text-slate-700">{t('adminWelcomeEmail.previewTo', 'Đến:')}</span>
                      <span className="font-mono text-slate-500 truncate">user@example.com</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      <span>{t('adminWelcomeEmail.previewSampleData', 'Xem trước với dữ liệu mẫu')}</span>
                    </div>
                  </div>

                  {/* Iframe */}
                  {preview.html ? (
                    <iframe
                      title={templateMeta.previewFrameTitle}
                      srcDoc={preview.html}
                      sandbox=""
                      className={`w-full flex-1 min-h-[460px] bg-white border-0 ${
                        isResizing ? 'pointer-events-none' : ''
                      }`}
                    />
                  ) : (
                    <div className="flex flex-1 min-h-[300px] items-center justify-center text-sm text-gray-400 dark:text-dk-muted">
                      {t('adminWelcomeEmail.noPreview')}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )
      )}

      {activeTab === 'schedule' && (
        <AdminSubscriptionReminderScheduleSection
          t={t}
          locale={locale}
          isLoading={isScheduleLoading}
          isSaving={isScheduleSaving}
          draftDays={scheduleDraft}
          errors={scheduleErrors}
          isValid={isScheduleValid}
          isDirty={scheduleIsDirty}
          previewText={schedulePreviewText}
          showEmptyWarning={scheduleDraft.length === 0}
          updatedAt={scheduleUpdatedAt}
          onChangeDay={changeScheduleDay}
          onAddDay={addScheduleDay}
          onRemoveDay={removeScheduleDay}
          onSave={saveSchedule}
        />
      )}
    </PageContainer>
  );
}
