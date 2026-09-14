import db from '../config/database.js';

class FormRepository {
  /**
   * Lấy danh sách biểu mẫu theo workspace_owner_id kèm số bài nộp.
   *
   * @param {number} workspaceOwnerId
   * @returns {Promise<Array<object>>}
   */
  async listFormsByOwner(workspaceOwnerId) {
    const result = await db.query(
      `SELECT
         f.id,
         f.workspace_owner_id AS "workspaceOwnerId",
         f.created_by_user_id AS "createdByUserId",
         f.public_key AS "publicKey",
         f.title,
         f.description,
         f.fields,
         f.settings,
         f.theme,
         f.booking_config AS "bookingConfig",
         f.payment_config AS "paymentConfig",
         f.is_published AS "isPublished",
         f.admin_disabled_at AS "adminDisabledAt",
         f.created_at AS "createdAt",
         f.updated_at AS "updatedAt",
         COUNT(s.id)::int AS "submissionCount"
       FROM forms f
       LEFT JOIN form_submissions s ON s.form_id = f.id
       WHERE f.workspace_owner_id = $1
       GROUP BY f.id
       ORDER BY f.created_at DESC`,
      [workspaceOwnerId]
    );
    return result.rows;
  }

  /**
   * Tìm form theo ID và workspace_owner_id.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @returns {Promise<object|null>}
   */
  async findFormByIdAndOwner(id, workspaceOwnerId) {
    const result = await db.query(
      `SELECT
         f.id,
         f.workspace_owner_id AS "workspaceOwnerId",
         f.created_by_user_id AS "createdByUserId",
         f.public_key AS "publicKey",
         f.title,
         f.description,
         f.fields,
         f.settings,
         f.theme,
         f.booking_config AS "bookingConfig",
         f.payment_config AS "paymentConfig",
         f.is_published AS "isPublished",
         f.admin_disabled_at AS "adminDisabledAt",
         f.created_at AS "createdAt",
         f.updated_at AS "updatedAt",
         COUNT(s.id)::int AS "submissionCount"
       FROM forms f
       LEFT JOIN form_submissions s ON s.form_id = f.id
       WHERE f.id = $1 AND f.workspace_owner_id = $2
       GROUP BY f.id`,
      [id, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Tìm form theo public_key (dùng cho route public).
   * Kèm thông tin gói dịch vụ của workspace_owner để kiểm tra hạn dùng.
   *
   * @param {string} publicKey
   * @returns {Promise<object|null>}
   */
  async findFormByPublicKey(publicKey) {
    const result = await db.query(
      `SELECT
         f.id,
         f.workspace_owner_id AS "workspaceOwnerId",
         f.created_by_user_id AS "createdByUserId",
         f.public_key AS "publicKey",
         f.title,
         f.description,
         f.fields,
         f.settings,
         f.theme,
         f.booking_config AS "bookingConfig",
         f.payment_config AS "paymentConfig",
         f.is_published AS "isPublished",
         f.admin_disabled_at AS "adminDisabledAt",
         f.created_at AS "createdAt",
         f.updated_at AS "updatedAt",
         u.email AS "ownerEmail",
         u.active_plan_id AS "ownerActivePlanId",
         u.subscription_expires_at AS "ownerSubscriptionExpiresAt",
         COALESCE(p.grace_period_days, 0)::int AS "ownerGracePeriodDays"
       FROM forms f
       JOIN users u ON u.id = f.workspace_owner_id
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE f.public_key = $1
       LIMIT 1`,
      [publicKey]
    );
    return result.rows[0] || null;
  }

  /**
   * Tạo biểu mẫu mới.
   *
   * @param {object} params
   * @returns {Promise<object>}
   */
  async createForm({
    workspaceOwnerId,
    createdByUserId,
    publicKey,
    title,
    description = null,
    fields = [],
    settings = {},
  }) {
    const result = await db.query(
      `INSERT INTO forms (
         workspace_owner_id,
         created_by_user_id,
         public_key,
         title,
         description,
         fields,
         settings,
         is_published
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       RETURNING
         id,
         workspace_owner_id AS "workspaceOwnerId",
         created_by_user_id AS "createdByUserId",
         public_key AS "publicKey",
         title,
         description,
         fields,
         settings,
         theme,
         booking_config AS "bookingConfig",
         payment_config AS "paymentConfig",
         is_published AS "isPublished",
         admin_disabled_at AS "adminDisabledAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        workspaceOwnerId,
        createdByUserId,
        publicKey,
        title,
        description,
        JSON.stringify(fields),
        JSON.stringify(settings),
      ]
    );
    return result.rows[0];
  }

  /**
   * Cập nhật biểu mẫu.
   * CHỈ cập nhật: title, description, fields, settings.
   * Bỏ qua hoàn toàn booking_config, payment_config, theme, admin_disabled_at.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {object} params
   * @returns {Promise<object|null>}
   */
  async updateForm(id, workspaceOwnerId, { title, description, fields, settings }) {
    const fieldsToSet = [];
    const values = [id, workspaceOwnerId];
    let idx = 3;

    if (title !== undefined) {
      fieldsToSet.push(`title = $${idx}`);
      values.push(title);
      idx += 1;
    }
    if (description !== undefined) {
      fieldsToSet.push(`description = $${idx}`);
      values.push(description);
      idx += 1;
    }
    if (fields !== undefined) {
      fieldsToSet.push(`fields = $${idx}`);
      values.push(JSON.stringify(fields));
      idx += 1;
    }
    if (settings !== undefined) {
      fieldsToSet.push(`settings = $${idx}`);
      values.push(JSON.stringify(settings));
      idx += 1;
    }

    fieldsToSet.push('updated_at = NOW()');

    const result = await db.query(
      `UPDATE forms
       SET ${fieldsToSet.join(', ')}
       WHERE id = $1 AND workspace_owner_id = $2
       RETURNING
         id,
         workspace_owner_id AS "workspaceOwnerId",
         created_by_user_id AS "createdByUserId",
         public_key AS "publicKey",
         title,
         description,
         fields,
         settings,
         theme,
         booking_config AS "bookingConfig",
         payment_config AS "paymentConfig",
         is_published AS "isPublished",
         admin_disabled_at AS "adminDisabledAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Cập nhật trạng thái xuất bản của form.
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {boolean} isPublished
   * @returns {Promise<object|null>}
   */
  async updateFormPublish(id, workspaceOwnerId, isPublished) {
    const result = await db.query(
      `UPDATE forms
       SET is_published = $3, updated_at = NOW()
       WHERE id = $1 AND workspace_owner_id = $2
       RETURNING
         id,
         workspace_owner_id AS "workspaceOwnerId",
         created_by_user_id AS "createdByUserId",
         public_key AS "publicKey",
         title,
         description,
         fields,
         settings,
         theme,
         booking_config AS "bookingConfig",
         payment_config AS "paymentConfig",
         is_published AS "isPublished",
         admin_disabled_at AS "adminDisabledAt",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [id, workspaceOwnerId, Boolean(isPublished)]
    );
    return result.rows[0] || null;
  }

  /**
   * Xoá cứng biểu mẫu và các bài nộp liên quan (cascade).
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @returns {Promise<boolean>}
   */
  async deleteForm(id, workspaceOwnerId) {
    const result = await db.query(
      `DELETE FROM forms
       WHERE id = $1 AND workspace_owner_id = $2
       RETURNING id`,
      [id, workspaceOwnerId]
    );
    return result.rowCount > 0;
  }

  /**
   * Tạo bài nộp mới.
   *
   * @param {object} params
   * @returns {Promise<object>}
   */
  async createSubmission({
    formId,
    workspaceOwnerId,
    accessToken,
    answers = {},
    respondentName = null,
    respondentEmail = null,
    respondentPhone = null,
    marketingConsent = null,
    status = 'submitted',
    submitterIpHash = null,
  }) {
    const result = await db.query(
      `INSERT INTO form_submissions (
         form_id,
         workspace_owner_id,
         access_token,
         answers,
         respondent_name,
         respondent_email,
         respondent_phone,
         marketing_consent,
         status,
         submitter_ip_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING
         id,
         form_id AS "formId",
         workspace_owner_id AS "workspaceOwnerId",
         access_token AS "accessToken",
         answers,
         respondent_name AS "respondentName",
         respondent_email AS "respondentEmail",
         respondent_phone AS "respondentPhone",
         marketing_consent AS "marketingConsent",
         status,
         submitter_ip_hash AS "submitterIpHash",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        formId,
        workspaceOwnerId,
        accessToken,
        JSON.stringify(answers),
        respondentName,
        respondentEmail,
        respondentPhone,
        marketingConsent,
        status,
        submitterIpHash,
      ]
    );
    return result.rows[0];
  }

  /**
   * Lấy danh sách bài nộp có phân trang theo formId và workspaceOwnerId.
   *
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {{ page?: number, pageSize?: number }} options
   * @returns {Promise<{ submissions: Array<object>, total: number, page: number, pageSize: number, totalPages: number }>}
   */
  async listSubmissionsByForm(formId, workspaceOwnerId, { page = 1, pageSize = 20 } = {}) {
    const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const parsedPageSize = Math.max(1, Math.min(100, Number.parseInt(pageSize, 10) || 20));
    const offset = (parsedPage - 1) * parsedPageSize;

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM form_submissions
       WHERE form_id = $1 AND workspace_owner_id = $2`,
      [formId, workspaceOwnerId]
    );
    const total = countResult.rows[0]?.total || 0;

    const rowsResult = await db.query(
      `SELECT
         s.id,
         s.form_id AS "formId",
         s.workspace_owner_id AS "workspaceOwnerId",
         s.access_token AS "accessToken",
         s.answers,
         s.respondent_name AS "respondentName",
         s.respondent_email AS "respondentEmail",
         s.respondent_phone AS "respondentPhone",
         s.marketing_consent AS "marketingConsent",
         s.status,
         s.appointment_at AS "appointmentAt",
         s.confirmation_sent_at AS "confirmationSentAt",
         s.reminder_sent_at AS "reminderSentAt",
         s.payment_code AS "paymentCode",
         s.payment_amount AS "paymentAmount",
         s.payment_snapshot AS "paymentSnapshot",
         s.hold_expires_at AS "holdExpiresAt",
         s.paid_confirmed_at AS "paidConfirmedAt",
         s.paid_confirmed_by AS "paidConfirmedBy",
         s.created_at AS "createdAt",
         s.updated_at AS "updatedAt"
       FROM form_submissions s
       WHERE s.form_id = $1 AND s.workspace_owner_id = $2
       ORDER BY s.created_at DESC
       LIMIT $3 OFFSET $4`,
      [formId, workspaceOwnerId, parsedPageSize, offset]
    );

    return {
      submissions: rowsResult.rows,
      total,
      page: parsedPage,
      pageSize: parsedPageSize,
      totalPages: Math.ceil(total / parsedPageSize) || 1,
    };
  }
}

export default new FormRepository();
