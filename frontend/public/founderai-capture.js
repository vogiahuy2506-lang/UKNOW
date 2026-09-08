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
 *   1. Auto-detect form: tìm <form data-founderai-capture>, hoặc (auto mode, data-auto khác "0")
 *      form đầu tiên CÓ input name thuộc email/phone/tel/phoneNumber — form không có trường
 *      nào trong số này (tìm kiếm, khảo sát…) bị bỏ qua, không chiếm submit.
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
// Thứ tự khoá CỐ Ý: email/phone TRƯỚC name. Alias ngắn của name ('ho','ten') từng khớp
// nhầm SUBSTRING ở giữa các từ khác — 'ho' nằm trong "phone"/"telephone", 'ten' nằm trong
// "content"/"attendees" — khiến id="phone" tự gán name="name", mất số điện thoại (Lỗ 4,
// PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md, CẬP NHẬT 08/09 17:30). Kiểm email/phone
// trước thu hẹp phần lớn ca; phần còn lại do aliasMatchesAutoName xử lý (xem dưới).
// Bỏ khoá "notes": buildFounderaiCapturePayload không có field nào tên "notes" trong
// switch-case (chỉ name/email/phone + cf_* whitelisted) — gán tự động chỉ tạo field
// chết, không bao giờ vào payload.
var FOUNDERAI_AUTO_NAME_KEYS = {
  email: ['email', 'e-mail', 'mail', 'gmail', 'youremail'],
  phone: ['phone', 'tel', 'mobile', 'sdt', 'dienthoai', 'zalo', 'sodienthoai', 'yourphone'],
  name: ['name', 'fullname', 'ho', 'ten', 'hovaten', 'yourname', 'username'],
};

function normalizeAutoNameKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * So khớp id/label/placeholder đã chuẩn hoá (norm) với 1 alias.
 * Alias DÀI (> 3 ký tự — "phone", "email"…) vẫn khớp SUBSTRING ở bất kỳ vị trí — id kiểu
 * "yourPhoneNumber" hay "companyEmail" cần bắt được. Alias NGẮN (≤ 3 ký tự — "ho", "ten",
 * "tel", "sdt") CHỈ khớp khi bằng nhau hoặc đứng ĐẦU chuỗi: indexOf tự do từng khiến "ho"
 * lọt vào giữa "phone"/"telephone", "ten" lọt vào giữa "content"/"attendees" (Lỗ 4).
 *
 * @param {string} norm
 * @param {string} alias
 * @returns {boolean}
 */
function aliasMatchesAutoName(norm, alias) {
  if (alias.length <= 3) return norm === alias || norm.indexOf(alias) === 0;
  return norm.indexOf(alias) !== -1;
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
        if (aliasMatchesAutoName(norm, aliases[j])) {
          return key;
        }
      }
    }
    // KHÔNG tự sinh cf_<id> (xem Lỗ 5 trong README): backend (buildTrustedCustomFieldsSnapshot)
    // từ chối MỌI khoá cf_* không có trong cấu hình form của trang. Admin muốn trường thêm phải
    // tự đặt name="cf_..." đúng khoá khai báo trong Lead Form Config.
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

// Bộ tên input mà buildFounderaiCapturePayload đọc ra email/phone (xem switch-case ở trên:
// 'email' → payload.email, 'phone'/'tel'/'phoneNumber' → payload.phone).
var FOUNDERAI_AUTO_CAPTURE_NAME_KEYS = ['email', 'phone', 'tel', 'phoneNumber'];

/**
 * Hàm thuần: trong danh sách form ứng viên (auto mode — trang không có thẻ
 * data-founderai-capture tường minh), chọn form ĐẦU TIÊN có ít nhất một input mang
 * name thuộc FOUNDERAI_AUTO_CAPTURE_NAME_KEYS. Form không có trường nào trong số này
 * (form tìm kiếm, form khảo sát, form đăng ký workshop dùng tên khác…) không phải form
 * thu lead — auto mode trước đây bắt LUÔN form đầu tiên bất kể là gì, chiếm submit và
 * chặn khách với lỗi "Vui lòng nhập email hợp lệ" nếu form đó đứng trước form đăng ký thật.
 *
 * @param {HTMLFormElement[]|NodeList} forms
 * @returns {HTMLFormElement|null}
 */
function pickAutoCaptureForm(forms) {
  var list = Array.prototype.slice.call(forms || []);
  var selector = FOUNDERAI_AUTO_CAPTURE_NAME_KEYS.map(function (key) {
    return '[name="' + key + '"]';
  }).join(', ');
  for (var i = 0; i < list.length; i++) {
    var form = list[i];
    if (form && typeof form.querySelector === 'function' && form.querySelector(selector)) {
      return form;
    }
  }
  return null;
}

