import sendStatsRepository from '../../repositories/stats/sendStats.repository.js';
import campaignChannelRegistry from '../campaign/campaignChannelRegistry.service.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4a — MỘT module đếm gửi tin cho mọi màn (Giám sát gửi tin, Tổng quan,
 * admin, Hoạt động nhóm). Đọc thẳng BẢNG TIN (email_messages, zalo_messages, campaign_channel_messages); các màn
 * chỉ gọi hàm ở đây, không tự đếm từ customer_journey / bộ đếm campaign_runs / nhật ký node campaign_executions.
 *
 * ── Từ điển (plan mục 2) ─────────────────────────────────────────────────────────────────────────────────────
 * sent     SỐ TIN đã gửi (đếm dòng):
 *            email  status ∈ EMAIL_SENT_STATUSES (sent, delivered, opened, clicked, bounced, spam, unsubscribed);
 *            Zalo   status = 'sent' (3 kênh riêng: zalo_personal, zalo_group, zalo_friend_request);
 *            Telegram / WhatsApp  status = 'sent'.
 * failed   SỐ ĐÍCH chưa gửi được (đếm người nhận, KHÔNG đếm lượt thử): đích có dòng lỗi và không có dòng đã-gửi
 *            cùng đích. Đích = (kênh, lượt chạy, node, người nhận, bước): email = lower(btrim(recipient_email)) +
 *            email_step; Zalo = recipient_value (rồi uid, group_id) + bước trong tracking_metadata; adapter =
 *            recipient_key + step_index. Dòng không có id_run (chiến dịch đã xoá) → mỗi dòng lỗi là một đích.
 *            Lỗi: email status='failed'; Zalo status='failed'; adapter status='failed' và error_category KHÁC
 *            'transient_retry' (dòng hẹn thử lại không phải lỗi cuối).
 * bounced  email status='bounced' — NẰM TRONG sent, KHÔNG cộng vào failed.
 * opened   email đã gửi có first_opened_at.
 * clicked  email đã gửi có first_clicked_at hoặc click_count > 0; Zalo đã gửi có click_count > 0.
 * Không tính vào đâu: Zalo 'aborted' (tin CHƯA TỪNG gửi: hoãn / bỏ qua / lượt bị dừng), 'pending', 'queued'; email
 *   'pending', 'queued'; adapter 'queued'. Luôn loại is_preview = true (gửi nhanh / gửi thử — hiện riêng sau).
 *   Tỉ lệ luôn tính trên cùng tập: open rate = opened / sent của email.
 *
 * ── Phạm vi (`scope`) ────────────────────────────────────────────────────────────────────────────────────────
 * `{ ownerId: number }` — một chủ tài khoản (lọc bằng workspace_owner_id, có ở mọi dòng tin của chiến dịch).
 * `{ ownerId: null, excludeOwnerIds?: number[] }` — toàn hệ thống (admin), kể cả dòng thiếu chủ; trừ các chủ trong
 *   excludeOwnerIds. `ownerId` PHẢI là null một cách tường minh — thiếu / undefined là lỗi gọi, không bao giờ được
 *   rơi âm thầm sang toàn hệ thống (lộ số liệu của khách khác).
 *
 * ── Cửa sổ (`window`) ────────────────────────────────────────────────────────────────────────────────────────
 * `{ days: n }` — n×24 giờ gần nhất (cuộn theo lúc chạy). `{ fromDate, toDate }` — 'YYYY-MM-DD' theo NGÀY VN, gồm
 * trọn ngày `toDate`. Mốc tính trong SQL theo thời điểm của TIN (sent_at; riêng adapter COALESCE(sent_at,
 * created_at) vì dòng lỗi của bảng đó không có sent_at), KHÔNG theo ngày bắt đầu lượt chạy.
 * Cửa sổ quyết định dòng nào được NHÌN THẤY: "đích chưa gửi được" xét trong các dòng của cửa sổ. Đích lỗi ở cuối
 * cửa sổ mà gửi được sau cửa sổ vẫn tính là lỗi của cửa sổ đó; nhờ vậy số của một cửa sổ đã khép không đổi về sau,
 * và các cửa sổ liền nhau không tự thay đổi lẫn nhau. Số theo lượt chạy (getRunTotals) không có cửa sổ. Chuỗi theo giờ
 * (getHourlySeries) nhận `{ hours }` — cửa sổ neo vào ranh giới giờ chẵn, xem hàm.
 *
 * Mọi hàm ném lỗi khi đầu vào sai (scope / window / id) thay vì trả số rỗng: số liệu rỗng do lỗi gọi là loại lỗi
 * khó thấy nhất. Lỗi truy vấn cũng KHÔNG bị nuốt (khác safeQuery).
 */

