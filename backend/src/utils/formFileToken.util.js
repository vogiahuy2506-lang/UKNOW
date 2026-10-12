import crypto from 'crypto';

/**
 * Token HMAC NGẮN HẠN cho tệp khách tải lên biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4b):
 *  - `download`: chủ/nhân viên (đã xác thực + đúng workspace) lấy link tải; link là token này, hạn vài phút.
 *    Route công khai `/api/public/forms/files/:token` kiểm token rồi phát tệp dạng attachment (GCS: 302 sang URL ký của kho).
 *  - `skip`: dấu "chủ biểu mẫu hết dung lượng" backend cấp lúc từ chối xin URL, khách gửi lại khi nộp bài để trường tệp bắt buộc
 *    vẫn qua (không mất khách). Có chữ ký nên khách không tự bịa để bỏ qua trường bắt buộc.
 *
 * Khác `fileDownloadToken.js` (token link email đính kèm chiến dịch — KHÔNG hết hạn, mang `sk`): token ở đây luôn có hạn và
 * chữ ký gắn với MỤC ĐÍCH (`purpose`), nên token loại này không dùng được cho loại kia. Khoá = JWT_SECRET; thiếu thì ném lỗi.
 */

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Chưa cấu hình JWT_SECRET — không ký/kiểm được token tệp biểu mẫu');
  }
  return secret;
};

export const FORM_FILE_DOWNLOAD_TTL_MS = 5 * 60 * 1000;
export const FORM_FILE_SKIP_TTL_MS = 60 * 60 * 1000;

function sign(purpose, payload, ttlMs, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...payload, x: now + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(`${purpose}.${body}`).digest('base64url');
  return { token: `${body}.${sig}`, expiresAt: new Date(now + ttlMs) };
}

function verify(purpose, token, now = Date.now()) {
  const text = String(token || '');
  const dot = text.lastIndexOf('.');
  if (dot <= 0) throw new Error('Token không hợp lệ');
  const body = text.slice(0, dot);
  const sig = text.slice(dot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(`${purpose}.${body}`).digest('base64url');
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Chữ ký không khớp');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Token không hợp lệ');
  }
  if (!payload || typeof payload !== 'object' || !Number.isFinite(payload.x) || payload.x <= now) {
    throw new Error('Token đã hết hạn');
  }
  return payload;
}

/**
 * @param {{ storageKey: string, fileName: string, contentType: string }} file
 * @param {number} [ttlMs]
 * @returns {{ token: string, expiresAt: Date }}
 */
export function createFormFileDownloadToken({ storageKey, fileName, contentType }, ttlMs = FORM_FILE_DOWNLOAD_TTL_MS) {
  return sign('form_file_download', { k: storageKey, n: fileName, m: contentType }, ttlMs);
}

/**
 * @param {string} token
 * @returns {{ storageKey: string, fileName: string, contentType: string }}
 * @throws {Error} chữ ký sai / hết hạn / thiếu trường
 */
export function verifyFormFileDownloadToken(token) {
  const payload = verify('form_file_download', token);
  if (typeof payload.k !== 'string' || !payload.k) throw new Error('Token không hợp lệ');
  return {
    storageKey: payload.k,
    fileName: typeof payload.n === 'string' ? payload.n : 'file',
    contentType: typeof payload.m === 'string' ? payload.m : '',
  };
}

/**
 * Dấu "chủ hết dung lượng" cho một trường tệp của một biểu mẫu.
 *
 * @param {{ formId: number|string, fieldKey: string }} scope
 * @param {number} [ttlMs]
 * @returns {{ token: string, expiresAt: Date }}
 */
export function createFormFileSkipToken({ formId, fieldKey }, ttlMs = FORM_FILE_SKIP_TTL_MS) {
  return sign('form_file_skip', { f: String(formId), k: String(fieldKey) }, ttlMs);
}

/**
 * @param {string} token
 * @param {{ formId: number|string, fieldKey: string }} scope
 * @returns {boolean} true khi chữ ký đúng, chưa hết hạn và đúng biểu mẫu + đúng trường
 */
export function isValidFormFileSkipToken(token, { formId, fieldKey }) {
  try {
    const payload = verify('form_file_skip', token);
    return payload.f === String(formId) && payload.k === String(fieldKey);
  } catch {
    return false;
  }
}
