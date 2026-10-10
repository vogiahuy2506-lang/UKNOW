import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { supportUserApi } from '../services/supportApi.service';
import {
  SUPPORT_BODY_MAX,
  SUPPORT_CATEGORIES,
  SUPPORT_SUBJECT_MAX,
  apiErrorMessage,
} from '../utils/supportConstants';
import SupportImagePicker from './SupportImagePicker';

/**
 * Modal "Gửi góp ý": loại, tiêu đề (≤200), nội dung (≤5000), ≤3 ảnh. Gửi `POST /support/tickets`
 * với payload `{ subject, category, body, attachmentIds }`.
 *
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {(ticket: object) => void} props.onCreated
 */
export default function NewTicketModal({ onClose, onCreated }) {
  const { t } = useI18n();
  const [category, setCategory] = useState('feedback');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const canSubmit = subject.trim() && body.trim() && !uploading && !submitting;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const result = await supportUserApi.createTicket({
        subject: subject.trim(),
        category,
        body: body.trim(),
        attachmentIds: images.map((image) => image.storageObjectId),
      });
      toast.success(t('support.form.created'));
      onCreated(result?.ticket);
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.form.createFailed'));
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100';

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('support.form.title')}
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{t('support.form.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close')}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <HiOutlineX className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor="support-category" className="mb-1 block text-sm font-medium text-slate-700">
              {t('support.form.category')}
            </label>
            <select
              id="support-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={fieldClass}
            >
              {SUPPORT_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {t(`support.category.${key}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="support-subject" className="mb-1 block text-sm font-medium text-slate-700">
              {t('support.form.subject')}
            </label>
            <input
              id="support-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={SUPPORT_SUBJECT_MAX}
              placeholder={t('support.form.subjectPlaceholder')}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="support-body" className="mb-1 block text-sm font-medium text-slate-700">
              {t('support.form.body')}
            </label>
            <textarea
              id="support-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={SUPPORT_BODY_MAX}
              rows={6}
              placeholder={t('support.form.bodyPlaceholder')}
              className={`${fieldClass} resize-y`}
            />
            <p className="mt-1 text-right text-xs text-slate-400">
              {t('support.form.charCount', { n: body.length, max: SUPPORT_BODY_MAX })}
            </p>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">{t('support.attachments.label')}</span>
            <SupportImagePicker
              value={images}
              onChange={setImages}
              uploadFn={supportUserApi.uploadAttachment}
              onUploadingChange={setUploading}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('support.form.submitting') : t('support.form.submit')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
