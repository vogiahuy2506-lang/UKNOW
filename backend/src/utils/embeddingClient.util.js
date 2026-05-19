/**
 * Gemini text-embedding-004 client.
 * Trả về vector 768 chiều để lưu vào pgvector.
 */

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIM = 768;

/**
 * Embed một đoạn text thành vector 768 chiều.
 *
 * @param {string} text
 * @returns {Promise<number[]>} vector 768 chiều
 */
export async function embedText(text) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw Object.assign(new Error('Thiếu GEMINI_API_KEY'), { status: 500 });

  const url = `https://generativelanguage.googleapis.com/v1/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw Object.assign(
      new Error(`Embedding API lỗi (${response.status}): ${body}`),
      { status: 502 }
    );
  }

  const data = await response.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(`Embedding trả về không hợp lệ (expected ${EMBEDDING_DIM} dims)`);
  }
  return values;
}

/**
 * Embed nhiều đoạn text song song (batch).
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts) {
  return Promise.all(texts.map(embedText));
}
