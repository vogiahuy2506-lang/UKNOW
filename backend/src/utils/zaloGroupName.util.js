/**
 * Helpers for resolving Zalo group display names from zca-js API payloads.
 */

const NAME_FIELDS = ['groupName', 'name', 'displayName', 'subject', 'title', 'group_title', 'gridName'];

/**
 * @param {string|number|null|undefined} groupId
 * @returns {{ raw: string, bare: string, prefixed: string }}
 */
export function normalizeZaloGroupId(groupId) {
  const raw = String(groupId || '').trim();
  if (!raw) {
    return { raw: '', bare: '', prefixed: '' };
  }
  const bare = raw.replace(/^group_/, '');
  return {
    raw,
    bare,
    prefixed: bare ? `group_${bare}` : raw,
  };
}

/**
 * Hội thoại nhóm trên hộp thư: external_id dạng group_<id>, hoặc visitor_info.is_group / group_id.
 * @param {{ externalId?: string|null, conversationInfo?: object|null }} params
 * @returns {boolean}
 */
export function isZaloGroupConversation({ externalId, conversationInfo } = {}) {
  const info = conversationInfo || {};
  const flag = info.is_group;
  if (flag === true || flag === 1 || flag === 'true' || flag === 't' || flag === '1') {
    return true;
  }
  if (info.group_id != null && String(info.group_id).trim() !== '') {
    return true;
  }
  const ext = String(externalId || '').trim();
  return ext.startsWith('group_') || ext.startsWith('g_');
}

/**
 * ID gửi vào Zalo (tham số grid của zca-js). Bỏ prefix nội bộ `group_`.
 * Không bỏ `g_` — một số payload Zalo dùng dạng đó.
 *
 * @param {...(string|number|null|undefined)} candidates
 * @returns {string}
 */
export function resolveZaloGroupSendId(...candidates) {
  for (const candidate of candidates) {
    const { bare } = normalizeZaloGroupId(candidate);
    if (bare) return bare;
  }
  return '';
}

/**
 * @param {unknown} record
 * @returns {string}
 */
export function pickGroupNameFromRecord(record) {
  if (!record || typeof record !== 'object') return '';
  for (const key of NAME_FIELDS) {
    const value = String(record[key] || '').trim();
    if (value) return value;
  }
  return '';
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
export function extractGroupNameFromPayload(payload) {
  if (!payload) return '';

  const direct = pickGroupNameFromRecord(payload);
  if (direct) return direct;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractGroupNameFromPayload(item);
      if (found) return found;
    }
    return '';
  }

  if (typeof payload !== 'object') return '';

  const queue = [payload];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const found = pickGroupNameFromRecord(current);
    if (found) return found;

    Object.values(current).forEach((value) => {
      if (value && typeof value === 'object') queue.push(value);
    });
  }

  return '';
}

/**
 * @param {unknown} result
 * @param {string|number|null|undefined} groupId
 * @returns {string}
 */
export function extractGroupNameFromApiResult(result, groupId) {
  if (!result) return '';

  const { raw, bare, prefixed } = normalizeZaloGroupId(groupId);
  const keys = [...new Set([raw, bare, prefixed].filter(Boolean))];

  for (const key of keys) {
    const fromMap = result?.gridInfoMap?.[key] || result?.groupInfoMap?.[key];
    const name = extractGroupNameFromPayload(fromMap);
    if (name) return name;
  }

  return extractGroupNameFromPayload(result);
}

/**
 * @param {string|null|undefined} groupName
 * @param {string|number|null|undefined} [groupId]
 * @returns {boolean}
 */
export function isPlaceholderGroupName(groupName, groupId = '') {
  const name = String(groupName || '').trim();
  if (!name || name === 'Nhóm') return true;
  if (name.startsWith('Nhóm group_')) return true;

  const { raw, bare, prefixed } = normalizeZaloGroupId(groupId);
  const placeholders = new Set([
    `Nhóm ${raw}`,
    `Nhóm ${bare}`,
    `Nhóm ${prefixed}`,
  ].filter((value) => value !== 'Nhóm'));

  if (placeholders.has(name)) return true;
  if (/^Nhóm \d+$/.test(name)) return true;

  return false;
}

/**
 * @param {string|number|null|undefined} groupId
 * @returns {string}
 */
export function buildPlaceholderGroupName(groupId) {
  const { bare } = normalizeZaloGroupId(groupId);
  const shortId = bare.slice(-6) || bare;
  return shortId ? `Nhóm ${shortId}` : 'Nhóm';
}
