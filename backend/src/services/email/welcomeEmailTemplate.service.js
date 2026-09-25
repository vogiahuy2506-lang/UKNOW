import sanitizeHtml from 'sanitize-html';
import {
  buildWelcomeEmail,
  buildRenewalReminderEmail,
  buildPlanExpiredEmail,
  buildEmployeeInvitationEmail,
  getDefaultWelcomeEmailTemplate,
  getDefaultPlanExpiringEmailTemplate,
  getDefaultPlanExpiredEmailTemplate,
  getDefaultEmployeeInvitationTemplate,
  sendSystemEmail,
} from '../../utils/systemEmail.util.js';
import {
  deleteSystemEmailTemplate,
  findSystemEmailTemplate,
  saveSystemEmailTemplate,
} from '../../repositories/admin/systemEmailTemplate.repository.js';

export const WELCOME_EMAIL_VARIABLES = Object.freeze([
  'user_name',
  'user_email',
  'plan_name',
  'plan_section',
  'login_url',
  'sender_name',
  'support_email',
  'docs_url',
]);

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — biến cho hai mẫu mới, danh sách
// RIÊNG với welcome (không dùng chung một danh sách cho cả ba, dù nội dung hai mẫu này hôm nay
// trùng nhau — để lệch nhau về sau không phải sửa cấu trúc).
const PLAN_EXPIRING_EMAIL_VARIABLES = Object.freeze([
  'user_name', 'plan_name', 'expires_at', 'days_left', 'grace_days',
  'upgrade_url', 'sender_name', 'support_email',
]);
const PLAN_EXPIRED_EMAIL_VARIABLES = Object.freeze([
  'user_name', 'plan_name', 'expires_at', 'days_left', 'grace_days',
  'upgrade_url', 'sender_name', 'support_email',
]);
const EMPLOYEE_INVITATION_VARIABLES = Object.freeze([
  'owner_name', 'user_email', 'activation_url', 'expiry_hours',
  'sender_name', 'support_email',
]);

/**
 * Nguồn sự thật duy nhất cho khoá mẫu thư hợp lệ + danh sách biến mỗi khoá.
 * `SYSTEM_EMAIL_TEMPLATE_KEYS` (Object.keys của map này) là whitelist mà route
 * adminSystemEmailTemplate.routes.js dùng để validate `:templateKey` — đổi map này thì whitelist
 * route tự cập nhật, không có nơi thứ hai để quên.
 */
export const SYSTEM_EMAIL_TEMPLATE_VARIABLES = Object.freeze({
  welcome: WELCOME_EMAIL_VARIABLES,
  plan_expiring: PLAN_EXPIRING_EMAIL_VARIABLES,
  plan_expired: PLAN_EXPIRED_EMAIL_VARIABLES,
  employee_invitation: EMPLOYEE_INVITATION_VARIABLES,
});

export const SYSTEM_EMAIL_TEMPLATE_KEYS = Object.freeze(Object.keys(SYSTEM_EMAIL_TEMPLATE_VARIABLES));

