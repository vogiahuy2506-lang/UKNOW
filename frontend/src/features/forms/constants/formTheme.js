/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b mục 1 — hằng số giao diện biểu mẫu dùng
 * chung (trình soạn + FormRenderer + trang công khai/trạng thái).
 *
 * `ALLOWED_FORM_FONTS` phải khớp NGUYÊN VĂN (cùng thứ tự không bắt buộc, nhưng cùng TẬP HỢP)
 * với `backend/src/utils/formDefinition.util.js` — có test backend đọc file NÀY bằng regex để
 * so khớp (`backend/src/utils/__tests__/formTheme.spec.js`, mẫu `vietQrBanks.spec.js:8`). Đổi
 * danh sách ở đây mà không đổi backend (hoặc ngược lại) thì test đó đỏ ngay.
 */
export const ALLOWED_FORM_FONTS = Object.freeze([
  'Be Vietnam Pro',
  'Inter',
  'Roboto',
  'Nunito',
  'Montserrat',
  'Lora',
  'Playfair Display',
  'Quicksand',
]);

/**
 * Chồng fallback theo font — 2 font có chân (serif) rõ rệt dùng fallback serif, 6 font còn lại
 * (không chân) dùng fallback sans-serif, để khi Google Fonts tải chậm/lỗi trình duyệt vẫn hiện
 * chữ cùng "họ" thay vì nhảy sang mặc định hệ thống lệch hẳn phong cách.
 */
const SERIF_FONTS = new Set(['Lora', 'Playfair Display']);

/**
 * Dựng chuỗi `font-family` CSS đầy đủ (tên font + fallback) cho MỘT font trong danh sách cho
 * phép. Font lạ (không trong `ALLOWED_FORM_FONTS`) trả về `undefined` — caller không áp style,
 * giữ font mặc định của trang (an toàn khi dữ liệu API cũ/hỏng có fontFamily không hợp lệ).
 *
 * @param {string|null|undefined} fontFamily
 * @returns {string|undefined}
 */
export function buildFormFontFamily(fontFamily) {
  if (!ALLOWED_FORM_FONTS.includes(fontFamily)) return undefined;
  const fallback = SERIF_FONTS.has(fontFamily) ? 'serif' : 'sans-serif';
  return `'${fontFamily}', ${fallback}`;
}

/**
 * Dựng URL Google Fonts CSS2 cho MỘT font — nạp đủ 4 độ đậm 400/500/600/700 (không dựa vào
 * `index.html`, nơi Playfair Display chỉ có sẵn đúng 700). Font lạ trả `null` — không chèn `<link>`.
 * URL dựng TỪ BẢNG HẰNG SỐ (không nối chuỗi từ tên font do API/người dùng cung cấp) — Bẫy PR-4b
 * mục 3: fontFamily luôn đi qua `ALLOWED_FORM_FONTS.includes()` trước khi lọt vào URL.
 *
 * @param {string|null|undefined} fontFamily
 * @returns {string|null}
 */
export function buildGoogleFontUrl(fontFamily) {
  if (!ALLOWED_FORM_FONTS.includes(fontFamily)) return null;
  const encodedName = fontFamily.split(' ').join('+');
  return `https://fonts.googleapis.com/css2?family=${encodedName}:wght@400;500;600;700&display=swap`;
}

export const ALLOWED_FORM_LAYOUTS = Object.freeze(['card', 'wide']);

/**
 * Chiều cao banner cụ thể theo enum sm/md/lg (PR-4b báo cáo: chọn theo thang chiều cao Tailwind
 * chuẩn — 6rem/10rem/16rem — banner luôn full-width nên chỉ cần chốt chiều CAO, không giới hạn
 * max-width (nghiệm thu "banner 1600×400 không bị thu về 512px").
 */
export const FORM_BANNER_HEIGHTS = Object.freeze({
  sm: '6rem',
  md: '10rem',
  lg: '16rem',
});
export const ALLOWED_FORM_BANNER_HEIGHTS = Object.freeze(Object.keys(FORM_BANNER_HEIGHTS));
export const DEFAULT_FORM_BANNER_HEIGHT = 'md';

/**
 * PR-8b (12/10/2026) — tuỳ chỉnh giao diện thêm. Bốn danh sách enum + trần độ tối ảnh nền PHẢI khớp
 * `backend/src/utils/formDefinition.util.js` (test `formTheme.spec.js` đọc file NÀY bằng regex).
 * Khoá vắng mặt trong theme = giao diện mặc định hiện tại; `solid` / `outline` (ô nhập) / `md` chính là hình dạng mặc định.
 */
export const ALLOWED_FORM_BUTTON_STYLES = Object.freeze(['solid', 'outline']);
export const ALLOWED_FORM_BUTTON_RADII = Object.freeze(['none', 'sm', 'md', 'lg', 'full']);
export const ALLOWED_FORM_CARD_RADII = Object.freeze(['none', 'sm', 'md', 'lg']);
export const ALLOWED_FORM_INPUT_STYLES = Object.freeze(['outline', 'filled']);
export const MAX_FORM_BACKGROUND_OVERLAY = 80;
// Độ tối dùng khi có ảnh nền mà chủ chưa chọn (khoá vắng mặt) — đủ để thẻ trắng nổi lên khỏi ảnh sáng.
export const DEFAULT_FORM_BACKGROUND_OVERLAY = 30;

/** Bo góc CSS cho nút gửi / Tiếp / Quay lại. `md` = `rounded-xl` hiện tại (0.75rem). */
export const FORM_BUTTON_RADII = Object.freeze({
  none: '0px',
  sm: '0.375rem',
  md: '0.75rem',
  lg: '1rem',
  full: '9999px',
});

/** Bo góc CSS cho thẻ biểu mẫu. `md` = `rounded-2xl` hiện tại (1rem). */
export const FORM_CARD_RADII = Object.freeze({
  none: '0px',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
});

/**
 * 5 mẫu dựng sẵn — CHỈ màu/font/layout, không chứa ảnh (banner/logo là tài sản riêng của form,
 * chọn preset không đụng tới — mục 6 "chọn preset ... giữ nguyên ảnh"). `id` khớp regex backend
 * `^[a-z0-9_-]{1,32}$`; nhãn hiển thị lấy qua i18n `forms.editorPage.theme.presets.<id>`, không
 * hardcode chữ Việt ở đây.
 */
export const FORM_THEME_PRESETS = Object.freeze([
  { id: 'classic', primaryColor: '#DF5C0E', backgroundColor: '#F9FAFB', fontFamily: 'Inter', layout: 'card' },
  { id: 'elegant', primaryColor: '#1D4ED8', backgroundColor: '#F8FAFC', fontFamily: 'Playfair Display', layout: 'wide' },
  { id: 'fresh', primaryColor: '#16A34A', backgroundColor: '#F0FDF4', fontFamily: 'Nunito', layout: 'card' },
  { id: 'warm', primaryColor: '#D97706', backgroundColor: '#FFFBEB', fontFamily: 'Be Vietnam Pro', layout: 'card' },
  { id: 'bold', primaryColor: '#7C3AED', backgroundColor: '#F5F3FF', fontFamily: 'Montserrat', layout: 'wide' },
]);
