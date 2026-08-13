import { normalizeZaloGroupId } from './zaloGroupName.util.js';
import { isPositiveZaloMsgId } from './zaloDispatchDelivery.util.js';

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
  if (isPositiveZaloMsgId(sent?.message?.msgId)) {
    return String(sent.message.msgId).trim();
  }
  const attachments = Array.isArray(sent?.attachment) ? sent.attachment : [];
  for (const item of attachments) {
    if (isPositiveZaloMsgId(item?.msgId)) {
      return String(item.msgId).trim();
    }
  }
  return null;
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

/** Precise msgId list window — echo of attachment dispatches can arrive after text. */
export const INBOX_ECHO_MSG_IDS_WINDOW_MS = 5 * 60 * 1000;
/** Narrow window for null-external_id fallback (echo, not human re-type from app). */
export const INBOX_ECHO_MANUAL_WINDOW_MS = 30 * 1000;

/**
 * Whether an isSelf inbound should skip handoff pause (echo of inbox-send).
 * Prefer msgId ∈ zalo_msg_ids; then manual_inbox + matching/null external_id within a short window.
 * Content equality is only a last guard when external_id is still null (A missed).
 *
 * @param {object} params
 * @param {string|number|null|undefined} params.incomingMsgId
 * @param {string} [params.incomingContent]
 * @param {Array<{
 *   source?: string|null,
 *   externalId?: string|null,
 *   zaloMsgIds?: unknown,
 *   content?: string|null,
 *   createdAt?: string|Date|null,
 * }>} params.candidates
 * @param {number} [params.now]
 * @param {number} [params.msgIdsWindowMs]
 * @param {number} [params.manualWindowMs]
 * @returns {boolean}
 */
export function isInboxSendEcho({
  incomingMsgId,
  incomingContent = '',
  candidates = [],
  now = Date.now(),
  msgIdsWindowMs = INBOX_ECHO_MSG_IDS_WINDOW_MS,
  manualWindowMs = INBOX_ECHO_MANUAL_WINDOW_MS,
}) {
  const msgId = incomingMsgId != null && incomingMsgId !== ''
    ? String(incomingMsgId)
    : null;
  if (!msgId || !Array.isArray(candidates) || candidates.length === 0) return false;

  const content = String(incomingContent || '').trim();

  for (const row of candidates) {
    const createdMs = row?.createdAt != null ? new Date(row.createdAt).getTime() : NaN;
    if (!Number.isFinite(createdMs)) continue;
    const ageMs = now - createdMs;
    if (ageMs < 0) continue;

    const ids = Array.isArray(row.zaloMsgIds)
      ? row.zaloMsgIds.map((id) => String(id)).filter(Boolean)
      : [];
    if (ageMs <= msgIdsWindowMs && ids.includes(msgId)) return true;

    if (row.source !== 'manual_inbox' || ageMs > manualWindowMs) continue;

    const externalId = row.externalId != null && row.externalId !== ''
      ? String(row.externalId)
      : null;
    if (externalId === msgId) return true;
    if (externalId != null) continue;

    // A missed (no external_id yet): require content match when both sides have text.
    const rowContent = String(row.content || '').trim();
    if (content && rowContent && content === rowContent) return true;
    if (!content && !rowContent) return true;
  }

  return false;
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
