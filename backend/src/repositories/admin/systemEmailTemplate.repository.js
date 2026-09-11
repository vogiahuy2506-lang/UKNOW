import db from '../../config/database.js';

const WELCOME_TEMPLATE_KEY = 'welcome';

export async function findWelcomeEmailTemplate(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT template_key, subject, body_html, updated_by, created_at, updated_at
     FROM system_email_templates
     WHERE template_key = $1
     LIMIT 1`,
    [WELCOME_TEMPLATE_KEY]
  );
  return rows[0] || null;
}

export async function saveWelcomeEmailTemplate({ subject, bodyHtml, updatedBy }, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO system_email_templates (template_key, subject, body_html, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (template_key) DO UPDATE SET
       subject = EXCLUDED.subject,
       body_html = EXCLUDED.body_html,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING template_key, subject, body_html, updated_by, created_at, updated_at`,
    [WELCOME_TEMPLATE_KEY, subject, bodyHtml, updatedBy]
  );
  return rows[0];
}

export async function deleteWelcomeEmailTemplate(queryable = db) {
  await queryable.query(
    'DELETE FROM system_email_templates WHERE template_key = $1',
    [WELCOME_TEMPLATE_KEY]
  );
}

