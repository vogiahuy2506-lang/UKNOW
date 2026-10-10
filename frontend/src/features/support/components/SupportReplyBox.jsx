import { useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import { SUPPORT_BODY_MAX, apiErrorMessage } from '../utils/supportConstants';
import SupportImagePicker from './SupportImagePicker';

/**
 * Ô trả lời + ảnh đính kèm, dùng chung cho người dùng và admin.
 * `onSubmit({ body, attachmentIds })` trả Promise; thành công thì xoá ô nhập.
 *
 * @param {object} props
 * @param {(payload: { body: string, attachmentIds: Array<number|string> }) => Promise<unknown>} props.onSubmit
 * @param {(file: File) => Promise<object>} props.uploadFn
 * @param {string} [props.placeholder]
 */
export default function SupportReplyBox({ onSubmit, uploadFn, placeholder }) {
  const { t } = useI18n();
  const [body, setBody] = useState('');
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const trimmed = body.trim();
  const canSend = trimmed.length > 0 && !uploading && !sending;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      await onSubmit({ body: trimmed, attachmentIds: images.map((image) => image.storageObjectId) });
      setBody('');
      setImages([]);
    } catch (error) {
      toast.error(apiErrorMessage(error) || t('support.thread.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="block text-sm font-medium text-slate-700" htmlFor="support-reply-body">
        {t('support.thread.reply')}
      </label>
      <textarea
        id="support-reply-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={SUPPORT_BODY_MAX}
        rows={4}
        placeholder={placeholder || t('support.thread.replyPlaceholder')}
        className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
      />
      <SupportImagePicker value={images} onChange={setImages} uploadFn={uploadFn} onUploadingChange={setUploading} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          {t('support.form.charCount', { n: body.length, max: SUPPORT_BODY_MAX })}
        </span>
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? t('support.thread.sending') : t('support.thread.send')}
        </button>
      </div>
    </form>
  );
}
