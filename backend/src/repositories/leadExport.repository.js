import db from '../config/database.js';
import { buildLeadWhere } from './lead.repository.js';

/**
 * Truy vấn cho XUẤT CSV khách từ landing page (bảng `leads`) — PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c.
 *
 * Cùng kiểu "khung id" như formSubmissionExport.repository.js: chốt id theo bộ lọc (dùng chính `buildLeadWhere` của danh sách nên
 * file xuất khớp đúng cái đang nhìn thấy, kể cả bộ lọc trường tuỳ chỉnh), rồi đọc dữ liệu từng lô theo id. Sắp xếp có tiebreak
 * `id DESC` — `findFiltered` chỉ sắp theo `created_at`, hai khách cùng giây sẽ đổi chỗ giữa các lần đọc.
 */

/**
 * @param {object} filters cùng hình dạng với `leadRepository.findFiltered` (đã qua `leadService.resolveSharedLeadFilters`)
 * @param {number} limit trần số dòng
 * @returns {Promise<{ ids: string[], total: number }>}
 */
export async function listLeadIdsForExport(filters, limit) {
  const { whereClause, params, idx } = buildLeadWhere(filters);
  const [countResult, idsResult] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM leads ${whereClause}`, params),
    db.query(
      `SELECT id FROM leads ${whereClause} ORDER BY created_at DESC, id DESC LIMIT $${idx}`,
      [...params, limit]
    ),
  ]);
  return {
    ids: idsResult.rows.map((row) => String(row.id)),
    total: countResult.rows[0]?.total || 0,
  };
}

/**
 * Khoá trường tuỳ chỉnh THỰC SỰ có trong khung id, kèm nhãn tiếng Việt trong ảnh chụp của khách MỚI NHẤT mang khoá đó.
 *
 * @param {number|string} workspaceOwnerId
 * @param {string[]} ids
 * @returns {Promise<Array<{ key: string, labelVi: string|null }>>}
 */
export async function listLeadCustomFieldKeys(workspaceOwnerId, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT e.key AS "key",
            (array_agg(e.value->>'labelVi' ORDER BY l.created_at DESC, l.id DESC))[1] AS "labelVi"
       FROM leads l
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(l.custom_fields) = 'object' THEN l.custom_fields ELSE '{}'::jsonb END
      ) AS e
      WHERE COALESCE(l.workspace_owner_id, l.id_user) = $1 AND l.id = ANY($2::bigint[])
      GROUP BY e.key
      ORDER BY e.key ASC`,
    [workspaceOwnerId, ids]
  );
  return rows;
}

/**
 * Đọc một lô khách theo id (không đảm bảo thứ tự — `streamCsv` tự xếp lại theo khung id).
 *
 * @param {number|string} workspaceOwnerId
 * @param {string[]} ids
 * @returns {Promise<object[]>}
 */
export async function findLeadsForExport(workspaceOwnerId, ids) {
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT id,
            last_name AS "lastName",
            first_name AS "firstName",
            email,
            phone,
            occupation,
            interest_area AS "interestArea",
            marketing_consent AS "marketingConsent",
            landing_page_slug AS "landingPageSlug",
            custom_fields AS "customFields",
            unsubscribe_token AS "unsubscribeToken",
            consent_withdrawn_at AS "consentWithdrawnAt",
            created_at AS "createdAt"
       FROM leads
      WHERE COALESCE(workspace_owner_id, id_user) = $1 AND id = ANY($2::bigint[])`,
    [workspaceOwnerId, ids]
  );
  return rows;
}

export default { listLeadIdsForExport, listLeadCustomFieldKeys, findLeadsForExport };
