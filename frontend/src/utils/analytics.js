/**
 * Google Analytics 4 — đo lưu lượng giai đoạn TRƯỚC đăng ký (nguồn truy cập,
 * trang nào dẫn tới đăng ký). Phễu trong `/admin/funnel` chỉ bắt đầu từ lúc
 * `USER_REGISTERED`, phần trước đó không có dữ liệu nào khác bù được.
 *
 * Hai điều kiện để bật, thiếu một là im lặng bỏ qua:
 * 1. Có `VITE_GA_MEASUREMENT_ID` — không set (dev/test) thì không nạp gì.
 * 2. Đang ở app chính — KHÔNG bao giờ nạp trên custom domain landing của khách:
 *    lưu lượng đó là của khách, trộn vào tài khoản GA của mình là sai cả về số
 *    liệu lẫn quyền riêng tư.
 *
 * URL gửi sang GA (page_path, page_location, page_referrer) luôn đi qua
 * `sanitizeAnalyticsUrl`: bỏ tham số mang bí mật/PII (token đặt lại mật khẩu, mã
 * mời, code/state OAuth, email…) và fragment mang token; giữ utm_* và tham số
 * thường. gtag mặc định gửi `document.location` nguyên văn theo MỌI sự kiện nên
 * vị trí đã lọc được `set` làm giá trị chung, không chỉ gắn vào page_view.
 */
import { isPrimaryAppHostname } from './isPrimaryAppHost.js';

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();

let loaded = false;

/** Tên tham số (không phân biệt hoa thường) không bao giờ được gửi sang GA. */
const SENSITIVE_PARAM_NAMES = new Set([
  'token',
  'invite',
  'code',
  'state',
  'access_token',
  'id_token',
  'refresh_token',
  'otp',
  'key',
  'secret',
  'signature',
  'sig',
  'password',
  'jwt',
  'auth',
  'apikey',
  'api_key',
  // PII — điều khoản GA cấm gửi (vd link mời `/register?email=`, `/login?username=`).
  'email',
  'phone',
  'username',
]);

/** Tên tham số chứa một trong các chuỗi này cũng bị bỏ (reset_token, client_secret…). */
const SENSITIVE_PARAM_SUBSTRINGS = ['token', 'secret', 'password', 'signature'];

/** Đoạn đường dẫn mang mã truy cập — thay bằng tên tham số route (App.jsx). */
const SENSITIVE_PATH_RULES = [[/^(\/f\/[^/]+\/s\/)[^/]+/, '$1:accessToken']];

function isSensitiveParamName(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return false;
  return SENSITIVE_PARAM_NAMES.has(key) || SENSITIVE_PARAM_SUBSTRINGS.some((part) => key.includes(part));
}

function decodeParamName(raw) {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/** Bỏ cặp key=value nhạy cảm, giữ nguyên văn (cả cách mã hoá) các cặp còn lại. */
function stripSensitiveParams(query) {
  return query
    .split('&')
    .filter((pair) => pair && !isSensitiveParamName(decodeParamName(pair.split('=')[0])))
    .join('&');
}

/** Fragment kiểu `#access_token=…&state=…` (OAuth implicit) hoặc có chữ token/secret → bỏ cả. */
function fragmentCarriesSecret(fragment) {
  const lowered = fragment.toLowerCase();
  if (SENSITIVE_PARAM_SUBSTRINGS.some((part) => lowered.includes(part))) return true;
  const keyPattern = /(?:^|[?&#;/!])([^=&?#;/!]+)=/g;
  let match;
  while ((match = keyPattern.exec(fragment)) !== null) {
    if (isSensitiveParamName(decodeParamName(match[1]))) return true;
  }
  return false;
}

/**
 * Lọc URL (tuyệt đối hoặc path + query) trước khi gửi sang GA.
 *
 * @param {string} value vd `window.location.href` hoặc `pathname + search`
 * @returns {string}
 */
export function sanitizeAnalyticsUrl(value) {
  const input = String(value ?? '');
  if (!input) return input;

  const hashIndex = input.indexOf('#');
  const beforeHash = hashIndex === -1 ? input : input.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : input.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const base = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1);

  const authority = (base.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i) || [''])[0];
  const origin = authority.replace(/\/\/[^/@]*@/, '//'); // bỏ user:pass@ nếu có
  const path = SENSITIVE_PATH_RULES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    base.slice(authority.length)
  );
  const keptQuery = query ? stripSensitiveParams(query) : '';
  const keptFragment = fragment && !fragmentCarriesSecret(fragment) ? fragment : '';

  return `${origin}${path}${keptQuery ? `?${keptQuery}` : ''}${keptFragment ? `#${keptFragment}` : ''}`;
}

/**
 * Vị trí đã lọc — ghi đè giá trị gtag tự lấy từ `document.location`. Referrer chỉ ghi đè khi
 * thật sự có phần bị lọc, còn lại để gtag xử lý như mặc định.
 */
function sanitizedPageContext() {
  const context = { page_location: sanitizeAnalyticsUrl(window.location.href) };
  const referrer = document.referrer;
  const safeReferrer = sanitizeAnalyticsUrl(referrer);
  if (referrer && safeReferrer !== referrer) context.page_referrer = safeReferrer;
  return context;
}

/** Snippet gtag chuẩn — dùng `arguments`, không đổi thành arrow function. */
function gtag() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(arguments);
}

export function analyticsEnabled() {
  return Boolean(MEASUREMENT_ID)
    && typeof window !== 'undefined'
    && isPrimaryAppHostname(window.location.hostname);
}

export function initAnalytics() {
  if (loaded || !analyticsEnabled()) return;
  loaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  const pageContext = sanitizedPageContext();
  gtag('set', pageContext);
  // SPA: GA4 chỉ tự bắn page_view lúc tải trang đầu, đổi route không tính.
  // Tắt để `trackPageView` bắn theo từng route — nếu không sẽ mất gần hết lượt xem.
  gtag('config', MEASUREMENT_ID, { send_page_view: false, ...pageContext });
}

export function trackPageView(path) {
  if (!loaded) return;
  const pageLocation = sanitizeAnalyticsUrl(window.location.href);
  gtag('set', { page_location: pageLocation });
  gtag('event', 'page_view', {
    page_path: sanitizeAnalyticsUrl(path),
    page_location: pageLocation,
    page_title: document.title,
  });
}

export function trackEvent(name, params = {}) {
  if (!loaded) return;
  gtag('event', name, params);
}