const MAX_WINDOW_DAYS = 3660;
const MAX_HOURLY_HOURS = 24 * 31;
const MAX_ID_LIST_SIZE = 1000;
const MAX_FAILURE_LIMIT = 500;
const DEFAULT_FAILURE_LIMIT = 50;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const toCount = (value) => Number(value) || 0;
const toNullableId = (value) => (value == null ? null : Number(value));

function toPositiveInt(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[0-9]{1,15}$/.test(value) && Number(value) > 0) return Number(value);
  return null;
}

/** Danh sách id dương, không trùng; ném lỗi nếu có phần tử sai hoặc quá dài. */
function normalizeIdList(value, name) {
  if (!Array.isArray(value)) {
    throw new TypeError(`sendStats: ${name} phải là mảng id`);
  }
  if (value.length > MAX_ID_LIST_SIZE) {
    throw new RangeError(`sendStats: ${name} tối đa ${MAX_ID_LIST_SIZE} phần tử`);
  }
  const ids = value.map((item) => {
    const id = toPositiveInt(item);
    if (id == null) throw new TypeError(`sendStats: ${name} có phần tử không phải số nguyên dương`);
    return id;
  });
  return [...new Set(ids)];
}

export function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object') {
    throw new TypeError('sendStats: thiếu scope');
  }
  if (scope.ownerId === null) {
    const excludeOwnerIds = scope.excludeOwnerIds == null
      ? []
      : normalizeIdList(scope.excludeOwnerIds, 'scope.excludeOwnerIds');
    return { ownerId: null, excludeOwnerIds };
  }
  const ownerId = toPositiveInt(scope.ownerId);
  if (ownerId == null) {
    throw new TypeError('sendStats: scope.ownerId phải là số nguyên dương (hoặc null tường minh cho toàn hệ thống)');
  }
  if (Array.isArray(scope.excludeOwnerIds) && scope.excludeOwnerIds.length > 0) {
    throw new TypeError('sendStats: excludeOwnerIds chỉ dùng cho phạm vi toàn hệ thống (ownerId: null)');
  }
  return { ownerId, excludeOwnerIds: [] };
}

/** Đúng ngày lịch (chặn '2026-02-30'); tính thuần bằng UTC nên không phụ thuộc múi giờ tiến trình. */
function isRealIsoDate(value) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * @param {*} window
 * @param {{ required: boolean }} options `required: false` cho phép null (không giới hạn thời gian)
 * @returns {null|{kind: 'days', days: number}|{kind: 'range', fromDate: string, toDate: string}}
 */
export function normalizeWindow(window, { required }) {
  if (window == null) {
    if (required) throw new TypeError('sendStats: thiếu window ({ days } hoặc { fromDate, toDate })');
    return null;
  }
  if (typeof window !== 'object') {
    throw new TypeError('sendStats: window phải là object');
  }
  const hasDays = window.days !== undefined;
  const hasRange = window.fromDate !== undefined || window.toDate !== undefined;
  if (hasDays === hasRange) {
    throw new TypeError('sendStats: window phải có đúng một dạng — { days } hoặc { fromDate, toDate }');
  }
  if (hasDays) {
    if (!Number.isInteger(window.days) || window.days < 1 || window.days > MAX_WINDOW_DAYS) {
      throw new RangeError(`sendStats: window.days phải là số nguyên từ 1 đến ${MAX_WINDOW_DAYS}`);
    }
    return { kind: 'days', days: window.days };
  }
  if (typeof window.fromDate !== 'string' || typeof window.toDate !== 'string'
    || !isRealIsoDate(window.fromDate) || !isRealIsoDate(window.toDate)) {
    throw new TypeError("sendStats: window.fromDate / toDate phải là ngày 'YYYY-MM-DD' hợp lệ (giờ VN)");
  }
  if (window.fromDate > window.toDate) {
    throw new RangeError('sendStats: window.fromDate không được sau window.toDate');
  }
  return { kind: 'range', fromDate: window.fromDate, toDate: window.toDate };
}

