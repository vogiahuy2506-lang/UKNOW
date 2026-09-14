import db from '../config/database.js';
import { getVietnamDayRange } from '../utils/vnTimeFormat.util.js';

/**
 * Luật "đang chiếm chỗ" của một bài nộp có lịch hẹn (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md
 * §4.3) — DÙNG CHUNG cho cả đếm-khi-đặt (createSubmission trong giao dịch) lẫn API slots
 * (listOccupiedCountsInRange), để hai nơi không tự viết điều kiện rồi lệch nhau.
 *
 * Nhánh `pending_payment AND hold_expires_at > NOW()` thuộc PR-3 (thanh toán giữ chỗ) — viết sẵn
 * ở đây vì hợp lý để có "một luật duy nhất" ngay từ PR-2a, nhưng KHÔNG có code nào trong PR-2a tạo
 * dòng `status = 'pending_payment'` nên nhánh này không thay đổi hành vi thực tế của PR-2a.
 *
 * @param {string} [alias] Alias bảng trong câu SQL gọi hàm này (vd 's' cho `form_submissions s`).
 *   Để trống khi câu SQL không alias bảng.
 * @returns {string}
 */
export function occupiedSlotConditionSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(
    ${p}status IN ('submitted', 'confirmed')
    OR (${p}status = 'pending_payment' AND ${p}hold_expires_at > NOW())
  )`;
}

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
    bookingConfig = null,
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
         booking_config,
         is_published
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
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
        bookingConfig ? JSON.stringify(bookingConfig) : null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Cập nhật biểu mẫu.
   * Cập nhật: title, description, fields, settings, bookingConfig (PR-2a).
   * Vẫn bỏ qua hoàn toàn payment_config, theme, admin_disabled_at (PR-3/PR-4).
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {object} params
   * @returns {Promise<object|null>}
   */
  async updateForm(id, workspaceOwnerId, { title, description, fields, settings, bookingConfig }) {
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
    if (bookingConfig !== undefined) {
      fieldsToSet.push(`booking_config = $${idx}`);
      values.push(bookingConfig ? JSON.stringify(bookingConfig) : null);
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
   * Tạo bài nộp mới. Nhận `queryable` để có thể chạy trong giao dịch (đường đặt lịch, §4.3 —
   * mẫu `storage.repository.js:13` `queryable = db`); đường nộp bài thường (không đặt lịch) vẫn
   * gọi như cũ, không cần truyền `queryable`.
   *
   * @param {object} params
   * @param {import('pg').PoolClient|typeof db} [queryable]
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
    appointmentAt = null,
    submitterIpHash = null,
  }, queryable = db) {
    const result = await queryable.query(
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
         appointment_at,
         submitter_ip_hash
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
         appointment_at AS "appointmentAt",
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
        appointmentAt,
        submitterIpHash,
      ]
    );
    return result.rows[0];
  }

  /**
   * Lấy khoá tư vấn giao dịch cho một khung giờ của form (§4.3) — PHẢI gọi trong giao dịch
   * (`client.query('BEGIN')` trước đó), dùng chính `client` đó chứ không phải pool `db`, nếu
   * không khoá tự nhả ngay khi câu lệnh xong (mẫu `storage.repository.js:6-11`).
   *
   * @param {import('pg').PoolClient} client
   * @param {number} formId
   * @param {string} appointmentAtIso ISO UTC của appointment_at
   */
  async acquireFormSlotLock(client, formId, appointmentAtIso) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [`form_slot:${formId}`, appointmentAtIso]
    );
  }

  /**
   * Đếm số bài nộp đang chiếm 1 khung giờ cụ thể (§4.3). Dùng trong giao dịch tạo bài nộp có
   * lịch — gọi SAU acquireFormSlotLock, bằng chính `client` đó.
   *
   * @param {number} formId
   * @param {string} appointmentAtIso
   * @param {import('pg').PoolClient|typeof db} [queryable]
   * @returns {Promise<number>}
   */
  async countOccupiedForAppointment(formId, appointmentAtIso, queryable = db) {
    const result = await queryable.query(
      `SELECT COUNT(*)::int AS occupied
       FROM form_submissions
       WHERE form_id = $1 AND appointment_at = $2 AND ${occupiedSlotConditionSql()}`,
      [formId, appointmentAtIso]
    );
    return result.rows[0]?.occupied || 0;
  }

  /**
   * Đếm số chỗ đang bị chiếm cho MỌI khung giờ trong một khoảng — MỘT truy vấn gom nhóm theo
   * appointment_at, dùng cho API slots (không phải một truy vấn mỗi khung).
   *
   * @param {number} formId
   * @param {string} startIso Bao gồm (>=)
   * @param {string} endIso Không bao gồm (<)
   * @returns {Promise<Array<{appointmentAt: Date, occupied: number}>>}
   */
  async listOccupiedCountsInRange(formId, startIso, endIso) {
    const result = await db.query(
      `SELECT appointment_at AS "appointmentAt", COUNT(*)::int AS occupied
       FROM form_submissions
       WHERE form_id = $1 AND appointment_at >= $2 AND appointment_at < $3 AND ${occupiedSlotConditionSql()}
       GROUP BY appointment_at`,
      [formId, startIso, endIso]
    );
    return result.rows;
  }

  /**
   * Tìm một bài nộp theo id, ràng buộc đúng form và chủ workspace (chống IDOR/nhầm form).
   *
   * @param {number} submissionId
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @returns {Promise<object|null>}
   */
  async findSubmissionByIdAndForm(submissionId, formId, workspaceOwnerId) {
    const result = await db.query(
      `SELECT
         id,
         form_id AS "formId",
         workspace_owner_id AS "workspaceOwnerId",
         status,
         appointment_at AS "appointmentAt"
       FROM form_submissions
       WHERE id = $1 AND form_id = $2 AND workspace_owner_id = $3`,
      [submissionId, formId, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Đổi trạng thái một bài nộp (dùng cho huỷ lịch, PR-2a việc 6b).
   *
   * @param {number} submissionId
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {string} status
   * @returns {Promise<object|null>}
   */
  async updateSubmissionStatus(submissionId, formId, workspaceOwnerId, status) {
    const result = await db.query(
      `UPDATE form_submissions
       SET status = $4, updated_at = NOW()
       WHERE id = $1 AND form_id = $2 AND workspace_owner_id = $3
       RETURNING
         id,
         form_id AS "formId",
         workspace_owner_id AS "workspaceOwnerId",
         status,
         appointment_at AS "appointmentAt",
         updated_at AS "updatedAt"`,
      [submissionId, formId, workspaceOwnerId, status]
    );
    return result.rows[0] || null;
  }

  /**
   * Đánh dấu đã gửi thư xác nhận đặt lịch cho người điền (chỉ set khi gửi thư THÀNH CÔNG).
   *
   * @param {number} submissionId
   */
  async markConfirmationSent(submissionId) {
    await db.query(
      `UPDATE form_submissions SET confirmation_sent_at = NOW() WHERE id = $1`,
      [submissionId]
    );
  }

  /**
   * Ứng viên nhắc lịch cho cron `form_booking_reminder` (mỗi 15 phút): đang chiếm chỗ (§4.3),
   * giờ hẹn còn trong (NOW, NOW+24h], chưa được nhắc, tạo trước giờ hẹn ít nhất 24h, có email,
   * form còn bật sendConfirmation và không bị super admin tắt.
   *
   * @returns {Promise<Array<{id: number, respondentEmail: string, appointmentAt: Date, formTitle: string}>>}
   */
  async listBookingReminderCandidates() {
    const result = await db.query(
      `SELECT
         s.id,
         s.respondent_email AS "respondentEmail",
         s.appointment_at AS "appointmentAt",
         f.title AS "formTitle"
       FROM form_submissions s
       JOIN forms f ON f.id = s.form_id
       WHERE ${occupiedSlotConditionSql('s')}
         AND s.appointment_at > NOW()
         AND s.appointment_at <= NOW() + INTERVAL '24 hours'
         AND s.reminder_sent_at IS NULL
         AND s.created_at < s.appointment_at - INTERVAL '24 hours'
         AND s.respondent_email IS NOT NULL
         AND f.admin_disabled_at IS NULL
         AND COALESCE((f.settings->>'sendConfirmation')::boolean, false) IS TRUE`
    );
    return result.rows;
  }

  /**
   * Giành quyền gửi thư nhắc TRƯỚC khi gửi (chặn 2 lượt cron chạy chồng gửi trùng) — chỉ thành
   * công (trả true) khi `reminder_sent_at` còn NULL lúc UPDATE.
   *
   * @param {number} submissionId
   * @returns {Promise<boolean>}
   */
  async claimReminderSlot(submissionId) {
    const result = await db.query(
      `UPDATE form_submissions SET reminder_sent_at = NOW() WHERE id = $1 AND reminder_sent_at IS NULL`,
      [submissionId]
    );
    return result.rowCount > 0;
  }

  /**
   * Trả `reminder_sent_at` về NULL khi gửi thư nhắc thất bại, để lượt cron sau thử lại.
   *
   * @param {number} submissionId
   */
  async unclaimReminderSlot(submissionId) {
    await db.query(
      `UPDATE form_submissions SET reminder_sent_at = NULL WHERE id = $1`,
      [submissionId]
    );
  }

  /**
   * Lấy danh sách bài nộp có phân trang theo formId và workspaceOwnerId.
   * `date` (YYYY-MM-DD, PR-2a việc 6a): lọc theo appointment_at rơi vào NGÀY ĐÓ tính theo giờ
   * Việt Nam (getVietnamDayRange — 00:00–24:00 giờ VN, không phải UTC) và xếp appointment_at
   * tăng dần; không có `date` thì giữ hành vi cũ (created_at giảm dần, không lọc theo lịch hẹn).
   *
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {{ page?: number, pageSize?: number, date?: string|null }} options
   * @returns {Promise<{ submissions: Array<object>, total: number, page: number, pageSize: number, totalPages: number }>}
   */
  async listSubmissionsByForm(formId, workspaceOwnerId, { page = 1, pageSize = 20, date = null } = {}) {
    const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const parsedPageSize = Math.max(1, Math.min(100, Number.parseInt(pageSize, 10) || 20));
    const offset = (parsedPage - 1) * parsedPageSize;

    // Cột không trùng tên bảng nào khác trong hai câu dưới, nên dùng chung 1 mảng điều kiện
    // "trần" (không alias) rồi thêm tiền tố `s.` riêng cho câu SELECT có alias.
    const rawConditions = ['form_id = $1', 'workspace_owner_id = $2'];
    const params = [formId, workspaceOwnerId];
    let orderColumn = 'created_at';
    let orderDirection = 'DESC';

    if (date) {
      const { startIso, endIso } = getVietnamDayRange(date);
      rawConditions.push(`appointment_at >= $${params.length + 1}`);
      params.push(startIso);
      rawConditions.push(`appointment_at < $${params.length + 1}`);
      params.push(endIso);
      orderColumn = 'appointment_at';
      orderDirection = 'ASC';
    }

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM form_submissions WHERE ${rawConditions.join(' AND ')}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const aliasedConditions = rawConditions.map((c) => `s.${c}`).join(' AND ');
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
       WHERE ${aliasedConditions}
       ORDER BY s.${orderColumn} ${orderDirection}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parsedPageSize, offset]
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
