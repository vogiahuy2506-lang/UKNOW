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

/** Lỗi gửi kênh adapter — `category` quyết định runner bỏ qua người này hay dừng cả node. */
export class ChannelSendError extends Error {
  /**
   * @param {'hard'|'transient'|'rate_limit'|'auth'|'not_configured'} category
   * @param {string} message
   */
  constructor(category, message) {
    super(message);
    this.name = 'ChannelSendError';
    this.category = category;
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
 * Kênh 'adapter' đăng ký CHỈ TRONG TEST (PR-3 chưa có kênh thật nào bật ở production — Telegram
 * PR-6 sẽ đăng ký tĩnh vào đây, sau cờ tắt mặc định). Mutable, khác `CHANNEL_DESCRIPTORS` (frozen).
 *
 * @type {ChannelDescriptor[]}
 */
let testChannelDescriptors = [];

function getAllDescriptors() {
  return [...CHANNEL_DESCRIPTORS, ...testChannelDescriptors];
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
  __registerChannelForTest,
  __resetTestChannels,
};
