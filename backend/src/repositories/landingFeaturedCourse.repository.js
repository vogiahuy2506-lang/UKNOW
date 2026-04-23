import db from '../config/database.js';

/**
 * Repository bảng `landing_featured_courses` — khóa học nổi bật trên landing.
 */
class LandingFeaturedCourseRepository {
  /**
   * Map một dòng DB sang object camelCase cho API.
   *
   * @param {object} row
   * @returns {object}
   */
  _mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      sortOrder: row.sort_order,
      titleVi: row.title_vi,
      titleEn: row.title_en,
      tagVi: row.tag_vi,
      tagEn: row.tag_en,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Danh sách bản ghi đang hiển thị trên landing (active), sắp xếp theo sort_order.
   *
   * @returns {Promise<object[]>}
   */
  async findActiveOrdered() {
    const result = await db.query(
      `SELECT
         id,
         sort_order,
         title_vi,
         title_en,
         tag_vi,
         tag_en,
         image_url,
         link_url,
         is_active,
         created_at,
         updated_at
       FROM landing_featured_courses
       WHERE is_active = true
       ORDER BY sort_order ASC, id ASC`
    );
    return result.rows.map((r) => this._mapRow(r));
  }

  /**
   * Tất cả bản ghi (admin).
   *
   * @returns {Promise<object[]>}
   */
  async findAllOrdered() {
    const result = await db.query(
      `SELECT
         id,
         sort_order,
         title_vi,
         title_en,
         tag_vi,
         tag_en,
         image_url,
         link_url,
         is_active,
         created_at,
         updated_at
       FROM landing_featured_courses
       ORDER BY sort_order ASC, id ASC`
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
         title_vi,
         title_en,
         tag_vi,
         tag_en,
         image_url,
         link_url,
         is_active,
         created_at,
         updated_at
       FROM landing_featured_courses
       WHERE id = $1`,
      [id]
    );
    return this._mapRow(result.rows[0]);
  }

  /**
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async insert(payload) {
    const result = await db.query(
      `INSERT INTO landing_featured_courses (
         sort_order,
         title_vi, title_en,
         tag_vi, tag_en,
         image_url, link_url,
         is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING
         id,
         sort_order,
         title_vi,
         title_en,
         tag_vi,
         tag_en,
         image_url,
         link_url,
         is_active,
         created_at,
         updated_at`,
      [
        payload.sortOrder ?? 0,
        payload.titleVi,
        payload.titleEn,
        payload.tagVi ?? '',
        payload.tagEn ?? '',
        payload.imageUrl || null,
        payload.linkUrl,
        payload.isActive !== false,
      ]
    );
    return this._mapRow(result.rows[0]);
  }

  /**
   * Cập nhật toàn bộ các trường (PUT) — payload đã gộp đủ giá trị ở service.
   *
   * @param {number|string} id
   * @param {object} payload
   * @returns {Promise<object|null>}
   */
  async updateById(id, payload) {
    const result = await db.query(
      `UPDATE landing_featured_courses SET
         sort_order = $2,
         title_vi = $3,
         title_en = $4,
         tag_vi = $5,
         tag_en = $6,
         image_url = $7,
         link_url = $8,
         is_active = $9,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING
         id,
         sort_order,
         title_vi,
         title_en,
         tag_vi,
         tag_en,
         image_url,
         link_url,
         is_active,
         created_at,
         updated_at`,
      [
        id,
        payload.sortOrder ?? 0,
        payload.titleVi,
        payload.titleEn,
        payload.tagVi ?? '',
        payload.tagEn ?? '',
        payload.imageUrl || null,
        payload.linkUrl,
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
    const result = await db.query(`DELETE FROM landing_featured_courses WHERE id = $1`, [id]);
    return (result.rowCount || 0) > 0;
  }
}

export default new LandingFeaturedCourseRepository();
