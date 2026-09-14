import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlineClipboardCopy, HiOutlineDownload } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

export default function ShareModal({ form, isOpen, onClose }) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState('');

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = form?.publicKey ? `${origin}/f/${form.publicKey}` : '';

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
      toast.error('Không thể sao chép liên kết');
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
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 p-6 relative">
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
              Đang tạo QR...
            </div>
          )}

          {qrDataUrl && (
            <button
              onClick={handleDownloadQr}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              <HiOutlineDownload className="w-4 h-4" />
              Tải ảnh QR về máy
            </button>
          )}
        </div>

        {/* Link input & copy */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">
            Đường dẫn trực tiếp
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
      </div>
    </div>
  );
}
