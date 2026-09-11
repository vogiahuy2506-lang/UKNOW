import sanitizeHtml from 'sanitize-html';
import {
  buildWelcomeEmail,
  getDefaultWelcomeEmailTemplate,
  sendSystemEmail,
} from '../../utils/systemEmail.util.js';
import {
  deleteWelcomeEmailTemplate,
  findWelcomeEmailTemplate,
  saveWelcomeEmailTemplate,
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

function assertSupportedVariables(subject, bodyHtml) {
  const unsupported = new Set();
  for (const value of [subject, bodyHtml]) {
    for (const match of String(value || '').matchAll(VARIABLE_RE)) {
      if (!WELCOME_EMAIL_VARIABLES.includes(match[1].toLowerCase())) {
        unsupported.add(match[1]);
      }
    }
  }
  if (unsupported.size > 0) {
    throw badRequest(`Biến không được hỗ trợ: ${Array.from(unsupported).join(', ')}`);
  }
}

export function normalizeWelcomeEmailTemplate(input) {
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

  assertSupportedVariables(rawSubject, rawBodyHtml);
  const bodyHtml = sanitizeBodyHtml(rawBodyHtml).trim();
  if (!bodyHtml) throw badRequest('Nội dung email không hợp lệ');

  return { subject: rawSubject, bodyHtml };
}

function toTemplateDto(row) {
  if (!row) {
    return {
      ...getDefaultWelcomeEmailTemplate(),
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

export async function getWelcomeEmailTemplate() {
  return toTemplateDto(await findWelcomeEmailTemplate());
}

export async function updateWelcomeEmailTemplate(input, actorUserId) {
  const normalized = normalizeWelcomeEmailTemplate(input);
  const row = await saveWelcomeEmailTemplate({
    ...normalized,
    updatedBy: actorUserId,
  });
  return toTemplateDto(row);
}

export async function resetWelcomeEmailTemplate() {
  await deleteWelcomeEmailTemplate();
  return toTemplateDto(null);
}

export function previewWelcomeEmailTemplate(input) {
  const template = normalizeWelcomeEmailTemplate(input);
  return buildWelcomeEmail({
    fullName: 'Nguyễn Minh Anh',
    email: 'minhanh@example.com',
    planName: 'Dùng thử',
    loginUrl: 'https://founderai.biz/login',
    template,
  });
}

/**
 * Resolve the latest template and send asynchronously from the registration
 * flow. A missing migration or temporary DB failure must not suppress the
 * welcome email: fall back to the code default and let SMTP decide the result.
 */
export async function sendWelcomeEmail({ to, fullName, planName = null, loginUrl }) {
  let template = null;
  try {
    const row = await findWelcomeEmailTemplate();
    if (row) {
      template = normalizeWelcomeEmailTemplate({
        subject: row.subject,
        bodyHtml: row.body_html,
      });
    }
  } catch (error) {
    console.warn('[WelcomeEmail] Could not load custom template, using default:', error.message);
  }

  const rendered = buildWelcomeEmail({
    fullName,
    email: to,
    planName,
    loginUrl,
    template,
  });
  return sendSystemEmail({ to, subject: rendered.subject, html: rendered.html });
}
