import db from '../config/database.js';
import { clampLandingLeadsLimit } from '../utils/landingLeadsLimit.util.js';
import { expandLandingSlugsForSqlFilter } from '../utils/landingPageSlugCanonical.util.js';
import { appendCustomFieldFilterSql } from '../utils/landingLeadCustomFilters.util.js';

/** Dùng chung với leadExport.repository.js (xuất CSV) để file xuất lọc ĐÚNG như danh sách. */
export function buildLeadWhere(filters, tableAlias = '') {
  const p = tableAlias ? `${tableAlias}.` : '';
  const useDateRange = Boolean(filters.useDateRange);
  const dateFrom = String(filters.dateFrom || '').trim();
  const dateTo = String(filters.dateTo || '').trim();
  const occupations = Array.isArray(filters.occupations) ? filters.occupations.filter(Boolean) : [];
  const interests = Array.isArray(filters.interests) ? filters.interests.filter(Boolean) : [];
  const landingSlugs = Array.isArray(filters.landingSlugs)
    ? filters.landingSlugs.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
    : [];

  const conditions = [];
  const params = [];
  let idx = 1;

  if (useDateRange && dateFrom) {
    conditions.push(`${p}created_at >= $${idx}::timestamptz`);
    params.push(`${dateFrom}T00:00:00.000+07:00`); // ngày VN, không UTC (C2-04)
    idx += 1;
  }
  if (useDateRange && dateTo) {
    conditions.push(`${p}created_at <= $${idx}::timestamptz`);
    params.push(`${dateTo}T23:59:59.999+07:00`); // ngày VN, không UTC (C2-04)
    idx += 1;
  }
  if (occupations.length > 0) {
    conditions.push(`${p}occupation = ANY($${idx}::text[])`);
    params.push(occupations);
    idx += 1;
  }
  if (interests.length > 0) {
    conditions.push(`${p}interest_area = ANY($${idx}::text[])`);
    params.push(interests);
    idx += 1;
  }
  if (landingSlugs.length > 0) {
    const UNKNOWN_SENTINEL = '__unknown__';
    const wantUnknown = landingSlugs.some((s) => s === UNKNOWN_SENTINEL || s === '');
    const normalSlugs = landingSlugs.filter((s) => s && s !== UNKNOWN_SENTINEL);
    const unknownCond = `(${p}landing_page_slug IS NULL OR TRIM(${p}landing_page_slug) = '')`;
    if (wantUnknown && normalSlugs.length === 0) {
      conditions.push(unknownCond);
    } else if (wantUnknown) {
      const slugVariants = expandLandingSlugsForSqlFilter(normalSlugs);
      conditions.push(`(${unknownCond} OR ${p}landing_page_slug = ANY($${idx}::text[]))`);
      params.push(slugVariants);
      idx += 1;
    } else {
      const slugVariants = expandLandingSlugsForSqlFilter(normalSlugs);
      conditions.push(`${p}landing_page_slug = ANY($${idx}::text[])`);
      params.push(slugVariants);
      idx += 1;
    }
  }

  if (filters.workspaceOwnerId) {
    conditions.push(`COALESCE(${p}workspace_owner_id, ${p}id_user) = $${idx}`);
    params.push(filters.workspaceOwnerId);
    idx += 1;
  } else {
    // Fail-closed: thiếu phạm vi workspace thì KHÔNG trả dòng nào (trước đây bỏ điều kiện -> trả lead của MỌI tenant).
    conditions.push('FALSE');
  }

  if (filters.excludeConsentFalse) {
    conditions.push(`${p}marketing_consent IS NOT FALSE`);
  }

  const next = appendCustomFieldFilterSql(
    { conditions, params, idx },
    filters.customFilters || [],
    tableAlias
  );

  const whereClause = next.conditions.length ? `WHERE ${next.conditions.join(' AND ')}` : '';
  return { whereClause, params: next.params, idx: next.idx };
}

/**
 * Repository truy vấn bảng `leads` (form landing công khai).
 */
