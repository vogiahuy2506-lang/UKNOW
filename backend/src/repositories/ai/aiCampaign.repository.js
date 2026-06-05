import db from '../../config/database.js';

class AiCampaignRepository {
  async getCourses(userId) {
    const result = await db.query(
      `SELECT id, course_name AS name, course_code AS code, status
       FROM courses WHERE id_user = $1
       ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    return result.rows;
  }

  async getEmailTemplates(userId) {
    const result = await db.query(
      `SELECT id, template_name, subject, category
       FROM email_templates
       WHERE id_user = $1 AND is_active = true
       ORDER BY usage_count DESC, created_at DESC
       LIMIT 10`,
      [userId]
    );
    return result.rows;
  }

  async getZaloAccounts(userId) {
    const result = await db.query(
      `SELECT id, display_name, zalo_name, status
       FROM zalo_settings
       WHERE id_user = $1 AND status = 'connected'
       ORDER BY is_default DESC, created_at DESC
       LIMIT 5`,
      [userId]
    );
    return result.rows;
  }

  async getZaloTemplates(userId) {
    const result = await db.query(
      `SELECT id, template_name, template_code, body_text, category
       FROM zalo_templates
       WHERE id_user = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );
    return result.rows;
  }

  async getDefaultZaloAccountId(userId) {
    const result = await db.query(
      `SELECT id FROM zalo_settings
       WHERE id_user = $1 AND status = 'connected'
       ORDER BY is_default DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.id ?? null;
  }

  async getZaloGroupsByAccountId(accountId) {
    const result = await db.query(
      `SELECT id, group_id, group_name, member_count
       FROM zalo_groups
       WHERE id_zalo_setting = $1
       ORDER BY member_count DESC
       LIMIT 10`,
      [accountId]
    );
    return result.rows;
  }

  async getLandingPages(userId) {
    const result = await db.query(
      `SELECT slug, COALESCE(title, slug) AS title, is_published
       FROM landing_pages
       WHERE id_user = $1
       ORDER BY updated_at DESC
       LIMIT 20`,
      [userId]
    );
    return result.rows;
  }

  async getCustomerStatTotal(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as total FROM customers WHERE id_user = $1`,
      [userId]
    );
    return result.rows[0];
  }

  async getCustomerStatEmail(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM customers
       WHERE id_user = $1 AND email IS NOT NULL AND email <> ''`,
      [userId]
    );
    return result.rows[0];
  }

  async getCustomerStatZalo(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM customers
       WHERE id_user = $1 AND (zalo_id IS NOT NULL OR zalo_phone IS NOT NULL)`,
      [userId]
    );
    return result.rows[0];
  }

  async getCustomerStatPhone(userId) {
    const result = await db.query(
      `SELECT COUNT(*) as count FROM customers
       WHERE id_user = $1 AND phone IS NOT NULL AND phone <> ''`,
      [userId]
    );
    return result.rows[0];
  }
}

export default new AiCampaignRepository();
