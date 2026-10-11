/**
 * Khớp "khách đã có" theo thông tin liên hệ — MỘT quy tắc chung cho mọi đường ghi khách
 * (nhập hàng loạt `POST /api/customers/bulk` và node "lưu khách" của chiến dịch).
 *
 * Trước đây hai đường dedup khác nhau: bulk so email/SĐT CHÍNH XÁC (phân biệt hoa thường,
 * `0912...` khác `+84912...`) còn node lưu khách hạ chữ thường email nhưng SĐT vẫn so chính xác,
 * nên cùng một người nhập qua hai đường ra hai dòng khách.
 *
 * Quy tắc chung:
 *   - email: trim + chữ thường.
 *   - SĐT: chỉ lấy chữ số, so 9 CHỮ SỐ CUỐI (khớp `0912345678`, `84912345678`, `+84 912 345 678`).
 *   - Ưu tiên khớp: (email + SĐT) -> email -> SĐT -> zaloId (zaloId chỉ dùng khi dòng KHÔNG có
 *     email lẫn SĐT, giữ hành vi cũ của bulk).
 *
 * Biểu thức SQL tương ứng (index ở migration 296) nằm ở `CUSTOMER_EMAIL_KEY_SQL` /
 * `CUSTOMER_PHONE_KEY_SQL` — phải khớp từng chữ với index thì Postgres mới dùng được.
 */

/** Biểu thức SQL cho khoá email (khớp index `idx_customers_ws_email_key`). */
export const CUSTOMER_EMAIL_KEY_SQL = 'LOWER(email)';

/** Biểu thức SQL cho khoá SĐT (khớp index `idx_customers_ws_phone_key`). */
export const CUSTOMER_PHONE_KEY_SQL = "RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 9)";

/**
 * @param {unknown} value
 * @returns {string|null} email đã trim + chữ thường, hoặc null nếu rỗng
 */
export function normalizeContactEmail(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  return text === '' ? null : text;
}

/**
 * @param {unknown} value
 * @returns {string|null} tối đa 9 chữ số cuối, hoặc null nếu không có chữ số nào
 */
export function normalizeContactPhoneKey(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/[^0-9]/g, '');
  if (digits === '') return null;
  return digits.slice(-9);
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeZaloId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function pairKey(emailKey, phoneKey) {
  return `${emailKey}|${phoneKey}`;
}

/**
 * Chỉ mục trong bộ nhớ trên các dòng `customers` đã nạp một lần (preload). Mỗi khoá chỉ giữ dòng
 * ĐẦU TIÊN được thêm vào — nạp theo `ORDER BY id ASC` thì dòng id nhỏ nhất thắng, kết quả ổn định.
 *
 * @returns {{
 *   add: (row: object) => void,
 *   remove: (row: object) => void,
 *   find: (contact: { email?: unknown, phone?: unknown, zaloId?: unknown }) => (object|null),
 * }}
 */
export function createCustomerContactIndex() {
  const byPair = new Map();
  const byEmail = new Map();
  const byPhone = new Map();
  const byZalo = new Map();

  const keysOf = (row) => ({
    emailKey: normalizeContactEmail(row.email),
    phoneKey: normalizeContactPhoneKey(row.phone),
    zaloKey: normalizeZaloId(row.zalo_id),
  });

  return {
    add(row) {
      const { emailKey, phoneKey, zaloKey } = keysOf(row);
      if (emailKey && phoneKey) {
        const key = pairKey(emailKey, phoneKey);
        if (!byPair.has(key)) byPair.set(key, row);
      }
      if (emailKey && !byEmail.has(emailKey)) byEmail.set(emailKey, row);
      if (phoneKey && !byPhone.has(phoneKey)) byPhone.set(phoneKey, row);
      if (zaloKey && !byZalo.has(zaloKey)) byZalo.set(zaloKey, row);
    },

    /** Gỡ dòng khỏi chỉ mục TRƯỚC khi đổi email/SĐT của nó (khoá cũ không còn đúng). */
    remove(row) {
      const { emailKey, phoneKey, zaloKey } = keysOf(row);
      if (emailKey && phoneKey) {
        const key = pairKey(emailKey, phoneKey);
        if (byPair.get(key) === row) byPair.delete(key);
      }
      if (emailKey && byEmail.get(emailKey) === row) byEmail.delete(emailKey);
      if (phoneKey && byPhone.get(phoneKey) === row) byPhone.delete(phoneKey);
      if (zaloKey && byZalo.get(zaloKey) === row) byZalo.delete(zaloKey);
    },

    find({ email, phone, zaloId } = {}) {
      const emailKey = normalizeContactEmail(email);
      const phoneKey = normalizeContactPhoneKey(phone);
      if (emailKey && phoneKey) {
        return byPair.get(pairKey(emailKey, phoneKey))
          || byEmail.get(emailKey)
          || byPhone.get(phoneKey)
          || null;
      }
      if (emailKey) return byEmail.get(emailKey) || null;
      if (phoneKey) return byPhone.get(phoneKey) || null;
      const zaloKey = normalizeZaloId(zaloId);
      if (zaloKey) return byZalo.get(zaloKey) || null;
      return null;
    },
  };
}

/**
 * Hàm tra cứu chung: nạp một lần các dòng khách có thể trùng rồi tìm trong bộ nhớ.
 *
 * @param {object} index kết quả `createCustomerContactIndex()` đã `add()` các dòng đã nạp
 * @param {{ email?: unknown, phone?: unknown, zaloId?: unknown }} contact
 * @returns {object|null} dòng khách đã có hoặc null
 */
export function findExistingCustomerByContact(index, contact) {
  return index.find(contact);
}

/**
 * Gom khoá tra cứu của một lô liên hệ để nạp một lần từ DB.
 *
 * @param {Array<{ email?: unknown, phone?: unknown, zaloId?: unknown }>} contacts
 * @returns {{ emailKeys: string[], phoneKeys: string[], zaloIds: string[] }}
 */
export function collectContactLookupKeys(contacts) {
  const emailKeys = new Set();
  const phoneKeys = new Set();
  const zaloIds = new Set();
  for (const contact of contacts || []) {
    const emailKey = normalizeContactEmail(contact?.email);
    const phoneKey = normalizeContactPhoneKey(contact?.phone);
    if (emailKey) emailKeys.add(emailKey);
    if (phoneKey) phoneKeys.add(phoneKey);
    if (!emailKey && !phoneKey) {
      const zaloKey = normalizeZaloId(contact?.zaloId);
      if (zaloKey) zaloIds.add(zaloKey);
    }
  }
  return {
    emailKeys: Array.from(emailKeys),
    phoneKeys: Array.from(phoneKeys),
    zaloIds: Array.from(zaloIds),
  };
}
