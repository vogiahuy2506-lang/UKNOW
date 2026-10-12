/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b mục 2 — tự tính màu chữ đọc được trên nền
 * màu chủ đạo tuỳ chọn, theo WCAG (Web Content Accessibility Guidelines) contrast ratio, chọn
 * giữa `#FFFFFF` và `#111827` (gray-900) — tỉ lệ nào cao hơn thì dùng màu đó. Số đo tham khảo
 * (review 15/09, đo bằng node): `#FFFF00` → tối (16.52 so 1.07); `#1D4ED8` → trắng (6.70 so
 * 2.65); `#16A34A` → tối (5.38 so 3.30).
 */

import { DEFAULT_FORM_BACKGROUND_OVERLAY, MAX_FORM_BACKGROUND_OVERLAY } from '../constants/formTheme';

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

// ─── PR-8b (12/10/2026) — tuỳ chỉnh giao diện thêm ─────────────────────────────────────────────────
// Biểu mẫu LUÔN có thẻ nền trắng (bề mặt luôn sáng) nên "nền" của chữ là #FFFFFF, KHÔNG phải `backgroundColor` của theme
// (màu đó chỉ tô vùng NGOÀI thẻ, sau thẻ).
const CARD_SURFACE = '#FFFFFF';
const FILLED_INPUT_SURFACE = '#F3F4F6'; // = bg-gray-100 của ô nhập kiểu "Nền xám nhạt" (FormRenderer)
const DEFAULT_PRIMARY = '#DF5C0E';
/** Ngưỡng WCAG AA cho chữ thường. */
export const MIN_TEXT_CONTRAST = 4.5;

/** `#RRGGBB` hợp lệ? (dùng trước khi đưa màu từ API/trạng thái vào style hoặc phép đo tương phản.) */
export function isHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

/**
 * Cảnh báo tương phản thấp của giao diện đang soạn — CHỈ cảnh báo, không chặn lưu. Trả mảng `{ id, ratio }`:
 * - `text`: màu chữ tuỳ chọn so với thẻ trắng.
 * - `button`: chữ nút so với màu nút. Nút đặc: chỉ xét khi có màu chủ đạo riêng (giao diện mặc định giữ nguyên, không cảnh báo
 *   cam-trên-trắng đã ship từ trước). Nút viền: chữ nút CHÍNH LÀ màu chủ đạo (mặc định hoặc riêng) trên nền thẻ trắng.
 *
 * @param {object} theme state theme của trình soạn (chuỗi rỗng = chưa đặt)
 * @returns {Array<{ id: 'text'|'button', ratio: number }>}
 */
export function getThemeContrastWarnings(theme) {
  const warnings = [];
  const th = theme || {};

  if (isHexColor(th.textColor)) {
    // Chữ nằm trên thẻ trắng; chữ khách gõ trong ô nhập "nền xám nhạt" nằm trên nền xám đó (kém tương phản hơn) -> lấy tỉ lệ thấp nhất.
    const surfaces = th.inputStyle === 'filled' ? [CARD_SURFACE, FILLED_INPUT_SURFACE] : [CARD_SURFACE];
    const ratio = Math.min(...surfaces.map((surface) => getContrastRatio(th.textColor, surface)));
    if (ratio < MIN_TEXT_CONTRAST) warnings.push({ id: 'text', ratio });
  }

  const customPrimary = isHexColor(th.primaryColor) ? th.primaryColor : null;
  if (th.buttonStyle === 'outline') {
    const ratio = getContrastRatio(customPrimary || DEFAULT_PRIMARY, CARD_SURFACE);
    if (ratio < MIN_TEXT_CONTRAST) warnings.push({ id: 'button', ratio });
  } else if (customPrimary) {
    const ratio = getContrastRatio(getReadableTextColor(customPrimary), customPrimary);
    if (ratio < MIN_TEXT_CONTRAST) warnings.push({ id: 'button', ratio });
  }

  return warnings;
}

/** Độ tối (%) phủ lên ảnh nền; thiếu/sai -> mặc định, kẹp trong 0..MAX. */
export function resolveBackgroundOverlay(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_FORM_BACKGROUND_OVERLAY;
  return Math.min(MAX_FORM_BACKGROUND_OVERLAY, Math.max(0, Math.round(n)));
}

// Chỉ nhận URL http(s) và loại ký tự có thể thoát khỏi url("...") — ảnh luôn do backend dựng từ khoá kho nên bình thường
// không bao giờ cần, đây là lớp phòng thủ cho dữ liệu lạ.
function toSafeCssImageUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (/["'()\\\s<>]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Style cho vùng nền NGOÀI thẻ biểu mẫu (trang công khai, trang trạng thái, khung xem trước): màu nền + ảnh nền phủ lớp tối.
 * Nhúng vào landing (`embedMode`) thì không tô gì — không đè nền trang chủ của landing. Không có màu lẫn ảnh -> `undefined`.
 *
 * @param {{ backgroundColor?: string, backgroundImageUrl?: string, backgroundImageOverlay?: number }} theme
 * @param {{ embedMode?: boolean }} [options]
 * @returns {object|undefined}
 */
export function buildFormPageBackgroundStyle(theme, { embedMode = false } = {}) {
  if (embedMode || !theme) return undefined;
  const style = {};
  if (theme.backgroundColor) style.backgroundColor = theme.backgroundColor;
  const imageUrl = toSafeCssImageUrl(theme.backgroundImageUrl);
  if (imageUrl) {
    const overlay = resolveBackgroundOverlay(theme.backgroundImageOverlay) / 100;
    const layers = overlay > 0 ? [`linear-gradient(rgba(0, 0, 0, ${overlay}), rgba(0, 0, 0, ${overlay}))`] : [];
    layers.push(`url("${imageUrl}")`);
    style.backgroundImage = layers.join(', ');
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
    style.backgroundRepeat = 'no-repeat';
  }
  return Object.keys(style).length > 0 ? style : undefined;
}
