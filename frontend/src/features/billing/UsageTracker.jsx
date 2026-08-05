import { useNavigate } from 'react-router-dom';
import { HiTrendingUp, HiExclamation } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const UsageTracker = ({ resourceType: _resourceType, title, used, limit, icon: Icon, color = 'primary' }) => {
  const { t } = useI18n();
  const navigate = useNavigate();

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
    <div
      className={`bg-white rounded-xl p-4 border ${
        isExceeded ? 'border-red-200' : isWarning ? 'border-orange-200' : 'border-gray-100'
      } hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon ? (
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <Icon className={`w-5 h-5 ${colors.text}`} />
            </div>
          ) : (
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <HiTrendingUp className={`w-5 h-5 ${colors.text}`} />
            </div>
          )}
          <h3 className="font-medium text-gray-900">{title}</h3>
        </div>
        {isExceeded && <HiExclamation className="w-5 h-5 text-red-500" />}
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getBarColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {used} / {limit}
        </span>
        <span className={`font-medium ${isExceeded ? 'text-red-500' : 'text-gray-700'}`}>
          {remaining} {t('plans.remaining')}
        </span>
      </div>

      {isExceeded && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate('/app/topup')}
            className="py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
          >
            {t('plans.buyTopup')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/pricing')}
            className="py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            {t('plans.upgrade')}
          </button>
        </div>
      )}
    </div>
  );
};

export default UsageTracker;
