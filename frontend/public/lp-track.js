/**
 * Chèn vào HTML Gemini: bắt click thẻ <a href="http..."> và đi qua API tracking trước khi sang đích.
 *
 * Ví dụ:
 * <script src="https://your-frontend/lp-track.js" data-api-base="https://your-api/api" data-slug="ai" defer></script>
 *
 * Luồng: capture phase -> link http(s) -> chặn mặc định -> mở tab mới tới .../public/landing-track/go?... (hoặc giữ URL đã rewrite).
 */
(function landingTrackIife() {
  var sc = document.currentScript;
  if (!sc) return;
  var apiBase = (sc.getAttribute('data-api-base') || '').replace(/\/+$/, '');
  /** VPS hay .env đôi khi sinh `/api/api` — gộp về một `/api` để route `/public/landing-track/go` khớp backend. */
  while (/\/api\/api$/i.test(apiBase)) {
    apiBase = apiBase.replace(/\/api\/api$/i, '/api');
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

  document.addEventListener(
    'click',
    function (ev) {
      var el = ev.target;
      if (!el || !el.closest) return;
      var a = el.closest('a[href]');
      if (!a) return;
      var href = String(a.getAttribute('href') || '').trim();
      if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
      if (href.indexOf('http://') !== 0 && href.indexOf('https://') !== 0) return;
      ev.preventDefault();
      /** URL đã rewrite khi lưu CMS — chỉ mở tab mới, không bọc thêm query u=. Vẫn sửa /api/api nếu HTML cũ. */
      var finalUrl =
        href.indexOf('landing-track/go') !== -1
          ? fixDoubleApiSegment(href)
          : fixDoubleApiSegment(
              apiBase + '/public/landing-track/go?slug=' + encodeURIComponent(slug) + '&u=' + encodeURIComponent(href)
            );
      openUrlInNewTab(finalUrl);
    },
    true
  );

  /**
   * Form nhúng `/embed/lead-form` gửi chiều cao thật qua postMessage — chỉnh iframe để không bị scrollbar dọc.
   * Chỉ áp dụng khi `ev.source` trùng `contentWindow` của iframe có src chứa `embed/lead-form`.
   */
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'uknow-lp-embed-resize') return;
    var h = Number(d.height);
    if (!isFinite(h) || h < 80 || h > 25000) return;
    var iframes = document.getElementsByTagName('iframe');
    for (var i = 0; i < iframes.length; i++) {
      var f = iframes[i];
      var src = String(f.getAttribute('src') || '');
      if (src.indexOf('embed/lead-form') === -1) continue;
      try {
        if (f.contentWindow === ev.source) {
          f.style.height = Math.ceil(h) + 'px';
          f.style.overflow = 'hidden';
          break;
        }
      } catch (e) {}
    }
  });
})();