/** Kênh theo registry, tách theo bảng chứa; `order` = thứ tự hiển thị. */
function resolveChannels() {
  const list = campaignChannelRegistry.listChannelsForStats();
  const emailKeys = list.filter((channel) => channel.table === 'email_messages').map((channel) => channel.key);
  if (emailKeys.length > 1) {
    throw new Error(`sendStats: registry khai ${emailKeys.length} kênh email, bảng email_messages chỉ chứa một`);
  }
  const keys = list.map((channel) => channel.key);
  return {
    email: emailKeys[0] ?? null,
    zalo: list.filter((channel) => channel.table === 'zalo_messages').map((channel) => channel.key),
    adapter: list.filter((channel) => channel.table === 'campaign_channel_messages').map((channel) => channel.key),
    keys,
    order: new Map(keys.map((key, index) => [key, index])),
  };
}

/** Bộ tham số repository cần — bỏ `keys` / `order` (chỉ để service sắp xếp / bù kênh trống). */
const forRepository = (channels) => ({ email: channels.email, zalo: channels.zalo, adapter: channels.adapter });

const byOrder = (channels, key) => channels.order.get(key) ?? Number.MAX_SAFE_INTEGER;

/**
 * Tổng theo kênh — ĐỦ mọi kênh registry (kênh không có dữ liệu = 0), theo thứ tự hiển thị của registry.
 *
 * @param {{ ownerId: number|null, excludeOwnerIds?: number[] }} scope
 * @param {{ days: number }|{ fromDate: string, toDate: string }} window
 * @returns {Promise<Array<{ channel: string, sent: number, failed: number, bounced: number, opened: number, clicked: number }>>}
 */
export async function getChannelTotals(scope, window) {
  const normalizedScope = normalizeScope(scope);
  const normalizedWindow = normalizeWindow(window, { required: true });
  const channels = resolveChannels();
  const rows = await sendStatsRepository.channelTotals({
    scope: normalizedScope,
    window: normalizedWindow,
    channels: forRepository(channels),
  });
  const byChannel = new Map(rows.map((row) => [row.channel, row]));
  return channels.keys.map((channel) => {
    const row = byChannel.get(channel);
    return {
      channel,
      sent: toCount(row?.sent),
      failed: toCount(row?.failed),
      bounced: toCount(row?.bounced),
      opened: toCount(row?.opened),
      clicked: toCount(row?.clicked),
    };
  });
}

/**
 * Chuỗi theo NGÀY VN: tin đã gửi theo ngày của tin; đích lỗi tính vào ngày của lần thử lỗi cuối trong cửa sổ.
 * Chỉ trả (ngày, kênh) CÓ dữ liệu, sắp theo ngày rồi thứ tự kênh; ngày trống do màn tự bù. Tổng theo ngày khớp
 * getChannelTotals cùng cửa sổ.
 *
 * @returns {Promise<Array<{ day: string, channel: string, sent: number, failed: number }>>}
 */
export async function getDailySeries(scope, window) {
  const normalizedScope = normalizeScope(scope);
  const normalizedWindow = normalizeWindow(window, { required: true });
  const channels = resolveChannels();
  const rows = await sendStatsRepository.dailySeries({
    scope: normalizedScope,
    window: normalizedWindow,
    channels: forRepository(channels),
  });
  return rows
    .map((row) => ({
      day: String(row.day),
      channel: row.channel,
      sent: toCount(row.sent),
      failed: toCount(row.failed),
    }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : byOrder(channels, a.channel) - byOrder(channels, b.channel)));
}

