import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineSparkles,
  HiOutlineCheckCircle,
  HiOutlineCalendar,
  HiOutlineX,
  HiOutlineArrowRight,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Modal chào mừng và thông báo kích hoạt gói dùng thử cho tài khoản mới.
 *
 * @param {{
 *   isOpen: boolean,
 *   trial: { activePlanId?: number, planCode?: string, planName?: string, durationDays?: number, expiresAt?: string } | null,
 *   onClose: () => void
 * }} props
 */
const TrialWelcomeModal = ({ isOpen, trial, onClose }) => {
  const { t } = useI18n();
  const navigate = useNavigate();

  if (!isOpen || !trial) return null;

  const durationDays = trial.durationDays != null ? trial.durationDays : 10;
  const expiresText = trial.expiresAt
    ? new Date(trial.expiresAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '';

  const handleViewPlans = () => {
    onClose();
    navigate('/app/billing');
  };

  const benefits = [];
  if (trial.messagesPerPeriod && Number(trial.messagesPerPeriod) > 0) {
    benefits.push(t('trialWelcome.featureMessages', { count: trial.messagesPerPeriod }));
  }
  if (trial.aiCreditsPerPeriod && Number(trial.aiCreditsPerPeriod) > 0) {
    benefits.push(t('trialWelcome.featureAiCredits', { count: trial.aiCreditsPerPeriod }));
  }
  if (trial.maxChatbots && Number(trial.maxChatbots) > 0) {
    benefits.push(t('trialWelcome.featureChatbot', { count: trial.maxChatbots }));
  } else if (trial.maxChatbots === 0 || trial.maxChatbots == null) {
    benefits.push(t('trialWelcome.featureChatbotUnlimited'));
  }

  return createPortal(
    <div className="modal-overlay z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm fixed inset-0" onClick={onClose}>
      <div
        className="modal-content modal-content-animate relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative Top Accent Banner */}
        <div className="h-2.5 bg-gradient-to-r from-orange-500 via-amber-500 to-primary-600" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label={t('common.close') || 'Đóng'}
        >
          <HiOutlineX className="w-5 h-5" />
        </button>

        <div className="p-6 md:p-8">
          {/* Header Icon + Title */}
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-orange-100 to-amber-100 border border-orange-200/60 flex items-center justify-center text-orange-600 mb-4 shadow-sm">
              <HiOutlineSparkles className="w-7 h-7 animate-pulse" />
            </div>

            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1.5">
              {t('trialWelcome.title')}
            </h2>
            <p className="text-sm text-gray-600 max-w-sm mb-5">
              {t('trialWelcome.subtitle')}
            </p>

            {/* Trial Plan Badge Card */}
            <div className="w-full bg-gradient-to-br from-orange-50/80 via-amber-50/50 to-orange-50/30 border border-orange-200/80 rounded-xl p-4 mb-5 text-left">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider bg-orange-500 text-white rounded-full shadow-sm">
                    {trial.planName || t('trialWelcome.planLabel')}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {t('trialWelcome.duration', { days: durationDays })}
                  </span>
                </div>
              </div>

              {expiresText && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-1">
                  <HiOutlineCalendar className="w-4 h-4 text-orange-600 flex-shrink-0" />
                  <span>{t('trialWelcome.expiresOn', { date: expiresText })}</span>
                </div>
              )}
            </div>

            {/* Benefit Highlights List */}
            {benefits.length > 0 && (
              <div className="w-full text-left mb-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                  {t('trialWelcome.highlightTitle')}
                </h4>
                <ul className="space-y-2.5">
                  {benefits.map((benefit, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <HiOutlineCheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center gap-3 w-full">
              <button
                type="button"
                onClick={handleViewPlans}
                className="w-full sm:w-1/2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{t('trialWelcome.viewPlans')}</span>
                <HiOutlineArrowRight className="w-4 h-4 text-gray-500" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-1/2 px-4 py-2.5 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-1.5"
              >
                <span>{t('trialWelcome.startNow')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TrialWelcomeModal;
