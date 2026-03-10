/**
 * Build cron expression from schedule form state.
 *
 * @param {object} scheduleForm schedule form payload
 * @returns {string}
 */
export const buildCronExpression = (scheduleForm = {}) => {
  const { scheduleType, scheduleDate, scheduleTime, weeklyDay } = scheduleForm;
  if (!scheduleTime) return '';

  const [hour, minute] = String(scheduleTime).split(':');
  if (hour === undefined || minute === undefined) return '';

  switch (scheduleType) {
    case 'once': {
      if (!scheduleDate) return '';
      const date = new Date(scheduleDate);
      return `${minute} ${hour} ${date.getDate()} ${date.getMonth() + 1} *`;
    }
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${weeklyDay || '1'}`;
    case 'monthly':
      return `${minute} ${hour} 1 * *`;
    default:
      return '';
  }
};

/**
 * Resolve Vietnamese schedule type label.
 *
 * @param {string} type schedule type
 * @returns {string}
 */
export const getScheduleTypeLabel = (type) => {
  switch (type) {
    case 'once':
      return 'Chạy 1 lần';
    case 'daily':
      return 'Hàng ngày';
    case 'weekly':
      return 'Hàng tuần';
    case 'monthly':
      return 'Hàng tháng';
    default:
      return type;
  }
};

/**
 * Check if a one-time schedule has already run.
 *
 * @param {object} schedule schedule item
 * @returns {boolean}
 */
export const isCompletedOnceSchedule = (schedule) =>
  schedule?.scheduleType === 'once' && Number(schedule?.runCount || 0) > 0;

/**
 * Check if one-time schedule was stopped on its last run.
 *
 * @param {object} schedule schedule item
 * @returns {boolean}
 */
export const isStoppedOnceSchedule = (schedule) =>
  schedule?.scheduleType === 'once'
  && Number(schedule?.runCount || 0) > 0
  && String(schedule?.lastRunStatus || '').toLowerCase() === 'stopped';

/**
 * Check if one-time schedule cannot be modified anymore.
 *
 * @param {object} schedule schedule item
 * @returns {boolean}
 */
export const isReadonlyOnceSchedule = (schedule) =>
  isStoppedOnceSchedule(schedule) || isCompletedOnceSchedule(schedule);

/**
 * Resolve weekly day label from select options.
 *
 * @param {string|number} dayValue cron day value
 * @param {Array<{value: string, label: string}>} weeklyDayOptions day options
 * @returns {string}
 */
export const getWeeklyDayLabel = (dayValue, weeklyDayOptions = []) => {
  const matched = weeklyDayOptions.find((item) => item.value === String(dayValue));
  return matched ? matched.label : 'Thứ 2';
};

/**
 * Parse weekly day from cron expression.
 *
 * @param {string} cronExpression cron string
 * @param {Array<{value: string, label: string}>} weeklyDayOptions day options
 * @returns {string}
 */
export const getWeeklyDayFromCron = (cronExpression = '', weeklyDayOptions = []) => {
  const cronParts = String(cronExpression).trim().split(/\s+/);
  if (cronParts.length < 5) return '1';
  const dayOfWeek = cronParts[4];
  const matched = weeklyDayOptions.find((item) => item.value === String(dayOfWeek));
  return matched ? matched.value : '1';
};

/**
 * Resolve UI label for schedule status.
 *
 * @param {object} schedule schedule item
 * @returns {string}
 */
export const getScheduleStatusLabel = (schedule) => {
  if (isStoppedOnceSchedule(schedule)) return 'Đã dừng';
  if (isCompletedOnceSchedule(schedule)) return 'Đã hoàn thành';
  return schedule?.enabled ? 'Đang bật' : 'Đã tắt';
};

/**
 * Resolve badge class for schedule status.
 *
 * @param {object} schedule schedule item
 * @returns {string}
 */
export const getScheduleStatusClassName = (schedule) => {
  if (isStoppedOnceSchedule(schedule)) return 'badge-gray';
  if (isCompletedOnceSchedule(schedule)) return 'badge-info';
  return schedule?.enabled ? 'badge-success' : 'badge-gray';
};
