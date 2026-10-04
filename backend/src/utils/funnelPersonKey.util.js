import { normalizeAccountPhone } from './accountPhone.util.js';

/**
 * Khoá "một người" của phễu sản phẩm (đợt 3): số điện thoại chuẩn hoá > email (hạ chữ thường) > chính dòng đó.
 * - SĐT: `normalizeAccountPhone` không ném và KHÔNG kiểm hợp lệ (trả chuỗi chữ số, có thể rác như "12") nên ở đây chỉ nhận
 *   khi còn 8–15 chữ số; rác thì rơi về email. Nhờ vậy "0901 234 567" và "+84901234567" cùng ra `p:0901234567`.
 * - Không có SĐT lẫn email dùng được: `row:<nguồn>:<id>` — mỗi dòng một người (không đoán gộp).
 *
 * @param {{ phone?: string|null, email?: string|null, source: string, id: number|string }} p
 * @returns {string}
 */
export function personKey({ phone, email, source, id }) {
  let normalizedPhone = '';
  try {
    normalizedPhone = normalizeAccountPhone(phone);
  } catch {
    normalizedPhone = '';
  }
  const digits = normalizedPhone.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 15) return `p:${normalizedPhone}`;
  const mail = String(email ?? '').trim().toLowerCase();
  if (mail) return `e:${mail}`;
  return `row:${source}:${id}`;
}
