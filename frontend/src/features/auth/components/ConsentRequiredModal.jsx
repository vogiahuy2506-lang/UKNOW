import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineShieldCheck } from 'react-icons/hi';
import { submitUserConsents } from '../services/authApi.service';
import { useI18n } from '../../../i18n';
import ConsentAgreementText from './ConsentAgreementText';

/**
 * Modal đồng ý điều khoản & xử lý dữ liệu cá nhân (Nghị định 330/2026/NĐ-CP).
 *
 * 🔴 QUYẾT ĐỊNH 12/09/2026: BẮT BUỘC, KHÔNG CÓ "ĐỂ SAU".
 * - Bắt buộc đồng ý mới được tiếp tục sử dụng app.
 * - Không đóng được: không có nút "Để sau", bấm overlay không tắt, không bắt phím Escape.
 * - Không đồng ý → đăng xuất; muốn xoá tài khoản → liên hệ hỗ trợ (app chưa có tự xoá).
 * - Tự động hiển thị lại khi văn bản pháp lý đổi phiên bản (isOutdated = true).
 *
 * @param {{ isOpen: boolean, onConsented?: () => void, onDecline?: () => Promise<void> | void, isOutdated?: boolean }} props
 */
const ConsentRequiredModal = ({ isOpen, onConsented, onDecline, isOutdated = false }) => {
  const { t } = useI18n();
  // Một ô đồng ý cho cả 3 văn bản (payload vẫn gửi đủ terms/privacy/dpa để backend ghi từng bằng chứng)
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleDecline = async () => {
    setDeclining(true);
    try {
      await onDecline?.();
    } finally {
      setDeclining(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!agreed) {
      setError(t('consentRequired.validationRequired'));
      return;
    }

    setLoading(true);
    try {
      const res = await submitUserConsents({
        terms: agreed,
        privacy: agreed,
        dpa: agreed,
      });

      if (res.success) {
        onConsented?.();
      } else {
        setError(res.message || res.error || t('consentRequired.failed'));
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || t('consentRequired.errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const title = isOutdated ? t('consentRequired.titleOutdated') : t('consentRequired.title');

  return createPortal(
    <div className="modal-overlay">
      <div
        className="modal-content modal-content-animate w-full max-w-lg mx-4 dark:border dark:border-dk-border/80 dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100 dark:border-dk-border">
          <HiOutlineShieldCheck className="w-5 h-5 text-orange-500 shrink-0" />
          <h2 className="text-base font-bold text-gray-900 dark:text-dk-text tracking-tight">{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-dk-text leading-relaxed">
            {t('consentRequired.description')}
          </p>

          <div className="pt-1">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  setError('');
                }}
                className="mt-0.5 w-4 h-4 text-orange-500 border-gray-300 dark:border-dk-border-strong rounded bg-white dark:bg-dk-surface focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-dk-text leading-snug">
                <ConsentAgreementText />
              </span>
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="pt-2 space-y-3">
            <button
              type="submit"
              className="btn btn-primary w-full shadow-sm"
              disabled={loading || declining || !agreed}
            >
              {loading ? t('consentRequired.saving') : t('consentRequired.submit')}
            </button>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={handleDecline}
              disabled={loading || declining}
            >
              {declining ? t('consentRequired.loggingOut') : t('consentRequired.declineAndLogout')}
            </button>
            <p className="text-xs text-center text-gray-500 dark:text-dk-text2">
              {t('consentRequired.disagreePrompt')}{' '}
              <a
                href="/contact"
                className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
              >
                {t('consentRequired.accountSettingsLink')}
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default ConsentRequiredModal;
