import crypto from 'crypto';

/**
 * Normalizes recipient identifier (phone or email) and returns a deterministic
 * 16-character hex hash prefix to ensure Zero-PII in keys and logs.
 *
 * @param {string} recipient
 * @returns {string}
 */
export function hashRecipient(recipient) {
  if (!recipient || typeof recipient !== 'string') {
    return '0000000000000000';
  }

  const trimmed = recipient.trim();
  let normalized = trimmed.toLowerCase();

  // If looks like phone number, strip common delimiters and international prefix (+84 -> 0)
  const isEmail = trimmed.includes('@');
  if (!isEmail) {
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    if (digitsOnly.startsWith('84') && digitsOnly.length >= 11) {
      normalized = `0${digitsOnly.slice(2)}`;
    } else {
      normalized = digitsOnly;
    }
  }

  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

const VALID_KEY_PATTERN = /^[a-zA-Z0-9_.:/@+-]{1,128}$/;

/**
 * Resolves request-level idempotency key at the HTTP/controller or orchestration boundary:
 * - If client provides Idempotency-Key / clientKey / requestKey:
 *   - Must be a non-empty string (1–128 chars, allowed charset).
 *   - Any non-string type (object, array, number, boolean) throws 400 INVALID_IDEMPOTENCY_KEY.
 * - If null or undefined: generates a single fresh crypto.randomUUID() for the logical request
 *   and invokes optional metrics callback to record 'missing_client_idempotency_key'.
 *
 * @param {string|null|undefined} clientHeaderOrKey
 * @param {object} [options]
 * @param {Function} [options.onMissingKey]
 * @returns {string}
 */
export function resolveRequestIdempotencyKey(clientHeaderOrKey, options = {}) {
  if (clientHeaderOrKey === null || clientHeaderOrKey === undefined) {
    if (typeof options.onMissingKey === 'function') {
      try {
        options.onMissingKey('missing_client_idempotency_key');
      } catch (_) {}
    }
    return crypto.randomUUID();
  }

  if (typeof clientHeaderOrKey !== 'string') {
    const err = new Error('Idempotency-Key must be a string');
    err.status = 400;
    err.code = 'INVALID_IDEMPOTENCY_KEY';
    throw err;
  }

  const trimmed = clientHeaderOrKey.trim();
  if (!trimmed || trimmed.length > 128 || !VALID_KEY_PATTERN.test(trimmed)) {
    const err = new Error('Idempotency-Key must be between 1 and 128 valid characters');
    err.status = 400;
    err.code = 'INVALID_IDEMPOTENCY_KEY';
    throw err;
  }

  return trimmed;
}

/**
 * Deterministically hashes client-controlled key parts (clientKey, requestKey)
 * to ensure 100% Zero-PII (returns 'h_[0-9a-f]{20}').
 * Requires a valid string key (resolved at request boundary).
 *
 * @param {string} val
 * @returns {string}
 */
export function hashClientSegment(val) {
  if (val === null || val === undefined || val === '') {
    const err = new Error('clientKey / requestKey is required for building reservation key (must be resolved at request boundary)');
    err.status = 400;
    err.code = 'MISSING_IDEMPOTENCY_KEY';
    throw err;
  }

  if (typeof val !== 'string') {
    const err = new Error('clientKey / requestKey must be a string');
    err.status = 400;
    err.code = 'INVALID_IDEMPOTENCY_KEY';
    throw err;
  }

  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 128 || !VALID_KEY_PATTERN.test(trimmed)) {
    const err = new Error('clientKey / requestKey must be between 1 and 128 valid characters');
    err.status = 400;
    err.code = 'INVALID_IDEMPOTENCY_KEY';
    throw err;
  }

  return `h_${crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 20)}`;
}

/**
 * Normalizes campaign node identifier (server/compiler controlled).
 *
 * @param {string|number} nodeId
 * @returns {string}
 */
