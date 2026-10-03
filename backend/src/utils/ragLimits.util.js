/**
 * Trần khi đưa đoạn tài liệu kiến thức (RAG) vào prompt chatbot, và hằng số tìm kiếm dùng chung.
 *
 * Vì sao: bản cũ in NGUYÊN `chunk_text` vào prompt, không cắt. Production 03/10/2026 có đoạn 219.902 ký tự (cả tài liệu
 * một đoạn) nên chatbot của một khách trả phí tốn TB 94k token vào mỗi câu (~3.400đ/câu). Chia lại đoạn (kbChunker) chỉ chữa
 * tài liệu nạp từ nay về sau; các đoạn CŨ chưa nạp lại vẫn nằm trong DB — trần này chặn chi phí ngay cả trước khi nạp lại.
 *
 *  - mỗi đoạn ≤ MAX_RAG_CHUNK_CHARS (1.500) ký tự;
 *  - tổng các đoạn tài liệu trong một prompt ≤ MAX_RAG_TOTAL_CHARS (6.000) ký tự — đoạn xếp hạng thấp bị bỏ khi hết ngân sách.
 */

export const MAX_RAG_CHUNK_CHARS = 1500;
export const MAX_RAG_TOTAL_CHARS = 6000;
/** Ngân sách còn lại dưới ngưỡng này thì bỏ luôn các đoạn kế (một mẩu vài chục ký tự chỉ gây nhiễu). */
const MIN_USEFUL_REMAINING_CHARS = 200;

/** Ngưỡng cosine tối thiểu khi tìm trong tài liệu của chính chatbot (đường kênh và đường widget/Studio dùng CHUNG một ngưỡng). */
export const CUSTOM_CHATBOT_MIN_SIMILARITY = 0.3;
export const MAX_KB_CHUNKS = 5;

/** Cắt `text` còn ≤ maxChars (gồm cả dấu "…" cuối), ưu tiên cắt ở khoảng trắng, không cắt giữa ký tự. */
export function truncateForPrompt(text, maxChars = MAX_RAG_CHUNK_CHARS) {
  const value = String(text ?? '');
  if (value.length <= maxChars) return value;
  let cut = Math.max(1, maxChars - 1);
  const lastSpace = value.lastIndexOf(' ', cut);
  if (lastSpace >= cut * 0.85) cut = lastSpace;
  // Không đứng giữa cặp surrogate hay trước dấu kết hợp.
  while (cut > 1 && (/[\udc00-\udfff]/.test(value[cut]) || /\p{M}/u.test(value[cut]))) cut -= 1;
  return `${value.slice(0, cut).trimEnd()}…`;
}

function applyBudget(items, getText, setText, { maxChunkChars, maxTotalChars }) {
  const result = [];
  let used = 0;
  for (const item of items || []) {
    const remaining = maxTotalChars - used;
    if (remaining < MIN_USEFUL_REMAINING_CHARS) break;
    const capped = truncateForPrompt(getText(item), Math.min(maxChunkChars, remaining));
    if (!capped.trim()) continue;
    used += capped.length;
    result.push(setText(item, capped));
  }
  return result;
}

/** @param {string[]} texts đoạn đã xếp theo độ liên quan giảm dần */
export function capChunkTexts(texts, {
  maxChunkChars = MAX_RAG_CHUNK_CHARS,
  maxTotalChars = MAX_RAG_TOTAL_CHARS,
} = {}) {
  return applyBudget(texts, (t) => t, (_, capped) => capped, { maxChunkChars, maxTotalChars });
}

/** @param {Array<{chunk_text: string}>} rows hàng đã xếp theo độ liên quan giảm dần (các trường khác giữ nguyên) */
export function capChunkRows(rows, {
  maxChunkChars = MAX_RAG_CHUNK_CHARS,
  maxTotalChars = MAX_RAG_TOTAL_CHARS,
} = {}) {
  return applyBudget(
    rows,
    (row) => row.chunk_text,
    (row, capped) => ({ ...row, chunk_text: capped }),
    { maxChunkChars, maxTotalChars },
  );
}
