import { FaClock, FaCalendarAlt, FaSyncAlt } from 'react-icons/fa';
import { useI18n } from '../../../i18n';

const SCHEDULE_TYPES = {
  now: { label: 'Gửi ngay', icon: FaClock },
  scheduled: { label: 'Hẹn giờ', icon: FaCalendarAlt },
  recurring: { label: 'Lặp lại', icon: FaSyncAlt }
};

const RECURRENCE_PATTERNS = [
  { value: 'daily', label: 'Hàng ngày' },
  { value: 'weekly', label: 'Hàng tuần' },
  { value: 'monthly', label: 'Hàng tháng' }
];

export default function ScheduleSelector({ value, onChange }) {
  const { t } = useI18n();
  const scheduleType = value?.schedule_type || 'now';
  const scheduledAt = value?.scheduled_at || '';
  const recurrencePattern = value?.recurrence_pattern || 'daily';
  const recurrenceEndDate = value?.recurrence_end_date || '';

  const updateValue = (updates) => {
    onChange?.({ ...value, ...updates });
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    return now.toISOString().slice(0, 16);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(SCHEDULE_TYPES).map(([type, config]) => {
          const Icon = config.icon;
          const isSelected = scheduleType === type;

          return (
            <button
              key={type}
              type="button"
              onClick={() => updateValue({ schedule_type: type })}
              className={`
                flex items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200
                ${isSelected
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 shadow-sm'
                  : 'border border-gray-200 dark:border-dk-border hover:border-orange-200 dark:hover:border-orange-800 hover:bg-gray-50 dark:hover:bg-dk-raised/50 text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text'
                }
              `}
            >
              <Icon className={`w-5 h-5 ${isSelected ? 'text-orange-500' : 'text-gray-400 dark:text-dk-muted'}`} />
              <span className="text-sm font-semibold">
                {t(`notificationCenter.schedule.${type}`, config.label)}
              </span>
            </button>
          );
        })}
      </div>

      {scheduleType === 'scheduled' && (
        <div className="bg-white dark:bg-dk-surface rounded-xl border border-gray-200 dark:border-dk-border p-4">
          <label className="block text-sm font-medium text-gray-600 dark:text-dk-text mb-2">
            {t('notificationCenter.schedule.pickDateTime')}
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => updateValue({ scheduled_at: e.target.value })}
            min={getMinDateTime()}
            className="w-full px-4 py-3 border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text rounded-xl focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/40 focus:border-orange-400 transition-all"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-dk-text2">
            {t('notificationCenter.schedule.scheduledHint')}
          </p>
        </div>
      )}

      {scheduleType === 'recurring' && (
        <div className="bg-white dark:bg-dk-surface rounded-xl border border-gray-200 dark:border-dk-border p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dk-text mb-3">
              {t('notificationCenter.schedule.repeatCycle')}
            </label>
            <div className="flex gap-2">
              {RECURRENCE_PATTERNS.map(pattern => (
                <button
                  key={pattern.value}
                  type="button"
                  onClick={() => updateValue({ recurrence_pattern: pattern.value })}
                  className={`
                    px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                    ${recurrencePattern === pattern.value
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-200 dark:hover:bg-dk-strong'
                    }
                  `}
                >
                  {t(`notificationCenter.schedule.${pattern.value}`, pattern.label)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-dk-text mb-2">
              {t('notificationCenter.schedule.endDateOptional')}
            </label>
            <input
              type="datetime-local"
              value={recurrenceEndDate}
              onChange={(e) => updateValue({ recurrence_end_date: e.target.value })}
              min={getMinDateTime()}
              className="w-full px-4 py-3 border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text rounded-xl focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/40 focus:border-orange-400 transition-all"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-dk-text2">
              {t('notificationCenter.schedule.endDateHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export { SCHEDULE_TYPES, RECURRENCE_PATTERNS };
