import { useState, useEffect } from 'react';
import { HiTrendingUp, HiTrendingDown, HiExclamation } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const UsageTracker = ({ resourceType, title, used, limit, icon: Icon, color = 'primary' }) => {
  const { t } = useI18n();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const remaining = Math.max(0, limit - used);
  const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const isExceeded = limit > 0 && used >= limit;
  const isWarning = percentage >= 80 && percentage < 100;

  const colorClasses = {
    primary: {
      bg: 'bg-primary-100',
      text: 'text-primary-600',
      bar: 'bg-primary-500',
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-600',
      bar: 'bg-green-500',
    },
    orange: {
      bg: 'bg-orange-100',
      text: 'text-orange-600',
      bar: 'bg-orange-500',
    },
    red: {
      bg: 'bg-red-100',
      text: 'text-red-600',
      bar: 'bg-red-500',
    },
  };

  const colors = colorClasses[color] || colorClasses.primary;

  const getBarColor = () => {
    if (isExceeded) return 'bg-red-500';
    if (isWarning) return 'bg-orange-500';
    return colors.bar;
  };

  return (
    <>
      <div
        className={`bg-white rounded-xl p-4 border ${
          isExceeded ? 'border-red-200' : isWarning ? 'border-orange-200' : 'border-gray-100'
        } hover:shadow-md transition-shadow`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${colors.text}`} />
              </div>
            )}
            <span className="text-sm font-medium text-gray-700">{title}</span>
          </div>

          {isExceeded && (
            <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
              <HiExclamation className="w-3.5 h-3.5" />
              {t('plans.expired')}
            </span>
          )}
          {isWarning && (
            <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
              <HiTrendingUp className="w-3.5 h-3.5" />
              80%+
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getBarColor()}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            {used} / {limit}
          </span>
          <span className={`font-medium ${isExceeded ? 'text-red-500' : 'text-gray-700'}`}>
            {remaining} {t('plans.remaining')}
          </span>
        </div>

        {/* Upgrade CTA */}
        {isExceeded && (
          <button
            onClick={() => setShowUpgradeModal(true)}
            className="w-full mt-3 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            {t('plans.upgrade')}
          </button>
        )}
      </div>
    </>
  );
};

export default UsageTracker;
