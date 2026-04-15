/**
 * Chuẩn hóa số nguyên dương từ input.
 *
 * @param {number|string} rawValue giá trị cần chuẩn hóa
 * @returns {number|null} số nguyên dương hoặc null nếu không hợp lệ
 */
const toPositiveInt = (rawValue) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

/**
 * Cộng thêm khoảng thời gian vào thời điểm hiện tại theo đơn vị user chọn.
 *
 * Luồng hoạt động:
 * 1. Chuẩn hóa delay value về số nguyên dương.
 * 2. Quy đổi sang mili-giây theo đơn vị phút/giờ/ngày.
 * 3. Trả về Date mới nếu hợp lệ, ngược lại trả null.
 *
 * @param {number|string} delayValue giá trị số lượng
 * @param {'minutes'|'hours'|'days'} delayUnit đơn vị cộng thêm
 * @returns {Date|null}
 */
export const buildDelayedRunDate = (delayValue, delayUnit) => {
  const amount = toPositiveInt(delayValue);
  if (!amount) return null;
  const unitToMs = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  const unitMs = unitToMs[delayUnit];
  if (!unitMs) return null;
  return new Date(Date.now() + (amount * unitMs));
};

/**
 * Build cron expression from schedule form state.
 *
 * @param {object} scheduleForm schedule form payload
 * @returns {string}
 */
export const buildCronExpression = (scheduleForm = {}) => {
  const {
    scheduleType,
    scheduleDate,
    scheduleTime,
    weeklyDay,
    customIntervalDays,
    delayValue,
    delayUnit,
  } = scheduleForm;

  if (scheduleType === 'after_delay') {
    const delayedDate = buildDelayedRunDate(delayValue, delayUnit);
    if (!delayedDate) return '';
    const minute = delayedDate.getMinutes();
    const hour = delayedDate.getHours();
    return `${minute} ${hour} ${delayedDate.getDate()} ${delayedDate.getMonth() + 1} *`;
  }

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
    case 'custom': {
      const intervalDays = toPositiveInt(customIntervalDays);
      if (!intervalDays) return '';
      return `${minute} ${hour} */${intervalDays} * *`;
    }
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
    case 'custom':
      return 'Tùy chỉnh';
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

/**
 * Lọc danh sách lịch chạy theo id chiến dịch (so khớp kiểu số).
 *
 * Luồng hoạt động:
 * 1. Chuẩn hóa `campaignId` về số nguyên.
 * 2. Giữ các bản ghi có `campaignId` trùng khớp.
 *
 * @param {Array<object>} schedules danh sách lịch từ API
 * @param {number|string} campaignId id chiến dịch
 * @returns {Array<object>}
 */
export const filterSchedulesByCampaignId = (schedules = [], campaignId) => {
  const target = Number(campaignId);
  if (!Number.isFinite(target)) return [];
  return schedules.filter((item) => Number(item?.campaignId) === target);
};

/**
 * Đọc phút và giờ từ cron 5 trường do backend tạo (phút, giờ, ngày-tháng, ...).
 * Chỉ trả kết quả khi hai trường đầu là số cụ thể (bỏ qua wildcard như `*`).
 *
 * @param {string} cronExpression chuỗi cron
 * @returns {{ minute: number, hour: number }|null}
 */
export const parseCronMinuteHourFiveField = (cronExpression = '') => {
  const parts = String(cronExpression).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const minute = Number.parseInt(parts[0], 10);
  const hour = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  return { minute, hour };
};

/**
 * Giờ chạy dạng 24h (VD 09:05) lấy từ cron; null nếu không đọc được.
 *
 * @param {string} cronExpression chuỗi cron
 * @returns {string|null}
 */
export const formatScheduleRunClockFromCron = (cronExpression) => {
  const parsed = parseCronMinuteHourFiveField(cronExpression);
  if (!parsed) return null;
  const hh = String(parsed.hour).padStart(2, '0');
  const mm = String(parsed.minute).padStart(2, '0');
  return `${hh}:${mm}`;
};

/**
 * Mô tả mẫu lịch ngắn gọn cho người dùng (ưu tiên weekly kèm thứ trong tuần), có kèm giờ chạy nếu đọc được từ cron.
 *
 * @param {object} schedule bản ghi lịch
 * @param {(cron: string) => string} getWeeklyDayFromCron hàm parse thứ từ cron
 * @param {(day: string) => string} getWeeklyDayLabel hàm map thứ → nhãn tiếng Việt
 * @returns {string}
 */
export const getSchedulePatternSummaryVi = (schedule, getWeeklyDayFromCron, getWeeklyDayLabel) => {
  const type = String(schedule?.scheduleType || '').trim();
  const cron = String(schedule?.cronExpression || '');
  let base;
  if (type === 'weekly') {
    const dayValue = getWeeklyDayFromCron(cron);
    base = `Hàng tuần vào ${getWeeklyDayLabel(dayValue)}`;
  } else {
    base = getScheduleTypeLabel(type);
  }
  const clock = formatScheduleRunClockFromCron(cron);
  if (clock) {
    return `${base} — lúc ${clock}`;
  }
  return base;
};
