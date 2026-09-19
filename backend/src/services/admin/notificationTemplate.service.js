import repo from '../../repositories/admin/notificationTemplate.repository.js';
import notificationService from './notification.service.js';

/**
 * Service cho notification_templates.
 * MVP chi ho tro: create + list + dispatch (cron) + slugify tieng Viet.
 */

const SLUG_REGEX = /^[a-z0-9-]+$/;

const VALID_TYPES = new Set([
  'maintenance', 'announcement', 'promotion', 'warning', 'reminder', 'security',
]);

const VALID_RECURRENCE = new Set(['daily', 'weekly', 'monthly']);

/**
 * Slugify tieng Viet -> ASCII lowercase, gach ngang.
 * "Khuyến mãi T9" -> "khuyen-mai-t9"
 */
export function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bo dau
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Tu sinh slug duy nhat trong (type_key, slug). Neu trung thi them -2, -3...
 */
async function ensureUniqueSlug(typeKey, baseSlug) {
  let candidate = baseSlug || `template-${Date.now()}`;
  let n = 1;
  // Gioi han 50 lan de tranh loop vo han
  while (n < 50) {
    const existing = await repo.getByTypeAndSlug(typeKey, candidate);
    if (!existing) return candidate;
    n += 1;
    candidate = `${baseSlug}-${n}`;
  }
  throw new Error('Khong the sinh slug duy nhat');
}

function validateInput(input) {
  const errors = [];
  if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
    errors.push('name la bat buoc');
  } else if (input.name.length > 120) {
    errors.push('name toi da 120 ky tu');
  }

  if (!input.type_key || !VALID_TYPES.has(input.type_key)) {
    errors.push('type_key khong hop le');
  }

  if (!input.subject || typeof input.subject !== 'string' || input.subject.trim().length === 0) {
    errors.push('subject la bat buoc');
  } else if (input.subject.length > 200) {
    errors.push('subject toi da 200 ky tu');
  }

  if (!input.body_html || typeof input.body_html !== 'string' || input.body_html.trim().length === 0) {
    errors.push('body_html la bat buoc');
  }

  if (input.slug !== undefined && input.slug !== null && input.slug !== '') {
    if (!SLUG_REGEX.test(input.slug)) {
      errors.push('slug chi chua [a-z0-9-]');
    }
  }

  if (input.schedule_type !== undefined && !['now', 'scheduled', 'recurring'].includes(input.schedule_type)) {
    errors.push('schedule_type khong hop le');
  }

  if (input.recurrence_pattern !== undefined && input.recurrence_pattern !== null && input.recurrence_pattern !== '') {
    if (!VALID_RECURRENCE.has(input.recurrence_pattern)) {
      errors.push('recurrence_pattern khong hop le');
    }
  }

  return errors;
}

export async function createTemplate(input, actorId) {
  const errors = validateInput(input);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    throw err;
  }

  // Neu user tu truyen slug: giu nguyen de DB UNIQUE / service 409 bat.
  // Neu user KHONG truyen slug (auto-gen tu name): them -2, -3 neu trung.
  const userProvidedSlug = input.slug && input.slug.trim() !== '';
  const baseSlug = userProvidedSlug ? input.slug : slugify(input.name);
  let slug;
  if (userProvidedSlug) {
    slug = baseSlug;
  } else {
    slug = await ensureUniqueSlug(input.type_key, baseSlug);
  }

  // CHECK trung slug mot lan nua de phong race condition
  const duplicate = await repo.getByTypeAndSlug(input.type_key, slug);
  if (duplicate) {
    const err = new Error(`Slug "${slug}" da ton tai cho dang ${input.type_key}`);
    err.status = 409;
    err.code = 'slug_not_unique';
    throw err;
  }

  const template = await repo.create({
    type_key: input.type_key,
    slug,
    name: input.name.trim(),
    description: input.description || null,
    subject: input.subject.trim(),
    body_html: input.body_html,
    schedule_type: input.schedule_type || 'now',
    scheduled_at: input.scheduled_at || null,
    recurrence_pattern: input.recurrence_pattern || null,
    recurrence_end_date: input.recurrence_end_date || null,
    created_by: actorId || null,
  });

  return template;
}

export async function listTemplates(typeKey) {
  if (typeKey) {
    return repo.listByType(typeKey);
  }
  return repo.listAll();
}

export async function getTemplate(id) {
  return repo.getById(id);
}

/**
 * Build payload tu template va dispatch qua notificationService.sendDirect.
 * Targeting phai duoc truyen vao tu caller (FE modal chon nhom truoc khi goi).
 */
export async function dispatchTemplate(id, { targeting = {}, actorId } = {}) {
  const template = await repo.getById(id);
  if (!template) {
    const err = new Error('Khong tim thay mau');
    err.status = 404;
    throw err;
  }
  if (!template.is_active) {
    const err = new Error('Mau dang tam dung');
    err.status = 409;
    throw err;
  }

  return notificationService.sendDirect({
    type: template.type_key,
    title: template.subject,
    message: template.subject, // fallback neu message = subject
    html_content: template.body_html,
    metadata: { source: 'notification_template', template_id: template.id },
    priority: 'normal',
    ...targeting,
    created_by: actorId || template.created_by || null,
  });
}

/**
 * Worker tick: dispatch cac mau scheduled + recurring da den han.
 * Tra ve so luong xu ly.
 */
export async function processDueTemplates() {
  const now = new Date();
  const handled = [];

  // Scheduled - chi gui mot lan
  const dueScheduled = await repo.findDueScheduled(now);
  for (const tpl of dueScheduled) {
    try {
      // Targeting cho mau lich-dinh-kem: super admin phai set sau.
      // Hien tai mau chi co schedule, chua co targeting -> log skip.
      // Phase 2 se mo rong cho phep luu targeting kem mau.
      console.log(`[NotificationTemplate] Scheduled template #${tpl.id} den han, can targeting. Skip.`);
      await repo.markDispatched(tpl.id, null);
      handled.push({ id: tpl.id, action: 'skipped_no_targeting' });
    } catch (err) {
      console.error(`[NotificationTemplate] Loi xu ly scheduled #${tpl.id}:`, err.message);
    }
  }

  // Recurring
  const dueRecurring = await repo.findDueRecurring(now);
  for (const tpl of dueRecurring) {
    try {
      console.log(`[NotificationTemplate] Recurring template #${tpl.id} den han, can targeting. Skip.`);
      await repo.markDispatched(tpl.id, null);
      handled.push({ id: tpl.id, action: 'skipped_no_targeting' });
    } catch (err) {
      console.error(`[NotificationTemplate] Loi xu ly recurring #${tpl.id}:`, err.message);
    }
  }

  return { handled };
}

/**
 * Worker dispatch that su dung targeting da luu trong template.metadata.
 * Phase 2 - hien tai chua co cot targeting nen khong su dung.
 */
export async function dispatchWithSavedTargeting(template, actorId) {
  return notificationService.sendDirect({
    type: template.type_key,
    title: template.subject,
    message: template.subject,
    html_content: template.body_html,
    metadata: { source: 'notification_template', template_id: template.id },
    priority: 'normal',
    created_by: actorId || template.created_by || null,
  });
}

export default {
  slugify,
  createTemplate,
  listTemplates,
  getTemplate,
  dispatchTemplate,
  processDueTemplates,
};
