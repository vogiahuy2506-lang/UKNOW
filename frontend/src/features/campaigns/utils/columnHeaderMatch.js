/**
 * Tiện ích chuẩn hoá và nhận diện tiêu đề cột dữ liệu theo ngữ nghĩa.
 *
 * Bản song sinh của `backend/src/utils/columnHeaderMatch.util.js` phía client.
 * Phục vụ runtime builder (`campaignBuilderRuntime.js` / `resolveItemField`).
 */

export function foldDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (m) => (m === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .trim();
}

export function isEmailHeader(h) {
  const norm = foldDiacritics(h);
  return (
    /^(email|e-mail|thu|mail|dia chi email|email address|thu dien tu)$/i.test(norm) ||
    norm.includes('email') ||
    norm.includes('thu dien tu') ||
    norm === 'mail'
  );
}

export function isPhoneHeader(h) {
  const norm = foldDiacritics(h);
  return (
    /^(phone|sdt|dien thoai|so dt|so dien thoai|mobile|tel|phone number|telephone)$/i.test(norm) ||
    norm.includes('sdt') ||
    norm.includes('dien thoai') ||
    norm.includes('so dt') ||
    norm.includes('phone') ||
    norm.includes('mobile') ||
    norm.includes('telephone')
  );
}

export function isNameHeader(h) {
  const norm = foldDiacritics(h);
  return (
    /^(name|ten|ho ten|ho va ten|fullname|full name|customer name|ten khach hang)$/i.test(norm) ||
    norm.includes('ho ten') ||
    norm.includes('fullname') ||
    norm.includes('ten khach hang')
  );
}

/**
 * Tìm key/tiêu đề cột phù hợp nhất theo ngữ nghĩa trong danh sách keys.
 * Ưu tiên:
 * 1. Khớp chính xác hoàn toàn từ khoá (exact regex match trên norm)
 * 2. Khớp includes (ưu tiên cột ngắn hơn / gần từ khoá hơn, ví dụ: "Email" trước "Email phụ")
 *
 * @param {string[]} keys Danh sách tên cột có trong dữ liệu
 * @param {'email'|'phone'|'name'} targetField Trường cần tìm
 * @returns {string|null} Key tốt nhất hoặc null nếu không khớp
 */
export function findBestMatchingKey(keys, targetField) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const target = String(targetField || '').trim().toLowerCase();

  let testFn;
  let exactRe;
  if (target === 'email') {
    testFn = isEmailHeader;
    exactRe = /^(email|e-mail|mail|dia chi email|email address|thu dien tu)$/i;
  } else if (target === 'phone') {
    testFn = isPhoneHeader;
    exactRe = /^(phone|sdt|dien thoai|so dt|so dien thoai|mobile|tel|phone number|telephone)$/i;
  } else if (target === 'name') {
    testFn = isNameHeader;
    exactRe = /^(name|ten|ho ten|ho va ten|fullname|full name|customer name|ten khach hang)$/i;
  } else {
    return null;
  }

  const matchingKeys = keys.filter((key) => testFn(key));
  if (matchingKeys.length === 0) return null;
  if (matchingKeys.length === 1) return matchingKeys[0];

  // Nếu có nhiều cột cùng khớp:
  // 1. Ưu tiên cột khớp exact regex
  const exactMatch = matchingKeys.find((key) => exactRe.test(foldDiacritics(key)));
  if (exactMatch) return exactMatch;

  // 2. Ưu tiên cột có độ dài sau khi chuẩn hoá ngắn nhất (ít từ phụ nhất)
  return matchingKeys.slice().sort((a, b) => {
    const normA = foldDiacritics(a);
    const normB = foldDiacritics(b);
    return normA.length - normB.length;
  })[0];
}
