/**
 * Render trang HTML rút lại đồng ý cho lead (song ngữ Việt - Anh).
 * Dùng chung cho cả leadService (200, 404) và leadUnsubscribeLimiter (429).
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.headingVi
 * @param {string} options.textVi
 * @param {string} options.headingEn
 * @param {string} options.textEn
 * @param {string} [options.privacyPolicyUrl]
 * @returns {string}
 */
export function renderLeadUnsubscribeHtml({
  title,
  headingVi,
  textVi,
  headingEn,
  textEn,
  privacyPolicyUrl,
}) {
  const fallbackPrivacyUrl =
    String(privacyPolicyUrl || "").trim() || "https://campaign.digiso.vn/privacy-policy";
  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
  .card{background:#fff;border-radius:8px;padding:28px;max-width:560px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  h1{font-size:22px;margin:0 0 8px 0;color:#1a1a1a}
  p{color:#555;font-size:15px;line-height:1.6;margin:0}
  .block{padding:12px 0}
  .block + .block{border-top:1px solid #e5e7eb}
  .lang-label{display:inline-block;font-size:12px;font-weight:700;color:#6b7280;margin-bottom:6px}
  .helper{margin-top:14px;font-size:13px;color:#6b7280}
  .helper a{color:#4b5563;text-decoration:underline}
</style>
</head>
<body>
  <div class="card">
    <div class="block">
      <span class="lang-label">Tiếng Việt</span>
      <h1>${headingVi}</h1>
      <p>${textVi}</p>
    </div>
    <div class="block">
      <span class="lang-label">English</span>
      <h1>${headingEn}</h1>
      <p>${textEn}</p>
    </div>
    <p class="helper">
      <a href="${fallbackPrivacyUrl}">Chính sách bảo mật / Privacy Policy</a>
    </p>
  </div>
</body>
</html>`;
}
