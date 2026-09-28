/**
 * Registry kênh gửi của ENGINE chiến dịch (PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-1/PR-3).
 *
 * Nguồn CHUẨN duy nhất cho "kênh gửi nào engine biết" — thay cho 4 danh sách ghi cứng rải rác
 * (campaignPreflight.service.js SEND_NODE_SUBTYPES, campaignRun.service.js skipSubtypes /
 * CONTINUOUS_SUPPORTED_ACTION_SUBTYPES / allowlist replay continuous) đã lệch nhau (xem mục 1 plan).
 *
 * ĐỪNG nhét vào campaignNodeRegistry.service.js — file đó chỉ AI builder dùng, engine không import.
 *
 * Hai loại kênh:
 * - `engine: 'legacy'` (PR-1) — 4 khối gửi cũ (email/zalo_personal/zalo_group/zalo_friend_request)
 *   xử lý trực tiếp trong campaignRun.service.js, KHÔNG có field `adapter`.
 * - `engine: 'adapter'` (PR-3+) — đi qua `campaignChannelRunner.service.js` (runner chung), PHẢI có
 *   đủ `quotaChannel`, `policy`, `adapter`.
 *
 * @typedef {object} ChannelPolicy
 * @property {number} minDelayMs delay ngẫu nhiên tối thiểu giữa 2 lần gửi (không áp cho tin đầu).
 * @property {number} maxDelayMs delay ngẫu nhiên tối đa giữa 2 lần gửi.
 * @property {number} perHourLimit trần gửi/giờ theo (channel, accountKey) — cửa sổ trượt trong RAM
 *   (runner tự quản lý, KHÔNG dùng chung state với zaloRateLimiter — xem mục 5 Bẫy của plan).
 * @property {{startHour: number, endHour: number}|null} quietHours khung giờ VN không gửi (vắt nửa
 *   đêm khi startHour > endHour, cùng khuôn zaloRateLimiter.js) — null = không có khung yên lặng.
 *
 * @typedef {object} ChannelAdapter
 * @property {function({userId: number, node: object}): Promise<void>} checkReadiness Gọi ở preflight
 *   — throw lỗi có `code` (vd NOT_CONFIGURED/ACCOUNT_DISCONNECTED) khi kênh chưa sẵn sàng gửi.
 * @property {function({userId: number, workspaceOwnerId: number, node: object, config: object}): Promise<{accountKey: string, display: string}>} resolveAccount
 *   Xác định tài khoản gửi cho node này.
 * @property {function({rows: object[], config: object}): Promise<Array<{recipientKey: string, display?: string, vars?: object}>>} resolveRecipients
 *   Chuẩn hoá/lọc danh sách người nhận từ `rows` thô (runner đã gom theo `config.recipientSource`) —
 *   adapter KHÔNG tự đọc nguồn dữ liệu khác trừ khi kênh cần (vd Telegram PR-6 đọc thêm hội thoại).
 * @property {function({account: object, recipientKey: string, text: string, stepIndex: number}): Promise<{messageId: string}>} sendOne
 *   Gửi một tin — throw `ChannelSendError` khi thất bại.
 * @property {function(Error): ('hard'|'transient'|'rate_limit'|'auth'|'not_configured')} classifyError
 *   Phân loại lỗi từ `sendOne`/`checkReadiness` để runner quyết định bỏ qua người này hay dừng cả node.
 *
 * @typedef {object} ChannelDescriptor
 * @property {string} key Giá trị cột `channel` ở ledger/messages/reservation cho kênh này.
 * @property {string} sendNodeSubtype node_subtype coi là "gửi" cho kênh này (vd 'send_email').
 * @property {'legacy'|'adapter'} engine 'legacy': 1 trong 4 khối gửi cũ. 'adapter': qua runner chung.
 * @property {boolean} continuousSupported Node subtype này có giữ campaign ở chế độ continuous
 *   không (nguồn cho CONTINUOUS_SUPPORTED_ACTION_SUBTYPES, R:3256).
 * @property {boolean} continuousReplay Node subtype này có được chạy lại ở các chu kỳ replay
 *   (continuousCycleIndex > 0) của continuous mode không (nguồn cho allowlist R:3335).
 * @property {string} [quotaChannel] Chỉ kênh 'adapter' — cột limit dùng để tính quota (vd 'zalo').
 * @property {ChannelPolicy} [policy] Chỉ kênh 'adapter'.
 * @property {ChannelAdapter} [adapter] Chỉ kênh 'adapter'.
 */

// PR-6 (tách tầng kênh gửi) — import tĩnh, KHÔNG kích hoạt side-effect thật nào (chỉ khai báo hàm)
// cho tới khi cờ CAMPAIGN_CHANNEL_TELEGRAM_ENABLED bật VÀ có node thật gọi tới.
import { telegramChannelAdapter, buildTelegramPolicyFromEnv } from './channels/telegram.campaignChannel.js';

