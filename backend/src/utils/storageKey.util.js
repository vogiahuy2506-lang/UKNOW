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
  extractStorageKey,
  collectStorageKeys,
};