export function normalizeNodeId(nodeId) {
  if (nodeId == null || !String(nodeId).trim()) {
    const err = new Error('nodeId is required for campaign reservation key');
    err.status = 400;
    err.code = 'MISSING_NODE_ID';
    throw err;
  }
  const str = String(nodeId).trim();
  if (/^[a-zA-Z0-9_-]{1,32}$/.test(str) && !/(?:\+?84|0)[35789]\d{8}/.test(str) && !str.includes('@')) {
    return str;
  }
  return `h_${crypto.createHash('sha256').update(str).digest('hex').slice(0, 20)}`;
}

/**
 * Normalizes inbox message identifier (database integer ID or UUID).
 *
 * @param {string|number} messageId
 * @returns {string}
 */
export function normalizeMessageId(messageId) {
  if (messageId == null || !String(messageId).trim()) {
    const err = new Error('messageId is required for inbox reservation key');
    err.status = 400;
    err.code = 'MISSING_MESSAGE_ID';
    throw err;
  }
  const str = String(messageId).trim();
  if (
    /^[0-9]{1,18}$/.test(str) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
  ) {
    return str;
  }
  return `h_${crypto.createHash('sha256').update(str).digest('hex').slice(0, 20)}`;
}

/**
 * Alias for backward compatibility.
 */
export const normalizeKeyPart = hashClientSegment;

/**
 * Deterministic hash of string without trimming (preserves whitespace significance).
 * @param {string|null|undefined} str
 * @returns {string}
 */
function hashString(str) {
  if (str == null) return '';
  return crypto.createHash('sha256').update(String(str)).digest('hex').slice(0, 16);
}

/**
 * Recursive canonical JSON serialization:
 * - Deterministically sorts keys of all nested objects
 * - Strictly preserves array element order
 * - Strictly preserves whitespace in strings
 *
 * @param {any} val
 * @returns {string}
 */
export function canonicalSerialize(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    const items = val.map((item) => canonicalSerialize(item));
    return `[${items.join(',')}]`;
  }
  const sortedKeys = Object.keys(val).sort();
  const entries = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize(val[k])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Deterministic hash of JSON object using recursive canonical serialization.
 * @param {any} val
 * @returns {string}
 */
function hashCanonicalJson(val) {
  if (val == null) return '';
  const serialized = canonicalSerialize(val);
  return crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * Deterministic hash of attachments array:
 * - Strictly preserves array order
 * - Hashes content identity / checksum if available along with metadata
 *
 * @param {Array|null|undefined} attachments
 * @returns {string}
 */
function hashAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const mapped = attachments.map((att) => {
    if (!att) return '';
    if (typeof att === 'string') return att;
    if (Buffer.isBuffer(att) || ArrayBuffer.isView(att)) {
      return {
        contentHash: crypto.createHash('sha256').update(att).digest('hex'),
      };
    }
    let contentHash = '';
    if (att.content != null) {
      if (Buffer.isBuffer(att.content) || ArrayBuffer.isView(att.content)) {
        contentHash = crypto.createHash('sha256').update(att.content).digest('hex');
      } else {
        contentHash = crypto.createHash('sha256').update(String(att.content)).digest('hex');
      }
    } else {
      contentHash = att.hash || att.checksum || '';
    }
    return {
      name: att.name || att.filename || '',
      size: att.size != null ? Number(att.size) : null,
      key: att.key || att.url || att.path || att.fileKey || '',
      contentType: att.contentType || att.mimeType || '',
      contentHash,
    };
  });
  return crypto.createHash('sha256').update(canonicalSerialize(mapped)).digest('hex').slice(0, 16);
}

/**
 * Canonical reservation key for campaign run nodes.
 * Format: campaign:{channel}:{billingUserId}:{campaignId}:{nodeId}:{recipientHash}
 *
 * @param {object} params
 * @param {string} params.channel - 'email' | 'zalo'
 * @param {string|number} params.billingUserId
 * @param {string|number} params.campaignId
 * @param {string|number} params.nodeId
 * @param {string} params.recipient
 * @returns {string}
 */
