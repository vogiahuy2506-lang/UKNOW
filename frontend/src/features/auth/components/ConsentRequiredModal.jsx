import { useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineShieldCheck } from 'react-icons/hi';
import { submitUserConsents } from '../services/authApi.service';
import { useI18n } from '../../../i18n';

/**
 * Modal đồng ý điều khoản & xử lý dữ liệu cá nhân (Nghị định 330/2026/NĐ-CP).
 *
 * 🔴 QUYẾT ĐỊNH 12/09/2026: BẮT BUỘC, KHÔNG CÓ "ĐỂ SAU".
 * - Bắt buộc đồng ý mới được tiếp tục sử dụng app.
 * - Không đóng được: không có nút "Để sau", bấm overlay không tắt, không bắt phím Escape.
 * - Lối ra duy nhất nếu không đồng ý: xoá tài khoản tại trang Cài đặt tài khoản.
 * - Tự động hiển thị lại khi văn bản pháp lý đổi phiên bản (isOutdated = true).
 *
 * @param {{ isOpen: boolean, onConsented?: () => void, isOutdated?: boolean }} props
 */
const ConsentRequiredModal = ({ isOpen, onConsented, isOutdated = false }) => {
  const { t } = useI18n();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [dpa, setDpa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const allChecked = terms && privacy && dpa;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!allChecked) {
      setError(t('consentRequired.validationRequired'));
      return;
    }

    setLoading(true);
    try {
      const res = await submitUserConsents({
        terms: true,
        privacy: true,
        dpa: true,
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
        className="modal-content modal-content-animate w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <HiOutlineShieldCheck className="w-5 h-5 text-primary-600" />
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            {t('consentRequired.description')}
          </p>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => {
                  setTerms(e.target.checked);
                  setError('');
                }}
                className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 leading-snug">
                {t('consentRequired.agreeTerms')}{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline font-medium"
                >
                  {t('consentRequired.termsLink')}
                </a>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => {
                  setPrivacy(e.target.checked);
                  setError('');
                }}
                className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 leading-snug">
                {t('consentRequired.agreePrivacy')}{' '}
                <a
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline font-medium"
                >
                  {t('consentRequired.privacyLink')}
                </a>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dpa}
                onChange={(e) => {
                  setDpa(e.target.checked);
                  setError('');
                }}
                className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 leading-snug">
                {t('consentRequired.agreeDpa')}{' '}
                <a
                  href="/public-dpa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline font-medium"
                >
                  {t('consentRequired.dpaLink')}
                </a>
              </span>
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="pt-2 space-y-3">
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={loading || !allChecked}
            >
              {loading ? t('consentRequired.saving') : t('consentRequired.submit')}
            </button>
            <p className="text-xs text-center text-gray-500">
              {t('consentRequired.disagreePrompt')}{' '}
              <a
                href="/contact"
                className="text-primary-600 hover:underline font-medium"
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
