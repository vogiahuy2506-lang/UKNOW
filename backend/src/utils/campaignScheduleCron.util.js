/**
 * Luật thời gian của lịch chạy chiến dịch — dùng chung cho scheduler (khi nào NỔ) và controller
 * (hiện "lần chạy tiếp" cho người dùng). Hai nơi phải cùng một luật, nếu không giao diện hứa một
 * giờ mà cron nổ giờ khác.
 *
 * Vì sao tính lúc đọc thay vì đọc cột `campaign_schedules.next_run_at`: cột đó không có chỗ nào
 * ghi (`grep -rn next_run_at backend/src` chỉ ra SELECT/RETURNING). Đo production 12/09/2026:
 * 29 lịch đang bật, 0 lịch có `next_run_at` → cột "Lần chạy tiếp" hiện "—" cho mọi lịch.
 *
 * Bốn helper đầu dời nguyên văn từ `scheduler.js` (không đổi hành vi) để scheduler và util này
 * chia sẻ một bản.
 */
import parser from 'cron-parser';

export const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Lịch `custom` (mỗi N ngày) đăng ký cron hằng ngày rồi lọc theo ngày; quét tối đa từng này ứng
 * viên trước khi bỏ cuộc (N tối đa hợp lý là vài chục ngày; 400 dư cho mọi trường hợp).
 */
const CUSTOM_SCAN_LIMIT = 400;

/**
 * Chuyển thời điểm bất kỳ về khóa ngày `YYYY-MM-DD` theo múi giờ Hà Nội.
 *
 * @param {Date|string|null|undefined} rawDate thời điểm đầu vào
 * @returns {string|null} khóa ngày hoặc null nếu input không hợp lệ
 */
export const toHanoiDateKey = (rawDate) => {
  if (!rawDate) return null;
  const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HANOI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
};

/**
 * Tính số ngày chênh lệch giữa 2 mốc ngày dạng `YYYY-MM-DD`.
 *
 * @param {string} startKey mốc bắt đầu
 * @param {string} endKey mốc kết thúc
 * @returns {number|null} số ngày chênh lệch hoặc null nếu parse lỗi
 */
export const getDaysDiffFromDateKeys = (startKey, endKey) => {
  if (!startKey || !endKey) return null;
  const [startYear, startMonth, startDay] = String(startKey).split('-').map((v) => Number.parseInt(v, 10));
  const [endYear, endMonth, endDay] = String(endKey).split('-').map((v) => Number.parseInt(v, 10));
  if (
    !Number.isFinite(startYear)
    || !Number.isFinite(startMonth)
    || !Number.isFinite(startDay)
    || !Number.isFinite(endYear)
    || !Number.isFinite(endMonth)
    || !Number.isFinite(endDay)
  ) {
    return null;
  }
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000));
};

/**
 * Parse số ngày lặp lại từ cron custom dạng N ngày ở trường ngày-tháng.
 *
 * @param {string} cronExpression biểu thức cron lưu trong DB
 * @returns {number|null} số ngày lặp hoặc null nếu không parse được
 */
export const parseCustomIntervalDaysFromCron = (cronExpression = '') => {
  const parts = String(cronExpression).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const match = String(parts[2]).match(/^\*\/(\d+)$/);
  if (!match) return null;
  const intervalDays = Number.parseInt(match[1], 10);
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  return intervalDays;
};

/**
 * Với lịch custom, runtime cron luôn chạy hàng ngày tại cùng giờ/phút để tránh lệch mốc N ngày.
 *
 * @param {object} schedule bản ghi lịch chạy
 * @returns {string} cron runtime dùng để đăng ký node-cron
 */
export const resolveRuntimeCronExpression = (schedule) => {
  const rawCron = String(schedule?.cron_expression || '').trim();
  if (String(schedule?.schedule_type || '').toLowerCase() !== 'custom') {
    return rawCron;
  }
  const parts = rawCron.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return rawCron;
  return `${parts[0]} ${parts[1]} * * *`;
};

/**
 * Thời điểm lịch sẽ nổ lần tới, theo đúng luật scheduler đang chạy:
 * - lịch tắt → null;
 * - daily/weekly/monthly/once → lần tới của cron theo múi giờ Hà Nội (once đã qua trong năm thì
 *   ra năm sau — đó cũng chính là điều node-cron sẽ làm, xem chú thích ở scheduler
 *   `triggerCampaignSchedule`);
 * - custom (mỗi N ngày) → cron hằng ngày, chỉ nhận ngày có (số ngày kể từ `last_run_at`, hoặc
 *   `created_at` nếu chưa chạy) chia hết cho N — trùng `shouldTriggerCustomScheduleToday`;
 * - cron không hợp lệ → null (scheduler cũng bỏ qua lịch đó, `cron.validate` thất bại).
 *
 * @param {object} schedule dòng `campaign_schedules` dạng snake_case (enabled, schedule_type,
 *   cron_expression, last_run_at, created_at)
 * @param {Date} [now] mốc hiện tại (test truyền vào)
 * @returns {Date|null}
 */
export const computeScheduleNextRunAt = (schedule, now = new Date()) => {
  if (!schedule || schedule.enabled === false) return null;
  const runtimeCron = resolveRuntimeCronExpression(schedule);
  if (!runtimeCron) return null;

  let interval;
  try {
    interval = parser.parseExpression(runtimeCron, { currentDate: now, tz: HANOI_TIME_ZONE });
  } catch {
    return null;
  }

  const isCustom = String(schedule.schedule_type || '').toLowerCase() === 'custom';
  const intervalDays = isCustom ? parseCustomIntervalDaysFromCron(schedule.cron_expression) : null;
  if (!intervalDays) {
    try {
      return interval.next().toDate();
    } catch {
      return null;
    }
  }

  const anchorKey = toHanoiDateKey(schedule.last_run_at || schedule.created_at || now);
  for (let i = 0; i < CUSTOM_SCAN_LIMIT; i += 1) {
    let candidate;
    try {
      candidate = interval.next().toDate();
    } catch {
      return null;
    }
    const dayDiff = getDaysDiffFromDateKeys(anchorKey, toHanoiDateKey(candidate));
    if (dayDiff == null) return candidate;
    if (dayDiff >= 0 && dayDiff % intervalDays === 0) return candidate;
  }
  return null;
};
