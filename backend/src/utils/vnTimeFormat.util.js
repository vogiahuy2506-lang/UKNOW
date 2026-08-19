/**
 * Định dạng thời gian cho log vận hành: luôn hiển thị cùng lúc UTC (ISO Z) và giờ Việt Nam.
 * Dùng timeZone cố định Asia/Ho_Chi_Minh — không phụ thuộc biến TZ của process Node hay múi giờ OS.
 */

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Parse input sang Date hợp lệ (epoch / ISO / đối tượng Date từ pg).
 *
 * @param {Date|string|number|null|undefined} input
 * @returns {Date|null}
 */
function toDateOrNull(input) {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input : null;
  }
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Khoá ngày lịch giờ VN dạng `yyyymmdd`.
 * Dùng formatToParts như hanoiHour — KHÔNG dùng `new Date(d.toLocaleString(...))`
 * (parse lại chuỗi đã định dạng sẽ lệch khi process chạy TZ=UTC).
 *
 * @param {Date|string|number|null|undefined} [input]
 * @returns {string}
 */
export function vnDayKey(input = new Date()) {
  const d = toDateOrNull(input) || new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}

/** Khoá tháng lịch giờ Việt Nam dạng `yyyymm`. */
export function vnMonthKey(input = new Date()) {
  const d = toDateOrNull(input) || new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}${get('month')}`;
}

/**
 * Một dòng log: ISO UTC + cùng mốc theo lịch Việt Nam (24h).
 *
 * @param {Date|string|number|null|undefined} input
 * @returns {string}
 */
export function formatUtcAndVietnamForLog(input) {
  const d = toDateOrNull(input);
  if (!d) return '(thời điểm không hợp lệ)';
  const utcIso = d.toISOString();
  const vnWall = new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23', // h23 = 0–23; hour12:false render nửa đêm thành "24"
  }).format(d);
  return `${utcIso} (giờ VN: ${vnWall})`;
}

/**
 * Lấy khoảng thời gian bắt đầu và kết thúc của một ngày lịch Việt Nam (UTC ISO).
 * Giờ VN luôn là UTC+7. Ngày YYYY-MM-DD bắt đầu từ `YYYY-MM-DDT00:00:00+07:00`
 * (tức (D-1)T17:00:00Z) đến `YYYY-MM-(D+1)T00:00:00+07:00`.
 *
 * @param {string|Date|null|undefined} [dateInput] YYYY-MM-DD hoặc Date hoặc null (hôm nay)
 * @returns {{ dayKey: string, dateStr: string, startIso: string, endIso: string, startUtc: Date, endUtc: Date }}
 */
export function getVietnamDayRange(dateInput) {
  let y;
  let m;
  let d;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const parts = dateInput.trim().split('-');
    y = Number(parts[0]);
    m = Number(parts[1]);
    d = Number(parts[2]);
  } else {
    const targetDate = toDateOrNull(dateInput) || new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: VIETNAM_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(targetDate);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    y = Number(get('year'));
    m = Number(get('month'));
    d = Number(get('day'));
  }

  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const dayKey = `${y}${mm}${dd}`;
  const dateStr = `${y}-${mm}-${dd}`;

  // 00:00:00 GMT+7 tương đương ngày YYYY-MM-DD 00:00:00+07:00
  const startUtc = new Date(`${dateStr}T00:00:00+07:00`);
  // Kết thúc ngày là 00:00:00 GMT+7 ngày hôm sau
  const nextDay = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const endUtc = nextDay;

  return {
    dayKey,
    dateStr,
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    startUtc,
    endUtc,
  };
}

