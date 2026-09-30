// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — hàm thuần của trang "Giám sát gửi tin" (UserDeliveryMonitorPage).
// Mọi mốc giờ hiển thị theo GIỜ VN cố định (như các màn chiến dịch khác — campaignDateTime.helpers.js): hạn mức, giờ
// yên lặng và "hôm nay" đều tính theo giờ VN nên người mở trang từ múi giờ khác vẫn đọc cùng một giờ với hệ thống.

const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const HOUR_MS = 60 * 60 * 1000;

// Năm kênh "tin" vẽ trên biểu đồ (lời mời kết bạn là kênh riêng, không vẽ) — đúng thứ tự xếp chồng và thứ tự chip.
export const HOURLY_CHART_CHANNELS = ['email', 'zalo_personal', 'zalo_group', 'telegram', 'whatsapp'];

// hourCycle h23: `hour12: false` in nửa đêm thành "24".
const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function vnParts(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = {};
  for (const part of partsFormatter.formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

/** Ngày VN 'YYYY-MM-DD' của một thời điểm (sv-SE cho đúng dạng ISO). */
function vnDay(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: VN_TIME_ZONE });
}

/** 'HH:mm' theo giờ VN; giá trị rỗng / sai → `fallback`. */
export function formatVnTime(value, fallback = '-') {
  const parts = vnParts(value);
  return parts ? `${parts.hour}:${parts.minute}` : fallback;
}

/** 'dd/MM HH:mm' theo giờ VN. */
export function formatVnDayMonthTime(value, fallback = '-') {
  const parts = vnParts(value);
  return parts ? `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}` : fallback;
}

/**
 * Mốc "tự chạy lại": chỉ 'HH:mm' khi cùng ngày VN với `now`, khác ngày thì thêm 'dd/MM' — lượt chờ tới bước gửi kế tiếp
 * có thể chờ vài ngày, "đến 09:00" trơ trọi sẽ đọc thành hôm nay.
 */
export function formatVnResumeTime(value, now = new Date(), fallback = '-') {
  const parts = vnParts(value);
  if (!parts) return fallback;
  const sameDay = vnDay(new Date(value)) === vnDay(now);
  return sameDay ? `${parts.hour}:${parts.minute}` : `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}

// Mã lý do chờ THẬT trong campaign_runs.run_metadata (campaignRun.service.js `persistRunDeferYieldSlot`) → khoá dịch.
// Dùng LẠI các khoá `deferredReason*` sẵn có của Gửi nhanh cho những lý do trùng nghĩa; chỉ thêm khoá mới cho mã chưa
// có khoá (hết lượt gửi, chờ bước kế, SMTP). Chuỗi là CỤM DANH TỪ đứng sau "Đang chờ:".
const EXACT_WAIT_REASON_KEYS = {
  phone_lookup_cooldown: 'quickSend.deferredReasonPhoneLookupCooldown',
  phone_lookup_cooldown_api_error: 'quickSend.deferredReasonPhoneLookupCooldown',
  all_accounts_phone_lookup_cooldown: 'quickSend.deferredReasonPhoneLookupCooldown',
  quiet_hours: 'quickSend.deferredReasonQuietHours',
  channel_quiet_hours: 'quickSend.deferredReasonQuietHours',
  rate_limited: 'quickSend.deferredReasonRateLimited',
  inter_message_delay: 'quickSend.deferredReasonInterMessageDelay',
  channel_rate_limit: 'quickSendAdapter.deferredReasonProviderRateLimit',
  smtp_rate_limited: 'userDeliveryMonitor.waitReason.smtpRateLimited',
  smtp_transient_burst: 'userDeliveryMonitor.waitReason.smtpUnstable',
  all_recipients_waiting_next_due: 'userDeliveryMonitor.waitReason.nextStep',
};

const UNKNOWN_WAIT_REASON_KEY = 'quickSend.deferredReasonUnknown';

/**
 * @param {string|null|undefined} reason mã lý do chờ của lượt chạy
 * @returns {string} khoá i18n (luôn có bản dịch; mã lạ → "hệ thống đang bận")
 */
export function getWaitReasonI18nKey(reason) {
  const code = String(reason || '').trim();
  if (EXACT_WAIT_REASON_KEYS[code]) return EXACT_WAIT_REASON_KEYS[code];
  // Quota ghi `plan_quota_<loại>` / `plan_quota_account_daily[_<kênh>]`; bước kế của one-shot ghi `scheduled_step_<kênh>_<n>`.
  if (code.startsWith('plan_quota')) return 'userDeliveryMonitor.waitReason.planQuota';
  if (code.startsWith('scheduled_step_')) return 'userDeliveryMonitor.waitReason.nextStep';
  return UNKNOWN_WAIT_REASON_KEY;
}

/** Mọi khoá i18n mà getWaitReasonI18nKey có thể trả — để test ghim đủ bản dịch vi/en. */
export const ALL_WAIT_REASON_I18N_KEYS = [...new Set([
  ...Object.values(EXACT_WAIT_REASON_KEYS),
  'userDeliveryMonitor.waitReason.planQuota',
  UNKNOWN_WAIT_REASON_KEY,
])];

/**
 * 24 cột giờ cho biểu đồ, neo vào giờ của phản hồi: BE chỉ trả (giờ, kênh) CÓ dữ liệu, giờ trống do màn tự bù.
 * VN không có giờ mùa hè và lệch UTC đúng 7 giờ nên ranh giới giờ VN trùng ranh giới giờ UTC — tính bằng mili giây.
 *
 * @param {Array<{ hour: string, channel: string, sent: number }>} rows `hourly` của phản hồi
 * @param {string|number|Date} generatedAt `generatedAt` của phản hồi
 * @param {number} [hours]
 * @returns {Array<{ hour: string, label: string, total: number } & Record<string, number>>} cũ → mới
 */
export function buildHourlySlots(rows, generatedAt, hours = 24) {
  const anchorMs = Date.parse(generatedAt);
  const endHourMs = Math.floor((Number.isFinite(anchorMs) ? anchorMs : Date.now()) / HOUR_MS) * HOUR_MS;

  const sentByHour = new Map();
  for (const row of rows || []) {
    const hourMs = Date.parse(row.hour);
    if (!Number.isFinite(hourMs) || !HOURLY_CHART_CHANNELS.includes(row.channel)) continue;
    const slot = sentByHour.get(hourMs) || {};
    slot[row.channel] = (slot[row.channel] || 0) + Number(row.sent || 0);
    sentByHour.set(hourMs, slot);
  }

  return Array.from({ length: hours }, (_, index) => {
    const hourMs = endHourMs - (hours - 1 - index) * HOUR_MS;
    const slot = sentByHour.get(hourMs) || {};
    const entry = { hour: new Date(hourMs).toISOString(), label: `${formatVnTime(hourMs).slice(0, 2)}:00` };
    let total = 0;
    for (const channel of HOURLY_CHART_CHANNELS) {
      entry[channel] = slot[channel] || 0;
      total += entry[channel];
    }
    entry.total = total;
    return entry;
  });
}
