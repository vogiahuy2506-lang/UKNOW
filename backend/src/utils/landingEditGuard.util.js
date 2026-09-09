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
 * Vớt HTML từ phản hồi model khi JSON.parse thất bại (model kèm lời dẫn,
 * bọc code fence, hoặc trả thẳng HTML).
 *
 * Chỉ nhận nội dung code fence khi nó THỰC SỰ mở đầu bằng thẻ HTML: regex
 * ```(?:html)? không khớp ```json nên chữ "json" lọt vào nhóm bắt, và cả
 * chuỗi JSON thô sẽ bị coi là HTML nếu không chặn ở đây. Với trang gốc dạng
 * fragment ngắn, rác đó lọt qua được cả ngưỡng teo tóp 60%.
 *
 * @param {string} text
 * @returns {string} HTML vớt được, chuỗi rỗng nếu không có gì dùng được
 */
/**
 * HTML lấy ra từ BÊN TRONG một chuỗi JSON hỏng vẫn mang ký tự thoát của JSON (`\n`, `\"`,
 * `\/`). Sếp gặp 09/09 13:10: model trả `{"title":..., "html":"<!DOCTYPE html>\n..."}` không
 * parse được, fallback regex bắt đúng đoạn `<!DOCTYPE html ... </html>` nằm trong chuỗi, trang
 * hiện đầy `\n` và `\"`, chốt chặn không bắt vì có DOCTYPE/Tailwind/đủ dài. Giải mã bằng chính
 * JSON.parse (bọc lại thành chuỗi JSON); giải mã không được thì trả '' để chốt 422 "không phải
 * HTML hợp lệ" ở aiLandingPage.service.js xử lý, không phát hành rác.
 *
 * @param {string} html
 * @returns {string}
 */
function unescapeJsonStringHtml(html) {
  const s = String(html || '');
  // Dấu hiệu còn thoát JSON: nhiều `\n` dạng chữ hoặc có `\"` dạng chữ. KHÔNG đòi "không có
  // xuống dòng thật" — ca JSON hỏng phổ biến nhất là model chèn xuống dòng thật vào trong
  // chuỗi, khi đó đoạn HTML có cả hai loại; xuống dòng thật được đổi thành `\n` trước khi parse.
  const escapedNewlines = (s.match(/\\n/g) || []).length;
  const looksEscaped = escapedNewlines >= 3 || /\\"/.test(s);
  if (!looksEscaped) return s;
  try {
    const decoded = JSON.parse(`"${s.replace(/\r?\n/g, '\\n').replace(/(?<!\\)"/g, '\\"')}"`);
    return typeof decoded === 'string' ? decoded : '';
  } catch {
    return '';
  }
}

export function extractHtmlFromModelText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const fullDocMatch = raw.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
  if (fullDocMatch) return unescapeJsonStringHtml(fullDocMatch[0].trim());

  const codeBlockMatch = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const fenced = codeBlockMatch ? codeBlockMatch[1].trim() : '';
  if (fenced.startsWith('<')) return unescapeJsonStringHtml(fenced);

  if (raw.startsWith('<') && raw.endsWith('>')) return unescapeJsonStringHtml(raw);

  return '';
}

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
    // 422 chứ không 502 cho mọi chốt trong file này: Cloudflare thay 502 của origin bằng trang
    // lỗi riêng, message "thử lại" bị nuốt (09/09). Xem ghi chú cùng ý ở aiLandingPage.service.js.
    const err = new Error('AI sinh HTML quá dài bị cắt ngắn. Hãy chia nhỏ yêu cầu sửa đổi.');
    err.status = 422;
    throw err;
  }

  if (current.toLowerCase().includes('<!doctype') && !next.toLowerCase().includes('<!doctype')) {
    const err = new Error('Thiếu <!DOCTYPE html> trong phản hồi AI.');
    err.status = 422;
    throw err;
  }

  if (current.includes('cdn.tailwindcss.com') && !next.includes('cdn.tailwindcss.com')) {
    const err = new Error('Thiếu Tailwind CDN trong HTML do AI sinh.');
    err.status = 422;
    throw err;
  }

  const oldPlaceholders = new Set(current.match(/\{\{[^}]+\}\}/g) || []);
  const newPlaceholders = next.match(/\{\{[^}]+\}\}/g) || [];
  const hasAddedPlaceholder = newPlaceholders.some((p) => !oldPlaceholders.has(p));
  if (hasAddedPlaceholder) {
    const err = new Error('AI trả về template chưa điền nội dung ({{...}}). Vui lòng thử lại.');
    err.status = 422;
    throw err;
  }

  // Chốt chặn 1: Tránh AI viết lại toàn bộ trang làm teo tóp nội dung
  if (current.length > 0 && next.length < 0.6 * current.length) {
    const err = new Error('AI đã viết lại toàn bộ trang thay vì chỉnh sửa. Vui lòng mô tả cụ thể hơn phần cần sửa.');
    err.status = 422;
    throw err;
  }

  // Chốt chặn 2: Kiểm tra form marker có điều kiện
  if (current.includes(LANDING_FORM_PLACEHOLDER) && !next.includes(LANDING_FORM_PLACEHOLDER)) {
    const err = new Error('AI đã làm mất vị trí form đăng ký. Vui lòng thử lại.');
    err.status = 422;
    throw err;
  }

  if (current.includes('/embed/lead-form') && !next.includes('/embed/lead-form')) {
    const err = new Error('AI đã làm mất khối form đăng ký nhúng. Vui lòng thử lại.');
    err.status = 422;
    throw err;
  }

  if (current.includes('data-uknow-lead-form') && !next.includes('data-uknow-lead-form')) {
    const err = new Error('AI đã làm mất form đăng ký nhúng (snippet). Vui lòng thử lại.');
    err.status = 422;
    throw err;
  }

  // Ba chốt trên chỉ canh marker/iframe/snippet cũ — form data-founderai-capture (hợp đồng
  // mới, AI sinh từ 07/09 qua aiLandingPage.service.js quy tắc 6 + chốt :171) chưa có chốt
  // nào bảo vệ ở đường AI-edit: nhờ AI "sửa màu nút" là có thể mất form trong im lặng.
  if (current.includes('data-founderai-capture') && !next.includes('data-founderai-capture')) {
    const err = new Error('AI đã làm mất form đăng ký. Vui lòng thử lại.');
    err.status = 422;
    throw err;
  }

  // Chốt chặn 3: Kiểm tra inline-style tương đối so với bản cũ
  const oldStyleCount = (current.match(/\bstyle\s*=/gi) || []).length;
  const newStyleCount = (next.match(/\bstyle\s*=/gi) || []).length;
  if (newStyleCount > oldStyleCount + 2) {
    const err = new Error('AI sinh thêm quá nhiều inline style thay vì dùng class Tailwind. Vui lòng thử lại.');
    err.status = 422;
    throw err;
  }

  return true;
}