export function buildCampaignReservationKey({ runId, nodeId, channel, recipient, logicalStep = 1, campaignId, billingUserId }) {
  const normRecip = hashRecipient(recipient);
  const normNode = normalizeNodeId(nodeId);
  if (runId != null) {
    return `campaign:${runId}:${normNode}:${channel}:${normRecip}:${logicalStep}`;
  }
  const normChannel = String(channel || '').toLowerCase();
  const normUser = String(billingUserId || '');
  const normCamp = String(campaignId || '');
  return `campaign:${normChannel}:${normUser}:${normCamp}:${normNode}:${normRecip}`;
}

/**
 * Canonical reservation key for direct / single message sends.
 * Format: direct:{channel}:{billingUserId}:{clientKey}:{recipientHash}
 *
 * @param {object} params
 * @param {string} params.channel - 'email' | 'zalo'
 * @param {string|number} params.billingUserId
 * @param {string} params.clientKey - caller supplied idempotency / deduplication key
 * @param {string} params.recipient
 * @returns {string}
 */
export function buildDirectReservationKey({ channel, billingUserId, clientKey, recipient }) {
  const normChannel = String(channel || '').toLowerCase();
  const normUser = String(billingUserId || '');
  const normKey = hashClientSegment(clientKey);
  const normRecip = hashRecipient(recipient);
  return `direct:${normChannel}:${normUser}:${normKey}:${normRecip}`;
}

/**
 * Canonical reservation key for preview sends.
 * Format: preview:{channel}:{billingUserId}:{requestKey}:{recipientHash}
 *
 * @param {object} params
 * @param {string} params.channel - 'email' | 'zalo'
 * @param {string|number} params.billingUserId
 * @param {string} params.requestKey
 * @param {string} params.recipient
 * @returns {string}
 */
export function buildPreviewReservationKey({ channel, billingUserId, requestKey, recipient }) {
  const normChannel = String(channel || '').toLowerCase();
  const normUser = String(billingUserId || '');
  const normKey = hashClientSegment(requestKey);
  const normRecip = hashRecipient(recipient);
  return `preview:${normChannel}:${normUser}:${normKey}:${normRecip}`;
}

/**
 * Canonical reservation key for quick sends.
 */
export function buildQuickSendReservationKey({ channel, billingUserId, requestKey, clientKey, recipient }) {
  const recipientHash = hashRecipient(recipient);
  const safeRequestKey = hashClientSegment(requestKey || clientKey);
  return `quick:${channel}:${billingUserId}:${safeRequestKey}:${recipientHash}`;
}

/**
 * Canonical reservation key for Unified Inbox replies.
 */
export function buildInboxReservationKey({ messageId, channel = 'zalo' }) {
  const safeMessageId = normalizeMessageId(messageId);
  return `inbox:${channel}:${safeMessageId}`;
}

/**
 * Original v1 canonical request payload fingerprint algorithm.
 * Preserves exact hashes for older reservation records in PostgreSQL.
 *
 * @param {object} payload
 * @returns {string}
 */
export function computeRequestFingerprintV1(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('computeRequestFingerprint requires a valid payload object');
  }

  const rawContent = payload.content ?? payload.message ?? payload.body ?? '';
  const contentStr = typeof rawContent === 'string'
    ? rawContent
    : (rawContent != null && typeof rawContent === 'object')
      ? canonicalSerialize(rawContent)
      : String(rawContent ?? '');

  const canonical = {
    channel: String(payload.channel || '').toLowerCase(),
    recipientHash: hashRecipient(payload.recipient || payload.to || ''),
    subjectHash: hashString(payload.subject || ''),
    contentHash: hashString(contentStr),
    templateId: payload.templateId != null ? String(payload.templateId) : '',
    templateVariablesHash: hashCanonicalJson(payload.templateVariables ?? payload.variables ?? payload.template_variables),
    attachmentsHash: hashAttachments(payload.attachments),
    optionsHash: hashCanonicalJson(payload.options),
    quantity: Number(payload.quantity || 1),
    sourceType: String(payload.sourceType || '').toLowerCase(),
  };

  const sortedJson = JSON.stringify(canonical, Object.keys(canonical).sort());
  return crypto.createHash('sha256').update(sortedJson).digest('hex');
}

