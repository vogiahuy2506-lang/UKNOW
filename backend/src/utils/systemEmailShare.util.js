import { buildBaseTemplate, SENDER_NAME } from './systemEmail.util.js';

/**
 * Builder email thông báo khi owner share landing page với một email.
 * Tách thành file riêng (không nhét vào systemEmail.util.js) để test/đọc dễ —
 * file đó đã > 1250 dòng, đang cõng 10 builder khác.
 *
 * Hai nhánh:
 *   isExistingUser = true  → user đã có tài khoản. CTA: "Mở landing page".
 *   isExistingUser = false → user chưa có tài khoản. CTA: "Đăng nhập/Đăng ký".
 *
 * Tất cả biến đều qua escapeHtml() — chống XSS qua tên người gửi / tên page.
 */
export function buildLandingPageSharedEmail({
  senderName,
  landingPageTitle,
  landingPageUrl,
  shareType,
  recipientName = null,
  isExistingUser,
  frontendUrl = process.env.FRONTEND_URL || 'https://founderai.vn',
}) {
  const safeSender = escapeHtml(senderName || 'Một người dùng Founder AI');
  const safeTitle = escapeHtml(landingPageTitle || 'Landing page');
  const safeRecipient = recipientName ? escapeHtml(recipientName) : null;

  const shareTypeVi = shareType === 'edit' ? 'chỉnh sửa' : 'xem';
  const ctaUrl = isExistingUser
    ? `${frontendUrl}/app/settings/landing-pages?tab=shared`
    : `${frontendUrl}/login?email=${encodeURIComponent('')}`; // recipientEmail không có sẵn ở tầng util; sẽ patch qua tag
  // CTA fallback nếu không có recipient email sẵn → trỏ thẳng /login.

  const greeting = safeRecipient
    ? `Xin chào <strong style="color:#f97316">${safeRecipient}</strong>,`
    : 'Xin chào,';
  const introText = isExistingUser
    ? `<strong style="color:#f97316">${safeSender}</strong> vừa chia sẻ landing page <strong>«${safeTitle}»</strong> với bạn trên <strong>${escapeHtml(SENDER_NAME)}</strong> với quyền <strong>${shareTypeVi}</strong>.`
    : `<strong style="color:#f97316">${safeSender}</strong> muốn chia sẻ landing page <strong>«${safeTitle}»</strong> với bạn trên <strong>${escapeHtml(SENDER_NAME)}</strong> với quyền <strong>${shareTypeVi}</strong>. Đăng ký tài khoản (miễn phí) để xem nội dung này.`;
  const ctaLabel = isExistingUser ? 'Mở landing page →' : 'Đăng ký để xem →';

  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">${greeting}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">${introText}</p>

    ${landingPageUrl ? `
    <!-- Landing Page Preview Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Landing page</p>
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">${safeTitle}</p>
          <p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all">${escapeHtml(landingPageUrl)}</p>
        </td>
      </tr>
    </table>` : ''}

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${escapeHtml(ctaUrl)}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            ${ctaLabel}
          </a>
        </td>
      </tr>
    </table>

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn không nhận ra yêu cầu này, vui lòng bỏ qua email này.
    </p>
  `;

  const subject = isExistingUser
    ? `[${SENDER_NAME}] ${safeSender} đã chia sẻ landing page «${safeTitle}» với bạn`
    : `[${SENDER_NAME}] ${safeSender} muốn chia sẻ landing page «${safeTitle}» với bạn`;

  return {
    subject,
    html: buildBaseTemplate({
      subtitle: isExistingUser ? 'Chia sẻ landing page' : 'Lời mời xem landing page',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

/**
 * Builder email thông báo khi owner share campaign với một email.
 * Hai nhánh tương tự landing page:
 *   isExistingUser = true  → user đã có tài khoản. CTA: "Mở chiến dịch".
 *   isExistingUser = false → user chưa có tài khoản. CTA: "Đăng nhập/Đăng ký".
 *
 * canRun truyền riêng (chỉ campaign mới có): hiển thị badge "Có thể chạy chiến dịch".
 */
export function buildCampaignSharedEmail({
  senderName,
  campaignName,
  campaignUrl,
  shareType,
  canRun = false,
  recipientName = null,
  isExistingUser,
  frontendUrl = process.env.FRONTEND_URL || 'https://founderai.vn',
}) {
  const safeSender = escapeHtml(senderName || 'Một người dùng Founder AI');
  const safeTitle = escapeHtml(campaignName || 'Chiến dịch');
  const safeRecipient = recipientName ? escapeHtml(recipientName) : null;

  const shareTypeVi = shareType === 'edit' ? 'chỉnh sửa' : 'xem';
  const ctaUrl = isExistingUser
    ? `${frontendUrl}/app/campaigns?tab=shared`
    : `${frontendUrl}/login`;

  const greeting = safeRecipient
    ? `Xin chào <strong style="color:#f97316">${safeRecipient}</strong>,`
    : 'Xin chào,';
  const introText = isExistingUser
    ? `<strong style="color:#f97316">${safeSender}</strong> vừa chia sẻ chiến dịch <strong>«${safeTitle}»</strong> với bạn trên <strong>${escapeHtml(SENDER_NAME)}</strong> với quyền <strong>${shareTypeVi}</strong>${canRun ? ' và có thể <strong>chạy chiến dịch</strong>' : ''}.`
    : `<strong style="color:#f97316">${safeSender}</strong> muốn chia sẻ chiến dịch <strong>«${safeTitle}»</strong> với bạn trên <strong>${escapeHtml(SENDER_NAME)}</strong> với quyền <strong>${shareTypeVi}</strong>. Đăng ký tài khoản (miễn phí) để xem chi tiết chiến dịch này.`;
  const ctaLabel = isExistingUser ? 'Mở chiến dịch →' : 'Đăng ký để xem →';

  const canRunBadge = canRun
    ? `<span style="display:inline-block;background:#dcfce7;color:#166534;font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;margin-left:8px;vertical-align:middle">Có thể chạy</span>`
    : '';

  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">${greeting}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">${introText}</p>

    ${campaignName ? `
    <!-- Campaign Preview Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Chiến dịch</p>
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">${safeTitle}${canRunBadge}</p>
          ${campaignUrl ? `<p style="margin:0;font-size:13px;color:#6b7280;word-break:break-all">${escapeHtml(campaignUrl)}</p>` : ''}
        </td>
      </tr>
    </table>` : ''}

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${escapeHtml(ctaUrl)}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            ${ctaLabel}
          </a>
        </td>
      </tr>
    </table>

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn không nhận ra yêu cầu này, vui lòng bỏ qua email này.
    </p>
  `;

  const subject = isExistingUser
    ? `[${SENDER_NAME}] ${safeSender} đã chia sẻ chiến dịch «${safeTitle}» với bạn`
    : `[${SENDER_NAME}] ${safeSender} muốn chia sẻ chiến dịch «${safeTitle}» với bạn`;

  return {
    subject,
    html: buildBaseTemplate({
      subtitle: isExistingUser ? 'Chia sẻ chiến dịch' : 'Lời mời xem chiến dịch',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builder email thông báo khi owner share chatbot với một email (PR-3).
 *
 * Khác với landing page / campaign share:
 *   - Chatbot share dùng cơ chế CLONE — recipient nhận 1 bản sao hoàn chỉnh (toàn bộ config
 *     + chunks + embedding), không phải share truy cập.
 *   - Nên CTA luôn là "Mở chatbot" (user đã có tài khoản thì thấy ngay trong danh sách của
 *     họ) hoặc "Đăng ký để nhận" (user ngoài hệ thống).
 *   - Có thêm dòng phụ "Đã nhân bản thành công với tên X" nếu clone xong.
 */
export function buildChatbotSharedEmail({
  senderName,
  chatbotName,
  recipientName = null,
  isExistingUser,
  clonedChatbotName = null,
  frontendUrl = process.env.FRONTEND_URL || 'https://founderai.vn',
}) {
  const safeSender = escapeHtml(senderName || 'Một người dùng Founder AI');
  const safeTitle = escapeHtml(chatbotName || 'Chatbot');
  const safeRecipient = recipientName ? escapeHtml(recipientName) : null;

  const ctaUrl = isExistingUser
    ? `${frontendUrl}/app/chatbots`
    : `${frontendUrl}/login`;

  const greeting = safeRecipient
    ? `Xin chào <strong style="color:#f97316">${safeRecipient}</strong>,`
    : 'Xin chào,';
  const introText = isExistingUser
    ? `<strong style="color:#f97316">${safeSender}</strong> vừa chia sẻ chatbot <strong>«${safeTitle}»</strong> với bạn trên <strong>${escapeHtml(SENDER_NAME)}</strong>. Toàn bộ cấu hình, kịch bản và tri thức đã được nhân bản thành một bản sao riêng trong tài khoản của bạn — bạn có thể chỉnh sửa hoặc dùng ngay.`
    : `<strong style="color:#f97316">${safeSender}</strong> muốn chia sẻ chatbot <strong>«${safeTitle}»</strong> với bạn trên <strong>${escapeHtml(SENDER_NAME)}</strong>. Đăng ký tài khoản (miễn phí) để nhận bản sao chatbot này — toàn bộ cấu hình và tri thức sẽ được tự động nhân bản vào tài khoản của bạn ngay sau khi đăng ký.`;
  const ctaLabel = isExistingUser ? 'Mở chatbot →' : 'Đăng ký để nhận →';

  const clonedNote = isExistingUser && clonedChatbotName
    ? `<p style="margin:0 0 24px;font-size:14px;color:#16a34a;line-height:1.6">✓ Bản sao <strong>${escapeHtml(clonedChatbotName)}</strong> đã có trong tài khoản của bạn.</p>`
    : '';

  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">${greeting}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">${introText}</p>

    ${chatbotName ? `
    <!-- Chatbot Preview Card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Chatbot</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#111827">${safeTitle}</p>
        </td>
      </tr>
    </table>` : ''}

    ${clonedNote}

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${escapeHtml(ctaUrl)}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            ${ctaLabel}
          </a>
        </td>
      </tr>
    </table>

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn không nhận ra yêu cầu này, vui lòng bỏ qua email này.
    </p>
  `;

  const subject = isExistingUser
    ? `[${SENDER_NAME}] ${safeSender} đã chia sẻ chatbot «${safeTitle}» với bạn`
    : `[${SENDER_NAME}] ${safeSender} muốn chia sẻ chatbot «${safeTitle}» với bạn`;

  return {
    subject,
    html: buildBaseTemplate({
      subtitle: isExistingUser ? 'Chia sẻ chatbot' : 'Lời mời nhận chatbot',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

