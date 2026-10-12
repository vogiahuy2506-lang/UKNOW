import db from '../config/database.js';
import { getVietnamDayRange } from '../utils/vnTimeFormat.util.js';

/**
 * Truy vấn cho XUẤT CSV bài nộp biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c).
 *
 * Xuất theo "khung id": (1) chốt danh sách id khớp bộ lọc, tối đa `limit`, đúng thứ tự xuất — bài nộp mới đến sau đó không lọt vào hay
 * làm lệch file; (2) tính cột câu trả lời trên đúng các id đó; (3) đọc dữ liệu từng lô theo id. Mọi truy vấn đều ràng `workspace_owner_id`
 * — id của chủ khác chỉ cho ra rỗng, không bao giờ lộ bài nộp của họ.
 */

/**
 * @param {{
 *   workspaceOwnerId: number|string,
 *   formId?: number|null,
 *   landingPageSlug?: string|null,
 *   from?: string|null,
 *   to?: string|null,
 *   date?: string|null,
 * }} filters `from`/`to`/`date` là ngày YYYY-MM-DD (giờ VN) đã được service kiểm định dạng. `from`/`to` lọc theo `created_at` (gồm cả hai
 *   đầu); `date` lọc theo NGÀY LỊCH HẸN (như trang bài nộp từng biểu mẫu) và đổi thứ tự sang lịch hẹn tăng dần.
 * @returns {{ where: string, params: unknown[], orderSql: string }}
 */
function buildSubmissionFilter(filters) {
  const conditions = ['s.workspace_owner_id = $1'];
  const params = [filters.workspaceOwnerId];
  let orderSql = 's.created_at DESC, s.id DESC';

  if (filters.formId != null) {
    params.push(filters.formId);
    conditions.push(`s.form_id = $${params.length}`);
  }
  if (filters.landingPageSlug) {
    params.push(filters.landingPageSlug);
    conditions.push(`s.landing_page_slug = $${params.length}`);
  }
  if (filters.from) {
    params.push(getVietnamDayRange(filters.from).startIso);
    conditions.push(`s.created_at >= $${params.length}`);
  }
  if (filters.to) {
    // endIso = 00:00 giờ VN của NGÀY SAU → dùng `<` để gồm trọn ngày `to`.
    params.push(getVietnamDayRange(filters.to).endIso);
    conditions.push(`s.created_at < $${params.length}`);
  }
  if (filters.date) {
    const { startIso, endIso } = getVietnamDayRange(filters.date);
    params.push(startIso);
    conditions.push(`s.appointment_at >= $${params.length}`);
    params.push(endIso);
    conditions.push(`s.appointment_at < $${params.length}`);
    orderSql = 's.appointment_at ASC, s.id ASC';
  }
  return { where: conditions.join(' AND '), params, orderSql };
}

/**
 * Chốt khung id cần xuất (đã sắp thứ tự) + tổng số bài khớp bộ lọc.
 *
 * @param {Parameters<typeof buildSubmissionFilter>[0]} filters
 * @param {number} limit trần số dòng
 * @returns {Promise<{ ids: string[], total: number }>}
 */
