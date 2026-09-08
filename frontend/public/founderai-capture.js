/**
 * FounderAI Universal Capture Script — auto-capture form đăng ký tuỳ chỉnh.
 *
 * Hỗ trợ cả 2 dạng landing page:
 *   - Subdomain hệ thống (*.founderai.biz / *.uknow.vn)
 *   - Custom domain đã verified trong landing_page_domains
 *
 * Payload gửi lên backend gồm:
 *   - 3 trường mặc định: name, email, phone (+ landingPageSlug tự inject).
 *   - marketingConsent (Nghị định 330/2026): đọc từ input name="marketingConsent".
 *     true/false nếu form có field này (checkbox checked/unchecked), null nếu form
 *     không hỏi (không có field). KHÔNG dùng tên "cf_agree_checkbox" cho ô này — đó
 *     chỉ là ví dụ minh hoạ customFields tuỳ chọn, không được backend hiểu là consent.
 *   - Tuỳ chọn: customFields — gom từ mọi input có `name="cf_*"` (vd: name="cf_company_text").
 *     Backend whitelist theo schema của từng landing page (key phải khớp /^cf_[a-z0-9_]{4,40}$/
 *     và tồn tại trong form config). Field không khai báo trong form config sẽ bị BE từ chối.
 *
 * Cách dùng:
 *   <form data-founderai-capture>
 *     <input type="text" name="name" placeholder="Họ và tên" />
 *     <input type="email" name="email" placeholder="Email" />
 *     <input type="tel" name="phone" placeholder="Số điện thoại" />
 *     <label><input type="checkbox" name="marketingConsent" /> Tôi đồng ý nhận thông tin khuyến mãi</label>
 *     <input name="cf_company_text" placeholder="Công ty" />
 *     <select name="cf_size_select">
 *       <option value="1-10">1-10 nhân viên</option>
 *       <option value="11-50">11-50 nhân viên</option>
 *     </select>
 *     <button type="submit">Đăng ký</button>
 *   </form>
 *   <div class="founderai-capture-success" style="display:none">✓ Đăng ký thành công!</div>
 *   <div class="founderai-capture-error" style="display:none;color:red"></div>
 *   <script src="https://app.founderai.biz/founderai-capture.js"
 *           data-api-base="https://api.founderai.biz/api"
 *           data-slug="ten-landing"
 *           defer></script>
 *
 * Luồng xử lý:
 *   1. Auto-detect form: tìm <form data-founderai-capture> hoặc form đầu tiên khi data-auto="1".
 *   2. Inject hidden input `landingPageSlug`.
 *   3. Intercept submit → POST JSON tới `${apiBase}/public/leads`.
 *      Payload gồm 6 field: name, email, phone, landingPageSlug, marketingConsent, customFields.
 *   4. Nếu backend trả `successRedirect: { url, delayMs, openInNewTab }`,
 *      redirect sau khoảng delayMs (mở tab mới nếu openInNewTab=true).
 *   5. Fallback: nếu form có `.founderai-capture-success` / `.founderai-capture-error` → toggle.
 */
// ----------------------------------------------------------------
// Auto-map: input/select/textarea thiếu name → tự suy ra từ id / label[for] / placeholder.
// Lý do: nhiều landing dán HTML form mà admin chỉ đặt id + label (vd Tailwind template),
// backend cần name để ghi vào leads.name / leads.email / leads.phone. Hàm này chỉ gắn
// name khi CHƯA CÓ — không đè name user đặt sẵn.
// ----------------------------------------------------------------
var FOUNDERAI_AUTO_NAME_KEYS = {
  // common keys → input id / placeholder / label substring → name attribute suy ra
  name: ['name', 'fullname', 'ho', 'ten', 'hovaten', 'yourname', 'username'],
  email: ['email', 'e-mail', 'mail', 'gmail', 'youremail'],
  phone: ['phone', 'tel', 'mobile', 'sdt', 'dienthoai', 'zalo', 'sodienthoai', 'yourphone'],
  notes: ['notes', 'note', 'message', 'loinhan', 'ghichu', 'yeucau', 'comments', 'content'],
};
// Trường cf_ đi kèm slug tự sinh theo id (vd id="company" → cf_company).
var FOUNDERAI_AUTO_NAME_LABEL_RE = /(cong ty|company|ten cong ty|workplace)/i;

function normalizeAutoNameKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function inferAutoName(el, form) {
  if (!el || el.name) return null;
  var id = String(el.id || '').trim();
  var placeholder = String(el.placeholder || '').trim();
  var labelText = '';
  if (id) {
    var lbl = form.querySelector('label[for="' + id.replace(/"/g, '\\"') + '"]');
    if (lbl) labelText = String(lbl.textContent || '').trim();
  }
  // Ưu tiên: id > label > placeholder
  var candidates = [];
  if (id) candidates.push(id);
  if (labelText) candidates.push(labelText);
  if (placeholder) candidates.push(placeholder);

  for (var i = 0; i < candidates.length; i++) {
    var norm = normalizeAutoNameKey(candidates[i]);
    if (!norm) continue;
    for (var key in FOUNDERAI_AUTO_NAME_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(FOUNDERAI_AUTO_NAME_KEYS, key)) continue;
      var aliases = FOUNDERAI_AUTO_NAME_KEYS[key];
      for (var j = 0; j < aliases.length; j++) {
        if (norm === aliases[j] || norm.indexOf(aliases[j]) !== -1) {
          return key;
        }
      }
    }
    // Match custom field — id kiểu "company" hoặc label công ty.
    if (/^[a-z][a-z0-9_]{2,40}$/.test(norm)) {
      // Tránh các id hệ thống Tailwind không phải custom field.
      var blacklist = ['submit', 'submitbtn', 'workshopform', 'sessiondate', 'participants', 'experience'];
      if (blacklist.indexOf(norm) !== -1) return null;
      return 'cf_' + norm;
    }
  }
  return null;
}

function autoMapFormInputsByIdOrLabel(form) {
  if (!form) return;
  var fields = form.querySelectorAll('input, select, textarea');
  for (var i = 0; i < fields.length; i++) {
    var el = fields[i];
    if (el.name) continue;
    // Bỏ qua: button, submit, hidden đã có sẵn name, type=hidden không id.
    var type = String(el.type || '').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'reset') continue;
    var guessed = inferAutoName(el, form);
    if (guessed) el.name = guessed;
  }
}

// ----------------------------------------------------------------
// Payload builder — tách khỏi IIFE để test được bằng jsdom (không cần
// document.currentScript). IIFE bên dưới chỉ gọi buildFounderaiCapturePayload(form, config).
// ----------------------------------------------------------------
var FOUNDERAI_CUSTOM_FIELD_KEY_RE = /^cf_[a-z0-9_]{4,40}$/;

/**
 * Đọc trạng thái đồng ý marketing (Nghị định 330/2026) từ field name="marketingConsent".
 * 3 trạng thái: true (đã tick) / false (có checkbox nhưng không tick) / null (form không hỏi).
 *
 * @param {HTMLFormElement} form
 * @returns {boolean|null}
 */