const DEFAULT_TEMPLATE_GETTERS = Object.freeze({
  welcome: getDefaultWelcomeEmailTemplate,
  plan_expiring: getDefaultPlanExpiringEmailTemplate,
  plan_expired: getDefaultPlanExpiredEmailTemplate,
  employee_invitation: getDefaultEmployeeInvitationTemplate,
});

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 100_000;
const VARIABLE_RE = /{{\s*([a-z_]+)\s*}}/gi;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function sanitizeBodyHtml(value) {
  return sanitizeHtml(value, {
    allowedTags: [
      'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
      'hr', 'i', 'img', 'li', 'ol', 'p', 'span', 'strong', 'table', 'tbody', 'td',
      'th', 'thead', 'tr', 'u', 'ul',
    ],
    allowedAttributes: {
      '*': ['align', 'class', 'height', 'style', 'title', 'width'],
      a: ['href', 'rel', 'target', 'title', 'style'],
      img: ['alt', 'height', 'src', 'style', 'title', 'width'],
      table: ['border', 'cellpadding', 'cellspacing', 'role', 'style', 'width'],
      td: ['align', 'colspan', 'rowspan', 'style', 'valign', 'width'],
      th: ['align', 'colspan', 'rowspan', 'style', 'valign', 'width'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  });
}

function assertSupportedVariables(templateKey, subject, bodyHtml) {
  const allowed = SYSTEM_EMAIL_TEMPLATE_VARIABLES[templateKey] || [];
  const unsupported = new Set();
  for (const value of [subject, bodyHtml]) {
    for (const match of String(value || '').matchAll(VARIABLE_RE)) {
      if (!allowed.includes(match[1].toLowerCase())) {
        unsupported.add(match[1]);
      }
    }
  }
  if (unsupported.size > 0) {
    throw badRequest(`Biến không được hỗ trợ: ${Array.from(unsupported).join(', ')}`);
  }
}

/**
 * @param {'welcome'|'plan_expiring'|'plan_expired'} templateKey
 * @param {{subject?: string, bodyHtml?: string}} input
 * @returns {{subject: string, bodyHtml: string}}
 */
export function normalizeSystemEmailTemplate(templateKey, input) {
  const rawSubject = String(input?.subject || '').replace(/[\r\n]+/g, ' ').trim();
  const rawBodyHtml = String(input?.bodyHtml || '').trim();

  if (!rawSubject) throw badRequest('Tiêu đề email không được để trống');
  if (rawSubject.length > MAX_SUBJECT_LENGTH) {
    throw badRequest(`Tiêu đề email không được quá ${MAX_SUBJECT_LENGTH} ký tự`);
  }
  if (!rawBodyHtml) throw badRequest('Nội dung email không được để trống');
  if (rawBodyHtml.length > MAX_BODY_LENGTH) {
    throw badRequest(`Nội dung email không được quá ${MAX_BODY_LENGTH} ký tự`);
  }

  assertSupportedVariables(templateKey, rawSubject, rawBodyHtml);
  const bodyHtml = sanitizeBodyHtml(rawBodyHtml).trim();
  if (!bodyHtml) throw badRequest('Nội dung email không hợp lệ');

  return { subject: rawSubject, bodyHtml };
}

function toTemplateDto(templateKey, row) {
  if (!row) {
    const getDefault = DEFAULT_TEMPLATE_GETTERS[templateKey];
    return {
      ...(getDefault ? getDefault() : { subject: '', bodyHtml: '' }),
      isCustomized: false,
      updatedBy: null,
      updatedAt: null,
    };
  }
  return {
    subject: row.subject,
    bodyHtml: row.body_html,
    isCustomized: true,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function getSystemEmailTemplate(templateKey) {
  return toTemplateDto(templateKey, await findSystemEmailTemplate(templateKey));
}

export async function updateSystemEmailTemplate(templateKey, input, actorUserId) {
  const normalized = normalizeSystemEmailTemplate(templateKey, input);
  const row = await saveSystemEmailTemplate(templateKey, {
    ...normalized,
    updatedBy: actorUserId,
  });
  return toTemplateDto(templateKey, row);
}

export async function resetSystemEmailTemplate(templateKey) {
  await deleteSystemEmailTemplate(templateKey);
  return toTemplateDto(templateKey, null);
}

// Dữ liệu mẫu cho xem trước — welcome giữ đúng dữ liệu cũ (previewWelcomeEmailTemplate trước
// đây), hai khoá mới dùng dữ liệu hư cấu tương tự cho nhất quán.
const PREVIEW_SAMPLE_DATA = Object.freeze({
  welcome: () => ({
    fullName: 'Nguyễn Minh Anh',
    email: 'minhanh@example.com',
    planName: 'Dùng thử',
    loginUrl: 'https://founderai.biz/login',
  }),
  plan_expiring: () => ({
    fullName: 'Nguyễn Minh Anh',
    planName: 'Chuyên nghiệp',
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    daysLeft: 3,
    renewalUrl: 'https://founderai.biz/app/billing',
  }),
  plan_expired: () => ({
    fullName: 'Nguyễn Minh Anh',
    planName: 'Chuyên nghiệp',
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    renewalUrl: 'https://founderai.biz/app/billing',
  }),
  employee_invitation: () => ({
    ownerName: 'Admin Nhóm',
    email: 'nhanvien.moi@example.com',
    activationUrl: 'https://founderai.biz/register?email=nhanvien.moi%40example.com&invite=sample_invitation_token',
    expiryHours: 48,
  }),
});

const PREVIEW_BUILDERS = Object.freeze({
  welcome: (template, sample) => buildWelcomeEmail({ ...sample, template }),
  plan_expiring: (template, sample) => buildRenewalReminderEmail({ ...sample, template }),
  plan_expired: (template, sample) => buildPlanExpiredEmail({ ...sample, template }),
  employee_invitation: (template, sample) => buildEmployeeInvitationEmail({ ...sample, template }),
});

export function previewSystemEmailTemplate(templateKey, input) {
  const template = normalizeSystemEmailTemplate(templateKey, input);
  const sample = PREVIEW_SAMPLE_DATA[templateKey]();
  return PREVIEW_BUILDERS[templateKey](template, sample);
}

// ─── Backward-compat cho luồng welcome hiện có ─────────────────────────────────
// KHÔNG đổi tên hay chữ ký các hàm dưới đây — auth.controller.js:227/:586 gọi thẳng
// sendWelcomeEmail() trong luồng đăng ký (register + googleLogin lần đầu); hỏng chỗ này là hỏng
// cửa vào sản phẩm. Test hiện có (auth.welcomeEmail.spec.js, welcomeEmailTemplate.service.spec.js)
// cũng import theo tên cũ. Mọi hàm dưới đây chỉ ủy quyền sang bản tổng quát ở trên.

export function normalizeWelcomeEmailTemplate(input) {
  return normalizeSystemEmailTemplate('welcome', input);
}

export async function getWelcomeEmailTemplate() {
  return getSystemEmailTemplate('welcome');
}

export async function updateWelcomeEmailTemplate(input, actorUserId) {
  return updateSystemEmailTemplate('welcome', input, actorUserId);
}

export async function resetWelcomeEmailTemplate() {
  return resetSystemEmailTemplate('welcome');
}

export function previewWelcomeEmailTemplate(input) {
  return previewSystemEmailTemplate('welcome', input);
}

/**
 * Tải mẫu tuỳ chỉnh từ DB cho một khoá, chuẩn hoá lại (sanitize + kiểm biến) trước khi dùng để
 * gửi thật. Lỗi migration chưa chạy hay DB tạm lỗi KHÔNG được chặn gửi — trả null, caller tự
 * ngã về nội dung cứng. Đây là đường dùng chung cho cả ba khoá; trước PR-2b logic này nằm thẳng
 * trong sendWelcomeEmail(), giờ tách ra để scheduler.js/subscriptionExpiry.service.js dùng lại
 * cho plan_expiring/plan_expired.
 *
 * @param {'welcome'|'plan_expiring'|'plan_expired'} templateKey
 * @returns {Promise<{subject: string, bodyHtml: string}|null>}
 */
export async function loadCustomSystemEmailTemplate(templateKey) {
  try {
    const row = await findSystemEmailTemplate(templateKey);
    if (!row) return null;
    return normalizeSystemEmailTemplate(templateKey, {
      subject: row.subject,
      bodyHtml: row.body_html,
    });
  } catch (error) {
    console.warn(
      `[SystemEmailTemplate] Could not load custom template for "${templateKey}", using default:`,
      error.message
    );
    return null;
  }
}

/**
 * Resolve the latest template and send asynchronously from the registration
 * flow. A missing migration or temporary DB failure must not suppress the
 * welcome email: fall back to the code default and let SMTP decide the result.
 */
export async function sendWelcomeEmail({ to, fullName, planName = null, loginUrl }) {
  const template = await loadCustomSystemEmailTemplate('welcome');
  const rendered = buildWelcomeEmail({
    fullName,
    email: to,
    planName,
    loginUrl,
    template,
  });
  return sendSystemEmail({ to, subject: rendered.subject, html: rendered.html });
}
