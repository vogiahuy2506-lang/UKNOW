import db from '../config/database.js';
import { clampLandingLeadsLimit } from '../utils/landingLeadsLimit.util.js';

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
         last_name, first_name, email, phone, occupation, interest_area, marketing_consent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
         id,
         last_name AS "lastName",
         first_name AS "firstName",
         email,
         phone,
         occupation,
         interest_area AS "interestArea",
         marketing_consent AS "marketingConsent",
         created_at AS "createdAt"`,
      [
        payload.lastName,
        payload.firstName,
        payload.email,
        payload.phone,
        payload.occupation,
        payload.interestArea,
        payload.marketingConsent,
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
   * @returns {Promise<object[]>}
   */
  async findFiltered(filters) {
    const useDateRange = Boolean(filters.useDateRange);
    const dateFrom = String(filters.dateFrom || '').trim();
    const dateTo = String(filters.dateTo || '').trim();
    const occupations = Array.isArray(filters.occupations) ? filters.occupations.filter(Boolean) : [];
    const interests = Array.isArray(filters.interests) ? filters.interests.filter(Boolean) : [];
    const limit = clampLandingLeadsLimit(filters.limit, 1000);

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

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

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
         created_at AS "createdAt"
       FROM leads
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
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

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(`SELECT COUNT(*)::bigint AS c FROM leads ${whereClause}`, params);
    return Number(result.rows[0]?.c || 0);
  }
}

export default new LeadRepository();
