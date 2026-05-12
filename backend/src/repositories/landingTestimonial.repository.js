import db from '../config/database.js';

/**
 * Repository bảng `landing_testimonials` — đánh giá trên landing.
 */
class LandingTestimonialRepository {
  /**
   * Map một dòng DB sang object camelCase cho API.
   *
   * @param {object} row
   * @returns {object|null}
   */
  _mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      sortOrder: row.sort_order,
      quoteVi: row.quote_vi,
      quoteEn: row.quote_en,
      starRating: row.star_rating,
      nameVi: row.name_vi,
      nameEn: row.name_en,
      roleVi: row.role_vi,
      roleEn: row.role_en,
      locationVi: row.location_vi,
      locationEn: row.location_en,
      imageUrl: row.image_url,
      isActive: row.is_active,
      idUser: row.id_user,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Danh sách đang hiển thị (active), sắp xếp theo sort_order.
   *
   * @returns {Promise<object[]>}
   */
  async findActiveOrdered() {
    const result = await db.query(
      `SELECT
         id,
         sort_order,
         quote_vi,
         quote_en,
         star_rating,
         name_vi,
         name_en,
         role_vi,
         role_en,
         location_vi,
         location_en,
         image_url,
         is_active,
         created_at,
         updated_at
       FROM landing_testimonials
       WHERE is_active = true
       ORDER BY sort_order ASC, id ASC`
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  /**
   * Tất cả bản ghi (admin).
   *
   * @param {number|string} userId
   * @returns {Promise<object[]>}
   */
  async findAllOrdered(userId) {
    const result = await db.query(
      `SELECT
         id,
         sort_order,
         quote_vi,
         quote_en,
         star_rating,
         name_vi,
         name_en,
         role_vi,
         role_en,
         location_vi,
         location_en,
         image_url,
         is_active,
         id_user,
         created_at,
         updated_at
       FROM landing_testimonials
       WHERE id_user = $1
       ORDER BY sort_order ASC, id ASC`,
      [userId]
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  /**
   * @param {number|string} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const result = await db.query(
      `SELECT
         id,
         sort_order,
         quote_vi,
         quote_en,
         star_rating,
         name_vi,
         name_en,
         role_vi,
         role_en,
         location_vi,
         location_en,
         image_url,
         is_active,
         id_user,
         created_at,
         updated_at
       FROM landing_testimonials
       WHERE id = $1`,
      [id]
    );
    return this._mapRow(result.rows[0]);
  }

  async insert(payload) {
    const result = await db.query(
      `INSERT INTO landing_testimonials (
         sort_order,
         quote_vi, quote_en,
         star_rating,
         name_vi, name_en,
         role_vi, role_en,
         location_vi, location_en,
         image_url,
         is_active,
         id_user
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING
         id,
         sort_order,
         quote_vi,
         quote_en,
         star_rating,
         name_vi,
         name_en,
         role_vi,
         role_en,
         location_vi,
         location_en,
         image_url,
         is_active,
         id_user,
         created_at,
         updated_at`,
      [
        payload.sortOrder ?? 0,
        payload.quoteVi,
        payload.quoteEn,
        payload.starRating,
        payload.nameVi,
        payload.nameEn,
        payload.roleVi ?? '',
        payload.roleEn ?? '',
        payload.locationVi ?? '',
        payload.locationEn ?? '',
        payload.imageUrl || null,
        payload.isActive !== false,
        payload.idUser,
      ]
    );
    return this._mapRow(result.rows[0]);
  }

  /**
   * @param {number|string} id
   * @param {object} payload
   * @returns {Promise<object|null>}
   */
  async updateById(id, payload) {
    const result = await db.query(
      `UPDATE landing_testimonials SET
         sort_order = $2,
         quote_vi = $3,
         quote_en = $4,
         star_rating = $5,
         name_vi = $6,
         name_en = $7,
         role_vi = $8,
         role_en = $9,
         location_vi = $10,
         location_en = $11,
         image_url = $12,
         is_active = $13,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING
         id,
         sort_order,
         quote_vi,
         quote_en,
         star_rating,
         name_vi,
         name_en,
         role_vi,
         role_en,
         location_vi,
         location_en,
         image_url,
         is_active,
         created_at,
         updated_at`,
      [
        id,
        payload.sortOrder ?? 0,
        payload.quoteVi,
        payload.quoteEn,
        payload.starRating,
        payload.nameVi,
        payload.nameEn,
        payload.roleVi ?? '',
        payload.roleEn ?? '',
        payload.locationVi ?? '',
        payload.locationEn ?? '',
        payload.imageUrl || null,
        payload.isActive !== false,
      ]
    );
    return this._mapRow(result.rows[0]);
  }

  /**
   * @param {number|string} id
   * @returns {Promise<boolean>}
   */
  async deleteById(id) {
    const result = await db.query(`DELETE FROM landing_testimonials WHERE id = $1`, [id]);
    return (result.rowCount || 0) > 0;
  }
}

export default new LandingTestimonialRepository();
