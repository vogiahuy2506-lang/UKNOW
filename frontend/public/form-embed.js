/**
 * FounderAI Form Embed — nhúng biểu mẫu vào landing page qua khối cố định (PR-5):
 *
 *   <section data-founderai-form-section>
 *     <div data-founderai-form="PUBLIC_KEY"></div>
 *     <noscript><a href="ORIGIN/f/PUBLIC_KEY">Mở biểu mẫu</a></noscript>
 *     <script src="ORIGIN/form-embed.js" defer></script>
 *   </section>
 *
 * File tĩnh nạp thẳng bằng <script> (không qua bundler, không export ESM) — không dùng
 * import/export, phải chạy được trên trình duyệt thô của landing page khách.
 *
 * Origin của app lấy từ chính src của thẻ <script> này: document.currentScript, dự phòng
 * script[src$="form-embed.js"] vì `defer` khiến currentScript = null khi script chạy (HTML
 * parser đã xong) — cùng mẫu đã dùng ở founderai-capture.js.
 *
 * Ngữ cảnh origin rỗng (window.origin === 'null' — landing được xem qua iframe sandbox
 * KHÔNG allow-same-origin, vd route /lp/:slug hoặc theo host) → KHÔNG chèn iframe (iframe
 * form lồng bên trong sẽ kế thừa origin rỗng của cha, gọi API sẽ vỡ) — chỉ hiện nút mở tab
 * mới tới ORIGIN/f/KEY.
 *
 * Bảo mật resize qua postMessage: chỉ nhận khi event.origin === APP_ORIGIN, event.source
 * đúng contentWindow của iframe đã mount, và data.type/data.key khớp — chặn trang khác giả
 * tin nhắn để đổi chiều cao/can thiệp iframe.
 */
(function () {
  'use strict';

  function getScriptEl() {
    var el = document.currentScript;
    if (el && el.src) return el;
    var list = document.querySelectorAll('script[src$="form-embed.js"]');
    return list.length ? list[list.length - 1] : null;
  }

  var scriptEl = getScriptEl();
  var debug = !!(scriptEl && scriptEl.getAttribute('data-debug') === '1');

  function log() {
    if (!debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[form-embed]');
    console.log.apply(console, args);
  }

  function getAppOrigin() {
    if (!scriptEl || !scriptEl.src) return '';
    try {
      return new URL(scriptEl.src, window.location.href).origin;
    } catch (e) {
      return '';
    }
  }

  var APP_ORIGIN = getAppOrigin();

  function isOpaqueOrigin() {
    try {
      if (typeof window.origin === 'string') return window.origin === 'null';
    } catch (e) {
      return true;
    }
    try {
      return String(window.location.origin) === 'null';
    } catch (e) {
      return true;
    }
  }

  var FALLBACK_MIN_HEIGHT = 480;
  var HEIGHT_MIN_CLAMP = 200;
  var HEIGHT_MAX_CLAMP = 6000;

  // { key, iframe } — nhiều biểu mẫu/khoá có thể cùng nằm trên một trang.
  var mounted = [];

  function renderFallbackLink(container, key) {
    container.innerHTML = '';
    var a = document.createElement('a');
    a.href = APP_ORIGIN + '/f/' + encodeURIComponent(key);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Mở biểu mẫu';
    a.setAttribute('data-founderai-form-fallback-link', '');
    a.style.display = 'inline-block';
    a.style.padding = '10px 20px';
    a.style.background = '#111827';
    a.style.color = '#ffffff';
    a.style.borderRadius = '8px';
    a.style.textDecoration = 'none';
    a.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    container.appendChild(a);
  }

  function renderIframe(container, key) {
    container.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = APP_ORIGIN + '/f/' + encodeURIComponent(key) + '?embed=1';
    iframe.style.width = '100%';
    iframe.style.display = 'block';
    iframe.style.border = '0';
    iframe.style.minHeight = FALLBACK_MIN_HEIGHT + 'px';
    iframe.style.height = FALLBACK_MIN_HEIGHT + 'px';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.setAttribute('title', 'Biểu mẫu');
    container.appendChild(iframe);
    mounted.push({ key: key, iframe: iframe });
    return iframe;
  }

  function mount() {
    if (!APP_ORIGIN) {
      log('Không xác định được origin app (thiếu src của script) — bỏ qua mount()');
      return;
    }
    var containers = document.querySelectorAll('[data-founderai-form]:not([data-founderai-form-mounted])');
    for (var i = 0; i < containers.length; i++) {
      var container = containers[i];
      var key = (container.getAttribute('data-founderai-form') || '').trim();
      // Đánh dấu đã mount TRƯỚC khi dựng nội dung — dán khối 2 lần hoặc gọi mount() lại
      // (vd. sau khi chèn HTML muộn) không được tạo iframe thứ hai trong cùng container.
      container.setAttribute('data-founderai-form-mounted', '1');
      if (!key) {
        log('Bỏ qua container thiếu data-founderai-form key hợp lệ', container);
        continue;
      }
      if (isOpaqueOrigin()) {
        renderFallbackLink(container, key);
      } else {
        renderIframe(container, key);
      }
    }
  }

  function onMessage(event) {
    if (event.origin !== APP_ORIGIN) return;
    var data = event.data;
    if (!data || data.type !== 'founderai-form-resize') return;
    for (var i = 0; i < mounted.length; i++) {
      var entry = mounted[i];
      if (entry.key !== data.key) continue;
      if (event.source !== entry.iframe.contentWindow) continue;
      var h = Number(data.height);
      if (!isFinite(h)) continue;
      h = Math.max(HEIGHT_MIN_CLAMP, Math.min(HEIGHT_MAX_CLAMP, h));
      entry.iframe.style.height = h + 'px';
      break;
    }
  }

  window.addEventListener('message', onMessage);

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // Namespace công khai — cho phép trợ lý AI/chỉnh sửa landing chèn khối HTML muộn (sau khi
  // DOMContentLoaded đã qua) rồi tự gọi mount() để kích hoạt container mới thêm vào.
  window.FounderAIForms = window.FounderAIForms || {};
  window.FounderAIForms.mount = mount;

  ready(mount);
})();
