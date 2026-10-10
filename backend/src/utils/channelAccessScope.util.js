/**
 * Phạm vi tài khoản Telegram / WhatsApp (Baileys) mà người thao tác được dùng (PLAN_GIAO_TK_TG_WA PR-H3), cho tầng repository của
 * Hộp thư. Giá trị là kết quả của `getAccessibleChannelScope(ctx)` (services/user/memberChannelAccess.service.js):
 *
 *   { telegram: string[]|null, whatsapp_baileys: string[]|null }
 *
 *  - `null` ở một kênh → chủ / super admin, KHÔNG lọc kênh đó;
 *  - `string[]` → nhân viên, chỉ các tài khoản này (mảng rỗng = không thấy tài khoản nào);
 *  - mọi giá trị khác (`undefined`, chuỗi, thiếu khoá...) → coi như `[]`. HỎNG THÌ CHẶN: chỗ gọi quên truyền phạm vi thì không lộ
 *    dữ liệu, chỉ trả rỗng (ngược với khuôn `topupLockGate`).
 *
 * `channel_connections.external_channel_id` là khoá tài khoản: Telegram = `telegram_accounts.id` dạng chuỗi, WhatsApp Baileys =
 * session_key đầy đủ. Kênh khác (Zalo OA, Facebook, web) KHÔNG nằm trong phạm vi giao nên không bao giờ bị lọc ở đây.
 *
 * Hàm thuần, không đụng DB.
 */

export const SCOPED_CHANNELS = Object.freeze(['telegram', 'whatsapp_baileys']);

/**
 * @param {unknown} scope
 * @returns {{ telegram: string[]|null, whatsapp_baileys: string[]|null }}
 */
export function normalizeChannelAccessScope(scope) {
  const source = scope && typeof scope === 'object' && !Array.isArray(scope) ? scope : {};
  const result = {};
  for (const channel of SCOPED_CHANNELS) {
    const value = source[channel];
    if (value === null) result[channel] = null;
    else if (Array.isArray(value)) result[channel] = Array.from(new Set(value.map((ref) => String(ref)).filter((ref) => ref !== '')));
    else result[channel] = [];
  }
  return result;
}

/** Có kênh nào bị lọc không (cả hai `null` = không lọc gì). */
export function isChannelScopeUnrestricted(scope) {
  const normalized = normalizeChannelAccessScope(scope);
  return SCOPED_CHANNELS.every((channel) => normalized[channel] === null);
}

/**
 * Một ref có được dùng không theo phạm vi MỘT kênh (`null` = thấy hết; mảng = chỉ các ref này; khác = không). So sánh theo chuỗi.
 *
 * @param {string|number} ref
 * @param {unknown} refsOfChannel phần tử `normalizeChannelAccessScope(scope)[channel]`
 * @returns {boolean}
 */
export function isRefInChannelScope(ref, refsOfChannel) {
  if (refsOfChannel === null) return true;
  return Array.isArray(refsOfChannel) && refsOfChannel.map(String).includes(String(ref));
}

/** subtype node → (kênh, khoá cấu hình chứa tài khoản). Node adapter chỉ có MỘT tài khoản. */
const ADAPTER_NODE_ACCOUNT_FIELDS = Object.freeze({
  send_telegram: { channel: 'telegram', field: 'telegramAccountId' },
  send_whatsapp: { channel: 'whatsapp_baileys', field: 'whatsappSessionKey' },
});

/**
 * Trợ lý AI dựng cho NHÂN VIÊN: tài khoản Telegram / WhatsApp chưa được giao (wizard giữ sót / marker giả / mô hình bịa) bị GỠ khỏi
 * node `send_telegram` / `send_whatsapp` để thẻ xác nhận báo "thiếu tài khoản gửi", thay vì âm thầm gửi bằng tài khoản khác.
 * `scope` null / undefined (chủ, hoặc gọi nội bộ không có người thao tác) → không đụng gì. Có scope mà thiếu khoá kênh → coi như [].
 *
 * @param {Array<{ node_subtype?: string, nodeSubtype?: string, config?: object }>} nodes
 * @param {{ telegram?: string[]|null, whatsapp_baileys?: string[]|null }|null|undefined} scope
 * @returns {string[]} các ref đã bị gỡ (không trùng)
 */
export function stripChannelAccountsNotAccessible(nodes, scope) {
  if (scope === null || scope === undefined) return [];
  const normalized = normalizeChannelAccessScope(scope);
  const removed = new Set();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const subtype = String(node?.node_subtype ?? node?.nodeSubtype ?? '').trim();
    const spec = ADAPTER_NODE_ACCOUNT_FIELDS[subtype];
    const config = node?.config;
    if (!spec || !config || typeof config !== 'object') continue;
    const raw = config[spec.field];
    if (raw === undefined || raw === null || raw === '') continue;
    if (!isRefInChannelScope(raw, normalized[spec.channel])) {
      removed.add(String(raw));
      delete config[spec.field];
    }
  }
  return [...removed];
}

/**
 * Đẩy mảng ref vào `params` và trả đoạn SQL `AND (...)` lọc theo `<alias>.channel` + `<alias>.external_channel_id`; chủ / super
 * admin (cả hai `null`) → chuỗi rỗng, không đẩy gì. Kênh ngoài phạm vi giao (Zalo OA, Facebook...) luôn qua.
 * `params` là mảng tham số ĐÃ có sẵn (đánh số tiếp từ độ dài hiện tại).
 *
 * @param {unknown} scope
 * @param {string} alias alias bảng `channel_connections`, do server viết (KHÔNG phải input người dùng)
 * @param {unknown[]} params
 * @returns {string}
 */
export function pushChannelAccessFilter(scope, alias, params) {
  const condition = pushChannelAccessCondition(scope, alias, params);
  return condition ? `AND ${condition}` : '';
}

/**
 * Như `pushChannelAccessFilter` nhưng trả BIỂU THỨC `(...)` không có `AND` đứng đầu (để ghép vào `OR`/`EXISTS`); chủ → ''.
 *
 * @param {unknown} scope
 * @param {string} alias
 * @param {unknown[]} params
 * @returns {string}
 */
export function pushChannelAccessCondition(scope, alias, params) {
  const normalized = normalizeChannelAccessScope(scope);
  if (isChannelScopeUnrestricted(normalized)) return '';
  const clauses = [`${alias}.channel NOT IN ('telegram', 'whatsapp_baileys')`];
  for (const channel of SCOPED_CHANNELS) {
    const refs = normalized[channel];
    if (refs === null) {
      clauses.push(`${alias}.channel = '${channel}'`);
    } else {
      params.push(refs);
      clauses.push(`(${alias}.channel = '${channel}' AND ${alias}.external_channel_id = ANY($${params.length}::text[]))`);
    }
  }
  return `(${clauses.join(' OR ')})`;
}
