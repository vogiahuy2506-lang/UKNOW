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
 * Parse chu kỳ ngày từ cron custom ( ở trường ngày-tháng).
 *
 * @param {string} cronExpression chuỗi cron
 * @returns {number|null} số ngày lặp hoặc null nếu không hợp lệ
 */
export const parseCustomIntervalDaysFromCron = (cronExpression = '') => {
  const parts = String(cronExpression).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const matched = String(parts[2]).match(/^\*\/(\d+)$/);
  if (!matched) return null;
  const intervalDays = Number.parseInt(matched[1], 10);
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  return intervalDays;
};

/**
 * Chuẩn hóa input về đối tượng Date hợp lệ.
 *
 * @param {string|number|Date|null|undefined} value dữ liệu thời gian đầu vào
 * @returns {Date|null}
 */
const toValidDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

/**
 * Gán giờ/phút từ cron vào một mốc Date.
 *
 * @param {Date} baseDate mốc ngày cần giữ lại
 * @param {string} cronExpression chuỗi cron
 * @returns {Date}
 */
const applyCronClockToDate = (baseDate, cronExpression) => {
  const next = new Date(baseDate.getTime());
  const parsedClock = parseCronMinuteHourFiveField(cronExpression);
  if (!parsedClock) return next;
  next.setHours(parsedClock.hour, parsedClock.minute, 0, 0);
  return next;
};

/**
 * Tính thời điểm chạy tiếp theo cho lịch `custom` (mỗi N ngày, neo theo ngày tạo/lần chạy gần nhất).
 *
 * Luồng hoạt động:
 * 1. Parse `intervalDays` từ cron.
 * 2. Nếu đã có `lastRunAt` thì mốc kế tiếp = `lastRunAt + N ngày`.
 * 3. Nếu chưa chạy lần nào thì ưu tiên ngày tạo; quá giờ thì nhảy thêm N ngày.
 * 4. Luôn đẩy mốc kế tiếp >= thời điểm hiện tại để hiển thị rõ ràng cho người dùng.
 *
 * @param {object} schedule bản ghi lịch
 * @param {Date} now thời điểm tham chiếu
 * @returns {Date|null}
 */
const resolveCustomScheduleNextRunAt = (schedule, now) => {
  const intervalDays = parseCustomIntervalDaysFromCron(schedule?.cronExpression);
  if (!intervalDays) return toValidDate(schedule?.nextRunAt);

  const nowDate = toValidDate(now) || new Date();
  const lastRunDate = toValidDate(schedule?.lastRunAt);
  const createdDate = toValidDate(schedule?.createdAt);
  const anchorDate = lastRunDate || createdDate;
  if (!anchorDate) return null;

  let candidate = applyCronClockToDate(anchorDate, schedule?.cronExpression);
  if (lastRunDate) {
    candidate.setDate(candidate.getDate() + intervalDays);
  } else if (candidate < nowDate) {
    candidate.setDate(candidate.getDate() + intervalDays);
  }

  while (candidate < nowDate) {
    candidate.setDate(candidate.getDate() + intervalDays);
  }

  return candidate;
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
    case 'hourly':
      return 'Hàng giờ';
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

/** Múi giờ cố định khớp `scheduler.js` (node-cron timezone). */
const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Đọc các thành phần lịch — giờ tường tại Asia/Ho_Chi_Minh — từ một mốc thời gian tuyệt đối.
 *
 * @param {Date} instant mốc thời gian
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }}
 */
const getHanoiWallClockParts = (instant) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: HANOI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }
  return {
    year: Number.parseInt(values.year, 10),
    month: Number.parseInt(values.month, 10),
    day: Number.parseInt(values.day, 10),
    hour: Number.parseInt(values.hour, 10),
    minute: Number.parseInt(values.minute, 10),
    second: Number.parseInt(values.second, 10),
  };
};

/**
 * Dựng `Date` (instant UTC) từ giờ tường UTC+7 (Việt Nam không DST).
 *
 * @param {number} y năm
 * @param {number} mon tháng (1–12)
 * @param {number} d ngày
 * @param {number} h giờ (0–23)
 * @param {number} min phút
 * @param {number} [s=0] giây
 * @returns {Date}
 */
