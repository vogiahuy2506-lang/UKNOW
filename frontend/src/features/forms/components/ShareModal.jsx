import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlineClipboardCopy, HiOutlineDownload, HiOutlineCode } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

export default function ShareModal({ form, isOpen, onClose, onPublish }) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = form?.publicKey ? `${origin}/f/${form.publicKey}` : '';

  // PR-5 — hợp đồng khối nhúng cố định (khớp frontend/public/form-embed.js +
  // PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md mục PR-5). ORIGIN tuyệt đối lấy lúc copy —
  // form-embed.js tự suy origin app từ chính src của thẻ <script> này lúc chạy trên landing.
  const embedCode = form?.publicKey
    ? `<section data-founderai-form-section>
  <div data-founderai-form="${form.publicKey}"></div>
  <noscript><a href="${origin}/f/${form.publicKey}">${t('forms.shareModal.openFormFallback')}</a></noscript>
  <script src="${origin}/form-embed.js" defer></script>
</section>`
    : '';

  // Nhúng thay thế bằng iframe thường cho nền tảng không cho chèn thẻ <script> (vd một số
  // trình dựng trang bên thứ ba) — không tự co giãn chiều cao (không có form-embed.js lắng
  // nghe postMessage resize), min-height cố định làm mốc hiển thị ban đầu.
  const iframeFallbackCode = form?.publicKey
    ? `<iframe src="${origin}/f/${form.publicKey}?embed=1" style="width:100%;border:0;min-height:480px" title="${form.title || t('forms.formTitle')}"></iframe>`
    : '';

  useEffect(() => {
    if (shareUrl && isOpen) {
      QRCode.toDataURL(shareUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(''));
    }
  }, [shareUrl, isOpen]);

  if (!isOpen || !form) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('forms.copied'));
    } catch {
      toast.error(t('forms.shareModal.copyError'));
    }
  };

  const handleCopyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('forms.copied'));
    } catch {
      toast.error(t('forms.shareModal.copyError'));
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `qr-form-${form.publicKey || 'share'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl overflow-x-hidden border border-gray-100 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <HiOutlineX className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {t('forms.share')}
        </h3>
        <p className="text-sm text-gray-500 mb-5 break-words">
          {form.title}
        </p>

        {!form.isPublished && (
          <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-800">
            <span>{t('forms.shareModal.hiddenWarning')}</span>
            {onPublish && (
              <button
                type="button"
                onClick={onPublish}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium whitespace-nowrap transition-colors shadow-sm"
              >
                {t('forms.publish')}
              </button>
            )}
          </div>
        )}

        {/* Mã nhúng landing (PR-5) — cách chính để đưa form vào landing page */}
        <div className="mb-5 p-4 bg-gray-900 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
              <HiOutlineCode className="w-4 h-4" />
              {t('forms.shareModal.embedTitle')}
            </label>
            <button
              onClick={() => handleCopyText(embedCode)}
              className="flex-shrink-0 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
              {t('forms.shareModal.copyCode')}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            {t('forms.shareModal.embedDesc')}
          </p>
          <pre className="text-[11px] leading-relaxed text-gray-100 whitespace-pre-wrap break-all font-mono bg-black/30 rounded-lg p-3 max-h-40 overflow-y-auto">
            {embedCode}
          </pre>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl mb-5">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Form QR Code"
              className="w-48 h-48 rounded-lg shadow-sm border border-gray-200 bg-white"
            />
          ) : (
            <div className="w-48 h-48 flex items-center justify-center text-gray-400 text-sm">
              {t('forms.shareModal.generatingQr')}
            </div>
          )}

          {qrDataUrl && (
            <button
              onClick={handleDownloadQr}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              <HiOutlineDownload className="w-4 h-4" />
              {t('forms.shareModal.downloadQr')}
            </button>
          )}
        </div>

        {/* Link input & copy */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">
            {t('forms.shareModal.directLink')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-700 select-all focus:outline-none"
            />
            <button
              onClick={handleCopyLink}
              className="flex-shrink-0 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl inline-flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <HiOutlineClipboardCopy className="w-4 h-4" />
              {t('forms.copyLink')}
            </button>
          </div>
        </div>

        {/* Nhúng iframe thường (PR-5) — nền tảng không cho chèn thẻ <script> */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-700">
              {t('forms.shareModal.iframeFallbackTitle')}
            </label>
            <button
              onClick={() => handleCopyText(iframeFallbackCode)}
              className="flex-shrink-0 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
              {t('forms.shareModal.copyCode')}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            {t('forms.shareModal.iframeFallbackDesc')}
          </p>
          <pre className="text-[11px] leading-relaxed text-gray-600 whitespace-pre-wrap break-all font-mono bg-gray-50 border border-gray-200 rounded-lg p-3">
            {iframeFallbackCode}
          </pre>
        </div>
      </div>
    </div>
  );
}
