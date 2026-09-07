/**
 * Sinh snippet HTML form lead để user copy dán vào landing page (hoặc AI chat gắn vào).
 *
 * Đặc tả:
 * - 3 trường khoá cứng: Họ tên (lastName + firstName / gộp thành `fullName` nếu single line), Email, SĐT.
 *   Theo test backend (/api/public/leads): cần `lastName` + `firstName` riêng → snippet gửi 2 input ẩn/hiển
 *   tuỳ `singleNameField`.
 * - Submit qua fetch POST JSON đến `${apiBase}/public/leads` (cùng endpoint iframe dùng).
 * - CORS đã mở cho `/api/public/leads` qua dynamicCors middleware.
 * - Custom style qua `theme` (primary, accent, bg, text, radius).
 * - Không chèn <script>, không CSS global — style inline để tránh xung đột với landing page.
 *
 * @param {object} opts
 * @param {string} opts.slug                  Slug landing page (gửi qua `landingPageSlug`).
 * @param {string} opts.apiBase               Gốc API, vd `https://api.uknow.vn/api` (đã chuẩn hoá).
 * @param {string} [opts.formId='uknow-lead-form']  id form để tránh xung đột khi nhúng nhiều form.
 * @param {'split'|'single'} [opts.nameMode='split']  `split` = 2 ô (Họ/Tên); `single` = 1 ô (Họ và tên) gửi lastName=firstName.
 * @param {object} [opts.theme]  { primary, accent, bg, text, border, radius, buttonText }
 * @returns {string} HTML string.
 */
export function buildLeadFormHtmlSnippet({
  slug,
  apiBase,
  formId = 'uknow-lead-form',
  nameMode = 'split',
  theme = {},
} = {}) {
  const safeSlug = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const safeApiBase = String(apiBase || '').trim().replace(/\/+$/, '');
  if (!safeSlug || !safeApiBase) return '';

  const primary = theme.primary || '#f97316';
  const accent = theme.accent || '#ea580c';
  const bg = theme.bg || '#ffffff';
  const text = theme.text || '#1f2937';
  const border = theme.border || '#e5e7eb';
  const radius = Number.isFinite(Number(theme.radius)) ? `${theme.radius}px` : '12px';
  const buttonText = theme.buttonText || 'Đăng ký ngay →';
  const titleText = theme.titleText || 'Đăng ký nhận tư vấn';
  const subtitleText = theme.subtitleText || 'Điền thông tin — đội ngũ sẽ liên hệ bạn trong 24h.';

  const cardStyle = `background:${bg};color:${text};border:1px solid ${border};border-radius:${radius};padding:24px;max-width:430px;width:100%;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.06);`;
  const labelStyle = `display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:${text};`;
  const inputStyle = `width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid ${border};border-radius:${radius};font-size:14px;color:${text};background:#fafafa;outline:none;`;
  const buttonStyle = `width:100%;padding:12px 16px;border:0;border-radius:${radius};background:linear-gradient(135deg,${primary},${accent});color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-top:8px;`;
  const msgStyle = `margin-top:10px;font-size:13px;display:none;`;
  const okMsgStyle = `${msgStyle}color:${primary};`;
  const errMsgStyle = `${msgStyle}color:#dc2626;`;

  const nameFields = nameMode === 'single'
    ? `<label style="${labelStyle}">Họ và tên <span style="color:#dc2626">*</span></label>
       <input type="text" name="fullName" required style="${inputStyle}" placeholder="Nguyễn Văn A" />`
    : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
         <div>
           <label style="${labelStyle}">Họ <span style="color:#dc2626">*</span></label>
           <input type="text" name="lastName" required style="${inputStyle}" placeholder="Nguyễn" />
         </div>
         <div>
           <label style="${labelStyle}">Tên <span style="color:#dc2626">*</span></label>
           <input type="text" name="firstName" required style="${inputStyle}" placeholder="Văn A" />
         </div>
       </div>`;

  return `<form id="${formId}" data-uknow-lead-form data-slug="${safeSlug}" data-api-base="${safeApiBase}" style="${cardStyle}">
  <h3 style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:${text}">${escapeHtml(titleText)}</h3>
  <p style="margin:0 0 16px 0;font-size:13px;color:${text};opacity:0.75">${escapeHtml(subtitleText)}</p>
  <div style="display:flex;flex-direction:column;gap:10px">
    ${nameFields}
    <div>
      <label style="${labelStyle}">Email <span style="color:#dc2626">*</span></label>
      <input type="email" name="email" required style="${inputStyle}" placeholder="ban@example.com" />
    </div>
    <div>
      <label style="${labelStyle}">Số điện thoại <span style="color:#dc2626">*</span></label>
      <input type="tel" name="phone" required pattern="[0-9+\\s\\-]{8,15}" style="${inputStyle}" placeholder="0901234567" />
    </div>
    <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:${text};opacity:0.85">
      <input type="checkbox" name="marketingConsent" required checked style="margin-top:2px" />
      <span>Tôi đồng ý nhận thông tin từ Founder AI.</span>
    </label>
  </div>
  <button type="submit" style="${buttonStyle}">${escapeHtml(buttonText)}</button>
  <p id="${formId}-ok" style="${okMsgStyle}">✓ Đăng ký thành công — chúng tôi sẽ liên hệ bạn.</p>
  <p id="${formId}-err" style="${errMsgStyle}"></p>
</form>
<script>
(function(){
  var f = document.getElementById('${formId}');
  if (!f || f.__uknowBound) return;
  f.__uknowBound = true;
  var ok = document.getElementById('${formId}-ok');
  var err = document.getElementById('${formId}-err');
  var btn = f.querySelector('button[type=submit]');
  f.addEventListener('submit', function(ev){
    ev.preventDefault();
    err.style.display = 'none'; ok.style.display = 'none';
    var fd = new FormData(f);
    var fullName = (fd.get('fullName') || '').toString().trim();
    var lastName = (fd.get('lastName') || '').toString().trim();
    var firstName = (fd.get('firstName') || '').toString().trim();
    if (fullName && !lastName && !firstName) {
      var parts = fullName.split(/\\s+/);
      lastName = parts.slice(0, -1).join(' ') || parts[0] || '';
      firstName = parts.slice(-1)[0] || '';
    }
    var payload = {
      slug: f.getAttribute('data-slug'),
      apiBase: f.getAttribute('data-api-base'),
      landingPageSlug: f.getAttribute('data-slug'),
      lastName: lastName,
      firstName: firstName,
      email: (fd.get('email') || '').toString().trim(),
      phone: (fd.get('phone') || '').toString().trim(),
      marketingConsent: fd.get('marketingConsent') === 'on'
    };
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = 'Đang gửi…';
    fetch(payload.apiBase + '/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: payload.lastName,
        firstName: payload.firstName,
        email: payload.email,
        phone: payload.phone,
        marketingConsent: payload.marketingConsent,
        landingPageSlug: payload.landingPageSlug
      })
    }).then(function(r){
      if (!r.ok) return r.json().then(function(j){ throw new Error((j && j.message) || ('HTTP ' + r.status)); });
      return r.json().catch(function(){ return {}; });
    }).then(function(){
      f.reset();
      ok.style.display = 'block';
    }).catch(function(e){
      err.textContent = (e && e.message) ? e.message : 'Có lỗi xảy ra, vui lòng thử lại.';
      err.style.display = 'block';
    }).then(function(){
      btn.disabled = false;
      btn.textContent = oldText;
    });
  });
})();
</script>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
