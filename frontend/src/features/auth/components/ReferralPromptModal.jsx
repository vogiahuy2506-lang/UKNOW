import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineGift, HiOutlineInformationCircle } from 'react-icons/hi';
import { bindReferrer } from '../services/authApi.service';
import { useI18n } from '../../../i18n';

/**
 * Modal nhắc nhập mã giới thiệu (Affiliate) ngay sau khi đăng ký tài khoản.
 *
 * Quy tắc nghiệp vụ (yêu cầu sếp):
 * - Chỉ cho nhập 1 lần lúc mới đăng ký (trong 24h đầu, sau các bước đổi mk / đồng ý / SĐT).
 * - Nếu bấm "Bỏ qua / Tôi không có mã", vĩnh viễn không hỏi lại và không cho nhập lại trong trang cá nhân.
 *
 * @param {{ isOpen: boolean, onClose: () => void, onSuccess: (updatedData: any) => void }} props
 */
const ReferralPromptModal = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCodeChange = (e) => {
    setCode(e.target.value.toUpperCase().replace(/\s+/g, ''));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError(t('referralPromptModal.invalidCode'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await bindReferrer({ referralCode: cleanCode });
      if (res?.success) {
        onSuccess?.(res.data);
      } else {
        setError(res?.message || t('referralPromptModal.failed'));
      }
    } catch (err) {
      const errCode = err?.response?.data?.code;
      const errMsg = err?.response?.data?.message;

      if (errCode === 'SELF_REFERRAL') {
        setError(t('referralPromptModal.selfReferral'));
      } else if (errCode === 'ALREADY_REFERRED') {
        setError(t('referralPromptModal.alreadyReferred'));
      } else if (errCode === 'REFERRAL_EXPIRED') {
        setError(t('referralPromptModal.timeExpired'));
      } else if (errCode === 'INVALID_REFERRAL_CODE') {
        setError(t('referralPromptModal.invalidCode'));
      } else {
        setError(errMsg || t('referralPromptModal.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={loading ? undefined : onClose}>
      <div
        className="modal-content modal-content-animate w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <HiOutlineGift className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-gray-900">
            {t('referralPromptModal.title')}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            {t('referralPromptModal.description')}
          </p>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-2.5 text-xs text-amber-800">
            <HiOutlineInformationCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              {t('referralPromptModal.warningNote')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('referralPromptModal.label')}
            </label>
            <input
              type="text"
              value={code}
              onChange={handleCodeChange}
              autoFocus
              maxLength={20}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder={t('referralPromptModal.placeholder')}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end items-center gap-2 pt-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              {t('referralPromptModal.skip')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !code.trim()}
            >
              {loading ? t('referralPromptModal.submitting') : t('referralPromptModal.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ReferralPromptModal;
