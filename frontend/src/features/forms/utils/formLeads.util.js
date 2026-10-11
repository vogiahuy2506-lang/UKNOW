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

function formatAnswerValue(value) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '')).filter(Boolean).join(', ');
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Câu trả lời của một bài nộp theo NHÃN trường, đúng thứ tự trường trong biểu mẫu.
 *
 * Backend lưu mỗi câu trả lời dạng ảnh chụp `{ label, type, value }` (nhãn lúc khách điền — đổi nhãn
 * sau này không làm bài cũ đổi nghĩa), nên ưu tiên nhãn trong ảnh chụp; thiếu thì lấy nhãn hiện tại
 * của trường cùng `key` trong biểu mẫu; vẫn thiếu thì hiện chính `key`. Câu trả lời không còn trường
 * tương ứng (trường đã bị xoá khỏi biểu mẫu) xếp cuối, không bị bỏ mất.
 *
 * @param {Record<string, unknown>|null|undefined} answers
 * @param {Array<{ key?: string, label?: string }>|null|undefined} formFields
 * @returns {Array<{ key: string, label: string, value: string }>}
 */
export function buildAnswerEntries(answers, formFields) {
  const fields = Array.isArray(formFields) ? formFields : [];
  const order = new Map();
  const labelByKey = new Map();
  fields.forEach((field, index) => {
    if (!field?.key) return;
    order.set(field.key, index);
    if (field.label) labelByKey.set(field.key, field.label);
  });

  const source = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  return Object.entries(source)
    .map(([key, item]) => {
      const isSnapshot = item !== null && typeof item === 'object' && !Array.isArray(item) && 'value' in item;
      const snapshotLabel = isSnapshot && typeof item.label === 'string' ? item.label.trim() : '';
      return {
        key,
        label: snapshotLabel || labelByKey.get(key) || key,
        value: formatAnswerValue(isSnapshot ? item.value : item),
      };
    })
    .sort((a, b) => {
      const orderA = order.has(a.key) ? order.get(a.key) : Number.MAX_SAFE_INTEGER;
      const orderB = order.has(b.key) ? order.get(b.key) : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.key.localeCompare(b.key);
    });
}
