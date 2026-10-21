/**
 * Cấu hình riêng của NGƯỜI BÁN không được đi theo landing khi chia sẻ qua Marketplace.
 *
 * `landing_pages.custom_config` có các khoá gắn với tài khoản người bán:
 *  - `googleSheetsSync` (`webhookUrl` + `secret`), `googleSheetsWebhookUrl`, `googleSheetsLastSyncAt`, `googleSheetsLastError`:
 *    lộ webhook + secret của Google Sheet người bán; landing clone còn đẩy lead của NGƯỜI MUA về Sheet của người bán
 *    (`lead.service.js` → `extractGoogleSheetsSyncConfig(lp.customConfig)`).
 *  - `sheetsSync`: tên cũ (alias) của `googleSheetsSync`, `extractGoogleSheetsSyncConfig` vẫn đọc.
 *  - `chosenFormId`: id biểu mẫu của người bán (cờ "biểu mẫu khách chọn", `landingPageAdmin.service.js`).
 *
 * Lọc ở CẢ BA chỗ (tạo snapshot, trả snapshot/preview, clone): snapshot đã lưu trước đây không tự sạch nên không thể chỉ lọc lúc tạo.
 */

/** Khoá (không phân biệt hoa/thường) bắt đầu bằng tiền tố này bị bỏ. */
const SELLER_PRIVATE_KEY_PREFIXES = ['googlesheets'];
/** Khoá (không phân biệt hoa/thường) trùng đúng tên này bị bỏ. */
const SELLER_PRIVATE_KEYS = new Set(['sheetssync', 'chosenformid']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isSellerPrivateLandingConfigKey(key) {
  const normalized = String(key).toLowerCase();
  return SELLER_PRIVATE_KEYS.has(normalized) || SELLER_PRIVATE_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Bản sao của `customConfig` đã bỏ khoá riêng của người bán (chỉ tầng ngoài cùng — các khoá trên nằm ở đó).
 * Không sửa đối tượng đầu vào. Giá trị không phải đối tượng thường (null/undefined/chuỗi/mảng) trả nguyên.
 *
 * @param {unknown} customConfig
 * @returns {unknown}
 */
export function stripSellerPrivateLandingConfig(customConfig) {
  if (!isPlainObject(customConfig)) return customConfig;
  const result = {};
  for (const [key, value] of Object.entries(customConfig)) {
    if (!isSellerPrivateLandingConfigKey(key)) result[key] = value;
  }
  return result;
}

/**
 * Bản sao của `snapshot_data` landing với `customConfig` (hoặc `custom_config` của dữ liệu cũ) đã lọc.
 * Giá trị không phải đối tượng thường trả nguyên.
 *
 * @param {unknown} snapshot
 * @returns {unknown}
 */
export function sanitizeLandingSnapshotForSharing(snapshot) {
  if (!isPlainObject(snapshot)) return snapshot;
  const result = { ...snapshot };
  if ('customConfig' in result) result.customConfig = stripSellerPrivateLandingConfig(result.customConfig);
  if ('custom_config' in result) result.custom_config = stripSellerPrivateLandingConfig(result.custom_config);
  return result;
}