/** Lỗi gửi kênh adapter — `category` quyết định runner bỏ qua người này hay dừng cả node. */
export class ChannelSendError extends Error {
  /**
   * @param {'hard'|'transient'|'rate_limit'|'auth'|'not_configured'} category
   * @param {string} message
   * @param {object} [options]
   * @param {number} [options.retryAfterMs] - chỉ cho 'rate_limit': nhà cung cấp bảo chờ bao lâu (vd
   *   Telegram FLOOD_WAIT_X → X*1000). Runner dùng làm mốc defer; thiếu thì dùng mặc định 15 phút.
   */
  constructor(category, message, { retryAfterMs = null } = {}) {
    super(message);
    this.name = 'ChannelSendError';
    this.category = category;
    this.retryAfterMs = retryAfterMs;
  }
}

/** @type {ChannelDescriptor[]} */
const CHANNEL_DESCRIPTORS = Object.freeze([
  Object.freeze({
    key: 'email',
    sendNodeSubtype: 'send_email',
    engine: 'legacy',
    continuousSupported: true,
    continuousReplay: true,
  }),
  Object.freeze({
    key: 'zalo_personal',
    sendNodeSubtype: 'send_zalo_personal',
    engine: 'legacy',
    continuousSupported: true,
    continuousReplay: true,
  }),
  Object.freeze({
    key: 'zalo_group',
    sendNodeSubtype: 'send_zalo_group',
    engine: 'legacy',
    continuousSupported: true,
    // SỬA CỐ Ý (PR-1, Việc 3) — R:3335 (allowlist replay continuous) trước đây THIẾU
    // send_zalo_group: campaign nhóm bật continuous bị hạ về one-shot ở R:3267 (không đủ node hỗ
    // trợ để... thực ra ĐỦ, vì continuousSupported đã có send_zalo_group từ trước) NHƯNG node gửi
    // nhóm bị bỏ qua ở MỌI chu kỳ replay (>0) — quay vòng không gửi. Bằng chứng an toàn: 0 chiến
    // dịch nhóm chạy continuous trên production trong 30 ngày (đo 27/09, mục 1 plan).
    continuousReplay: true,
  }),
  Object.freeze({
    key: 'zalo_friend_request',
    sendNodeSubtype: 'send_zalo_friend_request',
    engine: 'legacy',
    continuousSupported: true,
    continuousReplay: true,
  }),
]);

/**
 * Kênh 'adapter' đăng ký CHỈ TRONG TEST. Mutable, khác `CHANNEL_DESCRIPTORS` (frozen).
 *
 * @type {ChannelDescriptor[]}
 */
let testChannelDescriptors = [];

/**
 * PR-6 — Telegram là kênh 'adapter' đầu tiên có build THẬT (đăng ký tĩnh, không qua
 * `__registerChannelForTest`), nhưng chỉ "biết gửi" khi cờ bật — xem `TELEGRAM_CHANNEL_META` và
 * "CHỐT PR-6" trong plan: cờ CHỈ chặn GỬI, KHÔNG chặn ĐẾM quota.
 */
const TELEGRAM_CHANNEL_META = Object.freeze({ key: 'telegram', quotaChannel: 'zalo' });

function isTelegramChannelEnabled() {
  // Đọc lúc GỌI, không lúc import — test đổi cờ giữa các ca không bị dính giá trị cũ.
  return process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED === 'true';
}

/** Descriptor Telegram đầy đủ — CHỈ build khi cờ bật (adapter.sendOne cần cờ bật mới gọi tới). */
function buildTelegramDescriptor() {
  return {
    key: TELEGRAM_CHANNEL_META.key,
    sendNodeSubtype: 'send_telegram',
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: TELEGRAM_CHANNEL_META.quotaChannel,
    policy: buildTelegramPolicyFromEnv(),
    adapter: telegramChannelAdapter,
  };
}

function getAllDescriptors() {
  const staticAdapterDescriptors = isTelegramChannelEnabled() ? [buildTelegramDescriptor()] : [];
  return [...CHANNEL_DESCRIPTORS, ...staticAdapterDescriptors, ...testChannelDescriptors];
}

function findDescriptorBySubtype(subtype) {
  const value = String(subtype || '');
  return getAllDescriptors().find((d) => d.sendNodeSubtype === value) || null;
}

/** Toàn bộ node_subtype được coi là "gửi" (thay SEND_NODE_SUBTYPES cứng ở preflight). */
export function getSendNodeSubtypes() {
  return getAllDescriptors().map((d) => d.sendNodeSubtype);
}

