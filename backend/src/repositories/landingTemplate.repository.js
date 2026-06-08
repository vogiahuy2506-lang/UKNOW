import db from '../config/database.js';

/**
 * Repository for landing_page_templates table.
 */
class LandingTemplateRepository {
  /**
   * @param {object} scope
   * @param {number} scope.userId
   * @returns {Promise<object[]>}
   */
  async listAll(scope = {}) {
    const result = await db.query(
      `SELECT
         id,
         name,
         category,
         description,
         thumbnail_url AS "thumbnailUrl",
         html_structure AS "htmlStructure",
         css_variables AS "cssVariables",
         default_config AS "defaultConfig",
         is_active AS "isActive",
         is_public AS "isPublic",
         user_id AS "userId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_page_templates
       WHERE is_active = TRUE AND (is_public = TRUE OR user_id = $1)
       ORDER BY id ASC`,
      [scope?.userId || 0]
    );
    return result.rows;
  }

  /**
   * Get only public templates.
   * @returns {Promise<object[]>}
   */
  async listPublic() {
    const result = await db.query(
      `SELECT
         id,
         name,
         category,
         description,
         thumbnail_url AS "thumbnailUrl",
         is_public AS "isPublic",
         created_at AS "createdAt"
       FROM landing_page_templates
       WHERE is_active = TRUE AND is_public = TRUE
       ORDER BY id ASC`
    );
    return result.rows;
  }

  /**
   * Get templates created by a specific user.
   * @param {number} userId
   * @returns {Promise<object[]>}
   */
  async listByUser(userId) {
    const result = await db.query(
      `SELECT
         id,
         name,
         category,
         description,
         thumbnail_url AS "thumbnailUrl",
         html_structure AS "htmlStructure",
         css_variables AS "cssVariables",
         default_config AS "defaultConfig",
         is_active AS "isActive",
         is_public AS "isPublic",
         user_id AS "userId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_page_templates
       WHERE is_active = TRUE AND user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * @param {string} category
   * @returns {Promise<object[]>}
   */
  async listByCategory(category) {
    const result = await db.query(
      `SELECT
         id,
         name,
         category,
         description,
         thumbnail_url AS "thumbnailUrl",
         html_structure AS "htmlStructure",
         css_variables AS "cssVariables",
         default_config AS "defaultConfig",
         is_active AS "isActive",
         is_public AS "isPublic",
         user_id AS "userId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_page_templates
       WHERE category = $1 AND is_active = TRUE AND is_public = TRUE
       ORDER BY id ASC`,
      [category]
    );
    return result.rows;
  }

  /**
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const result = await db.query(
      `SELECT
         id,
         name,
         category,
         description,
         thumbnail_url AS "thumbnailUrl",
         html_structure AS "htmlStructure",
         css_variables AS "cssVariables",
         default_config AS "defaultConfig",
         is_active AS "isActive",
         is_public AS "isPublic",
         user_id AS "userId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_page_templates
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findActiveById(id) {
    const result = await db.query(
      `SELECT
         id,
         name,
         category,
         description,
         thumbnail_url AS "thumbnailUrl",
         html_structure AS "htmlStructure",
         css_variables AS "cssVariables",
         default_config AS "defaultConfig",
         is_active AS "isActive",
         is_public AS "isPublic",
         user_id AS "userId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_page_templates
       WHERE id = $1 AND is_active = TRUE
       LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get available categories with count.
   * @returns {Promise<object[]>}
   */
  async getCategoriesWithCount() {
    const result = await db.query(
      `SELECT category, COUNT(*)::int AS count
       FROM landing_page_templates
       WHERE is_active = TRUE AND is_public = TRUE
       GROUP BY category
       ORDER BY category ASC`
    );
    return result.rows;
  }

  /**
   * Create a new template.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const {
      name,
      description,
      htmlStructure,
      category = 'Custom',
      thumbnailUrl,
      cssVariables,
      defaultConfig,
      isPublic = false,
      userId,
    } = data;

    const result = await db.query(
      `INSERT INTO landing_page_templates 
       (name, description, html_structure, category, thumbnail_url, css_variables, default_config, is_public, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING 
         id,
         name,
         category,
         description,
         thumbnail_url AS "thumbnailUrl",
         html_structure AS "htmlStructure",
         css_variables AS "cssVariables",
         default_config AS "defaultConfig",
         is_active AS "isActive",
         is_public AS "isPublic",
         user_id AS "userId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [name, description, htmlStructure, category, thumbnailUrl, cssVariables, defaultConfig, isPublic, userId]
    );
    return result.rows[0];
  }

  /**
   * Soft delete a template (only by owner).
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteByIdAndUser(id, userId) {
    const result = await db.query(
      `UPDATE landing_page_templates
       SET is_active = FALSE
       WHERE id = $1 AND user_id = $2 AND is_active = TRUE
       RETURNING id`,
      [id, userId]
    );
    return result.rowCount > 0;
  }
}

export default new LandingTemplateRepository();
