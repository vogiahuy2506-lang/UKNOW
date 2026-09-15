import { useEffect } from 'react';
import { ALLOWED_FORM_FONTS, buildGoogleFontUrl } from '../constants/formTheme';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b mục 3 — chèn ĐÚNG MỘT thẻ `<link>` Google
 * Fonts cho font biểu mẫu đang chọn, với `id` cố định theo font (deterministic) để gọi lại cùng
 * font không chèn trùng. Font lạ (không thuộc `ALLOWED_FORM_FONTS`) không làm gì — an toàn khi
 * dữ liệu form cũ/hỏng mang `fontFamily` không hợp lệ.
 *
 * KHÔNG dựa vào `index.html` (chỉ nạp sẵn Inter/Be Vietnam Pro/Playfair Display, và Playfair ở
 * đó CHỈ có độ đậm 700) — hook luôn tự nạp đủ 400/500/600/700 cho font được chọn, kể cả 3 font
 * index.html đã có, để chắc chắn có đủ độ đậm dùng trong biểu mẫu (nút/label đậm hơn văn bản).
 *
 * Không gỡ `<link>` khi đổi font/unmount: các form khác trên cùng trang (nhúng nhiều iframe,
 * hoặc chuyển form trong trình soạn) có thể vẫn cần font đã nạp; để lại vô hại (giống cách
 * `index.html` tự nạp cố định).
 *
 * @param {string|null|undefined} fontFamily
 */
export function useFormFont(fontFamily) {
  useEffect(() => {
    if (!ALLOWED_FORM_FONTS.includes(fontFamily)) return;
    const url = buildGoogleFontUrl(fontFamily);
    if (!url) return;

    const linkId = `form-google-font-${fontFamily.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (document.getElementById(linkId)) return;

    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }, [fontFamily]);
}

export default useFormFont;
