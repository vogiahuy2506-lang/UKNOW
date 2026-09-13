import db from '../../config/database.js';

// Tổng quát hoá 13/09/2026 (PLAN_CANH_BAO_SAP_HET_HAN_GOI PR-2b, việc 6) — trước đây khoá cứng
// WELCOME_TEMPLATE_KEY='welcome', chỉ quản được một mẫu. Migration 206 đã nới CHECK cho
// 'plan_expiring'/'plan_expired'; 3 hàm dưới đây nhận templateKey làm tham số đầu để phục vụ cả
// ba, không chép file thứ hai khi thêm mẫu.
export async function findSystemEmailTemplate(templateKey, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT template_key, subject, body_html, updated_by, created_at, updated_at
     FROM system_email_templates
     WHERE template_key = $1
     LIMIT 1`,
    [templateKey]
  );
  return rows[0] || null;
}

export async function saveSystemEmailTemplate(templateKey, { subject, bodyHtml, updatedBy }, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO system_email_templates (template_key, subject, body_html, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (template_key) DO UPDATE SET
       subject = EXCLUDED.subject,
       body_html = EXCLUDED.body_html,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING template_key, subject, body_html, updated_by, created_at, updated_at`,
    [templateKey, subject, bodyHtml, updatedBy]
  );
  return rows[0];
}

export async function deleteSystemEmailTemplate(templateKey, queryable = db) {
  await queryable.query(
    'DELETE FROM system_email_templates WHERE template_key = $1',
    [templateKey]
  );
}