// Hook test-only: cho phép Vitest/jsdom import file này và gọi thẳng hàm thuần, không
// phải giả lập document.currentScript. Vô hại trên trình duyệt thật (chỉ gắn thêm 1
// object nhỏ vào window, không ai gọi tới nếu không phải test).
if (typeof window !== 'undefined') {
  window.__founderaiCaptureTestHooks = {
    buildFounderaiCapturePayload: buildFounderaiCapturePayload,
    readFounderaiMarketingConsent: readFounderaiMarketingConsent,
    autoMapFormInputsByIdOrLabel: autoMapFormInputsByIdOrLabel,
    pickAutoCaptureForm: pickAutoCaptureForm,
    inferAutoName: inferAutoName,
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
  // → capture form đầu tiên CÓ input email/phone/tel/phoneNumber (pickAutoCaptureForm).
  // Admin muốn TẮT có thể thêm data-auto="0" vào <script>.
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
      var picked = pickAutoCaptureForm(document.querySelectorAll('form'));
      return picked ? [picked] : [];
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
  // 4. UI helpers: show success / error inline nếu user có sẵn markup.
  // Tìm theo class (founderai-capture-success/error) HOẶC id thường gặp
  // trong template (successMessage, errorMessage, successDetails).
  // ----------------------------------------------------------------
  function findClosestByClassOrId(form, className, idName) {
    if (!form) return null;
    var parent = form.parentElement;
    while (parent && parent !== document.body) {
      var el = parent.querySelector('.' + className);
      if (el) return el;
      if (idName) {
        el = parent.querySelector('#' + idName);
        if (el) return el;
      }
      parent = parent.parentElement;
    }
    // Fallback: tìm trong form parent
    if (idName) {
      var fallback = form.parentElement ? form.parentElement.querySelector('#' + idName) : null;
      if (fallback) return fallback;
    }
    return form.parentElement ? form.parentElement.querySelector('.' + className) : null;
  }

  function showSuccess(form) {
    // Tìm success box — ưu tiên class, sau đó id="successMessage"
    var ok = findClosestByClassOrId(form, 'founderai-capture-success', 'successMessage');
    if (ok) {
      // Nếu tìm thấy bằng id → hiển thị (remove hidden class)
      if (ok.id === 'successMessage') {
        ok.classList.remove('hidden');
      } else {
        ok.style.display = 'block';
      }
      // Ẩn error box nếu có
      var err = findClosestByClassOrId(form, 'founderai-capture-error', 'errorMessage');
      if (err) {
        if (err.id === 'errorMessage') err.classList.add('hidden');
        else err.style.display = 'none';
      }
    }
  }

  function showError(form, message) {
    // Tìm error box — ưu tiên class, sau đó id="errorMessage"
    var err = findClosestByClassOrId(form, 'founderai-capture-error', 'errorMessage');
    if (err) {
      if (message) err.textContent = message;
      if (err.id === 'errorMessage') {
        err.classList.remove('hidden');
      } else {
        err.style.display = 'block';
      }
      // Ẩn success box nếu có
      var ok = findClosestByClassOrId(form, 'founderai-capture-success', 'successMessage');
      if (ok) {
        if (ok.id === 'successMessage') ok.classList.add('hidden');
        else ok.style.display = 'none';
      }
    }
  }

  // ----------------------------------------------------------------
  // 5. Submit handler — KHÔNG stopPropagation để custom handler của
  // admin vẫn chạy (hiển thị UI riêng như successMessage, loading…).
  // Chỉ preventDefault để chặn submit reload trang (form admin có
  // preventDefault rồi cũng OK — gọi 2 lần không sao).
  // ----------------------------------------------------------------
  function handleSubmit(ev) {
    // CHỈ preventDefault — KHÔNG stopPropagation, KHÔNG stopImmediatePropagation
    // để mọi custom submit handler phía admin vẫn bubble lên bình thường.
    if (ev.cancelable) ev.preventDefault();

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

        // Chỉ hiển thị success/error box của capture script nếu form KHÔNG có sẵn UI riêng.
        // VD: form có id="successMessage" (custom success) → giữ nguyên, không đụng.
        var hasCustomSuccess = form.parentElement && (
          form.parentElement.querySelector('#successMessage') ||
          form.parentElement.querySelector('.founderai-capture-success')
        );
        if (!hasCustomSuccess) {
          showSuccess(form);
          try { form.reset(); } catch (e) { /* ignore */ }
        }

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
