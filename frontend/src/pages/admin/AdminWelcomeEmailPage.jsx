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

const VARIABLE_LABEL_KEYS = {
  user_name: 'userName',
  user_email: 'userEmail',
  plan_name: 'planName',
  plan_section: 'planSection',
  login_url: 'loginUrl',
  sender_name: 'senderName',
  support_email: 'supportEmail',
  docs_url: 'docsUrl',
};

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

export default function AdminWelcomeEmailPage() {
  const { t, locale } = useI18n();
  const bodyRef = useRef(null);
  const [template, setTemplate] = useState({ subject: '', bodyHtml: '' });
  const [savedTemplate, setSavedTemplate] = useState({ subject: '', bodyHtml: '' });
  const [metadata, setMetadata] = useState({ isCustomized: false, updatedAt: null, variables: [] });
  const [preview, setPreview] = useState({ subject: '', html: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const isDirty = template.subject !== savedTemplate.subject || template.bodyHtml !== savedTemplate.bodyHtml;

  const requestPreview = useCallback(async (draft) => {
    setIsPreviewing(true);
    try {
      const response = await adminSystemEmailTemplateApiService.previewWelcomeTemplate(draft);
      setPreview(response.data?.data || { subject: '', html: '' });
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminWelcomeEmail.previewFailed'));
    } finally {
      setIsPreviewing(false);
    }
  }, [t]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await adminSystemEmailTemplateApiService.getWelcomeTemplate();
      const loaded = readTemplate(response);
      const content = { subject: loaded.subject, bodyHtml: loaded.bodyHtml };
      setTemplate(content);
      setSavedTemplate(content);
      setMetadata({
        isCustomized: loaded.isCustomized,
        updatedAt: loaded.updatedAt,
        variables: loaded.variables,
      });
      await requestPreview(content);
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminWelcomeEmail.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [requestPreview, t]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!template.subject.trim() || !template.bodyHtml.trim()) {
      toast.error(t('adminWelcomeEmail.required'));
      return;
    }
    setIsSaving(true);
    try {
      const response = await adminSystemEmailTemplateApiService.updateWelcomeTemplate(template);
      const saved = readTemplate(response);
      const content = { subject: saved.subject, bodyHtml: saved.bodyHtml };
      setTemplate(content);
      setSavedTemplate(content);
      setMetadata((current) => ({
        ...current,
        isCustomized: saved.isCustomized,
        updatedAt: saved.updatedAt,
      }));
      await requestPreview(content);
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
      const response = await adminSystemEmailTemplateApiService.resetWelcomeTemplate();
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
      await requestPreview(content);
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

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HiOutlineMail className="h-7 w-7 text-orange-500" />
            <h1 className="text-2xl font-bold text-gray-900">{t('adminWelcomeEmail.title')}</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('adminWelcomeEmail.subtitle')}</p>
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

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold">{t('adminWelcomeEmail.behaviorTitle')}</p>
        <p className="mt-1">{t('adminWelcomeEmail.behaviorNote')}</p>
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
              onClick={() => requestPreview(template)}
              disabled={isPreviewing}
            >
              <HiOutlineEye className="h-4 w-4" />
              {isPreviewing ? t('adminWelcomeEmail.previewing') : t('adminWelcomeEmail.refreshPreview')}
            </button>
          </div>
          {preview.html ? (
            <iframe
              title={t('adminWelcomeEmail.previewFrameTitle')}
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
    </div>
  );
}
