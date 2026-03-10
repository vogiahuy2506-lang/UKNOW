import crypto from 'crypto';

const getSecret = () => process.env.JWT_SECRET || 'changeme-set-JWT_SECRET';

const b64url = (str) => Buffer.from(str).toString('base64url');
const fromB64url = (str) => Buffer.from(str, 'base64url').toString('utf8');

/**
 * Tạo signed file token (dùng cho viewer, download, và attachment tracking).
 * @param {string} storageKey          - S3 key của file
 * @param {number|string|null} campaignId
 * @param {number|string|null} customerId
 * @param {string|null} email          - Email người nhận
 * @param {string|null} displayName    - Tên hiển thị của file (n)
 * @param {string|null} emailTrackingToken - UUID tracking token của email message (et)
 * @returns {string}  payload.signature (base64url)
 */
export function generateFileToken(storageKey, campaignId, customerId, email, displayName = null, emailTrackingToken = null) {
  const payload = b64url(
    JSON.stringify({
      sk: storageKey,
      c:  campaignId   ?? null,
      u:  customerId   ?? null,
      e:  email        ?? null,
      n:  displayName  ?? null,
      et: emailTrackingToken ?? null,
    })
  );
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

/** Alias giữ backward compat với code cũ */
export const generateDownloadToken = generateFileToken;

/**
 * Xác thực và giải mã file token.
 * @param {string} token
 * @returns {{ sk: string, c: number|null, u: number|null, e: string|null }}
 * @throws {Error} nếu token không hợp lệ
 */
export function verifyFileToken(token) {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) throw new Error('Token không hợp lệ');

  const payload = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

  // Constant-time comparison
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Chữ ký không khớp');
  }

  return JSON.parse(fromB64url(payload));
}

/** Alias giữ backward compat */
export const verifyDownloadToken = verifyFileToken;
