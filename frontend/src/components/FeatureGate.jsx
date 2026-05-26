import { useI18n } from '../../i18n';
import { HiLockClosed, HiSparkles } from 'react-icons/hi';

const FeatureGate = ({ feature, children, fallback = null, showUpgradePrompt = true }) => {
  const { t } = useI18n();

  // For now, we'll use a simple approach
  // In production, this should check against actual user features from API
  const hasFeature = true; // Placeholder - should come from context/props

  if (hasFeature) {
    return children;
  }

  if (!showUpgradePrompt) {
    return fallback || null;
  }

  return (
    <div className="relative">
      {/* Blurred content */}
      <div className="filter blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm mx-auto text-center">
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
            <HiLockClosed className="w-6 h-6 text-primary-600" />
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Tính năng Premium
          </h3>

          <p className="text-gray-500 mb-4">
            Tính năng này yêu cầu gói dịch vụ cao cấp hơn.
          </p>

          <button className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            <HiSparkles className="w-5 h-5" />
            {t('plans.upgrade')} ngay
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeatureGate;
