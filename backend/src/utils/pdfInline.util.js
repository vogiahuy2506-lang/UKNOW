import path from 'path';

/**
 * Hằng số dùng chung cho việc gửi PDF dạng ảnh (scan) thẳng tới Gemini bằng inlineData.
 *
 * Tách khỏi fileParser.util.js có chủ đích: nhiều spec mock module đó chỉ với
 * `extractTextFromBuffer`, nên import named thêm hằng số từ đó làm ESM ném SyntaxError
 * ở các suite không liên quan. Module này không ai mock.
 */
export const PDF_INLINE_MAX_BYTES = 10 * 1024 * 1024; // mỗi tệp
export const PDF_INLINE_BUDGET_BYTES = 15 * 1024 * 1024; // mỗi request gửi Gemini (trần inline 20 MB, chừa chỗ cho chữ + ảnh)

export function isPdfFile(originalName, contentType) {
  const ext = path.extname(originalName || '').toLowerCase();
  const mime = String(contentType || '').toLowerCase();
  return ext === '.pdf' || mime === 'application/pdf';
}

/** Dung lượng tệp theo MB, một chữ số lẻ, để câu báo không mâu thuẫn với trần ("10.4 MB vượt 10 MB"). */
export function formatMb(bytes) {
  return (Number(bytes) / (1024 * 1024)).toFixed(1);
}
