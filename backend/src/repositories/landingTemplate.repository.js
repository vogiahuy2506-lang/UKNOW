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
    const userId = Number.parseInt(scope?.userId, 10);
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
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_page_templates
       WHERE is_active = TRUE
       ORDER BY id ASC`
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
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM landing_page_templates
       WHERE category = $1 AND is_active = TRUE
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
       WHERE is_active = TRUE
       GROUP BY category
       ORDER BY category ASC`
    );
    return result.rows;
  }
}

export default new LandingTemplateRepository();
