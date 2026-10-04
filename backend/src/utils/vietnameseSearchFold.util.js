/**
 * Tìm kiếm không phân biệt dấu tiếng Việt ("nguyen" khớp "Nguyễn") — RA_SOAT_3_MAN H-33.
 *
 * Postgres production không cài extension `unaccent`, nên gấp dấu bằng `translate()` với đúng bảng ký tự này ở CẢ
 * HAI phía (JS gấp từ khoá, SQL gấp cột) để không lệch nhau. Bảng chứa cả chữ hoa lẫn chữ thường dạng dựng sẵn (NFC):
 * `lower()` của Postgres chỉ hạ được chữ hoa có dấu khi cơ sở dữ liệu dùng locale UTF-8, nên không dựa vào nó.
 */

const GROUPS = {
  a: 'àáảãạăằắẳẵặâầấẩẫậ',
  e: 'èéẻẽẹêềếểễệ',
  i: 'ìíỉĩị',
  o: 'òóỏõọôồốổỗộơờớởỡợ',
  u: 'ùúủũụưừứửữự',
  y: 'ỳýỷỹỵ',
  d: 'đ',
};

const pairs = [];
for (const [ascii, chars] of Object.entries(GROUPS)) {
  for (const ch of chars) {
    pairs.push([ch, ascii]);
    pairs.push([ch.toUpperCase(), ascii]);
  }
}

/** Chuỗi nguồn / đích cho `translate(lower(x), FROM, TO)` — cùng độ dài, chỉ chứa chữ cái (không có dấu nháy). */
export const VN_FOLD_FROM = pairs.map(([from]) => from).join('');
export const VN_FOLD_TO = pairs.map(([, to]) => to).join('');

const FOLD_MAP = new Map(pairs);

/**
 * Gấp dấu + hạ chữ thường một chuỗi người dùng nhập.
 * @param {string|null|undefined} input
 * @returns {string}
 */
export function foldVietnamese(input) {
  if (input == null) return '';
  let out = '';
  for (const ch of String(input).normalize('NFC')) {
    out += FOLD_MAP.get(ch) ?? ch;
  }
  return out.toLowerCase();
}

/**
 * Biểu thức SQL gấp dấu một cột/biểu thức. `expr` PHẢI là mã SQL do server viết (tên cột, `::text`), không phải input.
 * @param {string} expr
 */
export function sqlFoldVietnamese(expr) {
  return `translate(lower(${expr}), '${VN_FOLD_FROM}', '${VN_FOLD_TO}')`;
}

/** Thoát ký tự đại diện của LIKE trong từ khoá (`\`, `%`, `_`) — Postgres mặc định dùng `\` làm ký tự thoát. */
export function escapeLikePattern(input) {
  return String(input).replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Mẫu LIKE đã gấp dấu cho từ khoá tìm kiếm: `%nguyen%`.
 * @param {string} search
 */
export function buildFoldedLikePattern(search) {
  return `%${escapeLikePattern(foldVietnamese(search))}%`;
}