/**
 * Chuỗi theo GIỜ VN cho `hours` giờ TRÒN gần nhất, gồm giờ hiện tại đang chạy dở (hours = 24 → 23 giờ đã khép + giờ
 * này). Cùng bộ CTE và cùng quy ước với getDailySeries: tin đã gửi tính vào giờ của tin, đích lỗi tính vào giờ của lần
 * thử lỗi cuối trong cửa sổ. Chỉ trả (giờ, kênh) CÓ dữ liệu, sắp theo giờ rồi thứ tự kênh; giờ trống do màn tự bù.
 * Tham số là `{ hours }` chứ không dùng `window` vì đây là cửa sổ neo vào ranh giới giờ chẵn, không cuộn theo phút.
 *
 * @param {{ ownerId: number|null, excludeOwnerIds?: number[] }} scope
 * @param {{ hours: number }} options số nguyên từ 1 đến 744
 * @returns {Promise<Array<{ hour: string, channel: string, sent: number, failed: number }>>}
 *   `hour` = ISO timestamptz của ĐẦU giờ VN (vd '2026-09-29T16:00:00.000Z' = 23:00 giờ VN ngày 29/09).
 */
export async function getHourlySeries(scope, { hours } = {}) {
  const normalizedScope = normalizeScope(scope);
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURLY_HOURS) {
    throw new RangeError(`sendStats: hours phải là số nguyên từ 1 đến ${MAX_HOURLY_HOURS}`);
  }
  const channels = resolveChannels();
  const rows = await sendStatsRepository.hourlySeries({
    scope: normalizedScope,
    window: { kind: 'hours', hours },
    channels: forRepository(channels),
  });
  return rows
    .map((row) => ({
      hour: new Date(row.hour).toISOString(),
      channel: row.channel,
      sent: toCount(row.sent),
      failed: toCount(row.failed),
    }))
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : byOrder(channels, a.channel) - byOrder(channels, b.channel)));
}

/**
 * Tổng theo LƯỢT CHẠY — toàn bộ dòng của lượt, không theo cửa sổ (lượt sống lâu vẫn đủ số). Chỉ trả (lượt, kênh) có
 * dữ liệu; lượt không có dòng tin nào không xuất hiện (màn tự coi là 0).
 *
 * @param {{ ownerId: number|null, excludeOwnerIds?: number[] }} scope
 * @param {number[]} runIds
 * @returns {Promise<Array<{ runId: number, channel: string, sent: number, failed: number }>>}
 */
export async function getRunTotals(scope, runIds) {
  const normalizedScope = normalizeScope(scope);
  const normalizedRunIds = normalizeIdList(runIds, 'runIds');
  if (normalizedRunIds.length === 0) return [];
  const channels = resolveChannels();
  const rows = await sendStatsRepository.runTotals({
    scope: normalizedScope,
    runIds: normalizedRunIds,
    channels: forRepository(channels),
  });
  return rows
    .map((row) => ({
      runId: Number(row.id_run),
      channel: row.channel,
      sent: toCount(row.sent),
      failed: toCount(row.failed),
    }))
    .sort((a, b) => a.runId - b.runId || byOrder(channels, a.channel) - byOrder(channels, b.channel));
}

/**
 * Tổng theo CHIẾN DỊCH (và kênh). Cần ít nhất một trong `window` / `campaignIds` để không quét cả lịch sử.
 * `campaignId: null` = tin của chiến dịch đã xoá (giữ để tổng các dòng khớp tổng getChannelTotals).
 *
 * @param {{ ownerId: number|null, excludeOwnerIds?: number[] }} scope
 * @param {null|{ days: number }|{ fromDate: string, toDate: string }} window
 * @param {null|number[]} campaignIds
 * @returns {Promise<Array<{ campaignId: number|null, channel: string, sent: number, failed: number, opened: number, clicked: number }>>}
 */
export async function getCampaignTotals(scope, window, campaignIds) {
  const normalizedScope = normalizeScope(scope);
  const normalizedWindow = normalizeWindow(window, { required: false });
  const normalizedCampaignIds = campaignIds == null ? null : normalizeIdList(campaignIds, 'campaignIds');
  if (!normalizedWindow && !normalizedCampaignIds) {
    throw new TypeError('sendStats: getCampaignTotals cần window hoặc campaignIds (không quét cả lịch sử)');
  }
  if (normalizedCampaignIds && normalizedCampaignIds.length === 0) return [];
  const channels = resolveChannels();
  const rows = await sendStatsRepository.campaignTotals({
    scope: normalizedScope,
    window: normalizedWindow,
    campaignIds: normalizedCampaignIds,
    channels: forRepository(channels),
  });
  return rows
    .map((row) => ({
      campaignId: toNullableId(row.id_campaign),
      channel: row.channel,
      sent: toCount(row.sent),
      failed: toCount(row.failed),
      opened: toCount(row.opened),
      clicked: toCount(row.clicked),
    }))
    .sort((a, b) => (a.campaignId ?? Infinity) - (b.campaignId ?? Infinity)
      || byOrder(channels, a.channel) - byOrder(channels, b.channel));
}

