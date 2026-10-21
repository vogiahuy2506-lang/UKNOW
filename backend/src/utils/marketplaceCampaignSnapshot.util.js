/**
 * Gỡ dữ liệu GẮN NGƯỜI BÁN khỏi cấu hình các khối của chiến dịch đăng bán Marketplace (cùng họ với `marketplaceLandingSnapshot.util.js`).
 *
 * Áp ở HAI chỗ: lúc đăng bán (snapshot không mang dữ liệu người bán) và lúc mua / bù dữ liệu cũ (listing cũ đã lưu kèm các khoá này).
 * Áp cho CẢ `campaign_nodes.config` (snapshot.nodes) LẪN `flow_json.nodes[].data.config`: trình dựng chiến dịch mở sơ đồ từ `flow_json`
 * (config trong đó đè lên `campaign_nodes`) và lúc lưu ghi ngược lại, nên chỉ gỡ ở một nơi thì lần đầu người mua mở trình dựng
 * là dữ liệu người bán quay lại.
 *
 * "Gỡ" = đặt về đúng giá trị mà giao diện hiểu là CHƯA CHỌN (không thêm khoá không có sẵn, trừ hai khối danh sách Zalo — xem dưới):
 *  - kiểu `delete`  : bỏ khoá (id tài khoản đơn lẻ; trống = chưa chọn / email trống = tài khoản mặc định của người mua);
 *  - kiểu `null`    : đặt null (mặc định của registry cho `telegramAccountId`, `whatsappSessionKey`);
 *  - kiểu `array`   : đặt `[]`;
 *  - kiểu `list`    : đặt `[]` nếu đang là mảng, `''` nếu đang là chuỗi (danh sách nhập tay dạng văn bản);
 *  - kiểu `text`    : đặt `''`;   - kiểu `object`: đặt `{}`.
 *
 * Hai khối danh sách Zalo (`get_all_friends`, `get_all_groups`) đặt về trạng thái "chưa chọn ai" MÀ BỘ CHẠY HIỂU (cùng giá trị
 * `settingsGraph.buildSourceConfig` dùng cho khung mới): chọn rỗng ở hai khối này KHÔNG có nghĩa "tất cả" nếu bật cờ khoá / chế độ
 * 'fixed' — nếu không đặt cờ thì chọn rỗng = MỌI bạn bè / MỌI nhóm của tài khoản người mua, gửi nhầm đắt hơn thiếu một lựa chọn.
 *
 * KHÔNG gỡ: danh mục khoá học (`coursesDbSelectedIds`, `interestedCourseIds`… — bảng `courses` dùng chung toàn nền tảng, không có chủ),
 * tên tag của khối "Gắn tag" (tìm-hoặc-tạo trong workspace người mua), tham chiếu giữa các khối (đã đổi id ở bước clone).
 */
import { mapFlowJsonNodeConfigs } from './campaignTemplateReference.util.js';

const ZALO_ACCOUNT_SUBTYPES = new Set([
  'send_zalo',
  'send_zalo_personal',
  'send_zalo_group',
  'send_zalo_friend_request',
  'select_zalo_account',
  'get_all_friends',
  'get_all_groups',
]);

/** Khoá tài khoản Zalo: gỡ ở MỌI khối Zalo (kể cả khối chọn tài khoản và hai khối lấy danh sách). */
export const ZALO_ACCOUNT_KEY_RULES = Object.freeze([
  ['zaloAccountId', 'delete'],
  ['accountId', 'delete'],
  ['zaloPoolAccountIds', 'array'],
  ['zaloPersonalAccountIds', 'array'],
  ['zaloFriendAccountIds', 'array'],
]);

/** Khoá gắn người bán theo từng subtype (ngoài `ZALO_ACCOUNT_KEY_RULES`). */
export const SELLER_BOUND_KEY_RULES = Object.freeze({
  send_email: [
    ['fromEmailId', 'delete'], // tài khoản SMTP của người bán; trống = tài khoản email mặc định của người mua
    ['recipientEmails', 'list'], // danh sách người nhận nhập tay
  ],
  send_zalo_personal: [
    ['zaloRecipientPhones', 'list'],
    ['recipientPhones', 'list'],
  ],
  send_zalo_friend_request: [['zaloFriendPhones', 'list']],
  send_zalo_group: [['zaloGroupIds', 'list']], // id nhóm nhập tay — nhóm của tài khoản Zalo người bán
  // Bộ chạy KHÔNG đọc khoá này ở khối lấy nhóm (chỉ đọc ở send_zalo_group), nhưng cấu hình cũ vẫn mang id nhóm của người bán
  // (listing #9 production 20/10: 11 id) — gỡ để không lộ sang người mua. Trạng thái chọn nhóm do FIXED_RESETS đặt riêng.
  get_all_groups: [['zaloGroupIds', 'list']],
  send_telegram: [
    ['telegramAccountId', 'null'],
    ['recipientKeys', 'list'], // khoá hội thoại / nhóm gắn tài khoản người bán
  ],
  send_whatsapp: [
    ['whatsappSessionKey', 'null'],
    ['recipientKeys', 'list'],
  ],
  read_sheet: [
    ['sheetUrl', 'text'],
    ['sheetName', 'text'],
    ['sheetNameSource', 'delete'],
    ['dataSelectedColumns', 'array'], // tên cột của Google Sheet người bán
  ],
  read_interested_customers: [
    ['interestedSelectedCustomerIds', 'array'], // id khách hàng của người bán
    ['interestedExcludedCustomerIds', 'array'],
    ['interestedTagIds', 'array'], // id tag của workspace người bán
  ],
  read_landing_leads: [['landingLeadsSlugs', 'array']], // slug landing của người bán
  read_form_submissions: [
    ['formIds', 'array'],
    ['formId', 'delete'],
    ['fieldMap', 'object'], // khoá trường của biểu mẫu người bán
  ],
  read_products_db: [['productsDbSelectedIds', 'array']], // sản phẩm của người bán (truy vấn lọc theo chủ nên người mua không thấy)
});

