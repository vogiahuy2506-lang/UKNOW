/**
 * Dựng nội dung chuyển khoản gửi sang PayOS.
 *
 * Nội dung này là thứ DUY NHẤT kế toán nhìn thấy trong tin nhắn ngân hàng để nhận ra giao dịch
 * thuộc về Founder AI (câu hỏi từ phía vận hành, 11/09/2026 — bên AI Hành Chính đã có
 * "Nang cap BASIC thang" trong tin nhắn của họ).
 *
 * Hai ràng buộc của PayOS/ngân hàng:
 *
 * 1. **Trần 25 ký tự.** Cắt thô bằng `substring(25)` sẽ xén giữa chữ:
 *    `FounderAI Gói Doanh nghiệp lớn` → `FounderAI Gói Doanh nghiệ`. Hàm này cắt theo RANH GIỚI
 *    TỪ nên ra `FounderAI Goi Doanh` — ngắn hơn nhưng đọc được.
 *
 * 2. **Dấu tiếng Việt.** Ngân hàng gần như luôn bỏ dấu, và bỏ không nhất quán giữa các nhà băng.
 *    Bỏ dấu sẵn ở đây để nội dung hiện ra giống hệt nhau ở mọi ngân hàng.
 *
 * ⚠️ `đ`/`Đ` KHÔNG tách được bằng `normalize('NFD')` — chúng là ký tự Latin riêng (U+0111/U+0110),
 * không phải `d` + dấu tổ hợp. Phải thay tay, nếu không `Đồng` thành `Đong` (còn nguyên Đ).
 *
 * @module utils/payosDescription.util
 */

/** Trần ký tự của trường description phía PayOS. */
export const PAYOS_DESCRIPTION_MAX_LENGTH = 25;

/**
 * Bỏ dấu tiếng Việt, GIỮ NGUYÊN hoa/thường (khác `normalizeTextForMatch` trong helpers.js —
 * hàm đó hạ hết về chữ thường vì dùng để so khớp, không dùng để hiển thị).
 *
 * @param {string} value
 * @returns {string}
 */
export function stripVietnameseDiacritics(value) {
  return String(value ?? '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Cắt chuỗi về tối đa `maxLength` ký tự, KHÔNG xén giữa một từ.
 *
 * Nếu ngay cả từ đầu tiên đã dài hơn `maxLength` thì đành cắt thô — thà cụt còn hơn trả chuỗi
 * rỗng, vì kế toán vẫn cần một thứ gì đó để đối chiếu.
 *
 * @param {string} value
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateOnWordBoundary(value, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength + 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace <= 0) return text.slice(0, maxLength).trim();
  return cut.slice(0, lastSpace).trim();
}

/**
 * Nội dung chuyển khoản cuối cùng: `FounderAI <tên gói>`, bỏ dấu, cắt theo từ, tối đa 25 ký tự.
 *
 * @param {string|null|undefined} planName tên gói, ví dụ "Gói Tùy chọn"
 * @param {object} [options]
 * @param {string} [options.prefix='FounderAI'] tiền tố nhận diện thương hiệu
 * @param {number} [options.maxLength=PAYOS_DESCRIPTION_MAX_LENGTH]
 * @returns {string}
 */
export function buildPayosDescription(planName, options = {}) {
  const {
    prefix = 'FounderAI',
    maxLength = PAYOS_DESCRIPTION_MAX_LENGTH,
  } = options;

  const cleanPrefix = stripVietnameseDiacritics(prefix).replace(/\s+/g, ' ').trim();
  const cleanName = stripVietnameseDiacritics(planName).replace(/\s+/g, ' ').trim();

  // Tên gói rỗng thì vẫn phải trả về tiền tố — nội dung "FounderAI" trống nghĩa vẫn tốt hơn
  // một chuỗi rỗng mà ngân hàng sẽ tự điền bằng mã giao dịch vô nghĩa.
  if (!cleanName) return truncateOnWordBoundary(cleanPrefix, maxLength);

  return truncateOnWordBoundary(`${cleanPrefix} ${cleanName}`, maxLength);
}

export default { buildPayosDescription, stripVietnameseDiacritics, truncateOnWordBoundary, PAYOS_DESCRIPTION_MAX_LENGTH };