function readFounderaiMarketingConsent(form) {
  var el = form.querySelector('[name="marketingConsent"]');
  if (!el) return null;
  if (el.type === 'checkbox') return !!el.checked;
  var v = String(el.value == null ? '' : el.value).trim().toLowerCase();
  if (!v) return null;
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * Đọc form data → payload cho backend.
 *   - name (họ và tên chung)
 *   - email
 *   - phone (optional)
 *   - landingPageSlug (từ config.slug)
 *   - marketingConsent: xem readFounderaiMarketingConsent
 *   - customFields: gom từ mọi input có name khớp /^cf_[a-z0-9_]{4,40}$/
 *     • input/select/textarea  → giá trị string đã trim
 *     • checkbox               → true (nếu checked) / false (nếu không — FormData bỏ qua khi uncheck)
 *     • radio (single checked) → value
 *     • select-multiple         → mảng string (BE nhận primitive qua `values`)
 *     Field không thuộc schema landing page sẽ bị backend từ chối (whitelist an toàn).
 *
 * @param {HTMLFormElement} form
 * @param {{ slug?: string }} config
 * @returns {object}
 */
function buildFounderaiCapturePayload(form, config) {
  var cfg = config || {};
  var slugValue = cfg.slug || '';
  var fd = new FormData(form);
  var name = '';
  var email = '';
  var phone = '';
  var customFields = {};

  // Duyệt FormData: phân biệt checkbox uncheck (FormData không chứa key) — cần quét DOM.
  // Lưu ý: nếu cùng key xuất hiện nhiều lần (vd: select-multiple, checkbox-group), ta gom mảng.
  fd.forEach(function (value, key) {
    var v = value == null ? '' : String(value);
    var k = String(key);
    var trimmed = v.trim();
    switch (k) {
      case 'name':
      case 'fullName':
      case 'full_name':
        if (!name && trimmed) name = trimmed;
        break;
      case 'email':
        email = trimmed.toLowerCase();
        break;
      case 'phone':
      case 'tel':
      case 'phoneNumber':
        phone = trimmed;
        break;
      // marketingConsent xử lý riêng qua readFounderaiMarketingConsent (cần phân biệt
      // null/false, FormData không đủ để phân biệt "không hỏi" và "hỏi nhưng bỏ trống").
    }

    if (FOUNDERAI_CUSTOM_FIELD_KEY_RE.test(k)) {
      if (Object.prototype.hasOwnProperty.call(customFields, k)) {
        // Đã có key này → gom thành mảng (select-multiple / checkbox-group).
        if (Array.isArray(customFields[k])) {
          customFields[k].push(trimmed);
        } else {
          customFields[k] = [customFields[k], trimmed];
        }
      } else {
        customFields[k] = trimmed;
      }
    }
  });

  // Bổ sung checkbox chưa check (FormData không có key khi uncheck).
  var cbNodes = form.querySelectorAll('input[type="checkbox"][name]');
  for (var i = 0; i < cbNodes.length; i++) {
    var cb = cbNodes[i];
    var cbKey = String(cb.name || '');
    if (!FOUNDERAI_CUSTOM_FIELD_KEY_RE.test(cbKey)) continue;
    // Checkbox đã có trong customFields → user checked, giữ true.
    if (Object.prototype.hasOwnProperty.call(customFields, cbKey)) {
      if (customFields[cbKey] === '' || customFields[cbKey] === 'on') {
        customFields[cbKey] = true;
      }
      continue;
    }
    // Checkbox không có trong FormData → uncheck, set false (kể cả schema checkbox không required).
    customFields[cbKey] = false;
  }

  // Nếu không có custom field nào → không gửi key rỗng (BE coi như {}).
  var hasCustom = Object.keys(customFields).length > 0;

  return {
    name: name,
    email: email,
    phone: phone,
    landingPageSlug: slugValue,
    marketingConsent: readFounderaiMarketingConsent(form),
    customFields: hasCustom ? customFields : undefined,
  };
}

// Hook test-only: cho phép Vitest/jsdom import file này và gọi thẳng hàm thuần, không
// phải giả lập document.currentScript. Vô hại trên trình duyệt thật (chỉ gắn thêm 1
// object nhỏ vào window, không ai gọi tới nếu không phải test).
if (typeof window !== 'undefined') {
  window.__founderaiCaptureTestHooks = {
    buildFounderaiCapturePayload: buildFounderaiCapturePayload,
    readFounderaiMarketingConsent: readFounderaiMarketingConsent,
  };
}

(function founderaiCaptureIife() {
  'use strict';

  var sc = document.currentScript;
  if (!sc) return;

  var apiBase = (sc.getAttribute('data-api-base') || '').replace(/\/+$/, '');
  // Gộp trường hợp .env trỏ `/api/api` → về `/api`.
  while (/\/api\/api$/i.test(apiBase)) {
    apiBase = apiBase.replace(/\/api\/api$/i, '/api');
  }
  var slug = (sc.getAttribute('data-slug') || '').trim().toLowerCase();
  // Mặc định bật auto mode khi landing page không có form data-founderai-capture
  // → capture form đầu tiên tìm được trong trang. Admin muốn TẮT có thể thêm
  // data-auto="0" vào <script>.
  var autoAttr = sc.getAttribute('data-auto');
  var autoMode = autoAttr !== '0';
  var debug = sc.getAttribute('data-debug') === '1';

  if (!apiBase || !slug) {
    if (debug) console.warn('[founderai-capture] Thiếu data-api-base hoặc data-slug');
    return;
  }

  function log() {
    if (!debug) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[founderai-capture]');
    console.log.apply(console, args);
  }

  // ----------------------------------------------------------------
  // 1. Tìm form cần capture
  // ----------------------------------------------------------------
  function findForms() {
    var explicit = document.querySelectorAll('form[data-founderai-capture]');
    if (explicit.length > 0) return Array.prototype.slice.call(explicit);
    if (autoMode) {
      var fallback = document.querySelector('form');
      return fallback ? [fallback] : [];
    }
    return [];
  }

  // ----------------------------------------------------------------
  // 2. Inject hidden input: landingPageSlug (bắt buộc để backend route lead)
  // ----------------------------------------------------------------
  function injectHiddenField(form, name, value) {
    if (!form || !name) return;
    if (form.querySelector('input[name="' + name + '"]')) return;
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value == null ? '' : String(value);
    form.appendChild(input);
  }

  // ----------------------------------------------------------------
  // 4. UI helpers: show success / error inline nếu user có sẵn markup
  // ----------------------------------------------------------------
  function findClosestByClass(form, className) {
    if (!form) return null;
    var parent = form.parentElement;
    while (parent && parent !== document.body) {
      var el = parent.querySelector('.' + className);
      if (el) return el;
      parent = parent.parentElement;
    }
    return form.parentElement ? form.parentElement.querySelector('.' + className) : null;
  }

  function showSuccess(form) {
    var ok = findClosestByClass(form, 'founderai-capture-success');
    if (ok) {
      ok.style.display = 'block';
      var err = findClosestByClass(form, 'founderai-capture-error');
      if (err) err.style.display = 'none';
    }
  }

  function showError(form, message) {
    var err = findClosestByClass(form, 'founderai-capture-error');
    if (err) {
      err.textContent = message || 'Có lỗi xảy ra. Vui lòng thử lại.';
      err.style.display = 'block';
      var ok = findClosestByClass(form, 'founderai-capture-success');
      if (ok) ok.style.display = 'none';
    }
  }

  // ----------------------------------------------------------------
  // 5. Submit handler — chạy trong capture phase để ưu tiên hơn handler
  // của user. Nếu form có custom submit đã preventDefault rồi thì vẫn gửi
  // request (vì đây là capture phase, sau này mới bubble đến handler kia).
  // Sau khi gửi thành công → gọi requestIdleCallback để chạy submit gốc
  // (nếu user vẫn muốn xử lý riêng phía client).
  // ----------------------------------------------------------------
  function handleSubmit(ev) {
    ev.preventDefault();
    ev.stopPropagation();

    var form = ev.currentTarget;
    var submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.founderaiCapturing = '1';
    }

    var payload = buildFounderaiCapturePayload(form, { slug: slug });
    log('payload', payload);

    if (!payload.email) {
      showError(form, 'Vui lòng nhập email hợp lệ.');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (!payload.name) {
      showError(form, 'Vui lòng nhập họ và tên.');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    fetch(apiBase + '/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
    })
      .then(function (resp) {
        return resp.text().then(function (text) {
          var body = null;
          if (text) {
            try { body = JSON.parse(text); } catch (e) { body = null; }
          }
          if (!resp.ok) {
            var msg = (body && body.message) ? body.message : ('HTTP ' + resp.status);
            throw new Error(msg);
          }
          return body || {};
        });
      })
      .then(function (body) {
        log('success', body);
        showSuccess(form);
        try { form.reset(); } catch (e) { /* ignore */ }

        var sr = body && body.successRedirect;
        if (sr && sr.url) {
          var delay = Math.max(0, Math.min(30000, Number(sr.delayMs) || 0));
          if (sr.openInNewTab) {
            // Mở tab mới — dùng anchor vẫn thuộc gesture submit nên ít bị chặn popup.
            var a = document.createElement('a');
            a.href = sr.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else {
            setTimeout(function () {
              window.location.href = sr.url;
            }, delay);
          }
        }
      })
      .catch(function (err) {
        log('error', err);
        showError(form, err && err.message ? err.message : null);
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  // ----------------------------------------------------------------
  // 6. Bind form
  // ----------------------------------------------------------------
  function bind() {
    var forms = findForms();
    if (forms.length === 0) {
      log('Không tìm thấy form nào để capture. Thêm <form data-founderai-capture> hoặc bật data-auto="1".');
      return;
    }
    forms.forEach(function (form) {
      // Bước 1: Auto-map inputs thiếu name (id/placeholder → suy ra name).
      // VD: <input id="fullName"> → tự gắn name="name"
      autoMapFormInputsByIdOrLabel(form);

      // Bước 2: Inject landingPageSlug.
      injectHiddenField(form, 'landingPageSlug', slug);

      // Bước 3: novalidate để tránh browser validation che mất error message ta tự show.
      form.setAttribute('novalidate', 'novalidate');

      // Bước 4: Capture submit — dùng capture phase (third param = true) để
      // chạy TRƯỚC mọi handler khác (kể cả inline onsubmit). Handler này đã
      // gọi preventDefault nên submit gốc không reload trang.
      form.addEventListener('submit', handleSubmit, true);
    });
    log('Bound', forms.length, 'form(s). Auto-mapped inputs: id/placeholder → name. Hỗ trợ customFields: input name="cf_*".');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
