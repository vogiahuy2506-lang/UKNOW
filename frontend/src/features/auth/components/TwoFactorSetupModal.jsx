import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineShieldCheck, HiOutlineX, HiOutlineClipboardCopy } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { beginTwoFactorSetup, enableTwoFactor } from '../services/authApi.service';
import { useI18n } from '../../../i18n';

/** Sao chép văn bản; trả true nếu thành công. */
function copyText(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Danh sách mã khôi phục (chỉ hiện MỘT lần) + sao chép/tải .txt + checkbox xác nhận đã lưu.
 * Nút "Xong" chỉ bật khi đã tick — đóng sớm là mất mã.
 *
 * @param {{ codes: string[], onDone: () => void }} props
 */
export const RecoveryCodesPanel = ({ codes, onDone }) => {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);

  const handleCopyAll = () => {
    if (copyText(codes.join('\n'))) toast.success(t('twoFactor.copied'));
    else toast.error(t('twoFactor.copyFailed'));
  };

  const handleDownload = () => {
    try {
      const blob = new Blob([`Founder AI - ${t('twoFactor.recoveryCodesTitle')}\n\n${codes.join('\n')}\n`], {
        type: 'text/plain;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'founder-ai-recovery-codes.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('twoFactor.copyFailed'));
    }
  };

  return (
    <div className="px-6 py-5 space-y-4">
      <p className="text-sm text-gray-600">{t('twoFactor.recoveryCodesHint')}</p>
      <ul className="grid grid-cols-2 gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-sm text-gray-900">
        {codes.map((c) => (
          <li key={c} data-testid="recovery-code">{c}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={handleCopyAll} className="btn btn-secondary">
          {t('twoFactor.copyAll')}
        </button>
        <button type="button" onClick={handleDownload} className="btn btn-secondary">
          {t('twoFactor.downloadTxt')}
        </button>
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5"
        />
        <span>{t('twoFactor.savedCodesCheckbox')}</span>
      </label>
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" disabled={!saved} onClick={onDone}>
          {t('twoFactor.done')}
        </button>
      </div>
    </div>
  );
};

/**
 * Modal bật 2FA: bước 1 quét QR + nhập mã, bước 2 hiện mã khôi phục (không đóng sớm được).
 *
 * @param {{ isOpen: boolean, onClose: () => void, onEnabled?: () => void }} props
 */
const TwoFactorSetupModal = ({ isOpen, onClose, onEnabled }) => {
  const { t } = useI18n();
  const [setup, setSetup] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setSetup(null);
    setLoadError('');
    setCode('');
    setError('');
    setRecoveryCodes(null);
    beginTwoFactorSetup()
      .then((res) => {
        if (!cancelled) setSetup(res.data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.response?.data?.message || t('twoFactor.setupFailed'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const showingCodes = Array.isArray(recoveryCodes);
  // Bước mã khôi phục: mã chỉ hiện một lần nên không có đường thoát ngoài nút "Xong".
  const handleClose = () => {
    if (showingCodes) return;
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (code.length !== 6) {
      setError(t('twoFactor.codeRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await enableTwoFactor(code);
      setRecoveryCodes(res.data?.recoveryCodes || []);
    } catch (err) {
      setError(
        err?.response?.status === 401
          ? t('twoFactor.invalidCode')
          : err?.response?.data?.message || t('twoFactor.enableFailed'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onEnabled?.();
    onClose();
  };

  return createPortal(
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <HiOutlineShieldCheck className="w-5 h-5 text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">
              {showingCodes ? t('twoFactor.recoveryCodesTitle') : t('twoFactor.setupTitle')}
            </h2>
          </div>
          {!showingCodes && (
            <button
              type="button"
              onClick={handleClose}
              aria-label={t('common.close')}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          )}
        </div>

        {showingCodes ? (
          <RecoveryCodesPanel codes={recoveryCodes} onDone={handleDone} />
        ) : loadError ? (
          <div className="px-6 py-5">
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
          </div>
        ) : !setup ? (
          <div className="py-14 flex justify-center">
            <div className="spinner w-8 h-8" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col max-h-[calc(100vh-8rem)]">
            {/* Nội dung cuộn; hàng nút ghim ở đáy để nút Xác nhận luôn thấy được trên màn thấp. */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <section>
                <h3 className="text-sm font-semibold text-gray-900">{t('twoFactor.setupStep1Title')}</h3>
                <p className="text-sm text-gray-600 mt-1">{t('twoFactor.setupStep1Body')}</p>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-gray-900">{t('twoFactor.setupStep2Title')}</h3>
                <div className="flex justify-center my-3">
                  <img src={setup.qrDataUrl} alt={t('twoFactor.qrAlt')} className="w-44 h-44 border border-gray-200 rounded-lg" />
                </div>
                <ul className="text-sm text-gray-600 space-y-1.5 list-disc pl-5">
                  <li>{t('twoFactor.setupStep2Authenticator')}</li>
                  <li>{t('twoFactor.setupStep2Iphone')}</li>
                  <li>{t('twoFactor.setupStep2Manual')}</li>
                </ul>
              </section>
              <div>
                <p className="text-xs text-gray-500 mb-1">{t('twoFactor.manualKey')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono break-all">
                    {setup.secret}
                  </code>
                  <button
                    type="button"
                    aria-label={t('twoFactor.copySecret')}
                    onClick={() => {
                      if (copyText(setup.secret)) toast.success(t('twoFactor.copied'));
                      else toast.error(t('twoFactor.copyFailed'));
                    }}
                    className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  >
                    <HiOutlineClipboardCopy className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t('twoFactor.setupStep3Title')}</h3>
                <p className="text-sm text-gray-600 mt-1 mb-2">{t('twoFactor.setupStep3Body')}</p>
                <label htmlFor="two-factor-setup-code" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('twoFactor.enterCodeToConfirm')}
                </label>
                <input
                  id="two-factor-setup-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  placeholder="123456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100">
              <a
                href="/huong-dan/xac-thuc-hai-lop"
                target="_blank"
                rel="noopener noreferrer"
                className="mr-auto text-sm text-primary-600 hover:underline underline-offset-4"
              >
                {t('twoFactor.setupHelpLink')}
              </a>
              <button type="button" onClick={handleClose} className="btn btn-secondary">
                {t('twoFactor.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? t('common.loading') : t('twoFactor.confirm')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default TwoFactorSetupModal;
