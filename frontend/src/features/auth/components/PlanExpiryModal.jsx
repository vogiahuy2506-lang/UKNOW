import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineClock,
  HiOutlineExclamation,
  HiOutlineShieldExclamation,
  HiOutlineX,
  HiOutlineArrowRight,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Modal cảnh báo sắp hết hạn / đã hết hạn gói dịch vụ (PR-1).
 * Thiết kế có nút đóng (không chặn người dùng), hỗ trợ 3 giọng thông báo theo thứ tự:
 * 1. Đã hết hạn (isFullyExpired || planRevokedAfterExpiry)
 * 2. Đang trong ân hạn (isInGracePeriod)
 * 3. Sắp hết hạn trong <= 3 ngày (daysUntilExpiry <= 3)
 *
 * @param {{
 *   isOpen: boolean,
 *   billingStatus: object|null,
 *   onClose: () => void
 * }} props
 */
const PlanExpiryModal = ({ isOpen, billingStatus, onClose }) => {
  const { t } = useI18n();
  const navigate = useNavigate();

  if (!isOpen || !billingStatus) return null;

  const isExpired = Boolean(billingStatus.isFullyExpired || billingStatus.planRevokedAfterExpiry);
  const isInGrace = Boolean(billingStatus.isInGracePeriod);
  const daysUntilExpiry = typeof billingStatus.daysUntilExpiry === 'number' ? billingStatus.daysUntilExpiry : null;
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 3 && daysUntilExpiry > 0;

  // Xác định cấu hình hiển thị theo đúng thứ tự bảng 3.3 của plan
  let config = null;

  if (isExpired) {
    config = {
      title: t('planExpiryModal.expiredTitle'),
      description: t('planExpiryModal.expiredDesc'),
      badge: t('planExpiryModal.badgeExpired'),
      badgeClass: 'bg-red-50 text-red-700 border-red-200',
      iconContainerClass: 'bg-red-100 text-red-600 border-red-200',
      accentGradient: 'from-red-500 via-orange-500 to-amber-500',
      Icon: HiOutlineShieldExclamation,
    };
  } else if (isInGrace) {
    const graceDays = billingStatus.graceDaysLeft != null ? billingStatus.graceDaysLeft : 1;
    config = {
      title: t('planExpiryModal.graceTitle'),
      description: t('planExpiryModal.graceDesc', { days: graceDays }),
      badge: t('planExpiryModal.badgeGrace'),
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      iconContainerClass: 'bg-amber-100 text-amber-600 border-amber-200',
      accentGradient: 'from-amber-500 via-orange-500 to-red-500',
      Icon: HiOutlineClock,
    };
  } else if (isExpiringSoon) {
    config = {
      title: t('planExpiryModal.expiringTitle'),
      description: t('planExpiryModal.expiringDesc', { days: daysUntilExpiry }),
      badge: t('planExpiryModal.badgeExpiring'),
      badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
      iconContainerClass: 'bg-orange-100 text-orange-600 border-orange-200',
      accentGradient: 'from-orange-500 via-amber-500 to-yellow-500',
      Icon: HiOutlineExclamation,
    };
  } else {
    // Không thuộc diện cần hiển thị cảnh báo
    return null;
  }

  const handleUpgrade = () => {
    onClose();
    navigate('/app/billing');
  };

  const { Icon } = config;

  return createPortal(
    <div
      className="modal-overlay z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm fixed inset-0"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-expiry-modal-title"
    >
      <div
        className="modal-content modal-content-animate relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative Top Accent Banner */}
        <div className={`h-2 bg-gradient-to-r ${config.accentGradient}`} />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label={t('common.close') || 'Đóng'}
        >
          <HiOutlineX className="w-5 h-5" />
        </button>

        <div className="p-6 text-center">
          {/* Header Icon */}
          <div className="flex justify-center mb-4">
            <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-sm ${config.iconContainerClass}`}>
              <Icon className="w-8 h-8" />
            </div>
          </div>

          {/* Badge */}
          <div className="mb-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.badgeClass}`}>
              {config.badge}
            </span>
          </div>

          {/* Title */}
          <h2 id="plan-expiry-modal-title" className="text-xl font-bold text-gray-900 mb-2">
            {config.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-gray-600 mb-6 leading-relaxed">
            {config.description}
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row-reverse gap-3">
            <button
              type="button"
              onClick={handleUpgrade}
              className="w-full flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              <span>{t('planExpiryModal.upgradeNow')}</span>
              <HiOutlineArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200"
            >
              {t('planExpiryModal.remindLater')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PlanExpiryModal;
