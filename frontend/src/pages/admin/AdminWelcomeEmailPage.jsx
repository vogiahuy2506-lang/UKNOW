import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineEye,
  HiOutlineMail,
  HiOutlineRefresh,
  HiOutlineSave,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import adminSystemEmailTemplateApiService from '../../features/admin/services/adminSystemEmailTemplateApi.service';
import adminSubscriptionReminderSettingsApiService from '../../features/admin/services/adminSubscriptionReminderSettingsApi.service';
import AdminSubscriptionReminderScheduleSection from './AdminSubscriptionReminderScheduleSection';

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — trang này giờ sửa được cả 3 mẫu thư
// hạn gói (không chỉ welcome), qua bộ chọn mẫu bên dưới. Tên file/route/component giữ nguyên
// (welcome-email) — đổi tên không phải yêu cầu của PR này.
const TEMPLATE_KEYS = ['welcome', 'plan_expiring', 'plan_expired'];

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('adminWelcomeEmail.pageTabsLabel')}>
        <button
          type="button"
          onClick={() => selectTab('content')}
          aria-pressed={activeTab === 'content'}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'content'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('adminWelcomeEmail.contentTabLabel')}
        </button>
        <button
          type="button"
          onClick={() => selectTab('schedule')}
          aria-pressed={activeTab === 'schedule'}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'schedule'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t('adminSubscriptionReminderSchedule.tabLabel')}
        </button>
      </div>

      {activeTab === 'content' && (
        isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t('common.loading')}</div>
        ) : (
          <>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <HiOutlineMail className="h-7 w-7 text-orange-500" />
                  <h1 className="text-2xl font-bold text-gray-900">{templateMeta.title}</h1>
                </div>
                <p className="mt-1 text-sm text-gray-500">{templateMeta.subtitle}</p>
                <p className="mt-2 inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
                  {t('adminWelcomeEmail.locationNote')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary inline-flex items-center gap-2"
                  onClick={reset}
                  disabled={isResetting || isSaving}
                >
                  <HiOutlineRefresh className="h-4 w-4" />
                  {isResetting ? t('adminWelcomeEmail.resetting') : t('adminWelcomeEmail.restoreDefault')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary inline-flex items-center gap-2"
                  onClick={save}
                  disabled={isSaving || !isDirty}
                >
                  <HiOutlineSave className="h-4 w-4" />
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-gray-700">{t('adminWelcomeEmail.templateSelector')}</span>
              <p className="text-xs text-gray-500">{t('adminWelcomeEmail.templateSelectorHint')}</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('adminWelcomeEmail.templateSelector')}>
                {TEMPLATE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectTemplateKey(key)}
                    aria-pressed={key === templateKey}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      key === templateKey
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {templateKeyLabels[key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-semibold">{t('adminWelcomeEmail.behaviorTitle')}</p>
              <p className="mt-1">{templateMeta.behaviorNote}</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-gray-900">{t('adminWelcomeEmail.editorTitle')}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${metadata.isCustomized ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {metadata.isCustomized
                      ? t('adminWelcomeEmail.customized')
                      : t('adminWelcomeEmail.usingDefault')}
                  </span>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">{t('adminWelcomeEmail.subject')}</span>
                  <input
                    aria-label={t('adminWelcomeEmail.subject')}
                    value={template.subject}
                    onChange={(event) => setTemplate((current) => ({ ...current, subject: event.target.value }))}
                    maxLength={200}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                  <span className="block text-right text-xs text-gray-400">{template.subject.length}/200</span>
                </label>

                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">{t('adminWelcomeEmail.variables')}</span>
                  <p className="text-xs text-gray-500">{t('adminWelcomeEmail.variablesHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {metadata.variables.map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => insertBodyVariable(variable)}
                        title={t(`adminWelcomeEmail.variableLabels.${VARIABLE_LABEL_KEYS[variable] || variable}`)}
                        className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700 hover:border-orange-300 hover:bg-orange-50"
                      >
                        {`{{${variable}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-gray-700">{t('adminWelcomeEmail.bodyHtml')}</span>
                  <textarea
                    aria-label={t('adminWelcomeEmail.bodyHtml')}
                    ref={bodyRef}
                    value={template.bodyHtml}
                    onChange={(event) => setTemplate((current) => ({ ...current, bodyHtml: event.target.value }))}
                    rows={24}
                    spellCheck={false}
                    className="w-full rounded-lg border border-gray-200 px-3 py-3 font-mono text-xs leading-5 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                  <span className="text-xs text-gray-500">{t('adminWelcomeEmail.htmlHint')}</span>
                </label>

                {metadata.updatedAt && (
                  <p className="text-xs text-gray-400">
                    {t('adminWelcomeEmail.updatedAt', {
                      time: new Date(metadata.updatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN'),
                    })}
                  </p>
                )}
              </section>

              <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-gray-900">{t('adminWelcomeEmail.previewTitle')}</h2>
                    <p className="mt-1 text-xs text-gray-500">{preview.subject || t('adminWelcomeEmail.noPreview')}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary inline-flex items-center gap-2"
                    onClick={() => requestPreview(template, templateKey)}
                    disabled={isPreviewing}
                  >
                    <HiOutlineEye className="h-4 w-4" />
                    {isPreviewing ? t('adminWelcomeEmail.previewing') : t('adminWelcomeEmail.refreshPreview')}
                  </button>
                </div>
                {preview.html ? (
                  <iframe
                    title={templateMeta.previewFrameTitle}
                    srcDoc={preview.html}
                    sandbox=""
                    className="h-[760px] w-full bg-white"
                  />
                ) : (
                  <div className="flex h-80 items-center justify-center text-sm text-gray-400">
                    {t('adminWelcomeEmail.noPreview')}
                  </div>
                )}
              </section>
            </div>
          </>
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
    </div>
  );
}
