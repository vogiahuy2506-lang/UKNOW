import db from '../config/database.js';

const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Repository bảng `landing_pages` (HTML động /lp/:slug).
 */
class LandingPageRepository {
  /**
   * @param {string} slug
   * @returns {boolean}
   */
  isValidSlug(slug) {
    return typeof slug === 'string' && SLUG_RE.test(slug);
  }

  /**
   * @param {string} slug
   * @returns {Promise<object|null>}
   */
  async findPublishedBySlug(slug) {
    const s = String(slug || '').trim().toLowerCase();
    if (!this.isValidSlug(s)) return null;
    const result = await db.query(
      `SELECT
         id,
         slug,
         title,
         html_content AS "htmlContent",
         is_published AS "isPublished",
         id_user AS "idUser",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_pages
       WHERE slug = $1 AND is_published = TRUE
       LIMIT 1`,
      [s]
    );
    return result.rows[0] || null;
  }

  /**
   * @param {string} slug
   * @returns {Promise<object|null>}
   */
  async findBySlugAny(slug) {
    const s = String(slug || '').trim().toLowerCase();
    if (!this.isValidSlug(s)) return null;
    const result = await db.query(
      `SELECT
         id,
         slug,
         title,
         html_content AS "htmlContent",
         is_published AS "isPublished",
         id_user AS "idUser",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_pages
       WHERE slug = $1
       LIMIT 1`,
      [s]
    );
    return result.rows[0] || null;
  }

  /**
   * @returns {Promise<object[]>}
   */
  async listAllForAdmin() {
    const result = await db.query(
      `SELECT
         id,
         slug,
         title,
         is_published AS "isPublished",
         id_user AS "idUser",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_pages
       ORDER BY updated_at DESC`
    );
    return result.rows;
  }

  /**
   * Slug + tiêu đề các landing đang công bố — dùng gộp vào thống kê dashboard (kể cả chưa có event).
   *
   * @returns {Promise<{ slug: string, title: string }[]>}
   */
  async listPublishedSlugsWithTitles() {
    const result = await db.query(
      `SELECT slug, COALESCE(title, '') AS title
       FROM landing_pages
       WHERE is_published = TRUE
       ORDER BY slug ASC`
    );
    return result.rows.map((r) => ({
      slug: String(r.slug || '').trim().toLowerCase(),
      title: r.title != null ? String(r.title) : '',
    }));
  }

  /**
   * Tra cứu nhanh tiêu đề CMS theo danh sách slug (chỉ slug thỏa format bảng `landing_pages`).
   * Dùng để gắn nhãn hiển thị cho thống kê dashboard mà không N+1 query từng slug.
   *
   * @param {string[]} slugs
   * @returns {Promise<Map<string, string>>} slug (lowercase) → title (có thể rỗng)
   */
  async findTitlesBySlugs(slugs) {
    const unique = [
      ...new Set(
        (slugs || [])
          .map((s) => String(s || '').trim().toLowerCase())
          .filter((s) => this.isValidSlug(s))
      ),
    ];
    if (unique.length === 0) return new Map();
    const result = await db.query(
      `SELECT slug, title FROM landing_pages WHERE slug = ANY($1::text[])`,
      [unique]
    );
    const m = new Map();
    for (const row of result.rows) {
      m.set(row.slug, row.title != null ? String(row.title) : '');
    }
    return m;
  }

  /**
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const result = await db.query(
      `SELECT
         id,
         slug,
         title,
         html_content AS "htmlContent",
         is_published AS "isPublished",
         id_user AS "idUser",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_pages
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async insert(payload) {
    const result = await db.query(
      `INSERT INTO landing_pages (slug, title, html_content, is_published, id_user, created_at, updated_at)
       VALUES (LOWER(TRIM($1)), $2, $3, COALESCE($4, false), $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING
         id,
         slug,
         title,
         html_content AS "htmlContent",
         is_published AS "isPublished",
         id_user AS "idUser",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        payload.slug,
        String(payload.title || '').trim(),
        String(payload.htmlContent ?? ''),
        Boolean(payload.isPublished),
        payload.idUser ?? null,
      ]
    );
    return result.rows[0];
  }

  /**
   * @param {number} id
   * @param {object} payload
   * @returns {Promise<object|null>}
   */
  async updateById(id, payload) {
    const result = await db.query(
      `UPDATE landing_pages SET
         slug = LOWER(TRIM($2)),
         title = $3,
         html_content = $4,
         is_published = $5,
         id_user = COALESCE($6, id_user),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING
         id,
         slug,
         title,
         html_content AS "htmlContent",
         is_published AS "isPublished",
         id_user AS "idUser",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        id,
        payload.slug,
        String(payload.title || '').trim(),
        String(payload.htmlContent ?? ''),
        Boolean(payload.isPublished),
        payload.idUser ?? null,
      ]
    );
    return result.rows[0] || null;
  }

  /**
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async deleteById(id) {
    const result = await db.query('DELETE FROM landing_pages WHERE id = $1', [id]);
    return Number(result.rowCount || 0) > 0;
  }
}

export default new LandingPageRepository();