const hanoiWallClockToDate = (y, mon, d, h, min, s = 0) => {
  // UTC+7: instant = UTC giờ phút tương ứng sau khi trừ 7 giờ khỏi mốc «naive» cùng ngày dương lịch
  return new Date(Date.UTC(y, mon - 1, d, h - 7, min, s));
};

/**
 * Thứ trong tuần (0 = Chủ nhật … 6 = Thứ bảy) theo lịch tại Hanoi tại `instant`.
 *
 * @param {Date} instant mốc tham chiếu
 * @returns {number}
 */
const getHanoiWeekdaySun0 = (instant) => {
  const { year, month, day } = getHanoiWallClockParts(instant);
  const noonHanoi = hanoiWallClockToDate(year, month, day, 12, 0, 0);
  return noonHanoi.getUTCDay();
};

/**
 * Cộng số ngày dương lịch theo múi Hanoi (neo trưa để tránh lệch ranh giới).
 *
 * @param {number} y năm
 * @param {number} mon tháng (1–12)
 * @param {number} d ngày
 * @param {number} deltaDays số ngày cộng (có thể âm)
 * @returns {{ y: number, m: number, d: number }}
 */
const addHanoiCalendarDays = (y, mon, d, deltaDays) => {
  const noonHanoi = hanoiWallClockToDate(y, mon, d, 12, 0, 0);
  const moved = new Date(noonHanoi.getTime() + deltaDays * 86400000);
  const p = getHanoiWallClockParts(moved);
  return { y: p.year, m: p.month, d: p.day };
};

/**
 * Lần chạy kế tiếp cho cron «mỗi giờ tại phút M» (dạng `M * * * *`).
 *
 * @param {Date} now thời điểm hiện tại
 * @param {number} cronMinute phút trong giờ (0–59)
 * @returns {Date}
 */
const resolveHourlyPatternNextRunAt = (now, cronMinute) => {
  const p = getHanoiWallClockParts(now);
  let cand = hanoiWallClockToDate(p.year, p.month, p.day, p.hour, cronMinute, 0);
  if (cand <= now) {
    cand = hanoiWallClockToDate(p.year, p.month, p.day, p.hour + 1, cronMinute, 0);
  }
  return cand;
};

/**
 * Lần chạy kế tiếp cho lịch lặp chuẩn (hàng ngày / tuần / tháng / mỗi giờ), neo theo «bây giờ» tại Hanoi.
 *
 * Luồng hoạt động:
 * 1. Bỏ qua cron một mốc cố định hoặc custom N ngày (đã xử lý nơi khác).
 * 2. Theo `scheduleType` và hình dạng 5 trường cron, suy ra nhánh phù hợp.
 * 3. Với mỗi nhánh, tính mốc kế tiếp ≥ `now` theo giờ tường UTC+7.
 *
 * @param {object} schedule bản ghi lịch
 * @param {Date} now thời điểm tham chiếu
 * @returns {Date|null}
 */
