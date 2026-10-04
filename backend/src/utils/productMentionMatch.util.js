/**
 * Khớp tên/mã sản phẩm trong tin nhắn khách (PLAN_PHEU_NGUOI_GIA_SO_HOI_CHATBOT PR-D).
 * Hàm thuần: chuẩn hoá tên và tin bằng CÙNG một hàm (bỏ dấu, đ→d, chữ thường, ký tự không chữ-số → khoảng trắng).
 */

export function normalizeMentionText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MIN_NAME_CHARS = 6;
const MIN_NAME_WORDS = 2;
const MIN_CODE_CHARS = 3;

/** Tên đủ dài để khớp trọn cụm (≥ 2 từ hoặc ≥ 6 ký tự); tên quá ngắn như "AI", "khoá" thì bỏ. */
export function isMatchableName(normalizedName) {
  if (!normalizedName) return false;
  const words = normalizedName.split(' ').length;
  return words >= MIN_NAME_WORDS || normalizedName.length >= MIN_NAME_CHARS;
}

/**
 * @param {string} content nội dung tin
 * @param {Array<{id:number, product_name?:string, product_code?:string}>} products
 * @returns {number[]} id các sản phẩm được nhắc (mỗi sản phẩm tối đa một lần)
 */
export function findMentionedProductIds(content, products) {
  const text = normalizeMentionText(content);
  if (!text || !Array.isArray(products) || products.length === 0) return [];
  const padded = ` ${text} `;
  const ids = [];
  for (const product of products) {
    const name = normalizeMentionText(product.product_name);
    const code = normalizeMentionText(product.product_code);
    const byName = isMatchableName(name) && padded.includes(` ${name} `);
    const byCode = code.length >= MIN_CODE_CHARS && padded.includes(` ${code} `);
    if (byName || byCode) ids.push(product.id);
  }
  return ids;
}
