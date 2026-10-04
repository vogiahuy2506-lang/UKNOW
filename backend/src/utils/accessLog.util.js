/**
 * Che bí mật trên URL trước khi ghi log truy cập.
 *
 * RA_SOAT_3_MAN H-04: `docker logs` có dòng `GET /api/ai/chatbot/inbox/stream?token=eyJ...` — JWT còn sống
 * tới 3 giờ nằm nguyên văn trong log. Luồng SSE mới dùng vé (`?ticket=`), nhưng bản FE cũ còn mở trong tab
 * vẫn gửi `?token=`, và vé cũng không nên nằm trong log. Che cả hai bất kể client nào gọi.
 */

/** Tham số query có thể mang bí mật. So khớp không phân biệt hoa thường. */
export const SENSITIVE_QUERY_PARAMS = [
  'token',
  'ticket',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
];

const SENSITIVE_QUERY_RE = new RegExp(
  `([?&])(${SENSITIVE_QUERY_PARAMS.join('|')})=([^&#\\s]*)`,
  'gi'
);

export const REDACTED_PLACEHOLDER = '[redacted]';

/**
 * @param {string|undefined|null} url
 * @returns {string}
 */
export function redactUrlSecrets(url) {
  if (url == null) return '';
  return String(url).replace(SENSITIVE_QUERY_RE, `$1$2=${REDACTED_PLACEHOLDER}`);
}

/**
 * Dựng middleware morgan (định dạng 'dev') nhưng token `:url` đã che bí mật.
 * Nhận `morganLib` để test truyền thư viện thật + `options.stream` mà không phụ thuộc app.js.
 *
 * @param {Function} morganLib   — `import morgan from 'morgan'`
 * @param {object} [options]     — tuỳ chọn morgan (vd `{ stream }`)
 */
export function createAccessLogMiddleware(morganLib, options = {}) {
  morganLib.token('url', (req) => redactUrlSecrets(req.originalUrl || req.url));
  return morganLib('dev', options);
}