const SUBTYPE_ALIAS = Object.freeze({
  google_sheet: 'read_sheet',
  interested_customers: 'read_interested_customers',
});

/** Đặt lại trạng thái chọn của hai khối lấy danh sách Zalo (giá trị cố định, không phụ thuộc giá trị cũ). */
const FIXED_RESETS = Object.freeze({
  get_all_friends: { zaloFriendSelectionMode: 'fixed', zaloSelectedFriendIds: [], zaloExcludedFriendIds: [] },
  get_all_groups: { zaloSelectedGroupIds: [], zaloGroupSelectionSnapshotLocked: true },
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function emptyValueFor(kind, current) {
  switch (kind) {
    case 'null':
      return null;
    case 'array':
      return [];
    case 'list':
      return Array.isArray(current) ? [] : '';
    case 'text':
      return '';
    case 'object':
      return {};
    default:
      return undefined;
  }
}

function applyRules(config, rules) {
  let next = config;
  for (const [key, kind] of rules) {
    if (!Object.prototype.hasOwnProperty.call(config, key)) continue;
    const current = config[key];
    // Đã ở trạng thái "chưa chọn" (null / '' / [] / {}) thì giữ nguyên, khỏi sao chép.
    if (isEmptyValue(current)) continue;
    if (next === config) next = { ...config };
    if (kind === 'delete') delete next[key];
    else next[key] = emptyValueFor(kind, current);
  }
  return next;
}

/**
 * Gỡ dữ liệu gắn người bán khỏi config một khối.
 *
 * @param {string} subtype
 * @param {unknown} config
 * @returns {unknown} config mới (sao chép khi có đổi) — GIỮ NGUYÊN tham chiếu nếu không có gì đổi hoặc config không phải object
 */
export function stripSellerBoundNodeConfig(subtype, config) {
  if (!isPlainObject(config)) return config;
  const kind = SUBTYPE_ALIAS[String(subtype || '').trim()] || String(subtype || '').trim();
  let next = config;
  if (ZALO_ACCOUNT_SUBTYPES.has(kind)) next = applyRules(next, ZALO_ACCOUNT_KEY_RULES);
  const rules = SELLER_BOUND_KEY_RULES[kind];
  if (rules) next = applyRules(next, rules);
  const reset = FIXED_RESETS[kind];
  if (reset) {
    const needsReset = Object.entries(reset).some(([key, value]) => JSON.stringify(next[key]) !== JSON.stringify(value));
    if (needsReset) next = { ...next, ...reset };
  }
  return next;
}

/**
 * Gỡ dữ liệu gắn người bán khỏi cả sơ đồ `flow_json` (`nodes[].data.config`).
 *
 * @param {unknown} flowJson
 * @returns {unknown} giữ nguyên tham chiếu khi không có gì đổi
 */
export function stripSellerBoundFlowJson(flowJson) {
  return mapFlowJsonNodeConfigs(flowJson, stripSellerBoundNodeConfig);
}

/**
 * Gỡ khỏi danh sách khối của snapshot (`snapshot.nodes[]`, camelCase `nodeSubtype` + `config`).
 *
 * @param {Array<object>} nodes
 * @returns {Array<object>} mảng mới; khối không đổi giữ nguyên tham chiếu
 */
export function stripSellerBoundSnapshotNodes(nodes) {
  if (!Array.isArray(nodes)) return nodes;
  return nodes.map((node) => {
    if (!node || typeof node !== 'object') return node;
    const config = typeof node.config === 'string' ? safeParseObject(node.config) : node.config;
    const nextConfig = stripSellerBoundNodeConfig(node.nodeSubtype ?? node.node_subtype, config);
    return nextConfig === node.config ? node : { ...node, config: nextConfig };
  });
}

function safeParseObject(text) {
  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : text;
  } catch {
    return text;
  }
}

export default {
  ZALO_ACCOUNT_KEY_RULES,
  SELLER_BOUND_KEY_RULES,
  stripSellerBoundNodeConfig,
  stripSellerBoundFlowJson,
  stripSellerBoundSnapshotNodes,
};
