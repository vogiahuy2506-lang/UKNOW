import { FaClock, FaCalendarAlt, FaSyncAlt } from 'react-icons/fa';

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
                  ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                  : 'border border-gray-200 hover:border-orange-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900'
                }
              `}
            >
              <Icon className={`w-5 h-5 ${isSelected ? 'text-orange-500' : 'text-gray-400'}`} />
              <span className="text-sm font-semibold">{config.label}</span>
            </button>
          );
        })}
      </div>

      {scheduleType === 'scheduled' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-600 mb-2">
            Chọn ngày và giờ gửi
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => updateValue({ scheduled_at: e.target.value })}
            min={getMinDateTime()}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all"
          />
          <p className="mt-2 text-xs text-gray-500">
            Thông báo sẽ được gửi vào thời gian đã chọn
          </p>
        </div>
      )}

      {scheduleType === 'recurring' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-3">
              Chu kỳ lặp
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
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  {pattern.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              Ngày kết thúc (tùy chọn)
            </label>
            <input
              type="datetime-local"
              value={recurrenceEndDate}
              onChange={(e) => updateValue({ recurrence_end_date: e.target.value })}
              min={getMinDateTime()}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-400 transition-all"
            />
            <p className="mt-2 text-xs text-gray-500">
              Để trống nếu muốn lặp vô hạn
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export { SCHEDULE_TYPES, RECURRENCE_PATTERNS };
