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
 */
import { isPrimaryAppHostname } from './isPrimaryAppHost.js';

const MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();

let loaded = false;

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
  // SPA: GA4 chỉ tự bắn page_view lúc tải trang đầu, đổi route không tính.
  // Tắt để `trackPageView` bắn theo từng route — nếu không sẽ mất gần hết lượt xem.
  gtag('config', MEASUREMENT_ID, { send_page_view: false });
}

export function trackPageView(path) {
  if (!loaded) return;
  gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(name, params = {}) {
  if (!loaded) return;
  gtag('event', name, params);
}
