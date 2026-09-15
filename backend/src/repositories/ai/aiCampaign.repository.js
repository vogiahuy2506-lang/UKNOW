import db from '../../config/database.js';

class AiCampaignRepository {
  /**
   * Sản phẩm cho trợ lý AI (thẻ chọn sản phẩm + danh sách tài nguyên trong prompt).
   *
   * Lọc `status = 'publish'`: bảng `courses` đồng bộ nguyên trạng thái từ WooCommerce nên có cả
   * `draft`, `pending`, `private`. Trước 25/08/2026 không lọc gì, nên thẻ chiến dịch mời người
   * dùng chạy quảng bá cho khoá NHÁP và khoá RIÊNG TƯ — kể cả mục "Wallet Topup" (private).
   * Đường tạo thủ công mặc định 'publish' (`courses/course.service.js:58`) nên không bị lọc nhầm.
   */
  async getCourses(userId) {
    const result = await db.query(
      `SELECT id, course_name AS name, course_code AS code, status
       FROM courses WHERE id_user = $1 AND status = 'publish'
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
         AND NOT EXISTS (
           SELECT 1 FROM topup_locked_resources tlr
           WHERE tlr.resource_key = 'zalo_accounts' AND tlr.resource_id = zalo_settings.id
         )
       ORDER BY is_default DESC, created_at DESC
       LIMIT 5`,
      [userId]
    );
    return result.rows;
  }

  async getZaloAccountsFull(userId) {
    const result = await db.query(
      `SELECT id, display_name, zalo_name, status, is_active, is_default
       FROM zalo_settings
       WHERE id_user = $1
         AND NOT EXISTS (
           SELECT 1 FROM topup_locked_resources tlr
           WHERE tlr.resource_key = 'zalo_accounts' AND tlr.resource_id = zalo_settings.id
         )
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async getActiveEmailSenders(userId) {
    const result = await db.query(
      `SELECT id, name, email, reply_to, status
       FROM email_settings
       WHERE id_user = $1 AND status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM topup_locked_resources tlr
           WHERE tlr.resource_key = 'email_accounts' AND tlr.resource_id = email_settings.id
         )
       ORDER BY name`,
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
         AND NOT EXISTS (
           SELECT 1 FROM topup_locked_resources tlr
           WHERE tlr.resource_key = 'zalo_accounts' AND tlr.resource_id = zalo_settings.id
         )
       ORDER BY is_default DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0]?.id ?? null;
  }

  async getZaloGroupsByAccountId(accountId) {
    try {
      const result = await db.query(
        `SELECT id, group_id, group_name, member_count
         FROM zalo_groups
         WHERE id_zalo_setting = $1
         ORDER BY member_count DESC
         LIMIT 10`,
        [accountId]
      );
      return result.rows;
    } catch (error) {
      if (error?.code === '42P01') return []; // Table doesn't exist
      throw error;
    }
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

  /**
   * PR-6c — danh sách Biểu mẫu của chủ workspace để trợ lý AI gợi ý `formId` cho node
   * `read_form_submissions` (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, "Bổ sung 15/09 khi
   * soạn lệnh PR-6c" mục 1). Chỉ form ĐÃ XUẤT BẢN và KHÔNG bị super admin tắt — form nháp/đã tắt
   * không nhận bài nộp nên đưa cho AI chỉ gây nhầm lẫn ("form-6c: chọn form chưa xuất bản → node
   * ra 0 người trong im lặng" — cùng lớp lỗi mà PR-6 gốc đã tránh cho landing).
   *
   * `consentedCount` đếm ĐÚNG điều kiện node thật sự dùng khi đọc (`marketing_consent IS TRUE AND
   * status <> 'cancelled'`, xem `form.repository.js` `listConsentedSubmissionsForCampaign`) — để
   * AI biết trước form có `consentEnabled=false` hay 0 bài đồng ý thì cảnh báo "node sẽ không có
   * ai" thay vì im lặng tạo node rỗng.
   *
   * @param {number} ownerId workspace_owner_id
   * @returns {Promise<Array<{ id: number, title: string, isPublished: boolean, consentEnabled: boolean, consentedCount: number }>>}
   */
  async getForms(ownerId) {
    const result = await db.query(
      `SELECT
         f.id,
         f.title,
         f.is_published,
         COALESCE((f.settings->>'consentEnabled')::boolean, false) AS consent_enabled,
         COUNT(s.id) FILTER (WHERE s.marketing_consent IS TRUE AND s.status <> 'cancelled')::int AS consented_count
       FROM forms f
       LEFT JOIN form_submissions s ON s.form_id = f.id
       WHERE f.workspace_owner_id = $1
         AND f.admin_disabled_at IS NULL
         AND f.is_published = TRUE
       GROUP BY f.id
       ORDER BY f.created_at DESC
       LIMIT 20`,
      [ownerId]
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
