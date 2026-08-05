import { normalizeZaloGroupId } from './zaloGroupName.util.js';

/**
 * Resolve conversation external_id for a Zalo Personal inbound message.
 * For 1-1, prefer wrapper threadId (partner uid) — never isSelf fromUid after zca-js overwrite.
 *
 * @param {object} params
 * @param {boolean} params.isGroup
 * @param {string|null} params.groupId
 * @param {string|null|undefined} params.threadId - UserMessage/GroupMessage.threadId
 * @param {string|null|undefined} params.fromUid
 * @returns {string}
 */
export function resolveConversationExternalId({ isGroup, groupId, threadId, fromUid }) {
  if (isGroup) {
    const { prefixed } = normalizeZaloGroupId(groupId);
    return prefixed || String(groupId || '');
  }
  return String(threadId || fromUid || '');
}

/**
 * Extract msgId from zca-js sendMessage response (text and/or attachment).
 * Always returns a string when present (send path uses number; events use string).
 *
 * @param {object|null|undefined} sent
 * @returns {string|null}
 */
export function extractSendMsgId(sent) {
  const raw = sent?.message?.msgId ?? sent?.attachment?.[0]?.msgId;
  if (raw == null || raw === '') return null;
  return String(raw);
}
