// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — hàm thuần của trang "Giám sát gửi tin" phía ADMIN (AdminDeliveryMonitorPage).
// Mốc giờ / ngày hiển thị theo GIỜ VN như trang của người dùng (features/campaigns/utils/deliveryMonitor.helpers.js), dùng lại
// các hàm ở đó thay vì viết bản riêng.
import {
  HOURLY_CHART_CHANNELS,
  formatVnTime,
  getWaitReasonI18nKey,
} from '../../campaigns/utils/deliveryMonitor.helpers';

export const DELIVERY_WINDOWS = ['today', '7d', '30d'];

/** 'YYYY-MM-DD' → 'dd/MM'; giá trị sai → `fallback`. */
export function formatIsoDayMonth(isoDate, fallback = '-') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  return match ? `${match[3]}/${match[2]}` : fallback;
}

/** Danh sách ngày 'YYYY-MM-DD' từ `fromDate` tới `toDate` (gồm cả hai đầu); tính thuần bằng UTC nên không lệch múi giờ. */
export function eachIsoDay(fromDate, toDate) {
  const parse = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const start = parse(fromDate);
  const end = parse(toDate);
  if (start == null || end == null || start > end) return [];
  const days = [];
  for (let ms = start; ms <= end; ms += 24 * 60 * 60 * 1000) days.push(new Date(ms).toISOString().slice(0, 10));
  return days;
}

/**
 * Cột theo NGÀY cho biểu đồ 7 / 30 ngày: BE chỉ trả (ngày, kênh) CÓ dữ liệu, ngày trống do màn tự bù.
 *
 * @param {Array<{ day: string, channel: string, sent: number }>} rows `series.rows` của phản hồi (unit = 'day')
 * @param {string} fromDate `window.fromDate`
 * @param {string} toDate `window.toDate`
 * @returns {Array<{ day: string, label: string, total: number } & Record<string, number>>} cũ → mới
 */
export function buildDailySlots(rows, fromDate, toDate) {
  const sentByDay = new Map();
  for (const row of rows || []) {
    if (!HOURLY_CHART_CHANNELS.includes(row.channel)) continue;
    const slot = sentByDay.get(row.day) || {};
    slot[row.channel] = (slot[row.channel] || 0) + Number(row.sent || 0);
    sentByDay.set(row.day, slot);
  }
  return eachIsoDay(fromDate, toDate).map((day) => {
    const slot = sentByDay.get(day) || {};
    const entry = { day, label: formatIsoDayMonth(day) };
    let total = 0;
    for (const channel of HOURLY_CHART_CHANNELS) {
      entry[channel] = slot[channel] || 0;
      total += entry[channel];
    }
    entry.total = total;
    return entry;
  });
}

/** Số cột giờ của biểu đồ "hôm nay": từ 00:00 tới giờ hiện tại (theo GIỜ VN của `generatedAt`), gồm giờ đang chạy dở. */
export function countHoursToday(generatedAt) {
  const hourText = formatVnTime(generatedAt, '').slice(0, 2);
  const hour = Number(hourText);
  // `Number('')` là 0 nên phải loại chuỗi rỗng (thời điểm sai) trước, nếu không ra 1 cột thay vì 24.
  return hourText !== '' && Number.isFinite(hour) && hour >= 0 ? hour + 1 : 24;
}

/**
 * Lý do chờ PHỔ BIẾN NHẤT của các lượt đang chờ. BE trả từng MÃ lý do (plan_quota_daily, plan_quota_hourly… là hai mã
 * nhưng cùng một nhãn "đã hết lượt gửi"), nên gom theo NHÃN dịch — người đọc thấy nhãn, không thấy mã.
 * Hoà thì lấy nhãn xuất hiện trước (BE đã sắp mã theo số lượt giảm dần).
 *
 * @param {Array<{ reason: string|null, count: number }>} reasons `runs.waiting.reasons`
 * @returns {{ i18nKey: string, count: number }|null}
 */
export function pickTopWaitReason(reasons) {
  const byKey = new Map();
  for (const item of reasons || []) {
    const key = getWaitReasonI18nKey(item.reason);
    byKey.set(key, (byKey.get(key) || 0) + Number(item.count || 0));
  }
  let top = null;
  for (const [i18nKey, count] of byKey) {
    if (!top || count > top.count) top = { i18nKey, count };
  }
  return top;
}