class LeadRepository {
  /**
   * Thêm một bản ghi lead.
   *
   * Luồng hoạt động:
   * 1. INSERT các cột bắt buộc.
   * 2. Trả về dòng vừa tạo (bao gồm id).
   *
   * @param {object} payload
   * @param {string} payload.lastName
   * @param {string} payload.firstName
   * @param {string} payload.email
   * @param {string} payload.phone
   * @param {string} payload.occupation
   * @param {string} payload.interestArea
   * @param {boolean} payload.marketingConsent
   * @returns {Promise<object>}
   */
  async insertLead(payload) {
    const result = await db.query(
      `INSERT INTO leads (
         last_name, first_name, email, phone, occupation, interest_area, marketing_consent,
         landing_page_slug, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         id_user, workspace_owner_id, custom_fields
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, COALESCE($15::jsonb, '{}'::jsonb))
       RETURNING
         id,
         last_name AS "lastName",
         first_name AS "firstName",
         email,
         phone,
         occupation,
         interest_area AS "interestArea",
         marketing_consent AS "marketingConsent",
         landing_page_slug AS "landingPageSlug",
         utm_source AS "utmSource",
         utm_medium AS "utmMedium",
         utm_campaign AS "utmCampaign",
         utm_content AS "utmContent",
         utm_term AS "utmTerm",
         COALESCE(workspace_owner_id, id_user) AS "idUser",
         custom_fields AS "customFields",
         unsubscribe_token AS "unsubscribeToken",
         consent_withdrawn_at AS "consentWithdrawnAt",
         created_at AS "createdAt"`,
      [
        payload.lastName,
        payload.firstName,
        payload.email,
        payload.phone,
        payload.occupation,
        payload.interestArea,
        payload.marketingConsent,
        payload.landingPageSlug ?? null,
        payload.utmSource ?? null,
        payload.utmMedium ?? null,
        payload.utmCampaign ?? null,
        payload.utmContent ?? null,
        payload.utmTerm ?? null,
        payload.idUser,
        JSON.stringify(payload.customFields && typeof payload.customFields === 'object' ? payload.customFields : {}),
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * Lấy danh sách lead theo bộ lọc (dùng cho preview builder và node chiến dịch).
   *
   * Luồng hoạt động:
   * 1. Áp dụng khoảng ngày trên `created_at` nếu `useDateRange` bật và có from/to.
   * 2. Lọc `occupation` / `interest_area` nếu mảng filter không rỗng.
   * 3. Sắp xếp mới nhất trước, giới hạn `limit`.
   *
   * @param {object} filters
   * @param {boolean} filters.useDateRange
   * @param {string|null} filters.dateFrom YYYY-MM-DD
   * @param {string|null} filters.dateTo YYYY-MM-DD
   * @param {string[]} filters.occupations
   * @param {string[]} filters.interests
   * @param {number} filters.limit
   * @param {number} [filters.offset] Bỏ qua bản ghi đầu (phân trang), mặc định 0.
   * @returns {Promise<object[]>}
   */
  async findFiltered(filters) {
    const limit = clampLandingLeadsLimit(filters.limit, 1000);
    const offsetRaw = Number(filters.offset);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
    const { whereClause, params, idx } = buildLeadWhere(filters);
    params.push(limit);
    params.push(offset);

    const result = await db.query(
      `SELECT
         id,
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
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    return result.rows;
  }

  /**
   * Đếm tổng số bản ghi thỏa filter (không LIMIT) — dùng cho pagination meta.
   *
   * @param {object} filters Cùng shape với findFiltered (bỏ limit).
   * @returns {Promise<number>}
   */
  async countFiltered(filters) {
    const { whereClause, params } = buildLeadWhere(filters);
    const result = await db.query(`SELECT COUNT(*)::bigint AS c FROM leads ${whereClause}`, params);
    return Number(result.rows[0]?.c || 0);
  }

  /**
   * Tìm lead theo unsubscribe_token (UUID).
   *
   * @param {string} token
   * @returns {Promise<object|null>}
   */
  async findByUnsubscribeToken(token) {
    const result = await db.query(
      `SELECT
         id,
         last_name AS "lastName",
         first_name AS "firstName",
         email,
         phone,
         marketing_consent AS "marketingConsent",
         unsubscribe_token AS "unsubscribeToken",
         consent_withdrawn_at AS "consentWithdrawnAt",
         created_at AS "createdAt"
       FROM leads
       WHERE unsubscribe_token = $1
       LIMIT 1`,
      [token]
    );
    return result.rows[0] || null;
  }

  /**
   * Rút lại đồng ý tiếp thị cho lead theo id.
   * Cập nhật tại chỗ: marketing_consent = FALSE, consent_withdrawn_at = COALESCE(consent_withdrawn_at, NOW()).
   *
   * @param {number|string} id
   * @returns {Promise<object|null>}
   */
  async withdrawConsentById(id) {
    const result = await db.query(
      `UPDATE leads
       SET marketing_consent = FALSE,
           consent_withdrawn_at = COALESCE(consent_withdrawn_at, NOW())
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
   * Nhóm lead theo landing_page_slug cho giao diện thẻ (màn "Khách để lại thông tin").
   * Gom cả slug rỗng/null thành '__unknown__'. Không lọc theo slug (để thẻ hiện đủ).
   *
   * @param {object} filters cùng shape buildLeadWhere (bỏ landingSlugs)
   * @returns {Promise<Array<{ slug: string, total: number, latestAt: string|null }>>}
   */
  async aggregateGroupsBySlug(filters = {}) {
    const clone = { ...filters, landingSlugs: [] };
    const { whereClause, params } = buildLeadWhere(clone);
    // Nếu fail-closed (thiếu workspace) thì where đã có FALSE — trả rỗng tự nhiên.
    const result = await db.query(
      `SELECT
         COALESCE(NULLIF(TRIM(landing_page_slug), ''), '__unknown__') AS slug,
         COUNT(*)::bigint AS "total",
         MAX(created_at) AS "latestAt"
       FROM leads
       ${whereClause}
       GROUP BY COALESCE(NULLIF(TRIM(landing_page_slug), ''), '__unknown__')
       ORDER BY COUNT(*) DESC`,
      params
    );
    return result.rows.map((r) => ({
      slug: String(r.slug || '__unknown__'),
      total: Number(r.total || 0),
      latestAt: r.latestAt || null,
    }));
  }

  /**
   * Liệt kê khóa custom (kèm nhãn mới nhất) theo từng slug — để dựng cột động cho thẻ đã chọn.
   *
   * @param {object} filters cùng shape buildLeadWhere (bỏ landingSlugs)
   * @returns {Promise<Map<string, Array<{ key: string, labelVi: string|null }>>>}
   */
  async aggregateCustomKeysBySlug(filters = {}) {
    const clone = { ...filters, landingSlugs: [] };
    const { whereClause, params } = buildLeadWhere(clone, 'l');
    const { rows } = await db.query(
      `SELECT
         COALESCE(NULLIF(TRIM(l.landing_page_slug), ''), '__unknown__') AS slug,
         e.key AS "key",
         (array_agg(e.value->>'labelVi' ORDER BY l.created_at DESC, l.id DESC))[1] AS "labelVi"
       FROM leads l
       CROSS JOIN LATERAL jsonb_each(
         CASE WHEN jsonb_typeof(l.custom_fields) = 'object' THEN l.custom_fields ELSE '{}'::jsonb END
       ) AS e
       ${whereClause}
       GROUP BY 1, 2
       ORDER BY 1 ASC, 2 ASC`,
      params
    );
    const m = new Map();
    for (const r of rows) {
      const slug = String(r.slug || '__unknown__');
      if (!m.has(slug)) m.set(slug, []);
      m.get(slug).push({ key: r.key, labelVi: r.labelVi || null });
    }
    return m;
  }

  /**
   * Đếm lead submit theo landing_page_slug trong khoảng ngày (dashboard LP).
   *
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @param {{ workspaceOwnerId?: number|string, isSuperAdmin?: boolean }} scope
   * @returns {Promise<{ slug: string, submitCount: number }[]>}
   */
  async aggregateSubmitsBySlug(dateFrom, dateTo, scope = {}) {
    const conditions = [`landing_page_slug IS NOT NULL`, `TRIM(landing_page_slug) <> ''`];
    const params = [];
    let idx = 1;
    if (dateFrom) {
      conditions.push(`created_at >= $${idx}::timestamptz`);
      params.push(`${dateFrom}T00:00:00.000+07:00`); // ngày VN, không UTC (C2-04)
      idx += 1;
    }
    if (dateTo) {
      conditions.push(`created_at <= $${idx}::timestamptz`);
      params.push(`${dateTo}T23:59:59.999+07:00`); // ngày VN, không UTC (C2-04)
      idx += 1;
    }
    if (scope?.isSuperAdmin !== true) {
      const workspaceOwnerId = Number.parseInt(scope?.workspaceOwnerId, 10);
      if (!Number.isFinite(workspaceOwnerId)) return [];
      conditions.push(`COALESCE(workspace_owner_id, id_user) = $${idx}`);
      params.push(workspaceOwnerId);
      idx += 1;
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await db.query(
      `SELECT landing_page_slug AS slug, COUNT(*)::bigint AS "submitCount"
       FROM leads
       ${where}
       GROUP BY landing_page_slug`,
      params
    );
    return result.rows.map((r) => ({
      slug: r.slug,
      submitCount: Number(r.submitCount || 0),
    }));
  }
}

export default new LeadRepository();
