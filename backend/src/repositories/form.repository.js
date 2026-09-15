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

/**
 * Trần thư gửi người đặt (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, "Trần thư gửi người đặt" —
 * bổ sung sau review PR-2a 14/09). PR-2 là chỗ đầu tiên hệ thống gửi thư tới địa chỉ do người lạ
 * gõ vào, cùng hộp gửi với thư thanh toán/hoá đơn — không có trần thì form có thể bị lợi dụng làm
 * máy gửi spam mang tên hộp gửi hệ thống, hoặc dội bounce vì địa chỉ gõ sai. Hằng số đặt DUY NHẤT
 * ở đây — `form.service.js` (đường gửi thư xác nhận) và `formBookingReminder.service.js` (cron
 * nhắc) đều import từ đây, không tự định nghĩa lại.
 */
export const MAX_FORM_RESPONDENT_EMAILS_PER_24H = 200;
export const MAX_CONFIRMATION_EMAILS_PER_RECIPIENT_PER_24H = 3;

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
    theme = {},
    bookingConfig = null,
    paymentConfig = null,
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
         theme,
         booking_config,
         payment_config,
         is_published
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
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
        JSON.stringify(theme || {}),
        bookingConfig ? JSON.stringify(bookingConfig) : null,
        paymentConfig ? JSON.stringify(paymentConfig) : null,
      ]
    );
    return result.rows[0];
  }

  /**
   * Cập nhật biểu mẫu.
   * Cập nhật: title, description, fields, settings, bookingConfig (PR-2a), paymentConfig
   * (PR-3a), theme (PR-4a). Vẫn bỏ qua hoàn toàn admin_disabled_at (chỉ super admin route).
   *
   * @param {number} id
   * @param {number} workspaceOwnerId
   * @param {object} params
   * @returns {Promise<object|null>}
   */
  async updateForm(id, workspaceOwnerId, { title, description, fields, settings, theme, bookingConfig, paymentConfig }) {
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
    if (theme !== undefined) {
      fieldsToSet.push(`theme = $${idx}`);
      values.push(JSON.stringify(theme || {}));
      idx += 1;
    }
    if (bookingConfig !== undefined) {
      fieldsToSet.push(`booking_config = $${idx}`);
      values.push(bookingConfig ? JSON.stringify(bookingConfig) : null);
      idx += 1;
    }
    if (paymentConfig !== undefined) {
      fieldsToSet.push(`payment_config = $${idx}`);
      values.push(paymentConfig ? JSON.stringify(paymentConfig) : null);
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
    paymentCode = null,
    paymentAmount = null,
    paymentSnapshot = null,
    holdExpiresAt = null,
    landingPageSlug = null,
    utmSource = null,
    utmMedium = null,
    utmCampaign = null,
    utmContent = null,
    utmTerm = null,
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
         submitter_ip_hash,
         payment_code,
         payment_amount,
         payment_snapshot,
         hold_expires_at,
         landing_page_slug,
         utm_source,
         utm_medium,
         utm_campaign,
         utm_content,
         utm_term
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
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
         payment_code AS "paymentCode",
         payment_amount AS "paymentAmount",
         payment_snapshot AS "paymentSnapshot",
         hold_expires_at AS "holdExpiresAt",
         landing_page_slug AS "landingPageSlug",
         utm_source AS "utmSource",
         utm_medium AS "utmMedium",
         utm_campaign AS "utmCampaign",
         utm_content AS "utmContent",
         utm_term AS "utmTerm",
         unsubscribe_token AS "unsubscribeToken",
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
        paymentCode,
        paymentAmount,
        paymentSnapshot ? JSON.stringify(paymentSnapshot) : null,
        holdExpiresAt,
        landingPageSlug,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
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
   * Đếm số chỗ đang bị chiếm cho MỘT khung giờ, LOẠI TRỪ chính một bài nộp (§4.3, dùng khi chủ
   * form xác nhận "Đã nhận tiền" cho một lượt — phải đếm lại KHÔNG tính chính bài đang xác nhận,
   * vì nếu hold của nó CHƯA hết hạn thì nó tự đếm là đang chiếm chỗ, sẽ luôn thấy "đủ chỗ" một
   * cách vô nghĩa). Dùng trong giao dịch — gọi SAU acquireFormSlotLock, bằng chính `client` đó.
   *
   * @param {number} formId
   * @param {string} appointmentAtIso
   * @param {number} excludeSubmissionId
   * @param {import('pg').PoolClient|typeof db} [queryable]
   * @returns {Promise<number>}
   */
  async countOccupiedForAppointmentExcluding(formId, appointmentAtIso, excludeSubmissionId, queryable = db) {
    const result = await queryable.query(
      `SELECT COUNT(*)::int AS occupied
       FROM form_submissions
       WHERE form_id = $1 AND appointment_at = $2 AND id <> $3 AND ${occupiedSlotConditionSql()}`,
      [formId, appointmentAtIso, excludeSubmissionId]
    );
    return result.rows[0]?.occupied || 0;
  }

  /**
   * Đếm số lượt ĐANG chờ thanh toán còn hạn (§4.3 nhánh pending_payment) của CÙNG một
   * `submitter_ip_hash` trên MỘT form — chốt chống giữ chỗ hàng loạt (PR-3a mục 4, tối đa 3).
   * `submitterIpHash` rỗng/null thì KHÔNG đếm được gì (0) — không chặn nhầm khi không tính được
   * IP (`req.ip` rỗng) thay vì chặn oan mọi người.
   *
   * @param {number} formId
   * @param {string} submitterIpHash
   * @param {import('pg').PoolClient|typeof db} [queryable]
   * @returns {Promise<number>}
   */
  async countPendingHoldsForIpAndForm(formId, submitterIpHash, queryable = db) {
    if (!submitterIpHash) return 0;
    const result = await queryable.query(
      `SELECT COUNT(*)::int AS n
       FROM form_submissions
       WHERE form_id = $1
         AND submitter_ip_hash = $2
         AND status = 'pending_payment'
         AND hold_expires_at > NOW()`,
      [formId, submitterIpHash]
    );
    return result.rows[0]?.n || 0;
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
   * Đổi trạng thái một bài nộp (dùng cho huỷ lịch, PR-2a việc 6b). `fromStatuses` (nếu có) được
   * kiểm NGAY TRONG câu UPDATE — nguyên tử, tránh race giữa hai request cùng đổi trạng thái một
   * lượt (PR-2a review 14/09: huỷ 2 lần đồng thời trước đây có thể cả hai đều "thắng" vì
   * updateSubmissionStatus không tự kiểm status hiện tại, chỉ service tự đọc-rồi-mới-update).
   * 0 dòng khớp → gọi thêm `findSubmissionByIdAndForm` để phân biệt 404 (không tồn tại) hay 409
   * (tồn tại nhưng status hiện tại không nằm trong `fromStatuses`).
   *
   * @param {number} submissionId
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {string} status
   * @param {string[]|null} [fromStatuses] Chỉ đổi khi status HIỆN TẠI nằm trong danh sách này
   * @returns {Promise<object|null>}
   */
  async updateSubmissionStatus(submissionId, formId, workspaceOwnerId, status, fromStatuses = null) {
    const params = [submissionId, formId, workspaceOwnerId, status];
    let statusGuard = '';
    if (Array.isArray(fromStatuses) && fromStatuses.length > 0) {
      params.push(fromStatuses);
      statusGuard = ` AND status = ANY($${params.length}::varchar[])`;
    }
    const result = await db.query(
      `UPDATE form_submissions
       SET status = $4, updated_at = NOW()
       WHERE id = $1 AND form_id = $2 AND workspace_owner_id = $3${statusGuard}
       RETURNING
         id,
         form_id AS "formId",
         workspace_owner_id AS "workspaceOwnerId",
         status,
         appointment_at AS "appointmentAt",
         updated_at AS "updatedAt"`,
      params
    );
    return result.rows[0] || null;
  }

  /**
   * Xác nhận đã nhận tiền cho một bài nộp (PR-3a mục 5) — UPDATE NGUYÊN TỬ, điều kiện
   * `status = 'pending_payment'` nằm NGAY TRONG câu lệnh: hai request xác nhận đồng thời cùng
   * một bài, Postgres tự khoá theo dòng — request thứ hai chỉ thấy status đã đổi SAU khi request
   * đầu commit nên 0 dòng khớp, trả `null` (cùng mẫu `updateSubmissionStatus`/PR-2a review 14/09).
   * Với bài CÓ lịch hẹn, gọi hàm này SAU khi đã acquireFormSlotLock + đếm lại chỗ trong cùng
   * giao dịch — khoá đó tự tuần tự hoá hai request xác nhận cùng khung giờ, nên không cần thêm gì
   * ở đây cho ca đó.
   *
   * @param {number} submissionId
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {number} confirmedByUserId
   * @param {import('pg').PoolClient|typeof db} [queryable]
   * @returns {Promise<object|null>}
   */
  async confirmSubmissionPayment(submissionId, formId, workspaceOwnerId, confirmedByUserId, queryable = db) {
    const result = await queryable.query(
      `UPDATE form_submissions
       SET status = 'confirmed', paid_confirmed_at = NOW(), paid_confirmed_by = $4, updated_at = NOW()
       WHERE id = $1 AND form_id = $2 AND workspace_owner_id = $3 AND status = 'pending_payment'
       RETURNING
         id,
         form_id AS "formId",
         workspace_owner_id AS "workspaceOwnerId",
         status,
         appointment_at AS "appointmentAt",
         respondent_email AS "respondentEmail",
         payment_code AS "paymentCode",
         payment_amount AS "paymentAmount",
         paid_confirmed_at AS "paidConfirmedAt",
         paid_confirmed_by AS "paidConfirmedBy",
         updated_at AS "updatedAt"`,
      [submissionId, formId, workspaceOwnerId, confirmedByUserId]
    );
    return result.rows[0] || null;
  }

  /**
   * PR-7b — CHỈ 3 cột cần để dựng chân thư "Rút lại đồng ý" (`formUnsubscribeFooter.util.js`),
   * tách RIÊNG khỏi `confirmSubmissionPayment` một cách CỐ Ý: RETURNING của hàm đó đi thẳng ra
   * API `confirmPayment` cho chủ form (`form.controller.js` → `res.json({ data: submission })`)
   * — gộp `unsubscribe_token` vào đó sẽ lộ token rút đồng ý cho chủ form đọc được (vi phạm "Không
   * trả unsubscribeToken ở bất kỳ API nào").
   *
   * @param {number} submissionId
   * @returns {Promise<{ marketingConsent: boolean|null, unsubscribeToken: string, consentWithdrawnAt: string|null }|null>}
   */
  async getSubmissionConsentInfo(submissionId) {
    const result = await db.query(
      `SELECT
         marketing_consent AS "marketingConsent",
         unsubscribe_token AS "unsubscribeToken",
         consent_withdrawn_at AS "consentWithdrawnAt"
       FROM form_submissions
       WHERE id = $1`,
      [submissionId]
    );
    return result.rows[0] || null;
  }

  /**
   * Tìm bài nộp theo `unsubscribe_token` — dùng cho trang rút lại đồng ý công khai (PR-7b), mẫu
   * `lead.repository.js` `findByUnsubscribeToken`. Mỗi token chỉ khớp ĐÚNG MỘT bài nộp (cột
   * unique, migration 223) — rút không ảnh hưởng các bài khác của cùng người nộp/cùng form.
   *
   * @param {string} token
   * @returns {Promise<object|null>}
   */
  async findSubmissionByUnsubscribeToken(token) {
    const result = await db.query(
      `SELECT
         id,
         form_id AS "formId",
         marketing_consent AS "marketingConsent",
         unsubscribe_token AS "unsubscribeToken",
         consent_withdrawn_at AS "consentWithdrawnAt",
         created_at AS "createdAt"
       FROM form_submissions
       WHERE unsubscribe_token = $1
       LIMIT 1`,
      [token]
    );
    return result.rows[0] || null;
  }

  /**
   * Rút lại đồng ý nhận tiếp thị cho MỘT bài nộp — mẫu `lead.repository.js` `withdrawConsentById`.
   * `COALESCE(consent_withdrawn_at, NOW())` giữ nguyên thời điểm rút LẦN ĐẦU khi bấm link nhiều
   * lần (không ghi đè mốc thời gian cũ).
   *
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async withdrawSubmissionConsentById(id) {
    const result = await db.query(
      `UPDATE form_submissions
       SET marketing_consent = FALSE,
           consent_withdrawn_at = COALESCE(consent_withdrawn_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         marketing_consent AS "marketingConsent",
         consent_withdrawn_at AS "consentWithdrawnAt",
         unsubscribe_token AS "unsubscribeToken"`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Tìm bài nộp theo `access_token`, ràng buộc đúng `form_id` (link trạng thái công khai chứa cả
   * publicKey lẫn token trên URL — PR-3a mục 4: "token sai hoặc không thuộc form đó → 404", nên
   * PHẢI kiểm form_id khớp chứ không chỉ token đúng, đề phòng token đoán/chép nhầm giữa hai form).
   * KHÔNG trả respondent_name/email/phone — trang trạng thái là public, không hiện thông tin cá
   * nhân người đặt.
   *
   * @param {string} accessToken
   * @param {number} formId
   * @returns {Promise<object|null>}
   */
  async findSubmissionByAccessTokenAndForm(accessToken, formId) {
    const result = await db.query(
      `SELECT
         id,
         form_id AS "formId",
         status,
         appointment_at AS "appointmentAt",
         payment_amount AS "paymentAmount",
         payment_snapshot AS "paymentSnapshot",
         payment_code AS "paymentCode",
         hold_expires_at AS "holdExpiresAt"
       FROM form_submissions
       WHERE access_token = $1 AND form_id = $2`,
      [accessToken, formId]
    );
    return result.rows[0] || null;
  }

  /**
   * Số thư đã gửi cho người đặt (xác nhận + nhắc) của MỘT form trong 24h qua — trần theo form.
   * Dùng CHUNG cho đường gửi thư xác nhận (form.service.js) và cron nhắc
   * (formBookingReminder.service.js) qua đúng MAX_FORM_RESPONDENT_EMAILS_PER_24H ở trên.
   *
   * Index: lọc `form_id = $1` dùng được phần đầu của idx_form_submissions_form_created
   * (form_id, created_at DESC) — nhưng điều kiện thời gian ở đây là confirmation_sent_at/
   * reminder_sent_at (không phải created_at), nên phần lọc "trong 24h" chạy như Filter sau khi đã
   * thu hẹp theo form_id, KHÔNG có Index Cond cho chính 24h đó. Chấp nhận vì đây là trần MỀM, số
   * dòng mỗi form thường không lớn — nếu form nào có khối lượng bài nộp rất cao, nên thêm index
   * riêng cho (form_id, confirmation_sent_at)/(form_id, reminder_sent_at) ở migration sau (không
   * thêm ở đây theo đúng phạm vi review này — không migration mới).
   *
   * @param {number} formId
   * @returns {Promise<number>}
   */
  async countFormRespondentEmailsLast24h(formId) {
    const result = await db.query(
      `SELECT COUNT(*)::int AS n
       FROM form_submissions
       WHERE form_id = $1
         AND (
           (confirmation_sent_at IS NOT NULL AND confirmation_sent_at > NOW() - INTERVAL '24 hours')
           OR (reminder_sent_at IS NOT NULL AND reminder_sent_at > NOW() - INTERVAL '24 hours')
         )`,
      [formId]
    );
    return result.rows[0]?.n || 0;
  }

  /**
   * Số thư XÁC NHẬN đã gửi cho MỘT địa chỉ email trong 24h qua, trên TOÀN HỆ THỐNG (không lọc
   * theo form) — trần theo người nhận. So `lower(respondent_email)` để không lách bằng viết hoa.
   *
   * Index: KHÔNG có index nào trên `respondent_email` (kiểm `\d form_submissions` — chỉ có index
   * theo form_id/workspace_owner_id/appointment_at/payment_code) → câu này quét toàn bảng
   * form_submissions mỗi lần gọi. Ghi rõ trong báo cáo theo yêu cầu review — không tự thêm
   * migration/index mới ở đây (ngoài phạm vi lần review này); nếu khối lượng bài nộp toàn hệ
   * thống lớn lên, nên thêm index biểu thức
   * `(lower(respondent_email), confirmation_sent_at) WHERE confirmation_sent_at IS NOT NULL`.
   *
   * @param {string} email
   * @returns {Promise<number>}
   */
  async countConfirmationEmailsForRecipientLast24h(email) {
    const result = await db.query(
      `SELECT COUNT(*)::int AS n
       FROM form_submissions
       WHERE lower(respondent_email) = lower($1)
         AND confirmation_sent_at IS NOT NULL
         AND confirmation_sent_at > NOW() - INTERVAL '24 hours'`,
      [email]
    );
    return result.rows[0]?.n || 0;
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
   * @returns {Promise<Array<{id: number, formId: number, respondentEmail: string, appointmentAt: Date, formTitle: string}>>}
   */
  async listBookingReminderCandidates() {
    const result = await db.query(
      `SELECT
         s.id,
         s.form_id AS "formId",
         s.respondent_email AS "respondentEmail",
         s.appointment_at AS "appointmentAt",
         s.marketing_consent AS "marketingConsent",
         s.unsubscribe_token AS "unsubscribeToken",
         s.consent_withdrawn_at AS "consentWithdrawnAt",
         f.title AS "formTitle"
       FROM form_submissions s
       JOIN forms f ON f.id = s.form_id
       WHERE ${occupiedSlotConditionSql('s')}
         -- PR-3a (Bổ sung 15/09): occupiedSlotConditionSql tính CẢ pending_payment còn hạn giữ
         -- chỗ là "đang chiếm" (đúng cho §4.3 sức chứa) — nhưng thư NHẮC LỊCH không được gửi cho
         -- lượt còn đang chờ chuyển khoản, chưa chắc sẽ diễn ra. Lọc thêm status.
         AND s.status IN ('submitted', 'confirmed')
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
         s.landing_page_slug AS "landingPageSlug",
         s.utm_source AS "utmSource",
         s.utm_medium AS "utmMedium",
         s.utm_campaign AS "utmCampaign",
         s.utm_content AS "utmContent",
         s.utm_term AS "utmTerm",
         s.consent_withdrawn_at AS "consentWithdrawnAt",
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

  /**
   * Đếm bài nộp Biểu mẫu theo slug landing nguồn, trong khoảng ngày, cùng phạm vi chủ workspace/
   * super admin — mẫu `lead.repository.js` `aggregateSubmitsBySlug` (PR-7a "Bổ sung 15/09 khi
   * soạn lệnh PR-7" mục 2: dashboard landing đang GÁN `cur.submitCount` từ MỘT nguồn (leads),
   * hàm này cấp thêm nguồn thứ hai để `dashboardAnalytics.service.js` CỘNG dồn).
   * Loại bài `cancelled` — huỷ thì không tính là một lượt "gửi" (khớp cách trang bài nộp coi
   * `cancelled` là đã rút, không phải một chuyển đổi thật).
   *
   * @param {string|null} dateFrom Ngày `YYYY-MM-DD`, null = không chặn dưới
   * @param {string|null} dateTo Ngày `YYYY-MM-DD`, null = không chặn trên
   * @param {{ isSuperAdmin?: boolean, workspaceOwnerId?: number }} [scope]
   * @returns {Promise<Array<{ slug: string, submitCount: number }>>}
   */
  async aggregateSubmitsBySlug(dateFrom, dateTo, scope = {}) {
    const conditions = [
      `landing_page_slug IS NOT NULL`,
      `TRIM(landing_page_slug) <> ''`,
      `status <> 'cancelled'`,
    ];
    const params = [];
    let idx = 1;
    if (dateFrom) {
      conditions.push(`created_at >= $${idx}::timestamptz`);
      params.push(`${dateFrom}T00:00:00.000Z`);
      idx += 1;
    }
    if (dateTo) {
      conditions.push(`created_at <= $${idx}::timestamptz`);
      params.push(`${dateTo}T23:59:59.999Z`);
      idx += 1;
    }
    if (scope?.isSuperAdmin !== true) {
      const workspaceOwnerId = Number.parseInt(scope?.workspaceOwnerId, 10);
      if (!Number.isFinite(workspaceOwnerId)) return [];
      conditions.push(`workspace_owner_id = $${idx}`);
      params.push(workspaceOwnerId);
      idx += 1;
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await db.query(
      `SELECT landing_page_slug AS slug, COUNT(*)::bigint AS "submitCount"
       FROM form_submissions
       ${where}
       GROUP BY landing_page_slug`,
      params
    );
    return result.rows.map((r) => ({
      slug: r.slug,
      submitCount: Number(r.submitCount || 0),
    }));
  }

  /**
   * Bài nộp đủ điều kiện đưa vào node chiến dịch "Lấy dữ liệu từ biểu mẫu" (PR-6a):
   * thuộc đúng form + đúng chủ workspace, đã đồng ý nhận tin (marketing_consent IS TRUE),
   * chưa huỷ (status <> 'cancelled'). Xếp created_at tăng dần (bài cũ trước — khớp thứ tự
   * "chạy liên tục: lần sau chỉ lấy thêm bài mới" của continuous mode).
   *
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @param {number} limit
   * @returns {Promise<Array<object>>}
   */
  async listConsentedSubmissionsForCampaign(formId, workspaceOwnerId, limit) {
    const result = await db.query(
      `SELECT
         s.id,
         s.form_id AS "formId",
         s.answers,
         s.respondent_name AS "respondentName",
         s.respondent_email AS "respondentEmail",
         s.respondent_phone AS "respondentPhone",
         s.marketing_consent AS "marketingConsent",
         s.appointment_at AS "appointmentAt",
         s.created_at AS "createdAt"
       FROM form_submissions s
       WHERE s.form_id = $1
         AND s.workspace_owner_id = $2
         AND s.marketing_consent IS TRUE
         AND s.status <> 'cancelled'
       ORDER BY s.created_at ASC
       LIMIT $3`,
      [formId, workspaceOwnerId, limit]
    );
    return result.rows;
  }

  /**
   * Tổng số bài nộp khớp cùng điều kiện của `listConsentedSubmissionsForCampaign` (không giới
   * hạn LIMIT) — dùng cho `pagination.total` của API preview.
   *
   * @param {number} formId
   * @param {number} workspaceOwnerId
   * @returns {Promise<number>}
   */
  async countConsentedSubmissionsForCampaign(formId, workspaceOwnerId) {
    const result = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM form_submissions
       WHERE form_id = $1
         AND workspace_owner_id = $2
         AND marketing_consent IS TRUE
         AND status <> 'cancelled'`,
      [formId, workspaceOwnerId]
    );
    return result.rows[0]?.total || 0;
  }

  // ─── Super admin (PR-3a mục 9) ────────────────────────────────────────────────────────

  /**
   * Danh sách form cho bảng super admin — tìm theo `public_key` hoặc email chủ, phân trang.
   * `q` rỗng → trả tất cả (mới nhất trước).
   *
   * @param {{ q?: string, page?: number, pageSize?: number }} params
   * @returns {Promise<{ forms: Array<object>, total: number, page: number, pageSize: number }>}
   */
  async adminListForms({ q = '', page = 1, pageSize = 20 } = {}) {
    const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const parsedPageSize = Math.max(1, Math.min(100, Number.parseInt(pageSize, 10) || 20));
    const offset = (parsedPage - 1) * parsedPageSize;
    const term = String(q || '').trim();

    const whereClause = term ? `WHERE f.public_key ILIKE $1 OR u.email ILIKE $1` : '';
    const params = term ? [`%${term}%`] : [];

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM forms f
       JOIN users u ON u.id = f.workspace_owner_id
       ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const rowsResult = await db.query(
      `SELECT
         f.id,
         f.public_key AS "publicKey",
         f.title,
         f.is_published AS "isPublished",
         f.admin_disabled_at AS "adminDisabledAt",
         (f.payment_config IS NOT NULL) AS "hasPayment",
         f.created_at AS "createdAt",
         u.email AS "ownerEmail",
         COUNT(s.id)::int AS "submissionCount"
       FROM forms f
       JOIN users u ON u.id = f.workspace_owner_id
       LEFT JOIN form_submissions s ON s.form_id = f.id
       ${whereClause}
       GROUP BY f.id, u.email
       ORDER BY f.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parsedPageSize, offset]
    );

    return {
      forms: rowsResult.rows,
      total,
      page: parsedPage,
      pageSize: parsedPageSize,
      totalPages: Math.ceil(total / parsedPageSize) || 1,
    };
  }

  /**
   * Tìm form theo id CHO SUPER ADMIN — không ràng buộc theo workspace_owner_id (khác
   * `findFormByIdAndOwner`, dùng cho chủ form tự thao tác trên form của chính mình).
   *
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async adminFindFormById(id) {
    const result = await db.query(
      `SELECT id, public_key AS "publicKey", title, admin_disabled_at AS "adminDisabledAt"
       FROM forms
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Bật/tắt form (super admin) — set/clear `admin_disabled_at`.
   *
   * @param {number} id
   * @param {boolean} disabled
   * @returns {Promise<object|null>}
   */
  async adminSetFormDisabled(id, disabled) {
    const result = await db.query(
      `UPDATE forms
       SET admin_disabled_at = ${disabled ? 'NOW()' : 'NULL'}, updated_at = NOW()
       WHERE id = $1
       RETURNING id, public_key AS "publicKey", title, admin_disabled_at AS "adminDisabledAt"`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * PR-4a review 15/09 (Việc 1) — kiểm một khoá kho ảnh (bannerKey/logoKey) còn được form NÀO
   * của workspace này tham chiếu hay không. Dùng TRƯỚC khi giải phóng khoá cũ trong vòng đời
   * theme (`form.service.js` `syncFormThemeAssetLifecycle`/`deleteForm`): hai form khác nhau có
   * thể trỏ cùng một khoá (nhân bản form, hoặc chủ động dùng lại ảnh) — đổi/xoá ở MỘT form không
   * được kéo theo giải phóng khoá form KIA còn đang dùng. Gọi SAU khi form đang xử lý đã ghi/xoá
   * xong ở DB, nên chính nó sẽ không tự "false positive" khớp với khoá cũ của mình.
   *
   * @param {number} workspaceOwnerId
   * @param {string} storageKey
   * @returns {Promise<boolean>}
   */
  async isFormAssetKeyReferenced(workspaceOwnerId, storageKey) {
    const result = await db.query(
      `SELECT 1 FROM forms
        WHERE workspace_owner_id = $1
          AND (theme->>'bannerKey' = $2 OR theme->>'logoKey' = $2)
        LIMIT 1`,
      [workspaceOwnerId, storageKey]
    );
    return result.rowCount > 0;
  }
}

export default new FormRepository();
