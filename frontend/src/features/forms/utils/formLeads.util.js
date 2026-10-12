import { isDisplayFieldType } from './formFieldTypes.util';
import { formatAnswerForDisplay, isDisplayBlockAnswer } from './formAnswerDisplay.util';

/**
 * Helper thuần cho tab "Từ biểu mẫu" của màn "Khách để lại thông tin" (`GET /api/forms/submissions`).
 */

/**
 * Trạng thái HIỂN THỊ của một bài nộp. "Hết hạn giữ chỗ" không phải trạng thái lưu trong DB (tính lúc
 * đọc): `pending_payment` mà `holdExpiresAt` đã qua thì hiện khác với `pending_payment` còn hạn.
 * Cùng quy tắc với `FormSubmissionsPage` để hai màn không nói hai chuyện khác nhau về một bài nộp.
 *
 * @param {{ status?: string, holdExpiresAt?: string|null }} submission
 * @param {number} [now] mốc thời gian so sánh (ms) — truyền vào để test
 * @returns {'submitted'|'confirmed'|'cancelled'|'pending_payment'|'hold_expired'}
 */
export function getSubmissionDisplayStatus(submission, now = Date.now()) {
  if (
    submission?.status === 'pending_payment' &&
    submission.holdExpiresAt &&
    new Date(submission.holdExpiresAt).getTime() <= now
  ) {
    return 'hold_expired';
  }
  return submission?.status || 'submitted';
}

/**
 * Câu trả lời của một bài nộp theo NHÃN trường, đúng thứ tự trường trong biểu mẫu.
 *
 * Backend lưu mỗi câu trả lời dạng ảnh chụp `{ label, type, value }` (nhãn lúc khách điền — đổi nhãn
 * sau này không làm bài cũ đổi nghĩa), nên ưu tiên nhãn trong ảnh chụp; thiếu thì lấy nhãn hiện tại
 * của trường cùng `key` trong biểu mẫu; vẫn thiếu thì hiện chính `key`. Câu trả lời không còn trường
 * tương ứng (trường đã bị xoá khỏi biểu mẫu) xếp cuối, không bị bỏ mất.
 *
 * PR-4: bỏ mục của khối hiển thị (tiêu đề / đoạn chữ / ngắt trang — theo loại trong ảnh chụp hoặc theo trường hiện
 * tại của biểu mẫu); rating hiện "4/5 ★", yes_no hiện Có / Không (cần `t` để dịch; thiếu `t` thì hiện nguyên "yes"/"no").
 *
 * @param {Record<string, unknown>|null|undefined} answers
 * @param {Array<{ key?: string, label?: string, type?: string }>|null|undefined} formFields
 * @param {(key: string) => string} [t]
 * Trường tệp (PR-4b): mục kèm `files` (tên/cỡ — KHÔNG có khoá kho) và `fileStatus` để modal vẽ nút Tải về; `value` vẫn là tên tệp nối bằng ", ".
 *
 * @returns {Array<{ key: string, label: string, value: string, type?: string, files?: Array<{ name: string, size?: number }>, fileStatus?: string }>}
 */
export function buildAnswerEntries(answers, formFields, t) {
  const fields = Array.isArray(formFields) ? formFields : [];
  const order = new Map();
  const labelByKey = new Map();
  const typeByKey = new Map();
  fields.forEach((field, index) => {
    if (!field?.key) return;
    order.set(field.key, index);
    if (field.label) labelByKey.set(field.key, field.label);
    if (field.type) typeByKey.set(field.key, field.type);
  });

  const source = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  return Object.entries(source)
    .filter(([key, item]) => !isDisplayBlockAnswer(item) && !isDisplayFieldType(typeByKey.get(key)))
    .map(([key, item]) => {
      const isSnapshot = item !== null && typeof item === 'object' && !Array.isArray(item) && 'value' in item;
      const snapshotLabel = isSnapshot && typeof item.label === 'string' ? item.label.trim() : '';
      // Loại để định dạng: ưu tiên loại trong ảnh chụp lúc nộp, thiếu thì lấy loại hiện tại của trường.
      const type = (isSnapshot && typeof item.type === 'string' ? item.type : '') || typeByKey.get(key);
      const entry = {
        key,
        label: snapshotLabel || labelByKey.get(key) || key,
        value: formatAnswerForDisplay(type, isSnapshot ? item.value : item, t),
      };
      if (type === 'file') {
        entry.type = 'file';
        entry.files = isSnapshot && Array.isArray(item.files)
          ? item.files.map((file) => ({ name: String(file?.name ?? ''), size: file?.size }))
          : [];
        entry.fileStatus = isSnapshot && typeof item.fileStatus === 'string' ? item.fileStatus : '';
      }
      return entry;
    })
    .sort((a, b) => {
      const orderA = order.has(a.key) ? order.get(a.key) : Number.MAX_SAFE_INTEGER;
      const orderB = order.has(b.key) ? order.get(b.key) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.key.localeCompare(b.key);
    });
}
