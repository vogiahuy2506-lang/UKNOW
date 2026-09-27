/**
 * Registry kênh gửi của ENGINE chiến dịch (PLAN_TACH_TANG_KENH_GUI_2026-09-27, PR-1).
 *
 * Nguồn CHUẨN duy nhất cho "kênh gửi nào engine biết" — thay cho 4 danh sách ghi cứng rải rác
 * (campaignPreflight.service.js SEND_NODE_SUBTYPES, campaignRun.service.js skipSubtypes /
 * CONTINUOUS_SUPPORTED_ACTION_SUBTYPES / allowlist replay continuous) đã lệch nhau (xem mục 1 plan).
 *
 * ĐỪNG nhét vào campaignNodeRegistry.service.js — file đó chỉ AI builder dùng, engine không import.
 *
 * PR-1 chỉ khai 4 kênh "legacy" (engine:'legacy' — không có `adapter`, 4 khối gửi cũ trong
 * campaignRun.service.js vẫn xử lý trực tiếp theo subtype, KHÔNG đi qua runner chung). Field
 * `quotaChannel`/`policy`/`adapter` (mô tả đầy đủ ở mục 2 plan, dùng từ PR-3+ cho kênh adapter) CHƯA
 * khai ở đây — PR-1 không có code nào đọc, thêm số liệu chưa kiểm chứng vào lúc này chỉ tạo rủi ro.
 *
 * @typedef {object} ChannelDescriptor
 * @property {string} key - Giá trị cột `channel` ở ledger/messages/reservation cho kênh này.
 * @property {string} sendNodeSubtype - node_subtype coi là "gửi" cho kênh này (vd 'send_email').
 * @property {'legacy'|'adapter'} engine - 'legacy': 1 trong 4 khối gửi cũ xử lý trực tiếp trong
 *   campaignRun.service.js. 'adapter': đi qua runner chung (campaignChannelRunner, từ PR-3).
 * @property {boolean} continuousSupported - Node subtype này có giữ campaign ở chế độ continuous
 *   không (nguồn cho CONTINUOUS_SUPPORTED_ACTION_SUBTYPES, R:3256).
 * @property {boolean} continuousReplay - Node subtype này có được chạy lại ở các chu kỳ replay
 *   (continuousCycleIndex > 0) của continuous mode không (nguồn cho allowlist R:3335).
 */

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

const BY_SUBTYPE = new Map(CHANNEL_DESCRIPTORS.map((d) => [d.sendNodeSubtype, d]));

/** Toàn bộ node_subtype được coi là "gửi" (thay SEND_NODE_SUBTYPES cứng ở preflight). */
export function getSendNodeSubtypes() {
  return CHANNEL_DESCRIPTORS.map((d) => d.sendNodeSubtype);
}

/** subtype có nằm trong registry (engine biết cách xử lý) không. */
export function isKnownSendSubtype(subtype) {
  return BY_SUBTYPE.has(String(subtype || ''));
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
  return CHANNEL_DESCRIPTORS.filter((d) => d.continuousReplay).map((d) => d.sendNodeSubtype);
}

/** subtype của các kênh có continuousSupported=true (nguồn cho CONTINUOUS_SUPPORTED_ACTION_SUBTYPES R:3256). */
export function getContinuousSupportedSubtypes() {
  return CHANNEL_DESCRIPTORS.filter((d) => d.continuousSupported).map((d) => d.sendNodeSubtype);
}

export default {
  getSendNodeSubtypes,
  isKnownSendSubtype,
  isSendIntentSubtype,
  getContinuousReplaySubtypes,
  getContinuousSupportedSubtypes,
};
