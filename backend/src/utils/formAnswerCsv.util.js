import { isDisplayFieldType, RATING_MAX } from './formFieldTypes.util.js';

/**
 * Chữ của một câu trả lời biểu mẫu khi XUẤT CSV + dựng danh sách cột câu trả lời theo NHÃN trường
 * (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c). Hàm thuần, không DB.
 *
 * `formatAnswerForCsv` là bản BACKEND của `formatAnswerForDisplay` ở `frontend/src/features/forms/utils/formAnswerDisplay.util.js`
 * (màn bài nộp / modal chi tiết khách): cùng quy tắc rating / yes_no / checkbox / tệp, chỉ khác rating KHÔNG kèm "★" (file CSV là chữ thuần).
 * `formAnswerCsv.contract.spec.js` đẩy cùng một bảng ca qua cả hai bản — lệch một bên là đỏ.
 *
 * Mỗi câu trả lời lưu dạng ảnh chụp `{ label, type, value }` (formSubmission.util.js). Trường `file` (PR-4b) có thêm `files` / `fileStatus`
 * nhưng `value` là mảng TÊN tệp — CSV chỉ lấy `value`, không bao giờ ghi khoá kho hay URL.
 */

const YES_NO_LABELS = Object.freeze({
  vi: { yes: 'Có', no: 'Không' },
  en: { yes: 'Yes', no: 'No' },
});

/** @param {unknown} lang @returns {'vi'|'en'} */
export function resolveCsvLang(lang) {
  return String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'vi';
}

/**
 * @param {string|undefined} type loại trường lúc nộp (từ ảnh chụp)
 * @param {unknown} value giá trị thô
 * @param {string} [lang] 'vi' | 'en'
 * @returns {string}
 */
export function formatAnswerForCsv(type, value, lang = 'vi') {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '')).filter(Boolean).join(', ');
  if (value === null || value === undefined) return '';
  if (type === 'file') return '';
  if (type === 'rating') {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= RATING_MAX) return `${n}/${RATING_MAX}`;
  }
  if (type === 'yes_no') {
    const labels = YES_NO_LABELS[resolveCsvLang(lang)];
    if (value === 'yes') return labels.yes;
    if (value === 'no') return labels.no;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Giá trị ô của một khoá câu trả lời trong `answers` (ảnh chụp). Khối hiển thị (heading / paragraph / page_break) và khoá thiếu → ''.
 *
 * @param {unknown} answers `form_submissions.answers`
 * @param {string} key
 * @param {string} [lang]
 * @returns {string}
 */
export function answerCellText(answers, key, lang = 'vi') {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return '';
  const item = answers[key];
  if (item === null || item === undefined) return '';
  if (typeof item !== 'object' || Array.isArray(item)) return formatAnswerForCsv(undefined, item, lang);
  if (isDisplayFieldType(item.type)) return '';
  return formatAnswerForCsv(item.type, item.value, lang);
}

/**
 * Dựng cột câu trả lời cho một lần xuất.
 *
 * Cột định danh theo (biểu mẫu, khoá trường) — nhãn chỉ là TIÊU ĐỀ:
 *  - trường còn trong định nghĩa biểu mẫu → nhãn HIỆN TẠI, đúng thứ tự trường; khối hiển thị bị bỏ;
 *  - khoá có trong bài nộp cũ nhưng trường đã bị xoá → vẫn có cột (không mất dữ liệu), nhãn lấy từ ảnh chụp, xếp sau các trường còn lại;
 *  - nhãn TRÙNG giữa các biểu mẫu khác nhau → tiêu đề thành "Nhãn (Tên biểu mẫu)"; trùng trong cùng một biểu mẫu (hoặc cùng tên biểu mẫu) →
 *    thêm số thứ tự "(2)", "(3)";
 *  - tiêu đề trùng một cột cố định (vd trường tên "Email") → thêm hậu tố `answerSuffix` để hai cột không mang cùng tên.
 *
 * @param {{
 *   forms: Array<{ id: number|string, title?: string, fields?: Array<{ key?: string, label?: string, type?: string }> }>,
 *   snapshotKeys?: Array<{ formId: number|string, key: string, label?: string|null, type?: string|null }>,
 *   fixedHeaders?: string[],
 *   answerSuffix?: string,
 * }} input `forms` đã sắp theo thứ tự muốn xuất; `snapshotKeys` là khoá thực sự có trong các bài nộp được xuất
 * @returns {Array<{ formId: string, key: string, header: string }>}
 */
export function buildAnswerColumns({ forms = [], snapshotKeys = [], fixedHeaders = [], answerSuffix = '(answer)' } = {}) {
  const columns = [];
  const seen = new Set();
  const formTitleById = new Map();

  for (const form of forms) {
    const formId = String(form.id);
    formTitleById.set(formId, String(form.title || '').trim() || `#${formId}`);
    for (const field of Array.isArray(form.fields) ? form.fields : []) {
      const key = field?.key;
      if (!key || isDisplayFieldType(field.type)) continue;
      const id = `${formId}\u0000${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      columns.push({ formId, key, label: String(field.label || '').trim() || key });
    }
    for (const snap of snapshotKeys) {
      if (String(snap.formId) !== formId || !snap.key) continue;
      const id = `${formId}\u0000${snap.key}`;
      if (seen.has(id) || isDisplayFieldType(snap.type)) continue;
      seen.add(id);
      columns.push({ formId, key: snap.key, label: String(snap.label || '').trim() || snap.key });
    }
  }

  const norm = (text) => text.trim().toLowerCase();
  const labelGroups = new Map();
  for (const column of columns) {
    const group = labelGroups.get(norm(column.label)) || [];
    group.push(column);
    labelGroups.set(norm(column.label), group);
  }
  for (const group of labelGroups.values()) {
    const multiForm = new Set(group.map((column) => column.formId)).size > 1;
    for (const column of group) {
      column.header = multiForm ? `${column.label} (${formTitleById.get(column.formId)})` : column.label;
    }
  }

  // Hết đụng nhãn giữa các biểu mẫu mà vẫn trùng (cùng biểu mẫu hai trường cùng nhãn / hai biểu mẫu cùng tên) → số thứ tự.
  const fixed = new Set(fixedHeaders.map((header) => norm(String(header))));
  const used = new Set();
  for (const column of columns) {
    const base = fixed.has(norm(column.header)) ? `${column.header} ${answerSuffix}` : column.header;
    let candidate = base;
    for (let n = 2; used.has(norm(candidate)) || fixed.has(norm(candidate)); n += 1) candidate = `${base} (${n})`;
    used.add(norm(candidate));
    column.header = candidate;
  }
  return columns.map(({ formId, key, header }) => ({ formId, key, header }));
}
