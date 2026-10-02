/**
 * Landing Page Tracker - Chỉ tracking views & clicks
 * 
 * Chức năng:
 * 1. Đếm VIEW khi page load
 * 2. Đếm CLICK khi user click link bên ngoài
 * 
 * KHÔNG xử lý form submission - form do user tự quản lý
 * 
 * Ví dụ:
 * <script src="https://your-frontend/lp-track.js" data-api-base="https://your-api/api" data-slug="ai" defer></script>
 */
(function landingTrackIife() {
  'use strict';

  var sc = document.currentScript;
  if (!sc) return;

  var apiBase = (sc.getAttribute('data-api-base') || '').replace(/\/+$/, '');
  /** VPS hay .env đôi khi sinh `/api/api` — gộp về một `/api` để route `/public/landing-track/go` khớp backend. */
  while (/\/api\/api$/i.test(apiBase)) {
    apiBase = apiBase.replace(/\/api\/api$/i, '/api');
  }
  if (apiBase.indexOf('://api.founderai.biz') !== -1) {
    apiBase = apiBase.replace('://api.founderai.biz', '://founderai.biz');
  }
  var slug = (sc.getAttribute('data-slug') || '').trim().toLowerCase();
  if (!apiBase || !slug) return;

  /**
   * Sửa chuỗi URL đã lưu khi CMS từng sinh nhầm `/api/api/` trong path.
   */
  function fixDoubleApiSegment(u) {
    var s = String(u || '');
    while (s.indexOf('/api/api/') !== -1) {
      s = s.replace(/\/api\/api\//g, '/api/');
    }
    return s;
  }

  /**
   * Mở URL trong tab mới, kèm noopener — vẫn thuộc gesture click nên ít bị chặn popup.
   */
  function openUrlInNewTab(url) {
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ============================================================
  // 1. VIEW TRACKING
  // ============================================================
  function trackView() {
    fetch(apiBase + '/public/landing-analytics/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug }),
    }).catch(function() {
      // Silently fail - không ảnh hưởng UX
    });
  }

  // ============================================================
  // 2. CLICK TRACKING - Đếm click động mà không làm biến dạng URL
  // ============================================================
  function trackClick(targetUrl) {
    try {
      var payload = JSON.stringify({ slug: slug, targetUrl: targetUrl });
      if (navigator.sendBeacon) {
        // Beacon luôn gửi kèm credentials; body form-urlencoded (Content-Type được CORS cho phép sẵn)
        // nên không cần preflight — API không cấp CORS kèm credentials cho origin landing.
        // Backend đọc body này qua express.urlencoded (app.js).
        var form = 'slug=' + encodeURIComponent(slug) + '&targetUrl=' + encodeURIComponent(targetUrl);
        var blob = new Blob([form], { type: 'application/x-www-form-urlencoded' });
        navigator.sendBeacon(apiBase + '/public/landing-analytics/click', blob);
      } else if (window.fetch) {
        fetch(apiBase + '/public/landing-analytics/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(function() {});
      }
    } catch (e) {
      // Silently fail - không ảnh hưởng UX
    }
  }

  document.addEventListener(
    'click',
    function (ev) {
      var el = ev.target;
      if (!el || !el.closest) return;

      var a = el.closest('a[href]');
      if (!a) return;

      // Hỗ trợ opt-out bằng data-no-track hoặc data-tracking="false"
      if (a.hasAttribute('data-no-track') || a.getAttribute('data-tracking') === 'false') return;

      var href = String(a.getAttribute('href') || '').trim();
      if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0 || href.indexOf('javascript:') === 0) return;
      if (href.indexOf('http://') !== 0 && href.indexOf('https://') !== 0) return;

      // Ghi nhận click tracking trong nền — không ngăn cản hay thay đổi hành vi mặc định của trình duyệt
      trackClick(href);
    },
    true
  );

  // ============================================================
  // KHỞI TẠO - Đếm view khi page load xong
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackView);
  } else {
    trackView();
  }
})();
