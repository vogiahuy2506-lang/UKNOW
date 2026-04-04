import db from '../config/database.js';
import { clampLandingLeadsLimit } from '../utils/landingLeadsLimit.util.js';
import { expandLandingSlugsForSqlFilter } from '../utils/landingPageSlugCanonical.util.js';

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
         landing_page_slug, utm_source, utm_medium, utm_campaign, utm_content, utm_term
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
    const useDateRange = Boolean(filters.useDateRange);
    const dateFrom = String(filters.dateFrom || '').trim();
    const dateTo = String(filters.dateTo || '').trim();
    const occupations = Array.isArray(filters.occupations) ? filters.occupations.filter(Boolean) : [];
    const interests = Array.isArray(filters.interests) ? filters.interests.filter(Boolean) : [];
    const landingSlugs = Array.isArray(filters.landingSlugs)
      ? filters.landingSlugs.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const limit = clampLandingLeadsLimit(filters.limit, 1000);
    const offsetRaw = Number(filters.offset);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (useDateRange && dateFrom) {
      conditions.push(`created_at >= $${idx}::timestamptz`);
      params.push(`${dateFrom}T00:00:00.000Z`);
      idx += 1;
    }
    if (useDateRange && dateTo) {
      conditions.push(`created_at <= $${idx}::timestamptz`);
      params.push(`${dateTo}T23:59:59.999Z`);
      idx += 1;
    }
    if (occupations.length > 0) {
      conditions.push(`occupation = ANY($${idx}::text[])`);
      params.push(occupations);
      idx += 1;
    }
    if (interests.length > 0) {
      conditions.push(`interest_area = ANY($${idx}::text[])`);
      params.push(interests);
      idx += 1;
    }
    if (landingSlugs.length > 0) {
      // Mở rộng alias: lọc `l` vẫn khớp bản ghi lưu `/l` hoặc `/` (legacy / nhập sai)
      const slugVariants = expandLandingSlugsForSqlFilter(landingSlugs);
      conditions.push(`landing_page_slug = ANY($${idx}::text[])`);
      params.push(slugVariants);
      idx += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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
      conditions.push(`created_at >= $${idx}::timestamptz`);
      params.push(`${dateFrom}T00:00:00.000Z`);
      idx += 1;
    }
    if (useDateRange && dateTo) {
      conditions.push(`created_at <= $${idx}::timestamptz`);
      params.push(`${dateTo}T23:59:59.999Z`);
      idx += 1;
    }
    if (occupations.length > 0) {
      conditions.push(`occupation = ANY($${idx}::text[])`);
      params.push(occupations);
      idx += 1;
    }
    if (interests.length > 0) {
      conditions.push(`interest_area = ANY($${idx}::text[])`);
      params.push(interests);
      idx += 1;
    }
    if (landingSlugs.length > 0) {
      const slugVariants = expandLandingSlugsForSqlFilter(landingSlugs);
      conditions.push(`landing_page_slug = ANY($${idx}::text[])`);
      params.push(slugVariants);
      idx += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(`SELECT COUNT(*)::bigint AS c FROM leads ${whereClause}`, params);
    return Number(result.rows[0]?.c || 0);
  }

  /**
   * Đếm lead submit theo landing_page_slug trong khoảng ngày (dashboard LP).
   *
   * @param {string|null} dateFrom
   * @param {string|null} dateTo
   * @returns {Promise<{ slug: string, submitCount: number }[]>}
   */
  async aggregateSubmitsBySlug(dateFrom, dateTo) {
    const conditions = [`landing_page_slug IS NOT NULL`, `TRIM(landing_page_slug) <> ''`];
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
