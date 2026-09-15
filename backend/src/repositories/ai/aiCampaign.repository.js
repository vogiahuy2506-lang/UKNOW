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

  /**
   * PR-5b-2b — kèm `form_id` (Biểu mẫu đã gắn landing qua PR-5b-2a `forms.landing_page_id`, chưa
   * bị super admin tắt) để AI biết landing nào nên sinh `read_form_submissions` thay vì
   * `read_landing_leads` khi soạn chiến dịch "gửi cho người đăng ký landing X".
   *
   * Review "Neo PR-5b-2b" — lọc trước đây `WHERE id_user = $1`, KHÔNG phải chủ workspace: landing
   * do nhân viên tạo ghi `id_user = workspaceOwnerId` (landingPageAdmin.service.js `create()`) nên
   * lọc theo `id_user` với `ownerId` (đã là workspace owner id ở call site) vẫn đúng cho landing
   * MỚI, nhưng landing cũ trước khi có cột `workspace_owner_id` (hoặc bị đổi chủ tay qua DB) có
   * thể lệch — `COALESCE(workspace_owner_id, id_user)` khớp đúng "chủ hiệu lực" mà chính bảng này
   * đã dùng cho index riêng (`idx_landing_pages_effective_workspace_owner`), không đoán tên cột.
   *
   * @param {number} userId workspace owner id
   * @returns {Promise<Array<{ slug: string, title: string, is_published: boolean, form_id: number|null }>>}
   */
  async getLandingPages(userId) {
    const result = await db.query(
      `SELECT
         lp.slug,
         COALESCE(lp.title, lp.slug) AS title,
         lp.is_published,
         f.id AS form_id
       FROM landing_pages lp
       LEFT JOIN forms f ON f.landing_page_id = lp.id AND f.admin_disabled_at IS NULL
       WHERE COALESCE(lp.workspace_owner_id, lp.id_user) = $1
       ORDER BY lp.updated_at DESC
       LIMIT 20`,
      [userId]
    );
    return result.rows;
  }

  /**
   * PR-5b-2b — formId của Biểu mẫu gắn landing có slug này (chưa bị super admin tắt), thuộc ĐÚNG
   * `ownerId`. `null` nếu landing không tồn tại/không thuộc `ownerId`/chưa có form gắn/form đã bị
   * tắt. Tách khỏi `getLandingPages` (LIMIT 20 — landing cũ hơn 20 trang gần nhất sẽ tra hụt).
   *
   * @param {number} ownerId workspace owner id
   * @param {string} slug
   * @returns {Promise<number|null>}
   */
  async getFormIdForLandingSlug(ownerId, slug) {
    const result = await db.query(
      `SELECT f.id
       FROM landing_pages lp
       JOIN forms f ON f.landing_page_id = lp.id
       WHERE lp.slug = $1
         AND COALESCE(lp.workspace_owner_id, lp.id_user) = $2
         AND f.admin_disabled_at IS NULL
       LIMIT 1`,
      [slug, ownerId]
    );
    const id = result.rows[0]?.id;
    return id != null ? Number(id) : null;
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

  /**
   * PR-6c review 15/09 — kiểm CHỈ quyền sở hữu formId, tách khỏi `getForms`. `getForms` cố ý hẹp
   * (chỉ form đã xuất bản, không bị tắt, LIMIT 20) vì phục vụ gợi ý trong prompt — dùng nó để
   * kiểm sở hữu ở `sanitizeFormOwnership` từng xoá nhầm formId hợp lệ của form nháp hoặc form thứ
   * 21 trở đi của ĐÚNG chủ workspace. Hàm này không lọc is_published/admin_disabled_at/LIMIT —
   * chỉ trả đúng những id trong `formIds` thực sự thuộc `ownerId`.
   *
   * @param {number} ownerId workspace_owner_id
   * @param {Array<number|string>} formIds
   * @returns {Promise<number[]>}
   */
  async getFormIdsOwnedBy(ownerId, formIds) {
    const ids = Array.from(
      new Set((Array.isArray(formIds) ? formIds : []).map((id) => Number(id)).filter(Number.isInteger))
    );
    if (ids.length === 0) return [];
    const result = await db.query(
      `SELECT id FROM forms WHERE workspace_owner_id = $1 AND id = ANY($2::bigint[])`,
      [ownerId, ids]
    );
    return result.rows.map((row) => Number(row.id));
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