export async function listSubmissionIdsForExport(filters, limit) {
  const { where, params, orderSql } = buildSubmissionFilter(filters);
  const [countResult, idsResult] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM form_submissions s WHERE ${where}`, params),
    db.query(
      `SELECT s.id FROM form_submissions s WHERE ${where} ORDER BY ${orderSql} LIMIT $${params.length + 1}`,
      [...params, limit]
    ),
  ]);
  return {
    ids: idsResult.rows.map((row) => String(row.id)),
    total: countResult.rows[0]?.total || 0,
  };
}

/**
 * Các biểu mẫu (còn tồn tại) của workspace trong danh sách id — lấy tiêu đề + định nghĩa trường để dựng cột.
 *
 * @param {number|string} workspaceOwnerId
 * @param {Array<number|string>} formIds
 * @returns {Promise<Array<{ id: string, title: string, fields: object[], bookingConfig: object|null, paymentConfig: object|null }>>}
 */
export async function listFormsForExport(workspaceOwnerId, formIds) {
  if (!formIds.length) return [];
  const { rows } = await db.query(
    `SELECT f.id, f.title, f.fields, f.booking_config AS "bookingConfig", f.payment_config AS "paymentConfig"
       FROM forms f
      WHERE f.workspace_owner_id = $1 AND f.id = ANY($2::bigint[])
      ORDER BY f.id ASC`,
    [workspaceOwnerId, formIds]
  );
  return rows;
}

/**
 * Các khoá câu trả lời THỰC SỰ có trong khung id (theo từng biểu mẫu) kèm nhãn/loại trong ảnh chụp của bài MỚI NHẤT mang khoá đó.
 * Dùng để giữ cột cho trường đã bị xoá khỏi biểu mẫu nhưng bài nộp cũ còn dữ liệu.
 *
 * @param {number|string} workspaceOwnerId
 * @param {string[]} ids
 * @returns {Promise<Array<{ formId: string, key: string, label: string|null, type: string|null }>>}
 */
export async function listAnswerKeysForExport(workspaceOwnerId, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT s.form_id AS "formId",
            e.key AS "key",
            (array_agg(e.value->>'label' ORDER BY s.created_at DESC, s.id DESC))[1] AS label,
            (array_agg(e.value->>'type' ORDER BY s.created_at DESC, s.id DESC))[1] AS type
       FROM form_submissions s
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(s.answers) = 'object' THEN s.answers ELSE '{}'::jsonb END
      ) AS e
      WHERE s.workspace_owner_id = $1 AND s.id = ANY($2::bigint[])
      GROUP BY s.form_id, e.key
      ORDER BY s.form_id ASC, e.key ASC`,
    [workspaceOwnerId, ids]
  );
  return rows.map((row) => ({ ...row, formId: String(row.formId) }));
}

/**
 * Trong khung id: biểu mẫu nào có bài, và có bài nào mang lịch hẹn / mã thanh toán không (để quyết định có cột "Giờ hẹn" / thanh toán).
 *
 * @param {number|string} workspaceOwnerId
 * @param {string[]} ids
 * @returns {Promise<{ formIds: string[], hasAppointment: boolean, hasPayment: boolean }>}
 */
export async function summarizeSubmissionIdsForExport(workspaceOwnerId, ids) {
  if (!ids.length) return { formIds: [], hasAppointment: false, hasPayment: false };
  const { rows } = await db.query(
    `SELECT s.form_id AS "formId",
            bool_or(s.appointment_at IS NOT NULL) AS "hasAppointment",
            bool_or(s.payment_code IS NOT NULL) AS "hasPayment"
       FROM form_submissions s
      WHERE s.workspace_owner_id = $1 AND s.id = ANY($2::bigint[])
      GROUP BY s.form_id
      ORDER BY s.form_id ASC`,
    [workspaceOwnerId, ids]
  );
  return {
    formIds: rows.map((row) => String(row.formId)),
    hasAppointment: rows.some((row) => row.hasAppointment),
    hasPayment: rows.some((row) => row.hasPayment),
  };
}

/**
 * Đọc một lô bài nộp theo id (không đảm bảo thứ tự — `streamCsv` tự xếp lại theo khung id).
 *
 * @param {number|string} workspaceOwnerId
 * @param {string[]} ids
 * @returns {Promise<object[]>}
 */
export async function findSubmissionsForExport(workspaceOwnerId, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT s.id,
            s.form_id AS "formId",
            f.title AS "formTitle",
            s.respondent_name AS "respondentName",
            s.respondent_email AS "respondentEmail",
            s.respondent_phone AS "respondentPhone",
            s.status,
            s.hold_expires_at AS "holdExpiresAt",
            s.marketing_consent AS "marketingConsent",
            s.consent_withdrawn_at AS "consentWithdrawnAt",
            s.landing_page_slug AS "landingPageSlug",
            s.utm_source AS "utmSource",
            s.utm_medium AS "utmMedium",
            s.utm_campaign AS "utmCampaign",
            s.utm_content AS "utmContent",
            s.utm_term AS "utmTerm",
            s.appointment_at AS "appointmentAt",
            s.payment_code AS "paymentCode",
            s.payment_amount AS "paymentAmount",
            s.created_at AS "createdAt",
            s.answers
       FROM form_submissions s
       JOIN forms f ON f.id = s.form_id AND f.workspace_owner_id = s.workspace_owner_id
      WHERE s.workspace_owner_id = $1 AND s.id = ANY($2::bigint[])`,
    [workspaceOwnerId, ids]
  );
  return rows;
}

export default {
  listSubmissionIdsForExport,
  listFormsForExport,
  listAnswerKeysForExport,
  summarizeSubmissionIdsForExport,
  findSubmissionsForExport,
};