/** subtype có nằm trong registry (engine biết cách xử lý — legacy HOẶC adapter) không. */
export function isKnownSendSubtype(subtype) {
  return findDescriptorBySubtype(subtype) !== null;
}

/**
 * subtype "có ý gửi" — hoặc registry biết, hoặc theo quy ước đặt tên `send_*` (kể cả registry
 * CHƯA biết, vd `send_whatsapp` lúc chưa có adapter). Dùng để phân biệt với node không-phải-gửi
 * (wait_time, condition, subtype cụt như 'email'/'zalo_personal' không có tiền tố `send_`).
 */
export function isSendIntentSubtype(subtype) {
  const value = String(subtype || '');
  return isKnownSendSubtype(value) || value.startsWith('send_');
}

/** subtype của các kênh có continuousReplay=true (nguồn cho allowlist replay R:3335). */
export function getContinuousReplaySubtypes() {
  return getAllDescriptors().filter((d) => d.continuousReplay).map((d) => d.sendNodeSubtype);
}

/** subtype của các kênh có continuousSupported=true (nguồn cho CONTINUOUS_SUPPORTED_ACTION_SUBTYPES R:3256). */
export function getContinuousSupportedSubtypes() {
  return getAllDescriptors().filter((d) => d.continuousSupported).map((d) => d.sendNodeSubtype);
}

/**
 * Descriptor kênh 'adapter' cho subtype này — dùng ở campaignRun.service.js (Việc 3, PR-3) và
 * campaignPreflight.service.js (checkReadiness) để biết node có nên đi qua runner chung không.
 *
 * @param {string} subtype
 * @returns {ChannelDescriptor|null} null nếu subtype không phải kênh 'adapter' (kể cả khi là kênh
 *   'legacy' hoặc không tồn tại trong registry).
 */
export function getAdapterDescriptorBySubtype(subtype) {
  const descriptor = findDescriptorBySubtype(subtype);
  return descriptor && descriptor.engine === 'adapter' ? descriptor : null;
}

/**
 * `key` của mọi kênh 'adapter' có `quotaChannel` khớp giá trị truyền vào — PR-4 dùng để cộng vế
 * `campaign_channel_messages` vào các hàm đếm quota Zalo (userSendLimit.util.js/sendQuota.repository.js).
 * Danh sách rỗng khi chưa kênh adapter nào đăng ký (production hiện tại) — vế SQL tương ứng = 0.
 *
 * @param {string} quotaChannel 'email' | 'zalo'
 * @returns {string[]}
 */
export function getAdapterChannelKeysByQuotaChannel(quotaChannel) {
  const dynamicKeys = getAllDescriptors()
    .filter((d) => d.engine === 'adapter' && d.quotaChannel === quotaChannel)
    .map((d) => d.key);
  // PR-6 (CHỐT PR-6) — cờ CAMPAIGN_CHANNEL_TELEGRAM_ENABLED chỉ chặn GỬI (getAllDescriptors ở trên
  // đã lọc theo cờ), KHÔNG được chặn ĐẾM: tắt cờ không có nghĩa tin Telegram đã gửi trước đó thôi
  // tính vào hạn mức Zalo. Luôn cộng thêm 'telegram' vào đây bất kể cờ.
  const alwaysOnKeys = TELEGRAM_CHANNEL_META.quotaChannel === quotaChannel
    ? [TELEGRAM_CHANNEL_META.key]
    : [];
  return [...new Set([...dynamicKeys, ...alwaysOnKeys])];
}

/**
 * Đăng ký một kênh 'adapter' CHỈ DÙNG CHO TEST (mock descriptor). Throw nếu gọi ngoài
 * `NODE_ENV=test` — PR-3 không đăng ký kênh thật nào ở production/dev.
 *
 * @param {ChannelDescriptor} descriptor
 */
export function __registerChannelForTest(descriptor) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__registerChannelForTest chỉ được gọi khi NODE_ENV=test');
  }
  testChannelDescriptors = [
    ...testChannelDescriptors.filter((d) => d.sendNodeSubtype !== descriptor.sendNodeSubtype),
    descriptor,
  ];
}

/** Xoá toàn bộ kênh 'adapter' đã đăng ký cho test. Throw nếu gọi ngoài `NODE_ENV=test`. */
export function __resetTestChannels() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetTestChannels chỉ được gọi khi NODE_ENV=test');
  }
  testChannelDescriptors = [];
}

export default {
  ChannelSendError,
  getSendNodeSubtypes,
  isKnownSendSubtype,
  isSendIntentSubtype,
  getContinuousReplaySubtypes,
  getContinuousSupportedSubtypes,
  getAdapterDescriptorBySubtype,
  getAdapterChannelKeysByQuotaChannel,
  __registerChannelForTest,
  __resetTestChannels,
};
