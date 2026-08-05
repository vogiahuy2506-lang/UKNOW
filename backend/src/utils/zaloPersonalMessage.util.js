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

/**
 * After saveMessageToDatabase: skip zaloInbox handler for echo / unique-index races.
 * Dropping skippedEcho here silently pauses AI on every bot reply (D3+D4).
 *
 * @param {object|null|undefined} saveResult
 * @returns {boolean}
 */
export function shouldSkipInboxHandler(saveResult) {
  return !!(saveResult?.isDuplicate || saveResult?.skippedEcho);
}

/**
 * Gate used by the listener after persist — single place D3+D4 is enforced.
 * @returns {boolean} true if handler was invoked
 */
export function runInboxHandlerAfterSave(saveResult, handler, msgData, onHandlerError) {
  if (shouldSkipInboxHandler(saveResult)) return false;
  if (typeof handler !== 'function') return false;
  try {
    const maybePromise = handler(msgData);
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch((err) => {
        if (typeof onHandlerError === 'function') onHandlerError(err);
      });
    }
  } catch (err) {
    if (typeof onHandlerError === 'function') onHandlerError(err);
  }
  return true;
}