const resolveStandardRecurrenceNextRunAt = (schedule, now) => {
  const cron = String(schedule?.cronExpression || '').trim();
  const parts = cron.split(/\s+/).filter(Boolean);
  if (parts.length < 5) return null;
  if (isCronExpressionOneTimeRun(cron)) return null;

  const nowDate = toValidDate(now) || new Date();
  const type = String(schedule?.scheduleType || '').toLowerCase();

  // Mỗi giờ: `phút * * * *` (phút cố định, giờ wildcard)
  const isHourlyShape = parts[1] === '*'
    && parts[2] === '*'
    && parts[3] === '*'
    && parts[4] === '*'
    && /^\d+$/.test(parts[0]);
  if (type === 'hourly' || isHourlyShape) {
    const cronMinute = Number.parseInt(parts[0], 10);
    if (!Number.isFinite(cronMinute) || cronMinute < 0 || cronMinute > 59) return null;
    return resolveHourlyPatternNextRunAt(nowDate, cronMinute);
  }

  const minute = Number.parseInt(parts[0], 10);
  const hour = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  const p = getHanoiWallClockParts(nowDate);

  // Hàng tháng (ngày 1): `M H 1 * *`
  const isMonthlyShape = parts[2] === '1' && parts[3] === '*' && parts[4] === '*';
  if (type === 'monthly' || isMonthlyShape) {
    let cand = hanoiWallClockToDate(p.year, p.month, 1, hour, minute, 0);
    if (cand <= nowDate) {
      cand = hanoiWallClockToDate(p.year, p.month + 1, 1, hour, minute, 0);
    }
    return cand;
  }

  // Hàng tuần: `M H * * dow`
  const isWeeklyShape = parts[2] === '*' && parts[3] === '*' && parts[4] !== '*';
  if (type === 'weekly' || isWeeklyShape) {
    let targetDow = Number.parseInt(parts[4], 10);
    if (targetDow === 7) targetDow = 0; // node-cron: 0 và 7 đều là Chủ nhật
    if (!Number.isFinite(targetDow) || targetDow < 0 || targetDow > 6) return null;
    const currentDow = getHanoiWeekdaySun0(nowDate);
    let daysToAdd = (targetDow - currentDow + 7) % 7;
    const first = addHanoiCalendarDays(p.year, p.month, p.day, daysToAdd);
    let cand = hanoiWallClockToDate(first.y, first.m, first.d, hour, minute, 0);
    if (cand <= nowDate) {
      const bumped = addHanoiCalendarDays(first.y, first.m, first.d, 7);
      cand = hanoiWallClockToDate(bumped.y, bumped.m, bumped.d, hour, minute, 0);
    }
    return cand;
  }

  // Hàng ngày: `M H * * *`
  const isDailyShape = parts[2] === '*' && parts[3] === '*' && parts[4] === '*';
  if (type === 'daily' || isDailyShape) {
    let cand = hanoiWallClockToDate(p.year, p.month, p.day, hour, minute, 0);
    if (cand <= nowDate) {
      const nextDay = addHanoiCalendarDays(p.year, p.month, p.day, 1);
      cand = hanoiWallClockToDate(nextDay.y, nextDay.m, nextDay.d, hour, minute, 0);
    }
    return cand;
  }

  return null;
};

/**
 * Tính mốc chạy tiếp theo cho từng lịch để phục vụ màn hình xem thiết lập.
 *
 * Luồng hoạt động:
 * 1. Lịch custom (mỗi N ngày): tính theo mốc neo + cron.
 * 2. Lịch lặp chuẩn (hàng ngày / tuần / tháng / mỗi giờ): suy từ cron và ngày giờ hiện tại (UTC+7) nếu suy được.
 * 3. Ngược lại: dùng `nextRunAt` từ API nếu có.
 *
 * @param {object} schedule bản ghi lịch
 * @param {Date} [now=new Date()] thời điểm tham chiếu
 * @returns {Date|null}
 */
export const resolveScheduleNextRunAt = (schedule, now = new Date()) => {
  if (!schedule) return null;
  if (String(schedule?.scheduleType || '').toLowerCase() === 'custom') {
    return resolveCustomScheduleNextRunAt(schedule, now);
  }
  const fromPattern = resolveStandardRecurrenceNextRunAt(schedule, now);
  if (fromPattern) return fromPattern;
  return toValidDate(schedule?.nextRunAt);
};

/**
 * Nhận diện cron 5 trường dạng «một mốc cố định»: ngày-tháng cố định, thứ trong tuần là *.
 * Không trùng daily hoặc weekly (có * ở ngày hoặc tháng), không trùng custom (bước nhảy ở ngày).
 *
 * @param {string} cronExpression chuỗi cron
 * @returns {boolean}
 */
export const isCronExpressionOneTimeRun = (cronExpression = '') => {
  const parts = String(cronExpression).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 5) return false;
  if (parts[4] !== '*') return false;
  if (parts[2].includes('*') || parts[3].includes('*')) return false;
  const dom = Number.parseInt(parts[2], 10);
  const mon = Number.parseInt(parts[3], 10);
  if (!Number.isFinite(dom) || !Number.isFinite(mon)) return false;
  if (dom < 1 || dom > 31 || mon < 1 || mon > 12) return false;
  return true;
};

