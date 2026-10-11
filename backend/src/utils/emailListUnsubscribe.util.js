/**
 * Header huỷ đăng ký một chạm cho email chiến dịch (PLAN_RA_SOAT_DOT3 PR-Q2 việc g, RFC 2369 + RFC 8058).
 *
 * Gmail / Yahoo (yêu cầu người gửi hàng loạt từ 2024) hiện nút "Huỷ đăng ký" ngay cạnh tên người gửi khi
 * thư có `List-Unsubscribe` + `List-Unsubscribe-Post`; thiếu header thì người nhận bấm "Báo spam" — hại
 * uy tín tên miền gửi nặng hơn nhiều so với một lượt huỷ đăng ký.
 *
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click` báo cho nhà cung cấp hộp thư rằng họ được phép
 * POST (body `List-Unsubscribe=One-Click`) thẳng vào URL huỷ đăng ký mà KHÔNG cần người nhận bấm xác nhận.
 * Endpoint `POST /api/customers/email-tracking/unsubscribe/:token` (PR-C1) xử lý mọi POST là đã xác nhận.
 */

/**
 * URL huỷ đăng ký theo token tracking — PHẢI trùng URL trong chân thư (`buildTrackedHtml`).
 *
 * @param {string} trackingBaseUrl gốc URL công khai (đã bỏ dấu `/` cuối)
 * @param {string} trackingToken
 * @returns {string}
 */
export function buildEmailUnsubscribeUrl(trackingBaseUrl, trackingToken) {
  const base = String(trackingBaseUrl || '').replace(/\/+$/, '');
  return `${base}/api/customers/email-tracking/unsubscribe/${trackingToken}`;
}

/**
 * Địa chỉ mailto huỷ đăng ký (tuỳ chọn). Chỉ dùng khi vận hành thật sự đọc hộp thư đó —
 * quảng bá một địa chỉ không ai xử lý còn tệ hơn không có. Env `EMAIL_UNSUBSCRIBE_MAILTO`.
 *
 * @param {string|undefined} [raw]
 * @returns {string|null}
 */
export function resolveUnsubscribeMailto(raw = process.env.EMAIL_UNSUBSCRIBE_MAILTO) {
  const value = String(raw || '').trim();
  if (!value || /[\s<>,"\r\n]/.test(value)) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return null;
  return value;
}

/**
 * Dựng header cho nodemailer.
 *
 * - `List-Unsubscribe`: `<mailto:...>` (nếu có) và `<https-url>`.
 * - `List-Unsubscribe-Post`: chỉ khi URL là HTTPS (RFC 8058 bắt buộc; môi trường dev http thì bỏ).
 *
 * @param {{ unsubscribeUrl: string, mailto?: string|null }} input
 * @returns {Record<string, string>} rỗng nếu không có URL hợp lệ
 */
export function buildListUnsubscribeHeaders({ unsubscribeUrl, mailto = resolveUnsubscribeMailto() }) {
  const url = String(unsubscribeUrl || '').trim();
  if (!/^https?:\/\/[^\s<>]+$/i.test(url)) return {};

  const targets = [];
  if (mailto) targets.push(`<mailto:${mailto}?subject=unsubscribe>`);
  targets.push(`<${url}>`);

  const headers = { 'List-Unsubscribe': targets.join(', ') };
  if (/^https:\/\//i.test(url)) {
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return headers;
}
