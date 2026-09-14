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

/**
 * Lấy khoảng thời gian của tuần trước theo giờ Việt Nam (thứ Hai 00:00:00+07:00 đến thứ Hai 00:00:00+07:00 kế).
 * periodKey dạng ISO week: 'YYYY-Www' (vd: '2026-W37')
 *
 * @param {string|Date|number|null|undefined} [dateInput]
 * @returns {{ periodKey: string, label: string, startIso: string, endIso: string, startUtc: Date, endUtc: Date, weekNumber: number }}
 */
export function getVietnamWeekRange(dateInput) {
  let targetDate;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    targetDate = new Date(`${dateInput.trim()}T12:00:00+07:00`);
  } else {
    targetDate = toDateOrNull(dateInput) || new Date();
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(targetDate);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));

  // Day of week theo lịch VN (1 = Monday, 7 = Sunday)
  const vnDateUtcEpoch = Date.UTC(y, m - 1, d);
  const dayOfWeek = new Date(vnDateUtcEpoch).getUTCDay(); // 0 = Sun, 1 = Mon...
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

  // Tuần TRƯỚC: Thứ Hai tuần trước lùi (isoDay - 1) + 7 ngày
  const prevMondayEpoch = vnDateUtcEpoch - (isoDay - 1 + 7) * 86400000;
  const monDate = new Date(prevMondayEpoch);
  const monY = monDate.getUTCFullYear();
  const monM = monDate.getUTCMonth() + 1;
  const monD = monDate.getUTCDate();

  // Chủ nhật tuần trước (mon + 6 ngày)
  const sunDate = new Date(prevMondayEpoch + 6 * 86400000);
  const sunM = sunDate.getUTCMonth() + 1;
  const sunD = sunDate.getUTCDate();

  // Thứ Hai kế tiếp (chính là thứ Hai của tuần hiện tại)
  const nextMonDate = new Date(prevMondayEpoch + 7 * 86400000);
  const nextY = nextMonDate.getUTCFullYear();
  const nextM = nextMonDate.getUTCMonth() + 1;
  const nextD = nextMonDate.getUTCDate();

  const startStr = `${monY}-${String(monM).padStart(2, '0')}-${String(monD).padStart(2, '0')}`;
  const nextMonStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`;

  const startUtc = new Date(`${startStr}T00:00:00+07:00`);
  const endUtc = new Date(`${nextMonStr}T00:00:00+07:00`);

  // Tính ISO week dựa trên Thứ Năm của tuần trước
  const thuDate = new Date(prevMondayEpoch + 3 * 86400000);
  const isoYear = thuDate.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstThu = new Date(Date.UTC(isoYear, 0, 4 + (4 - jan4Day)));
  const weekNumber = 1 + Math.round((thuDate - firstThu) / (7 * 86400000));
  const periodKey = `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;

  const label = `Tuần ${weekNumber} (${String(monD).padStart(2, '0')}/${String(monM).padStart(2, '0')}–${String(sunD).padStart(2, '0')}/${String(sunM).padStart(2, '0')})`;

  return {
    periodKey,
    label,
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    startUtc,
    endUtc,
    weekNumber,
  };
}

/**
 * Lấy khoảng thời gian của tháng trước theo giờ Việt Nam (ngày 1 00:00:00+07:00 đến ngày 1 00:00:00+07:00 kế).
 * periodKey dạng 'YYYY-MM'
 *
 * @param {string|Date|number|null|undefined} [dateInput]
 * @returns {{ periodKey: string, label: string, startIso: string, endIso: string, startUtc: Date, endUtc: Date, year: number, month: number }}
 */
export function getVietnamMonthRange(dateInput) {
  let targetDate;
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    targetDate = new Date(`${dateInput.trim()}T12:00:00+07:00`);
  } else {
    targetDate = toDateOrNull(dateInput) || new Date();
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(targetDate);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const y = Number(get('year'));
  const m = Number(get('month'));

  let prevY = y;
  let prevM = m - 1;
  if (prevM < 1) {
    prevM = 12;
    prevY = y - 1;
  }

  const startStr = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
  const endStr = `${y}-${String(m).padStart(2, '0')}-01`;

  const startUtc = new Date(`${startStr}T00:00:00+07:00`);
  const endUtc = new Date(`${endStr}T00:00:00+07:00`);

  const periodKey = `${prevY}-${String(prevM).padStart(2, '0')}`;
  const label = `Tháng ${String(prevM).padStart(2, '0')}/${prevY}`;

  return {
    periodKey,
    label,
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    startUtc,
    endUtc,
    year: prevY,
    month: prevM,
  };
}

