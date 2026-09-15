/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b mục 2 — tự tính màu chữ đọc được trên nền
 * màu chủ đạo tuỳ chọn, theo WCAG (Web Content Accessibility Guidelines) contrast ratio, chọn
 * giữa `#FFFFFF` và `#111827` (gray-900) — tỉ lệ nào cao hơn thì dùng màu đó. Số đo tham khảo
 * (review 15/09, đo bằng node): `#FFFF00` → tối (16.52 so 1.07); `#1D4ED8` → trắng (6.70 so
 * 2.65); `#16A34A` → tối (5.38 so 3.30).
 */

const DARK_TEXT = '#111827';
const LIGHT_TEXT = '#FFFFFF';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function srgbChannelToLinear(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/**
 * Tỉ lệ tương phản WCAG giữa hai màu hex — công thức chuẩn `(sáng hơn + 0.05) / (tối hơn + 0.05)`.
 *
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function getContrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Màu chữ đọc được (trắng hoặc tối) trên nền `hex` — CHỈ gọi khi theme thực sự có màu chủ đạo
 * riêng (nghiệm thu: áp dụng "chỉ khi theme có primaryColor"; form mặc định vẫn giữ chữ trắng
 * trên cam dù `#DF5C0E` tự nó tính ra chữ tối — 4.79 so 3.70 — nếu lỡ chạy hàm này vô điều kiện).
 * Hex không hợp lệ trả về `LIGHT_TEXT` (an toàn, không throw).
 *
 * @param {string} hex Mã màu `#RRGGBB`
 * @returns {'#FFFFFF'|'#111827'}
 */
export function getReadableTextColor(hex) {
  if (!HEX_RE.test(String(hex || ''))) return LIGHT_TEXT;
  const contrastWithDark = getContrastRatio(hex, DARK_TEXT);
  const contrastWithLight = getContrastRatio(hex, LIGHT_TEXT);
  return contrastWithDark > contrastWithLight ? DARK_TEXT : LIGHT_TEXT;
}
