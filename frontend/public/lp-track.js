/**
 * Chèn vào HTML Gemini: bắt click thẻ <a href="http..."> và đi qua API tracking trước khi sang đích.
 * Đồng thời xử lý form submission lead capture: POST /api/public/leads + modal cảm ơn.
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

  /* ============================================================
   * FORM SUBMISSION: Lead capture → POST /api/public/leads
   * ============================================================ */

  /** Hiển thị modal cảm ơn sau khi submit form thành công. */
  function showThankYouModal() {
    // Inject keyframe animation once
    if (!document.getElementById('founder-modal-style')) {
      var style = document.createElement('style');
      style.id = 'founder-modal-style';
      style.textContent =
        '@keyframes founderFadeIn{from{opacity:0}to{opacity:1}}' +
        '@keyframes founderSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(style);
    }

    var overlay = document.createElement('div');
    overlay.setAttribute('data-founder-modal', '1');
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:rgba(0,0,0,0.55);z-index:99999;',
      'display:flex;align-items:center;justify-content:center;',
      'animation:founderFadeIn 0.22s ease;'
    ].join('');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:#fff;border-radius:20px;padding:40px 32px;',
      'max-width:400px;width:90%;text-align:center;',
      'box-shadow:0 25px 60px rgba(0,0,0,0.22);',
      'animation:founderSlideUp 0.28s ease;'
    ].join('');

    box.innerHTML = [
      '<div style="font-size:52px;margin-bottom:12px">🎉</div>',
      '<h2 style="font-size:20px;font-weight:700;color:#1e293b;margin:0 0 10px 0">Đăng ký thành công!</h2>',
      '<p style="color:#64748b;font-size:14px;line-height:1.7;margin:0 0 8px 0">',
      'Cảm ơn bạn đã quan tâm! Chúng tôi đã ghi nhận thông tin của bạn.',
      '</p>',
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 24px 0">',
      'Một email xác nhận sẽ được gửi tới bạn trong thời gian sớm nhất.',
      '</p>',
      '<button id="founder-modal-close-btn" style="',
      'background:#ee7518;color:#fff;border:none;border-radius:10px;',
      'padding:12px 32px;font-size:14px;font-weight:600;cursor:pointer;',
      'transition:background 0.2s;">Đóng</button>'
    ].join('');

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function closeModal() {
      overlay.remove();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    box.querySelector('#founder-modal-close-btn').addEventListener('click', closeModal);
  }

  /** Hiện thông báo lỗi dưới nút submit của form. */
  function showFormError(form, message) {
    var prev = form.querySelector('[data-founder-form-error]');
    if (prev) prev.remove();
    var el = document.createElement('p');
    el.setAttribute('data-founder-form-error', '1');
    el.textContent = message || 'Có lỗi xảy ra. Vui lòng thử lại.';
    el.style.cssText = 'color:#ef4444;font-size:13px;margin-top:8px;text-align:center;';
    var btn = form.querySelector('[type=submit], button');
    if (btn && btn.parentNode) {
      btn.parentNode.insertBefore(el, btn.nextSibling);
    } else {
      form.appendChild(el);
    }
  }

  /** Đọc giá trị các trường lead từ form. */
  function collectLeadData(form) {
    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? (el.value || '').trim() : '';
    }
    var consent = form.querySelector('[name="marketingConsent"]');
    return {
      firstName: val('firstName'),
      lastName: val('lastName'),
      email: val('email'),
      phone: val('phone'),
      occupation: val('occupation'),
      interestArea: val('interestArea'),
      // Nếu không có checkbox thì mặc định true (việc submit form = đồng ý)
      marketingConsent: consent ? consent.checked : true,
      landingPageSlug: slug,
    };
  }

  /** Gắn listener submit vào tất cả form lead trên trang. */
  function attachLeadFormListeners() {
    var forms = document.querySelectorAll('form');
    forms.forEach(function (form) {
      // Bỏ qua form không có email input (không phải lead form)
      var hasEmail = form.querySelector('input[type=email], input[name=email]');
      var isMarked = form.hasAttribute('data-lp-lead-form');
      if (!hasEmail && !isMarked) return;

      // Xóa inline onsubmit (alert cũ) để tránh xung đột
      form.onsubmit = null;

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation();

        var data = collectLeadData(form);
        var submitBtn = form.querySelector('[type=submit], button[type=submit], button:not([type])');
        var origText = submitBtn ? submitBtn.textContent : '';

        // Xóa lỗi cũ
        var prevErr = form.querySelector('[data-founder-form-error]');
        if (prevErr) prevErr.remove();

        // Loading state
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Đang gửi...';
        }

        var xhr = new XMLHttpRequest();
        xhr.open('POST', apiBase + '/public/leads');
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.onload = function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
          var res;
          try {
            res = JSON.parse(xhr.responseText);
          } catch (e) {
            res = {};
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            showThankYouModal();
            form.reset();
          } else {
            showFormError(form, res.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
          }
        };

        xhr.onerror = function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
          showFormError(form, 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
        };

        xhr.send(JSON.stringify(data));
      });
    });
  }

  // Gắn listeners sau khi DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachLeadFormListeners);
  } else {
    attachLeadFormListeners();
  }
})();
