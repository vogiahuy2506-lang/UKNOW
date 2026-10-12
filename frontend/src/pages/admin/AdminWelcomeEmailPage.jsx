import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineClock,
  HiOutlineEye,
  HiOutlineInformationCircle,
  HiOutlineMail,
  HiOutlineRefresh,
} from 'react-icons/hi';
import {
  AdminEditorShell,
  EditorSettingsModal,
  EditorTopbar,
  TopbarButton,
  TopbarDivider,
  TopbarSaveButton,
  TopbarSegmented,
  TopbarSettingsButton,
  TopbarToolsMenu,
} from '../../components/editor/AdminEditorShell';
import { useI18n } from '../../i18n';
import adminSystemEmailTemplateApiService from '../../features/admin/services/adminSystemEmailTemplateApi.service';
import adminSubscriptionReminderSettingsApiService from '../../features/admin/services/adminSubscriptionReminderSettingsApi.service';
import AdminSubscriptionReminderScheduleSection from './AdminSubscriptionReminderScheduleSection';

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — trang này giờ sửa được cả 3 mẫu thư
// hạn gói (không chỉ welcome), qua bộ chọn mẫu bên dưới. Tên file/route/component giữ nguyên
// (welcome-email) — đổi tên không phải yêu cầu của PR này.
//
// 11/10/2026 (PLAN_TRANG_SOAN_QUAN_TRI) — CHỈ đổi bố cục theo kiểu "Tạo landing page" /app: thanh trên
// (chọn mẫu thư · Cài đặt · Công cụ · Lưu) + vùng soạn/xem trước chiếm trọn chiều cao; Lịch nhắc hạn và
// thông tin mẫu nằm trong modal Cài đặt. State, handler, lời gọi API giữ nguyên.
const TEMPLATE_KEYS = ['welcome', 'plan_expiring', 'plan_expired', 'employee_invitation', 'order_payment_reminder'];

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
  billing_period_label: 'billingPeriodLabel',
  amount: 'amount',
  order_code: 'orderCode',
  pay_url: 'payUrl',
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
    daysBeforeYearly: Array.isArray(data.daysBeforeYearly) ? data.daysBeforeYearly : [],
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
  // Cài đặt (modal): tab 'schedule' = Lịch nhắc hạn, 'info' = Thông tin mẫu đang sửa.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('schedule');
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
  // Mốc nhắc riêng cho gói năm (PLAN_MOC_NHAC_HAN_THEO_KY B5); scheduleDraft/scheduleSaved ở trên = gói tháng.
  const [scheduleYearlyDraft, setScheduleYearlyDraft] = useState([]);
  const [scheduleYearlySaved, setScheduleYearlySaved] = useState([]);
  const [scheduleUpdatedAt, setScheduleUpdatedAt] = useState(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);

  const isDirty = template.subject !== savedTemplate.subject || template.bodyHtml !== savedTemplate.bodyHtml;
  const scheduleIsDirty = JSON.stringify(scheduleDraft) !== JSON.stringify(scheduleSaved.map(String))
    || JSON.stringify(scheduleYearlyDraft) !== JSON.stringify(scheduleYearlySaved.map(String));
  const { errors: scheduleErrors, parsed: scheduleParsedDays } = validateScheduleDraft(scheduleDraft, t);
  const { errors: scheduleYearlyErrors, parsed: scheduleYearlyParsedDays } = validateScheduleDraft(scheduleYearlyDraft, t);
  const isScheduleValid = scheduleErrors.length === 0 && scheduleYearlyErrors.length === 0;
  const schedulePreviewText = scheduleParsedDays.length > 0
    ? t('adminSubscriptionReminderSchedule.previewWithDays', {
      days: [...new Set(scheduleParsedDays)].sort((a, b) => b - a).join(', '),
    })
    : t('adminSubscriptionReminderSchedule.previewNoDays');
  const scheduleYearlyPreviewText = scheduleYearlyParsedDays.length > 0
    ? t('adminSubscriptionReminderSchedule.previewWithDaysYearly', {
      days: [...new Set(scheduleYearlyParsedDays)].sort((a, b) => b - a).join(', '),
    })
    : t('adminSubscriptionReminderSchedule.previewNoDaysYearly');

  const savedDaysText = [...scheduleSaved].sort((x, y) => y - x).join(', ');
  const savedYearlyDaysText = [...scheduleYearlySaved].sort((x, y) => y - x).join(', ')
    || t('adminSubscriptionReminderSchedule.noMarks');

  const templateKeyLabels = {
    welcome: t('adminWelcomeEmail.templateKeys.welcome'),
    plan_expiring: t('adminWelcomeEmail.templateKeys.plan_expiring'),
    plan_expired: t('adminWelcomeEmail.templateKeys.plan_expired'),
    employee_invitation: t('adminWelcomeEmail.templateKeys.employee_invitation'),
    order_payment_reminder: t('adminWelcomeEmail.templateKeys.order_payment_reminder'),
  };
  // Nhãn ngắn cho thanh trên (4 nhãn đầy đủ không vừa giữa thanh 52px); nhãn đầy đủ nằm ở tooltip.
  const templateKeyShortLabels = {
    welcome: t('adminWelcomeEmail.templateKeysShort.welcome'),
    plan_expiring: t('adminWelcomeEmail.templateKeysShort.plan_expiring'),
    plan_expired: t('adminWelcomeEmail.templateKeysShort.plan_expired'),
    employee_invitation: t('adminWelcomeEmail.templateKeysShort.employee_invitation'),
    order_payment_reminder: t('adminWelcomeEmail.templateKeysShort.order_payment_reminder'),
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
      // (PR-2), ghi cứng là tự mâu thuẫn: sếp đặt [10,5,2] ở Cài đặt mà chữ mô tả vẫn nói 7/3.
      // Lấy từ scheduleSaved (đã lưu), KHÔNG phải scheduleDraft — chữ này mô tả hành vi THẬT.
      subtitle: t('adminWelcomeEmail.templateMeta.plan_expiring.subtitle', { days: savedDaysText, daysYearly: savedYearlyDaysText }),
      behaviorNote: t('adminWelcomeEmail.templateMeta.plan_expiring.behaviorNote', { days: savedDaysText, daysYearly: savedYearlyDaysText }),
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
    order_payment_reminder: {
      title: t('adminWelcomeEmail.templateMeta.order_payment_reminder.title'),
      subtitle: t('adminWelcomeEmail.templateMeta.order_payment_reminder.subtitle'),
      behaviorNote: t('adminWelcomeEmail.templateMeta.order_payment_reminder.behaviorNote'),
      previewFrameTitle: t('adminWelcomeEmail.templateMeta.order_payment_reminder.previewFrameTitle'),
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
      setScheduleYearlyDraft(loaded.daysBeforeYearly.map(String));
      setScheduleYearlySaved(loaded.daysBeforeYearly);
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

  // Lịch nhắc hạn giờ nằm trong modal Cài đặt (không còn "tab" ngang hàng với nội dung thư). Lịch đang sửa mà
  // chưa Lưu thì đóng Cài đặt phải hỏi (thay cho hộp hỏi khi chuyển tab trước đây); đồng ý thì bỏ bản nháp.
  const openSettings = (nextTab) => {
    if (nextTab) setSettingsTab(nextTab);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    if (scheduleIsDirty) {
      if (!window.confirm(t('adminWelcomeEmail.settingsCloseConfirm'))) return;
      setScheduleDraft(scheduleSaved.map(String));
      setScheduleYearlyDraft(scheduleYearlySaved.map(String));
    }
    setSettingsOpen(false);
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

  const changeScheduleYearlyDay = (index, value) => {
    setScheduleYearlyDraft((current) => current.map((day, i) => (i === index ? value : day)));
  };

  const addScheduleYearlyDay = () => {
    setScheduleYearlyDraft((current) => [...current, '']);
  };

  const removeScheduleYearlyDay = (index) => {
    setScheduleYearlyDraft((current) => current.filter((_, i) => i !== index));
  };

  const saveSchedule = async () => {
    if (!isScheduleValid) return;
    setIsScheduleSaving(true);
    try {
      const response = await adminSubscriptionReminderSettingsApiService.updateSettings({
        daysBefore: scheduleParsedDays,
        daysBeforeYearly: scheduleYearlyParsedDays,
      });
      const saved = readScheduleSettings(response);
      setScheduleDraft(saved.daysBefore.map(String));
      setScheduleSaved(saved.daysBefore);
      setScheduleYearlyDraft(saved.daysBeforeYearly.map(String));
      setScheduleYearlySaved(saved.daysBeforeYearly);
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

  const toolsItems = [
    {
      key: 'refresh-preview',
      icon: HiOutlineEye,
      label: isPreviewing ? t('adminWelcomeEmail.previewing') : t('adminWelcomeEmail.refreshPreview'),
      description: t('adminWelcomeEmail.toolsRefreshPreviewDesc'),
      disabled: isPreviewing,
      onClick: () => requestPreview(template, templateKey),
    },
    {
      key: 'restore-default',
      icon: HiOutlineRefresh,
      label: isResetting ? t('adminWelcomeEmail.resetting') : t('adminWelcomeEmail.restoreDefault'),
      description: t('adminWelcomeEmail.toolsRestoreDefaultDesc'),
      disabled: isResetting || isSaving,
      danger: true,
      onClick: reset,
    },
  ];

  const topbar = (
    <EditorTopbar
      icon={HiOutlineMail}
      title={t('adminWelcomeEmail.topbarTitle')}
      subtitle={templateMeta.title}
      center={(
        // Chỉ từ xl: giữa thanh 52px 4 tab + cụm nút phải không vừa ở 768–1279px (kể cả khi menu trái mở) → tràn đè nút Cài đặt.
        // Dưới xl đã có ô chọn mẫu thư ngay dưới thanh trên.
        <div className="hidden xl:block">
          <TopbarSegmented
            value={templateKey}
            onChange={selectTemplateKey}
            ariaLabel={t('adminWelcomeEmail.templateSelector')}
            options={TEMPLATE_KEYS.map((key) => ({
              value: key,
              label: templateKeyShortLabels[key],
              title: templateKeyLabels[key],
            }))}
          />
        </div>
      )}
      right={(
        <>
          {isDirty && (
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
              {t('adminWelcomeEmail.unsavedBadge')}
            </span>
          )}
          <TopbarSettingsButton onClick={() => openSettings()} active={settingsOpen} />
          <TopbarToolsMenu items={toolsItems} />
          <TopbarDivider />
          <TopbarSaveButton onClick={save} saving={isSaving} disabled={!isDirty} />
        </>
      )}
    />
  );

  const inputClass = 'w-full rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';

  return (
    <AdminEditorShell topbar={topbar}>
      <div className="h-full flex flex-col min-h-0">
        {/* Dưới xl thanh trên không chứa bộ chọn mẫu thư (không đủ chỗ) → ô chọn gọn ngay dưới thanh trên. */}
        <div className="xl:hidden shrink-0 px-3 py-2 bg-white dark:bg-dk-surface border-b border-gray-200/90 dark:border-dk-border">
          <select
            aria-label={t('adminWelcomeEmail.templateSelector')}
            value={templateKey}
            onChange={(event) => selectTemplateKey(event.target.value)}
            className={`${inputClass} h-9 px-3 text-sm font-medium sm:max-w-xs`}
          >
            {TEMPLATE_KEYS.map((key) => (
              <option key={key} value={key}>{templateKeyShortLabels[key]}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-gray-400 dark:text-dk-muted">
            {t('common.loading')}
          </div>
        ) : (
          <div
            ref={containerRef}
            className={`flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative ${
              isResizing ? 'cursor-col-resize select-none' : ''
            }`}
          >
            {/* Cột Trái: soạn (Tiêu đề · Biến · Nội dung HTML) */}
            <section
              style={isDesktop ? { width: `${splitRatio}%` } : undefined}
              className="w-full lg:w-auto shrink-0 flex flex-col lg:h-full min-h-0 bg-white dark:bg-dk-surface border-b lg:border-b-0 lg:border-r border-gray-200/90 dark:border-dk-border"
            >
              <div className="flex-1 min-h-0 flex flex-col gap-4 p-4 lg:overflow-y-auto">
                {/* Tiêu đề email */}
                <label className="block space-y-1.5 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700 dark:text-dk-text">
                      {t('adminWelcomeEmail.subject')}
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-dk-muted font-mono">
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
                    className={`${inputClass} px-3 py-2 text-sm`}
                  />
                </label>

                {/* Biến cá nhân hóa — gợi ý dài chuyển thành tooltip (i) */}
                <div className="space-y-1.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-700 dark:text-dk-text">
                      {t('adminWelcomeEmail.variables')}
                    </span>
                    <span
                      role="img"
                      aria-label={t('adminWelcomeEmail.variablesHint')}
                      title={t('adminWelcomeEmail.variablesHint')}
                      className="text-gray-400 dark:text-dk-muted cursor-help inline-flex"
                    >
                      <HiOutlineInformationCircle className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {metadata.variables.map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => insertBodyVariable(variable)}
                        title={t(`adminWelcomeEmail.variableLabels.${VARIABLE_LABEL_KEYS[variable] || variable}`)}
                        className="rounded-lg border border-gray-200 dark:border-dk-border/80 bg-gray-50 dark:bg-dk-raised px-2 py-0.5 font-mono text-[11px] text-gray-700 dark:text-dk-text hover:border-orange-400 hover:bg-orange-50 dark:hover:border-orange-500/50 dark:hover:bg-orange-950/30 transition-colors"
                      >
                        {`{{${variable}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nội dung HTML */}
                <label className="flex-1 flex flex-col min-h-0 space-y-1.5">
                  <span className="text-xs font-semibold text-gray-700 dark:text-dk-text">
                    {t('adminWelcomeEmail.bodyHtml')}
                  </span>
                  <textarea
                    aria-label={t('adminWelcomeEmail.bodyHtml')}
                    ref={bodyRef}
                    value={template.bodyHtml}
                    onChange={(event) =>
                      setTemplate((current) => ({ ...current, bodyHtml: event.target.value }))
                    }
                    rows={16}
                    spellCheck={false}
                    className={`${inputClass} flex-1 p-3 font-mono text-xs leading-5 resize-none min-h-[260px]`}
                  />
                </label>
              </div>
              <p className="shrink-0 px-4 py-2 border-t border-gray-100 dark:border-dk-border text-[11px] text-gray-400 dark:text-dk-muted">
                {t('adminWelcomeEmail.htmlHint')}
              </p>
            </section>

            {/* Thanh kéo phân cách thay đổi tỷ lệ giữa Editor và Preview */}
            <div
              role="separator"
              aria-orientation="vertical"
              tabIndex={0}
              onMouseDown={handleMouseDownResize}
              onDoubleClick={handleResetSplit}
              title={t('adminWelcomeEmail.resizeHint')}
              className={`hidden lg:flex w-3 -mx-1.5 z-20 cursor-col-resize select-none shrink-0 items-center justify-center group transition-colors ${
                isResizing ? 'bg-orange-500/20' : 'hover:bg-orange-500/10'
              }`}
            >
              <div
                className={`w-1 h-10 rounded-full transition-colors ${
                  isResizing ? 'bg-orange-500' : 'bg-gray-300 dark:bg-dk-strong group-hover:bg-orange-400'
                }`}
              />
            </div>

            {/* Cột Phải: Xem trước (Live Preview) */}
            <section
              style={isDesktop ? { width: `${100 - splitRatio}%` } : undefined}
              className="w-full lg:w-auto flex-1 flex flex-col lg:h-full min-h-0 shrink-0 bg-gray-100/70 dark:bg-dk-inset p-3"
            >
              {/* Khung hộp thư giả lập — giữ sáng: mô phỏng hộp thư thật, thân thư luôn nền trắng (lớp bao ngoài vẫn theo chế độ tối) */}
              <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl shadow-xs overflow-hidden border border-slate-200/80">
                <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 shrink-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-3 text-[11px] text-slate-600">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-700">{t('adminWelcomeEmail.previewTo')}</span>
                      <span className="font-mono text-slate-500 truncate">user@example.com</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] shrink-0">
                      {isPreviewing ? (
                        <HiOutlineRefresh className="w-3 h-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      )}
                      <span className="hidden sm:inline">
                        {isPreviewing ? t('adminWelcomeEmail.previewing') : t('adminWelcomeEmail.previewSampleData')}
                      </span>
                    </div>
                  </div>
                  {preview.subject && (
                    <div className="text-xs font-semibold text-slate-800 truncate">{preview.subject}</div>
                  )}
                </div>

                {preview.html ? (
                  <iframe
                    title={templateMeta.previewFrameTitle}
                    srcDoc={preview.html}
                    sandbox=""
                    className={`w-full flex-1 min-h-[420px] lg:min-h-0 bg-white border-0 ${
                      isResizing ? 'pointer-events-none' : ''
                    }`}
                  />
                ) : (
                  <div className="flex flex-1 min-h-[240px] items-center justify-center text-sm text-slate-400">
                    {t('adminWelcomeEmail.noPreview')}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <EditorSettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        title={t('adminWelcomeEmail.settingsTitle')}
        subtitle={t('adminWelcomeEmail.settingsSubtitle')}
        tabs={[
          { key: 'schedule', label: t('adminSubscriptionReminderSchedule.tabLabel'), icon: HiOutlineClock },
          { key: 'info', label: t('adminWelcomeEmail.settingsInfoTab'), icon: HiOutlineInformationCircle },
        ]}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        footer={<TopbarButton onClick={closeSettings}>{t('editorShell.close')}</TopbarButton>}
      >
        {settingsTab === 'schedule' && (
          // Bản gốc là lưới 2 cột (xl) gồm 2 thẻ; trong modal ép về 1 cột cho gọn.
          <div className="[&>div]:grid-cols-1">
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
              yearlyDraftDays={scheduleYearlyDraft}
              yearlyErrors={scheduleYearlyErrors}
              yearlyPreviewText={scheduleYearlyPreviewText}
              showYearlyEmptyWarning={scheduleYearlyDraft.length === 0}
              updatedAt={scheduleUpdatedAt}
              onChangeDay={changeScheduleDay}
              onAddDay={addScheduleDay}
              onRemoveDay={removeScheduleDay}
              onChangeYearlyDay={changeScheduleYearlyDay}
              onAddYearlyDay={addScheduleYearlyDay}
              onRemoveYearlyDay={removeScheduleYearlyDay}
              onSave={saveSchedule}
            />
          </div>
        )}

        {settingsTab === 'info' && (
          <div className="space-y-5">
            <section className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-dk-muted">
                {t('adminWelcomeEmail.infoTemplateHeading')}
              </h3>
              <p className="text-sm font-semibold text-gray-900 dark:text-dk-text">{templateMeta.title}</p>
              <p className="text-sm text-gray-600 dark:text-dk-text2">{templateMeta.subtitle}</p>
            </section>

            <section className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-dk-muted">
                {t('adminWelcomeEmail.behaviorTitle')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-dk-text2">{templateMeta.behaviorNote}</p>
            </section>

            <section className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-dk-muted">
                {t('adminWelcomeEmail.infoStatusHeading')}
              </h3>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  metadata.isCustomized
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60'
                    : 'bg-gray-100 text-gray-600 dark:bg-dk-raised dark:text-dk-text2 border border-gray-200/60 dark:border-dk-border/60'
                }`}
              >
                {metadata.isCustomized
                  ? t('adminWelcomeEmail.customized')
                  : t('adminWelcomeEmail.usingDefault')}
              </span>
              {metadata.updatedAt && (
                <p className="text-xs text-gray-400 dark:text-dk-muted">
                  {t('adminWelcomeEmail.updatedAt', {
                    time: new Date(metadata.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                  })}
                </p>
              )}
            </section>

            <p className="rounded-xl border border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-raised px-3 py-2 text-xs text-gray-600 dark:text-dk-text2">
              {t('adminWelcomeEmail.locationNote')}
            </p>
          </div>
        )}
      </EditorSettingsModal>
    </AdminEditorShell>
  );
}
