import { useState, useEffect, useRef } from 'react';
import {
  FaTimes,
  FaDesktop,
  FaMobile,
  FaCheck,
  FaSpinner,
  FaCopy,
  FaDownload,
  FaCode,
  FaEye
} from 'react-icons/fa';
import { HiOutlineMail, HiOutlineCalendar } from 'react-icons/hi';
import adminNotificationApi from '../services/adminNotificationApi.service';
import { useI18n } from '../../../i18n';

const DEBOUNCE_MS = 400;

function inferSubjectFromHtml(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return '';
  const m = htmlString.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : '';
}

function stripHtmlToText(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return '';
  return htmlString
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export default function EmailPreviewModal({ isOpen, onClose, notification }) {
  const { t, locale: currentLocale } = useI18n();
  const [device, setDevice] = useState('desktop');
  const [lang, setLang] = useState(currentLocale === 'en' ? 'en' : 'vi');
  const [view, setView] = useState('rendered');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copyState, setCopyState] = useState(null);
  const debounceRef = useRef(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!isOpen || !notification) {
      setHtml('');
      setError(null);
      setCopyState(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await adminNotificationApi.previewEmailHtml({
          type: notification.type,
          priority: notification.priority,
          title: notification.title,
          message: notification.message,
          html_content: notification.html_content ?? null,
          locale: lang,
          device
        });
        if (reqId !== requestSeq.current) return;
        setHtml(res?.data?.html || '');
      } catch (err) {
        if (reqId !== requestSeq.current) return;
        console.error('[EmailPreviewModal] preview-email-html failed:', err);
        setError(err?.response?.data?.message || err?.message || t('notificationCenter.previewModal.loadFailed', 'Failed to load preview'));
        setHtml('');
      } finally {
        if (reqId === requestSeq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, notification, lang, device, t]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleCopyHtml = async () => {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      setCopyState('html');
      setTimeout(() => setCopyState(null), 1500);
    } catch (err) {
      console.error('[EmailPreviewModal] clipboard write failed:', err);
    }
  };

  const handleCopyText = async () => {
    const text = stripHtmlToText(html);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('text');
      setTimeout(() => setCopyState(null), 1500);
    } catch (err) {
      console.error('[EmailPreviewModal] clipboard write failed:', err);
    }
  };

  const handleDownload = () => {
    if (!html) return;
    const subj = (notification?.title || 'email-preview').replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${subj}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDateTime = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleString(currentLocale === 'vi' ? 'vi-VN' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  const typeLabel = t(`notificationCenter.types.${notification?.type}`, notification?.type || 'Announcement');
  const recipientCount = notification?.recipient_count ?? 0;
  const subject = notification?.title || '';
  const subjectInferred = subject || inferSubjectFromHtml(html);
  const createdAt = formatDateTime(notification?.created_at);
  const sentAt = formatDateTime(notification?.sent_at);
  const scheduledAt = formatDateTime(notification?.scheduled_at);
  const plainText = stripHtmlToText(html);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden dark:bg-dk-surface dark:border dark:border-dk-border">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <HiOutlineMail className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white truncate">
                  {t('notificationCenter.previewModal.title')}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-orange-50/90">
                  <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 font-medium">
                    {typeLabel}
                  </span>
                  <span>
                    {recipientCount > 0
                      ? t('notificationCenter.previewModal.recipientsCount', { count: recipientCount })
                      : t('notificationCenter.previewModal.unknownRecipients')}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
              aria-label={t('notificationCenter.previewModal.close')}
            >
              <FaTimes className="text-white w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Email header meta */}
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-4 dark:border-dk-border dark:bg-dk-raised">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div>
              <div className="text-slate-400 dark:text-dk-muted uppercase tracking-wide font-semibold mb-1">Subject</div>
              <div className="font-medium text-slate-900 break-words dark:text-dk-text" title={subjectInferred}>
                {subjectInferred || '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 dark:text-dk-muted uppercase tracking-wide font-semibold mb-1">
                {t('notificationCenter.previewModal.from')}
              </div>
              <div className="font-mono text-slate-700 break-all dark:text-dk-text">
                Founder AI Platform &lt;noreply@digiso.vn&gt;
              </div>
            </div>
            <div>
              <div className="text-slate-400 dark:text-dk-muted uppercase tracking-wide font-semibold mb-1">
                {t('notificationCenter.previewModal.to')}
              </div>
              <div className="text-slate-700 dark:text-dk-text">
                {recipientCount > 0
                  ? t('notificationCenter.previewModal.recipientsCount', { count: recipientCount })
                  : t('notificationCenter.previewModal.unknownRecipients')}
              </div>
            </div>
            <div>
              <div className="text-slate-400 dark:text-dk-muted uppercase tracking-wide font-semibold mb-1">
                {t('notificationCenter.previewModal.time')}
              </div>
              <div className="text-slate-700 inline-flex items-center gap-1.5 dark:text-dk-text">
                <HiOutlineCalendar className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" />
                {sentAt !== '—'
                  ? `${t('notificationCenter.previewModal.sentAt')} ${sentAt}`
                  : scheduledAt !== '—'
                    ? `${t('notificationCenter.previewModal.scheduledAt')} ${scheduledAt}`
                    : `${t('notificationCenter.previewModal.createdAt')} ${createdAt}`}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-white border-b border-slate-100 dark:bg-dk-surface dark:border-dk-border">
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 dark:bg-dk-raised" role="tablist">
              <button
                onClick={() => setView('rendered')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all inline-flex items-center gap-1.5 ${
                  view === 'rendered' ? 'bg-white text-slate-900 shadow-sm dark:bg-dk-inset dark:text-dk-text' : 'text-slate-600 hover:text-slate-900 dark:text-dk-text2 dark:hover:text-dk-text'
                }`}
              >
                <FaEye className="w-3 h-3" />
                {t('notificationCenter.previewModal.viewRendered')}
              </button>
              <button
                onClick={() => setView('html')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all inline-flex items-center gap-1.5 ${
                  view === 'html' ? 'bg-white text-slate-900 shadow-sm dark:bg-dk-inset dark:text-dk-text' : 'text-slate-600 hover:text-slate-900 dark:text-dk-text2 dark:hover:text-dk-text'
                }`}
              >
                <FaCode className="w-3 h-3" />
                {t('notificationCenter.previewModal.viewHtml')}
              </button>
              <button
                onClick={() => setView('text')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === 'text' ? 'bg-white text-slate-900 shadow-sm dark:bg-dk-inset dark:text-dk-text' : 'text-slate-600 hover:text-slate-900 dark:text-dk-text2 dark:hover:text-dk-text'
                }`}
              >
                {t('notificationCenter.previewModal.viewText')}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-dk-text2 font-medium">
                {t('notificationCenter.previewModal.lang')}
              </span>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 dark:bg-dk-raised">
                <button
                  onClick={() => setLang('vi')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    lang === 'vi' ? 'bg-orange-500 text-white' : 'text-slate-700 hover:bg-white dark:text-dk-text dark:hover:bg-dk-inset'
                  }`}
                >
                  🇻🇳 VI
                </button>
                <button
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    lang === 'en' ? 'bg-orange-500 text-white' : 'text-slate-700 hover:bg-white dark:text-dk-text dark:hover:bg-dk-inset'
                  }`}
                >
                  🇺🇸 EN
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-dk-text2 font-medium">
                {t('notificationCenter.previewModal.device')}
              </span>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 dark:bg-dk-raised">
                <button
                  onClick={() => setDevice('desktop')}
                  className={`p-1.5 rounded-md transition-all ${
                    device === 'desktop' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-white dark:text-dk-text2 dark:hover:bg-dk-inset'
                  }`}
                  title="Desktop"
                >
                  <FaDesktop className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDevice('mobile')}
                  className={`p-1.5 rounded-md transition-all ${
                    device === 'mobile' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-white dark:text-dk-text2 dark:hover:bg-dk-inset'
                  }`}
                  title="Mobile (375px)"
                >
                  <FaMobile className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-dk-inset">
          {loading && !html && (
            <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400 dark:text-dk-muted text-sm">
              <FaSpinner className="w-5 h-5 animate-spin mr-2" />
              {t('notificationCenter.previewModal.loading')}
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-red-500 dark:text-red-400 text-sm gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setLang((l) => l)}
                className="text-xs text-slate-500 dark:text-dk-text2 underline"
              >
                {t('notificationCenter.previewModal.retry', '(retry)')}
              </button>
            </div>
          )}
          {!loading && !error && html && view === 'rendered' && (
            <div className="flex justify-center p-6">
              {/* giữ sáng: thân email xem trước là HTML thật gửi cho khách (nền trong suốt, chữ đen) — khung bao quanh vẫn tối */}
              <iframe
                key={`rendered-${lang}-${device}`}
                title="Email Preview"
                srcDoc={html}
                sandbox=""
                className="bg-white rounded-2xl shadow-xl border-0"
                style={{
                  width: device === 'mobile' ? '375px' : '100%',
                  maxWidth: '680px',
                  height: '720px'
                }}
              />
            </div>
          )}
          {!loading && !error && view === 'html' && (
            <pre className="m-6 rounded-xl bg-slate-900 text-slate-100 p-5 text-xs overflow-auto font-mono leading-5 whitespace-pre-wrap break-all dark:border dark:border-dk-border">
              {html}
            </pre>
          )}
          {!loading && !error && view === 'text' && (
            <div className="m-6 rounded-xl bg-white border border-slate-200 p-5 text-sm text-slate-800 whitespace-pre-wrap leading-6 dark:border-dk-border dark:bg-dk-surface dark:text-dk-text">
              {plainText || t('notificationCenter.previewModal.noText')}
            </div>
          )}
        </div>

        {/* Footer toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-white dark:border-dk-border dark:bg-dk-surface">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-dk-text2">
            <FaCheck className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />
            {t('notificationCenter.previewModal.badgeNote')}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              disabled={!plainText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
              title={t('notificationCenter.previewModal.copyText')}
            >
              <FaCopy className="w-3 h-3" />
              {copyState === 'text' ? t('notificationCenter.previewModal.copied') : t('notificationCenter.previewModal.copyText')}
            </button>
            <button
              type="button"
              onClick={handleCopyHtml}
              disabled={!html}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
              title={t('notificationCenter.previewModal.copyHtml')}
            >
              <FaCode className="w-3 h-3" />
              {copyState === 'html' ? t('notificationCenter.previewModal.copied') : t('notificationCenter.previewModal.copyHtml')}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!html}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-raised"
              title={t('notificationCenter.previewModal.downloadHtml')}
            >
              <FaDownload className="w-3 h-3" />
              {t('notificationCenter.previewModal.downloadHtml')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-medium text-sm shadow-sm"
            >
              {t('notificationCenter.previewModal.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
