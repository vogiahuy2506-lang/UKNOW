/**
 * Tên tệp hiển thị cho người dùng, suy từ khoá lưu trữ — thuần chuỗi, không chạm DB/HTTP.
 *
 * Khoá lưu trữ có tiền tố sinh tự động để khỏi trùng: `uploads/<chủ>/chat/1779359034935_Campaign_4_-_Aff.png`
 * (13 chữ số mili giây), ảnh landing còn thêm 8 ký tự hex ngẫu nhiên: `…/landing/1779359034935_ab12cd34_hero.png`.
 * Người dùng chỉ cần thấy `Campaign_4_-_Aff.png` / `hero.png`.
 */

/** `uploads/7/chat/1779359034935_ab12cd34_hero.png` → `hero.png`. Tên không có tiền tố thì giữ nguyên. */
export function friendlyFileName(keyOrName) {
  const base = String(keyOrName || '').split('/').pop() || '';
  // Chỉ bỏ tiền tố KHI đúng dạng sinh tự động (13 chữ số, rồi tuỳ chọn 8 hex): tên người dùng tự đặt như
  // "20240101_BaoCao.pdf" (8 chữ số) không bị cắt.
  const stripped = base.replace(/^\d{13}_(?:[0-9a-f]{8}_)?/, '');
  return stripped || base;
}

/** Thoát `\`, `%`, `_` để chữ người dùng gõ khớp NGUYÊN VĂN trong `ILIKE ... ESCAPE '\'` (gõ "50%" không khớp mọi thứ). */
export function escapeLikePattern(text) {
  return String(text ?? '').replace(/[\\%_]/g, '\\$&');
}
