import crypto from 'crypto';

const getSecret = () => process.env.JWT_SECRET || 'changeme-set-JWT_SECRET';

const b64url = (str) => Buffer.from(str).toString('base64url');
const fromB64url = (str) => Buffer.from(str, 'base64url').toString('utf8');

/** Default 24h; override via CHAT_ATTACHMENT_REF_TTL_MS for tests. */
export const REF_TTL_MS = Number.parseInt(process.env.CHAT_ATTACHMENT_REF_TTL_MS || '', 10) || 24 * 60 * 60 * 1000;

/**
 * Sign a chat attachment ref (NOT the forever /file download token).
 * PR-1: { sk, cb, uid, exp }
 * PR-2: { sk, cb, sid, exp }
 *
 * @param {string} storageKey
 * @param {{ chatbotId: number|string, uid?: number|string|null, sid?: string|null }} bind
 * @param {{ ttlMs?: number }} [opts]
 * @returns {string}
 */
export function signChatAttachmentRef(storageKey, { chatbotId, uid = null, sid = null } = {}, { ttlMs = REF_TTL_MS } = {}) {
  const sk = String(storageKey || '').trim();
  if (!sk) throw new Error('storageKey is required');
  if (chatbotId == null || chatbotId === '') throw new Error('chatbotId is required');

  const resolvedTtl = Number.isFinite(ttlMs) ? ttlMs : REF_TTL_MS;
  const exp = Date.now() + resolvedTtl;
  const payloadObj = {
    sk,
    cb: Number(chatbotId) || chatbotId,
    exp,
  };
  if (uid != null && uid !== '') payloadObj.uid = Number(uid) || uid;
  if (sid != null && sid !== '') payloadObj.sid = String(sid);

  const payload = b64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verify and decode a chat attachment ref.
 * @param {string} ref
 * @param {{ chatbotId: number|string, uid?: number|string|null, sid?: string|null }} expected
 * @returns {{ sk: string, cb: *, uid?: *, sid?: *, exp: number }}
 */
export function resolveChatAttachmentRef(ref, { chatbotId, uid = null, sid = null } = {}) {
  if (!ref || typeof ref !== 'string') {
    const err = new Error('Token đính kèm không hợp lệ');
    err.status = 403;
    throw err;
  }

  const dotIndex = ref.lastIndexOf('.');
  if (dotIndex === -1) {
    const err = new Error('Token đính kèm không hợp lệ');
    err.status = 403;
    throw err;
  }

  const payload = ref.slice(0, dotIndex);
  const sig = ref.slice(dotIndex + 1);

  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    const err = new Error('Token đính kèm không hợp lệ');
    err.status = 403;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(fromB64url(payload));
  } catch {
    const err = new Error('Token đính kèm không hợp lệ');
    err.status = 403;
    throw err;
  }

  if (!data?.sk || data.exp == null) {
    const err = new Error('Token đính kèm không hợp lệ');
    err.status = 403;
    throw err;
  }

  if (Date.now() > Number(data.exp)) {
    const err = new Error('Token đính kèm đã hết hạn');
    err.status = 403;
    throw err;
  }

  if (String(data.cb) !== String(chatbotId)) {
    const err = new Error('Token đính kèm không thuộc chatbot này');
    err.status = 403;
    throw err;
  }

  // PR-1: uid-bound refs
  if (data.uid != null) {
    if (uid == null || String(data.uid) !== String(uid)) {
      const err = new Error('Token đính kèm không thuộc người dùng này');
      err.status = 403;
      throw err;
    }
  }

  // PR-2: session-bound refs
  if (data.sid != null) {
    if (!sid || String(data.sid) !== String(sid)) {
      const err = new Error('Token đính kèm không thuộc phiên này');
      err.status = 403;
      throw err;
    }
  }

  return data;
}