/**
 * v2 canonical request payload fingerprint algorithm:
 * - Adds full email/attachment protection: htmlHash, ccHash, bccHash, attachmentsHash
 * - Adds account/sender protection: fromEmailId, accountId
 * - Supports phone / groupId / to / recipient aliases
 *
 * @param {object} payload
 * @returns {string}
 */
export function computeRequestFingerprintV2(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('computeRequestFingerprint requires a valid payload object');
  }

  const rawContent = payload.content ?? payload.message ?? payload.body ?? payload.bodyText ?? '';
  const contentStr = typeof rawContent === 'string'
    ? rawContent
    : (rawContent != null && typeof rawContent === 'object')
      ? canonicalSerialize(rawContent)
      : String(rawContent ?? '');

  const rawHtml = payload.htmlContent ?? payload.html ?? payload.bodyHtml ?? '';
  const htmlStr = typeof rawHtml === 'string'
    ? rawHtml
    : (rawHtml != null && typeof rawHtml === 'object')
      ? canonicalSerialize(rawHtml)
      : String(rawHtml ?? '');

  const ccList = Array.isArray(payload.cc)
    ? [...payload.cc].filter(Boolean).sort()
    : (payload.cc ? [payload.cc] : []);
  const bccList = Array.isArray(payload.bcc)
    ? [...payload.bcc].filter(Boolean).sort()
    : (payload.bcc ? [payload.bcc] : []);

  const fromEmailId = payload.fromEmailId != null
    ? String(payload.fromEmailId)
    : (payload.from_email_id != null ? String(payload.from_email_id) : '');
  const accountId = payload.accountId != null
    ? String(payload.accountId)
    : (payload.account_id != null ? String(payload.account_id) : '');

  const canonical = {
    accountId,
    attachmentsHash: hashAttachments(payload.attachments),
    bccHash: hashCanonicalJson(bccList),
    ccHash: hashCanonicalJson(ccList),
    channel: String(payload.channel || '').toLowerCase(),
    contentHash: hashString(contentStr),
    fromEmailId,
    htmlHash: hashString(htmlStr),
    optionsHash: hashCanonicalJson(payload.options),
    quantity: Number(payload.quantity || 1),
    recipientHash: hashRecipient(payload.recipient || payload.to || payload.phone || payload.groupId || ''),
    sourceType: String(payload.sourceType || '').toLowerCase(),
    subjectHash: hashString(payload.subject || ''),
    templateId: payload.templateId != null ? String(payload.templateId) : '',
    templateVariablesHash: hashCanonicalJson(payload.templateVariables ?? payload.variables ?? payload.template_variables),
  };

  const sortedJson = JSON.stringify(canonical, Object.keys(canonical).sort());
  return crypto.createHash('sha256').update(sortedJson).digest('hex');
}

/**
 * Computes request payload fingerprint for tamper and parameter-drift protection.
 * Uses sha256 of canonical deterministic JSON.
 * Defaults to 'v2'.
 *
 * @param {object} payload
 * @param {string} [version='v2']
 * @returns {string}
 */
export function computeRequestFingerprint(payload = {}, version = 'v2') {
  if (version === 'v1') {
    return computeRequestFingerprintV1(payload);
  }
  if (version === 'v2') {
    return computeRequestFingerprintV2(payload);
  }
  throw new Error(`Unsupported request fingerprint version: ${version}`);
}

/**
 * Validates request payload against saved fingerprint and version.
 *
 * @param {string} savedVersion
 * @param {string} savedFingerprint
 * @param {object} currentPayload
 * @returns {{ valid: boolean, savedFingerprint: string, computedFingerprint: string|null }}
 */
export function validateFingerprint(savedVersion, savedFingerprint, currentPayload) {
  if (!savedFingerprint || !/^[0-9a-f]{64}$/i.test(savedFingerprint)) {
    return { valid: false, savedFingerprint, computedFingerprint: null };
  }
  const version = savedVersion || 'v1';
  const computedFingerprint = computeRequestFingerprint(currentPayload, version);
  const valid = savedFingerprint.toLowerCase() === computedFingerprint.toLowerCase();

  return {
    valid,
    savedFingerprint,
    computedFingerprint,
  };
}