/**
 * Lịch chạy một lần: theo `scheduleType` hoặc theo hình dạng cron (phòng dữ liệu lệch).
 *
 * @param {object} schedule bản ghi lịch
 * @returns {boolean}
 */
export const isScheduleOneTimeRun = (schedule) => {
  const t = String(schedule?.scheduleType || '').toLowerCase();
  if (t === 'once') return true;
  return isCronExpressionOneTimeRun(schedule?.cronExpression);
};

/**
 * Tính thời điểm đã đặt cho lịch «một mốc» từ cron + mốc neo `createdAt`.
 * Năm không có trong cron — chọn năm sao cho (ngày-giờ) là lần xuất hiện đầu tiên không trước lúc tạo lịch.
 *
 * Luồng hoạt động:
 * 1. Parse phút, giờ, ngày, tháng từ cron 5 trường.
 * 2. Neo `anchor` = `createdAt` (hoặc «bây giờ» nếu thiếu).
 * 3. Thử các năm liên tiếp từ năm của anchor, lấy mốc hợp lệ đầu tiên ≥ anchor.
 *
 * @param {object} schedule bản ghi lịch
 * @returns {Date|null}
 */
export const resolveOneTimeSchedulePlannedAt = (schedule) => {
  const cron = schedule?.cronExpression;
  if (!isCronExpressionOneTimeRun(cron)) return null;
  const parts = String(cron).trim().split(/\s+/).filter(Boolean);
  const minute = Number.parseInt(parts[0], 10);
  const hour = Number.parseInt(parts[1], 10);
  const dom = Number.parseInt(parts[2], 10);
  const mon = Number.parseInt(parts[3], 10);
  const anchor = toValidDate(schedule?.createdAt) || new Date();
  const startYear = anchor.getFullYear();
  for (let delta = 0; delta <= 5; delta += 1) {
    const y = startYear + delta;
    const candidate = new Date(y, mon - 1, dom, hour, minute, 0, 0);
    if (Number.isNaN(candidate.getTime())) continue;
    if (candidate.getFullYear() !== y || candidate.getMonth() !== mon - 1 || candidate.getDate() !== dom) {
      continue;
    }
    if (candidate >= anchor) return candidate;
  }
  return null;
};

/**
 * Thời điểm hiển thị cho cột «lần chạy tiếp theo» / «lịch chạy»: với lịch 1 lần ưu tiên mốc suy ra từ cron + ngày tạo.
 *
 * @param {object} schedule bản ghi lịch
 * @param {Date} [now=new Date()] tham chiếu cho lịch lặp (custom, nextRunAt)
 * @returns {Date|null}
 */
export const resolveScheduleUiTimingDate = (schedule, now = new Date()) => {
  if (!schedule) return null;
  if (isScheduleOneTimeRun(schedule)) {
    const planned = resolveOneTimeSchedulePlannedAt(schedule);
    if (planned) return planned;
  }
  return resolveScheduleNextRunAt(schedule, now);
};

/**
 * Nhãn cột thời gian trong popup xem lịch: lịch một lần dùng «Lịch chạy», còn lại «Lần chạy tiếp theo».
 *
 * @param {object} schedule bản ghi lịch
 * @returns {string}
 */
export const getScheduleRunTimingFieldLabelVi = (schedule) =>
  (isScheduleOneTimeRun(schedule) ? 'Lịch chạy' : 'Lần chạy tiếp theo');

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
  } else if (type === 'custom') {
    const intervalDays = parseCustomIntervalDaysFromCron(cron);
    base = intervalDays ? `Mỗi ${intervalDays} ngày (theo mốc bắt đầu)` : getScheduleTypeLabel(type);
  } else {
    base = getScheduleTypeLabel(type);
  }
  const clock = formatScheduleRunClockFromCron(cron);
  if (clock) {
    return `${base} — lúc ${clock}`;
  }
  return base;
};
