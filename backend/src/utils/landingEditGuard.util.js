/**
 * Marker comment dùng cho vị trí nhúng form đăng ký.
 */
export const LANDING_FORM_PLACEHOLDER = '<!-- UKNOW_LP_FORM -->';

/**
 * Ngưỡng an toàn độ dài tối đa của currentHtml khi gửi cho AI edit.
 * Tính toán: maxOutputTokens = 32768, ~3 ký tự/token tiếng Việt, trừ escape JSON và phần mở rộng thêm -> ~60.000 ký tự.
 */
export const MAX_EDIT_HTML_INPUT_CHARS = 60000;

/**
 * Validate HTML kết quả từ chế độ AI Edit Landing Page.
 * Ngăn chặn các lỗi: AI cắt ngang do quá token, AI viết lại từ đầu làm mất layout/nội dung,
 * AI làm mất form đăng ký sẵn có, hoặc AI lạm dụng inline style.
 *
 * @param {{ currentHtml: string, newHtml: string, finishReason?: string }} params
 * @returns {boolean}
 * @throws {Error & { status: number }}
 */
export function validateEditHtmlOutput({ currentHtml, newHtml, finishReason }) {
  const current = String(currentHtml || '').trim();
  const next = String(newHtml || '').trim();

  if (finishReason === 'MAX_TOKENS') {
    const err = new Error('AI sinh HTML quá dài bị cắt ngắn. Hãy chia nhỏ yêu cầu sửa đổi.');
    err.status = 502;
    throw err;
  }

  if (current.toLowerCase().includes('<!doctype') && !next.toLowerCase().includes('<!doctype')) {
    const err = new Error('Thiếu <!DOCTYPE html> trong phản hồi AI.');
    err.status = 502;
    throw err;
  }

  if (current.includes('cdn.tailwindcss.com') && !next.includes('cdn.tailwindcss.com')) {
    const err = new Error('Thiếu Tailwind CDN trong HTML do AI sinh.');
    err.status = 502;
    throw err;
  }

  const oldPlaceholders = new Set(current.match(/\{\{[^}]+\}\}/g) || []);
  const newPlaceholders = next.match(/\{\{[^}]+\}\}/g) || [];
  const hasAddedPlaceholder = newPlaceholders.some((p) => !oldPlaceholders.has(p));
  if (hasAddedPlaceholder) {
    const err = new Error('AI trả về template chưa điền nội dung ({{...}}). Vui lòng thử lại.');
    err.status = 502;
    throw err;
  }

  // Chốt chặn 1: Tránh AI viết lại toàn bộ trang làm teo tóp nội dung
  if (current.length > 0 && next.length < 0.6 * current.length) {
    const err = new Error('AI đã viết lại toàn bộ trang thay vì chỉnh sửa. Vui lòng mô tả cụ thể hơn phần cần sửa.');
    err.status = 502;
    throw err;
  }

  // Chốt chặn 2: Kiểm tra form marker có điều kiện
  if (current.includes(LANDING_FORM_PLACEHOLDER) && !next.includes(LANDING_FORM_PLACEHOLDER)) {
    const err = new Error('AI đã làm mất vị trí form đăng ký. Vui lòng thử lại.');
    err.status = 502;
    throw err;
  }

  if (current.includes('/embed/lead-form') && !next.includes('/embed/lead-form')) {
    const err = new Error('AI đã làm mất khối form đăng ký nhúng. Vui lòng thử lại.');
    err.status = 502;
    throw err;
  }

  // Chốt chặn 3: Kiểm tra inline-style tương đối so với bản cũ
  const oldStyleCount = (current.match(/\bstyle\s*=/gi) || []).length;
  const newStyleCount = (next.match(/\bstyle\s*=/gi) || []).length;
  if (newStyleCount > oldStyleCount + 2) {
    const err = new Error('AI sinh thêm quá nhiều inline style thay vì dùng class Tailwind. Vui lòng thử lại.');
    err.status = 502;
    throw err;
  }

  return true;
}
