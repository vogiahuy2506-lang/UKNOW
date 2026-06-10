import { useCallback, useEffect, useState } from 'react';
import { HiOutlineMail, HiOutlineClock, HiOutlinePaperAirplane, HiOutlineExclamationCircle, HiOutlineCheckCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import adminBulkNotificationApiService from '../../features/admin/services/adminBulkNotificationApi.service';
import { useI18n } from '../../i18n';

export default function BulkNotificationPage() {
  const { t } = useI18n();
  const [recipientCount, setRecipientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    title: '',
    message: '',
    duration_minutes: '',
    start_time: '',
  });

  useEffect(() => {
    adminBulkNotificationApiService.getRecipientCount()
      .then((res) => setRecipientCount(res.data.data.count))
      .catch(() => setRecipientCount(0))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (result) setResult(null);
  }, [result]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error(t('bulkNotification.errorTitleRequired'));
      return;
    }
    if (!form.message.trim()) {
      toast.error(t('bulkNotification.errorMessageRequired'));
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
      };
      if (form.duration_minutes) payload.duration_minutes = parseInt(form.duration_minutes, 10);
      if (form.start_time) payload.start_time = form.start_time;

      const res = await adminBulkNotificationApiService.sendNotification(payload);
      setResult(res.data.data);
      if (res.data.success) {
        toast.success(res.data.message || t('bulkNotification.success'));
      } else {
        toast.error(res.data.message || t('bulkNotification.error'));
      }
      setForm({ title: '', message: '', duration_minutes: '', start_time: '' });
    } catch (err) {
      // Ưu tiên message từ server (response.data.message), fallback i18n key
      const serverMsg = err?.response?.data?.message;
      if (serverMsg) {
        toast.error(serverMsg);
      } else {
        toast.error(t('bulkNotification.error'));
      }
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setForm({ title: '', message: '', duration_minutes: '', start_time: '' });
    setResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('bulkNotification.title')}</h1>
        <p className="mt-1 text-gray-500">{t('bulkNotification.subtitle')}</p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <HiOutlineMail className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-blue-800">{t('bulkNotification.recipients')}</p>
            {loading ? (
              <div className="mt-1 h-4 w-24 rounded bg-blue-200 animate-pulse" />
            ) : (
              <p className="mt-0.5 text-sm text-blue-700">
                {recipientCount > 0
                  ? t('bulkNotification.recipientsCount', { count: recipientCount })
                  : t('bulkNotification.noRecipients')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="card space-y-5 p-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('bulkNotification.labelTitle')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder={t('bulkNotification.placeholderTitle')}
                maxLength={200}
                className="input input-bordered w-full"
              />
              <p className="mt-1 text-xs text-gray-400">{t('bulkNotification.titleHint')}</p>
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t('bulkNotification.labelMessage')} <span className="text-red-500">*</span>
              </label>
              <textarea
                name="message"
                value={form.message}
                onChange={handleChange}
                placeholder={t('bulkNotification.placeholderMessage')}
                rows={6}
                maxLength={2000}
                className="textarea textarea-bordered w-full resize-none font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t('bulkNotification.charCount', { current: form.message.length, max: 2000 })}
              </p>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Duration */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('bulkNotification.labelDuration')}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="duration_minutes"
                    value={form.duration_minutes}
                    onChange={handleChange}
                    placeholder="30"
                    min={1}
                    max={9999}
                    className="input input-bordered w-full pr-14"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-sm text-gray-400">
                    {t('bulkNotification.minutes')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">{t('bulkNotification.durationHint')}</p>
              </div>

              {/* Start time */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t('bulkNotification.labelStartTime')}
                </label>
                <input
                  type="datetime-local"
                  name="start_time"
                  value={form.start_time}
                  onChange={handleChange}
                  className="input input-bordered w-full"
                />
                <p className="mt-1 text-xs text-gray-400">{t('bulkNotification.startTimeHint')}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="btn btn-primary gap-2"
                disabled={sending || loading}
              >
                {sending ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    {t('bulkNotification.sending')}
                  </>
                ) : (
                  <>
                    <HiOutlinePaperAirplane className="h-4 w-4" />
                    {t('bulkNotification.send')}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-ghost"
                disabled={sending}
              >
                {t('bulkNotification.reset')}
              </button>
            </div>
          </form>
        </div>

        {/* Preview & Result */}
        <div className="space-y-5">
          {/* Email preview */}
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">{t('bulkNotification.preview')}</h3>
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <div className="mb-3 rounded bg-red-600 px-3 py-2">
                <p className="text-xs font-semibold text-white">⚠️ FounderAI</p>
                <p className="text-[11px] text-red-100">Thông báo bảo trì hệ thống</p>
              </div>
              <p className="mb-2 text-xs text-gray-500">Xin chào <strong>Quý khách hàng</strong>,</p>
              <p className="mb-3 text-xs text-gray-600">
                Chúng tôi xin thông báo rằng hệ thống <strong>FounderAI</strong> sẽ được bảo trì...
              </p>
              {form.start_time && (
                <div className="mb-2 rounded bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                  <strong>Thời gian:</strong> {new Date(form.start_time).toLocaleString('vi-VN')}
                </div>
              )}
              {form.duration_minutes && (
                <div className="mb-2 text-xs text-gray-500">
                  <strong>Thời gian dự kiến:</strong> ~{form.duration_minutes} phút
                </div>
              )}
              {form.title && (
                <div className="mb-2 rounded bg-gray-50 px-3 py-2 text-xs">
                  <span className="font-semibold text-gray-500 uppercase">Tiêu đề: </span>
                  <span className="text-gray-800">{form.title}</span>
                </div>
              )}
              {form.message && (
                <div className="rounded border border-gray-100 bg-white px-3 py-2 text-xs text-gray-700">
                  <span className="font-semibold text-gray-500">Nội dung: </span>
                  {form.message.length > 100
                    ? `${form.message.substring(0, 100)}...`
                    : form.message}
                </div>
              )}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-xl border px-5 py-4 ${
              result.failed === 0
                ? 'border-emerald-100 bg-emerald-50'
                : result.sent === 0
                ? 'border-red-100 bg-red-50'
                : 'border-amber-100 bg-amber-50'
            }`}>
              <div className="flex items-start gap-3">
                {result.failed === 0 ? (
                  <HiOutlineCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className={`text-sm font-semibold ${
                    result.failed === 0 ? 'text-emerald-800' : 'text-amber-800'
                  }`}>
                    {t('bulkNotification.resultTitle')}
                  </p>
                  <div className="mt-1 space-y-0.5 text-xs">
                    <p className={result.sent > 0 ? 'text-emerald-700' : 'text-gray-500'}>
                      ✓ {t('bulkNotification.sentCount', { count: result.sent })}
                    </p>
                    {result.failed > 0 && (
                      <p className="text-amber-700">
                        ✗ {t('bulkNotification.failedCount', { count: result.failed })}
                      </p>
                    )}
                    <p className="text-gray-500">
                      {t('bulkNotification.totalCount', { count: result.total })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <HiOutlineExclamationCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                {t('bulkNotification.warning')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
