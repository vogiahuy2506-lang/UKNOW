import { verifyFileToken } from './fileDownloadToken.js';

export function normalizeStorageKey(input) {
  if (!input) return '';

  let rawValue = input;
  if (typeof input === 'object' && input !== null) {
    rawValue = input.key || input.storageKey || input.url || input.link || input.attachmentUrl || '';
  }

  const text = String(rawValue || '').trim();
  if (!text) return '';
  if (text.replace(/\\/g, '/').split('/').includes('..')) return '';

  let candidate = text;
  try {
    const parsed = new URL(text, 'http://localhost');
    const pathname = decodeURIComponent(parsed.pathname || '').replace(/^\/+/, '');
    const uploadIndex = pathname.indexOf('uploads/');
    candidate = uploadIndex >= 0 ? pathname.slice(uploadIndex) : pathname;
  } catch {
    // Keep the raw value for direct storage keys.
  }

  const normalized = candidate.replace(/^\/+/, '').replace(/\\/g, '/');
  const uploadIndex = normalized.indexOf('uploads/');
  const key = uploadIndex >= 0 ? normalized.slice(uploadIndex) : normalized;
  if (!key.startsWith('uploads/') || key.includes('..')) return '';
  return key;
}

/**
 * Khoá đã chuẩn hoá nếu nó nằm dưới `uploads/<ownerId>/`, ngược lại chuỗi rỗng.
 *
 * Tệp tải lên luôn lưu theo CHỦ workspace (`uploads/<chủ>/...`, cả khi nhân viên tải — xem
 * `uploadController.uploadTemp`/`promoteTemp` và `chatAttachment.persistChatBlob`), nên `ownerId` phải là id chủ
 * workspace (`resolveWorkspaceOwnerId`/`resolveOwnerUserId`), KHÔNG phải id người đang thao tác: nhân viên đọc tệp
 * chính mình vừa tải thì khoá nằm dưới id chủ.
 *
 * Kiểm trên khoá ĐÃ chuẩn hoá (cùng bộ chuẩn hoá mà bước đọc dùng) chứ không trên chuỗi client gửi: URL
 * `https://…/uploads/8/…`, `%2e%2e`, dấu `\` đều bị bộ chuẩn hoá đưa về dạng thật trước khi so tiền tố. Tiền tố có
 * dấu `/` ở cuối để chủ 7 không đọc được `uploads/70/…`.
 *
 * @param {unknown} input khoá/URL/object do client hoặc DB đưa vào
 * @param {number|string|null} ownerId id chủ workspace
 * @returns {string}
 */
export function resolveOwnedStorageKey(input, ownerId) {
  const owner = Number(ownerId);
  if (!Number.isSafeInteger(owner) || owner <= 0) return '';
  const key = normalizeStorageKey(input);
  if (!key) return '';
  return key.startsWith(`uploads/${owner}/`) ? key : '';
}

/**
 * Như `resolveOwnedStorageKey` nhưng ném lỗi 403 (`STORAGE_KEY_NOT_OWNED`) khi khoá không hợp lệ hoặc không thuộc
 * chủ — dùng ở mọi chỗ AI đọc tệp theo khoá do CLIENT gửi (`history[].files[].storage_key`). Trả khoá đã chuẩn hoá
 * để truyền thẳng cho bước đọc (không chuẩn hoá lại hai kiểu).
 *
 * @param {unknown} input
 * @param {number|string|null} ownerId
 * @returns {string}
 */
export function assertOwnedStorageKey(input, ownerId) {
  const key = resolveOwnedStorageKey(input, ownerId);
  if (!key) {
    const error = new Error(`Khoá tệp không hợp lệ hoặc không thuộc workspace ${ownerId ?? '(không rõ)'}`);
    error.status = 403;
    error.code = 'STORAGE_KEY_NOT_OWNED';
    throw error;
  }
  return key;
}

export function extractStorageKey(input) {
  const direct = normalizeStorageKey(input);
  if (direct) return direct;

  const text = String(input || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text, 'http://localhost');
    const match = parsed.pathname.match(/\/file\/([^/]+)/);
    if (!match?.[1]) return '';
    const payload = verifyFileToken(decodeURIComponent(match[1]));
    return normalizeStorageKey(payload?.sk);
  } catch {
    return '';
  }
}

export function collectStorageKeys(value, output = new Set()) {
  if (value == null) return output;

  if (Array.isArray(value)) {
    for (const item of value) collectStorageKeys(item, output);
    return output;
  }

  if (typeof value === 'object') {
    const direct = extractStorageKey(value);
    if (direct) output.add(direct);
    for (const nested of Object.values(value)) collectStorageKeys(nested, output);
    return output;
  }

  const text = String(value);
  const direct = extractStorageKey(text);
  if (direct) output.add(direct);

  for (const match of text.matchAll(/(?:https?:\/\/[^\s"'<>]+)?\/file\/([^\s"'<>]+)/gi)) {
    const key = extractStorageKey(`/file/${match[1]}`);
    if (key) output.add(key);
  }
  for (const match of text.matchAll(/(?:^|[\s"'(=])\/?(uploads\/[A-Za-z0-9._~!$&+,;=:@%\/-]+)/g)) {
    const key = normalizeStorageKey(match[1]);
    if (key) output.add(key);
  }
  return output;
}

export default {
  normalizeStorageKey,
  resolveOwnedStorageKey,
  assertOwnedStorageKey,
  extractStorageKey,
  collectStorageKeys,
};
