import { foldDiacritics } from '../../campaigns/utils/columnHeaderMatch';
import { mapVariableToSemanticTarget } from '../../campaigns/utils/templateVariableAutoMap';

/**
 * Thông tin khách mà bộ chạy chiến dịch TỰ ghép được với khách đã lưu và cột Google Sheet / biểu mẫu
 * (`mapVariableToSemanticTarget`: ten_khach -> name, email_khach -> email, so_dien_thoai -> phone).
 * Khoá khác (ten_khoa_hoc, link_khoa_hoc, donvi, chucvu...) không có nguồn tự ghép nên KHÔNG gợi ý nữa;
 * mẫu cũ đang dùng chúng vẫn chạy và hiện ở mục "Đang dùng trong mẫu".
 */
export const CUSTOMER_FIELDS = [
  { key: 'ten_khach', source: 'name', labelKey: 'emailTemplateEditor.suggestedCustomerName' },
  { key: 'email_khach', source: 'email', labelKey: 'emailTemplateEditor.suggestedCustomerEmail' },
  { key: 'so_dien_thoai', source: 'phone', labelKey: 'emailTemplateEditor.suggestedPhone' },
];

// Cùng cách bắt biến với backend (`TEMPLATE_VARIABLE_REGEX`): không giới hạn ký tự, để {{Họ Tên}} cũng được thấy.
const VARIABLE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Trích khoá biến (duy nhất, giữ thứ tự xuất hiện) từ một hay nhiều đoạn chữ: tiêu đề + nội dung. */
export function extractVariableKeys(...texts) {
  const seen = new Set();
  const keys = [];
  texts.forEach((text) => {
    if (!text || typeof text !== 'string' || !text.includes('{{')) return;
    const re = new RegExp(VARIABLE_REGEX.source, 'g');
    let match;
    while ((match = re.exec(text)) !== null) {
      const key = match[1].trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  });
  return keys;
}

/** Chuẩn hoá tên cột người dùng gõ thành khoá biến: bỏ dấu, chữ thường, ký tự lạ thành "_". */
export function normalizeCustomKey(input) {
  return foldDiacritics(input)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Nguồn giá trị của một khoá: 'name' | 'email' | 'phone' (tự lấy từ khách) hay 'column' (đọc từ cột cùng tên). */
export function getVariableSource(key) {
  const field = CUSTOMER_FIELDS.find((f) => f.key === key);
  if (field) return field.source;
  return mapVariableToSemanticTarget(key) || 'column';
}

/**
 * Danh sách biến tự phát hiện, hình dạng cũ `{ name, key }` để các chỗ đọc `template.variables` vẫn chạy.
 * Tên dễ hiểu lấy từ: thông tin có sẵn -> tên đã khai báo trước đó (mẫu cũ) -> chính khoá.
 */
export function buildDetectedVariables(keys, { declared = [], translate } = {}) {
  const declaredNames = new Map();
  (Array.isArray(declared) ? declared : []).forEach((item) => {
    const k = String(item?.key ?? '').trim();
    if (k && item?.name) declaredNames.set(k, String(item.name));
  });
  return keys.map((key) => {
    const field = CUSTOMER_FIELDS.find((f) => f.key === key);
    const name = (field && typeof translate === 'function' ? translate(field.labelKey) : null)
      || declaredNames.get(key)
      || key;
    return { name, key };
  });
}
