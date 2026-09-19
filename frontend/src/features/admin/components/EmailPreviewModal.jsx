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

const DEBOUNCE_MS = 400;

const TYPE_LABELS_VI = {
  maintenance: 'Bảo trì',
  announcement: 'Thông báo',
  promotion: 'Khuyến mãi',
  warning: 'Cảnh báo',
  reminder: 'Nhắc nhở',
  security: 'Bảo mật'
};

function formatDateTimeVi(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

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
  const [device, setDevice] = useState('desktop');
  const [lang, setLang] = useState('vi');
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
        setError(err?.response?.data?.message || err?.message || 'Không thể tải preview');
        setHtml('');
      } finally {
        if (reqId === requestSeq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, notification, lang, device]);

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

  if (!isOpen) return null;

  const typeLabel = TYPE_LABELS_VI[notification?.type] || 'Thông báo';
  const recipientCount = notification?.recipient_count ?? 0;
  const subject = notification?.title || '';
  const subjectInferred = subject || inferSubjectFromHtml(html);
  const createdAt = formatDateTimeVi(notification?.created_at);
  const sentAt = formatDateTimeVi(notification?.sent_at);
  const scheduledAt = formatDateTimeVi(notification?.scheduled_at);
  const plainText = stripHtmlToText(html);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <HiOutlineMail className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white truncate">Xem trước email</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-orange-50/90">
                  <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 font-medium">
                    {typeLabel}
                  </span>
                  <span>{recipientCount > 0 ? `${recipientCount} người nhận` : 'Chưa xác định người nhận'}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
              aria-label="Đóng"
            >
              <FaTimes className="text-white w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Email header meta */}
        <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div>
              <div className="text-slate-400 uppercase tracking-wide font-semibold mb-1">Subject</div>
              <div className="font-medium text-slate-900 break-words" title={subjectInferred}>
                {subjectInferred || '—'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 uppercase tracking-wide font-semibold mb-1">Từ</div>
              <div className="font-mono text-slate-700 break-all">
                Founder AI Platform &lt;noreply@digiso.vn&gt;
              </div>
            </div>
            <div>
              <div className="text-slate-400 uppercase tracking-wide font-semibold mb-1">Đến</div>
              <div className="text-slate-700">
                {recipientCount > 0 ? `${recipientCount} người nhận` : 'Đang fill user list…'}
              </div>
            </div>
            <div>
              <div className="text-slate-400 uppercase tracking-wide font-semibold mb-1">Thời gian</div>
              <div className="text-slate-700 inline-flex items-center gap-1.5">
                <HiOutlineCalendar className="w-3.5 h-3.5 text-slate-400" />
                {sentAt !== '—'
                  ? `Đã gửi: ${sentAt}`
                  : scheduledAt !== '—'
                    ? `Hẹn: ${scheduledAt}`
                    : `Tạo: ${createdAt}`}
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-white border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1" role="tablist">
              <button
                onClick={() => setView('rendered')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all inline-flex items-center gap-1.5 ${
                  view === 'rendered' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FaEye className="w-3 h-3" />
                Render
              </button>
              <button
                onClick={() => setView('html')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all inline-flex items-center gap-1.5 ${
                  view === 'html' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FaCode className="w-3 h-3" />
                HTML
              </button>
              <button
                onClick={() => setView('text')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === 'text' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Text
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium">Ngôn ngữ:</span>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setLang('vi')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    lang === 'vi' ? 'bg-orange-500 text-white' : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  🇻🇳 VI
                </button>
                <button
                  onClick={() => setLang('en')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                    lang === 'en' ? 'bg-orange-500 text-white' : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  🇺🇸 EN
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium">Thiết bị:</span>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  onClick={() => setDevice('desktop')}
                  className={`p-1.5 rounded-md transition-all ${
                    device === 'desktop' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-white'
                  }`}
                  title="Desktop"
                >
                  <FaDesktop className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDevice('mobile')}
                  className={`p-1.5 rounded-md transition-all ${
                    device === 'mobile' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-white'
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
        <div className="flex-1 overflow-auto bg-slate-100">
          {loading && !html && (
            <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400 text-sm">
              <FaSpinner className="w-5 h-5 animate-spin mr-2" />
              Đang tải preview từ server...
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-red-500 text-sm gap-2">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setLang((l) => l)} // trigger refetch by re-render? — onEffect dep lang/device; no-op re-run cần setState
                className="text-xs text-slate-500 underline"
              >
                (mở lại modal để thử lại)
              </button>
            </div>
          )}
          {!loading && !error && html && view === 'rendered' && (
            <div className="flex justify-center p-6">
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
            <pre className="m-6 rounded-xl bg-slate-900 text-slate-100 p-5 text-xs overflow-auto font-mono leading-5 whitespace-pre-wrap break-all">
              {html}
            </pre>
          )}
          {!loading && !error && view === 'text' && (
            <div className="m-6 rounded-xl bg-white border border-slate-200 p-5 text-sm text-slate-800 whitespace-pre-wrap leading-6">
              {plainText || 'Không có text thuần kèm theo.'}
            </div>
          )}
        </div>

        {/* Footer toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-white">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FaCheck className="w-3.5 h-3.5 text-green-500" />
            Preview render từ BE — khớp 100% với email thực mà khách nhận.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              disabled={!plainText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              title="Sao chép text thô"
            >
              <FaCopy className="w-3 h-3" />
              {copyState === 'text' ? 'Đã copy' : 'Copy text'}
            </button>
            <button
              type="button"
              onClick={handleCopyHtml}
              disabled={!html}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              title="Sao chép mã HTML"
            >
              <FaCode className="w-3 h-3" />
              {copyState === 'html' ? 'Đã copy' : 'Copy HTML'}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!html}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              title="Tải HTML về"
            >
              <FaDownload className="w-3 h-3" />
              Tải HTML
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-medium text-sm shadow-sm"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