/**
 * Tổng theo NGƯỜI THỰC HIỆN (actor_user_id = người tạo chiến dịch), cộng mọi kênh.
 * `actorUserId: null` = dòng chưa gắn người thực hiện (giữ để tổng khớp getChannelTotals).
 *
 * @returns {Promise<Array<{ actorUserId: number|null, sent: number, failed: number }>>}
 */
export async function getActorTotals(scope, window) {
  const normalizedScope = normalizeScope(scope);
  const normalizedWindow = normalizeWindow(window, { required: true });
  const channels = resolveChannels();
  const rows = await sendStatsRepository.actorTotals({
    scope: normalizedScope,
    window: normalizedWindow,
    channels: forRepository(channels),
  });
  return rows
    .map((row) => ({
      actorUserId: toNullableId(row.actor_user_id),
      sent: toCount(row.sent),
      failed: toCount(row.failed),
    }))
    .sort((a, b) => (a.actorUserId ?? Infinity) - (b.actorUserId ?? Infinity));
}

/**
 * Các đích CHƯA GỬI ĐƯỢC (lỗi cuối), lần thử lỗi mới nhất trước. Cần `runId` hoặc `window`. Với `runId` không
 * cần `window`: xét toàn bộ dòng của lượt, nên số phần tử (khi không chạm `limit`) đúng bằng `failed` của
 * getRunTotals cho lượt đó.
 *
 * `reason`: email COALESCE(bounce_reason, error_message); Zalo tracking_metadata.error (rồi errorLabel);
 * adapter "error_category: error_message". `recipient` / `reason` / `at` là của lần thử lỗi CUỐI của đích;
 * `attempts` = số dòng lỗi của đích trong tập xét; `at` là timestamptz (Date). `recipientDisplay`: tên nhóm Zalo /
 * tên hiển thị adapter, không có thì null.
 *
 * @param {{ ownerId: number|null, excludeOwnerIds?: number[] }} scope
 * @param {{ runId?: number, window?: object, limit?: number }} [options]
 * @returns {Promise<Array<{ runId: number|null, campaignId: number|null, channel: string, recipient: string|null,
 *   recipientDisplay: string|null, reason: string|null, attempts: number, at: Date }>>}
 */
export async function listFinalFailures(scope, { runId, window, limit } = {}) {
  const normalizedScope = normalizeScope(scope);
  const normalizedRunId = runId == null ? null : toPositiveInt(runId);
  if (runId != null && normalizedRunId == null) {
    throw new TypeError('sendStats: runId phải là số nguyên dương');
  }
  const normalizedWindow = normalizeWindow(window, { required: false });
  if (normalizedRunId == null && !normalizedWindow) {
    throw new TypeError('sendStats: listFinalFailures cần runId hoặc window (không quét cả lịch sử)');
  }
  const normalizedLimit = limit == null ? DEFAULT_FAILURE_LIMIT : limit;
  if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > MAX_FAILURE_LIMIT) {
    throw new RangeError(`sendStats: limit phải là số nguyên từ 1 đến ${MAX_FAILURE_LIMIT}`);
  }
  const channels = resolveChannels();
  const rows = await sendStatsRepository.finalFailures({
    scope: normalizedScope,
    runId: normalizedRunId,
    window: normalizedWindow,
    limit: normalizedLimit,
    channels: forRepository(channels),
  });
  return rows.map((row) => ({
    runId: toNullableId(row.id_run),
    campaignId: toNullableId(row.id_campaign),
    channel: row.channel,
    recipient: row.recipient ?? null,
    recipientDisplay: row.recipient_display ?? null,
    reason: row.reason ?? null,
    attempts: toCount(row.attempts),
    at: row.at,
  }));
}

export default {
  getChannelTotals,
  getDailySeries,
  getHourlySeries,
  getRunTotals,
  getCampaignTotals,
  getActorTotals,
  listFinalFailures,
};
