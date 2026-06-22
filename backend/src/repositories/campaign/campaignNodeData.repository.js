import db from '../../config/database.js';
import { isSuperAdmin } from '../../utils/roleScope.util.js';

class CampaignNodeDataRepository {
  /**
   * Fetch courses matching the given IDs, with optional search/status filters.
   *
   * @param {number[]} selectedCourseIds
   * @param {string} searchTerm
   * @param {string[]} selectedStatuses
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async findCoursesById(selectedCourseIds, searchTerm, selectedStatuses, limit) {
    const queryParams = [selectedCourseIds];
    let paramIdx = 2;
    let whereClause = 'WHERE c.id = ANY($1)';
    if (searchTerm) {
      whereClause += ` AND (c.course_name ILIKE $${paramIdx} OR c.course_code ILIKE $${paramIdx})`;
      queryParams.push(`%${searchTerm}%`);
      paramIdx += 1;
    }
    if (selectedStatuses.length > 0) {
      whereClause += ` AND c.status = ANY($${paramIdx})`;
      queryParams.push(selectedStatuses);
      paramIdx += 1;
    }
    queryParams.push(limit);

    const result = await db.query(
      `SELECT
         c.id,
         c.course_code AS "courseCode",
         c.course_name AS "courseName",
         c.price,
         c.original_price AS "originalPrice",
         c.status,
         c.description,
         c.category,
         c.thumbnail_url AS "thumbnailUrl",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt"
       FROM courses c
       ${whereClause}
       ORDER BY c.id DESC
       LIMIT $${paramIdx}`,
      queryParams
    );
    return result.rows;
  }

  /**
   * Fetch products matching the given IDs, with optional search/status filters.
   *
   * @param {number[]} selectedProductIds
   * @param {string} searchTerm
   * @param {string[]} selectedStatuses
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async findProductsById(selectedProductIds, searchTerm, selectedStatuses, limit, userId, role = null) {
    const queryParams = [selectedProductIds];
    let paramIdx = 2;
    let whereClause = 'WHERE p.id = ANY($1)';
    if (!isSuperAdmin(role) && userId != null) {
      whereClause += ` AND p.id_user = $${paramIdx}`;
      queryParams.push(userId);
      paramIdx += 1;
    }
    if (searchTerm) {
      whereClause += ` AND (p.product_name ILIKE $${paramIdx} OR p.product_code ILIKE $${paramIdx})`;
      queryParams.push(`%${searchTerm}%`);
      paramIdx += 1;
    }
    if (selectedStatuses.length > 0) {
      whereClause += ` AND p.status = ANY($${paramIdx})`;
      queryParams.push(selectedStatuses);
      paramIdx += 1;
    }
    queryParams.push(limit);

    const result = await db.query(
      `SELECT
         p.id,
         p.product_code AS "productCode",
         p.product_name AS "productName",
         p.price,
         p.original_price AS "originalPrice",
         p.status,
         p.description,
         p.usp,
         p.category,
         p.thumbnail_url AS "thumbnailUrl",
         p.created_at AS "createdAt",
         p.updated_at AS "updatedAt"
       FROM products p
       ${whereClause}
       ORDER BY p.id DESC
       LIMIT $${paramIdx}`,
      queryParams
    );
    return result.rows;
  }

  /**
   * Preload existing customers by email/phone within a transaction.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} userId
   * @param {string[]} preloadEmails
   * @param {string[]} preloadPhones
   * @returns {Promise<object[]>}
   */
  async preloadCustomersByEmailPhone(client, userId, preloadEmails, preloadPhones) {
    const parts = [];
    const params = [userId];
    let pi = 2;
    if (preloadEmails.length > 0) {
      parts.push(`LOWER(email) = ANY($${pi}::text[])`);
      params.push(preloadEmails);
      pi += 1;
    }
    if (preloadPhones.length > 0) {
      parts.push(`phone = ANY($${pi}::text[])`);
      params.push(preloadPhones);
      pi += 1;
    }
    const sql = `SELECT * FROM customers WHERE id_user = $1 AND (${parts.join(' OR ')})`;
    const { rows } = await client.query(sql, params);
    return rows;
  }

  /**
   * Update an existing customer record within a transaction.
   *
   * @param {import('pg').PoolClient} client
   * @param {object} params
   * @returns {Promise<void>}
   */
  async updateCustomer(client, { email, phone, fullName, gender, customerSource, notes, id, userId }) {
    await client.query(
      `UPDATE customers SET
         email = COALESCE($1, email),
         phone = COALESCE($2, phone),
         full_name = COALESCE($3, full_name),
         gender = COALESCE($4, gender),
         customer_source = COALESCE($5, customer_source),
         notes = COALESCE($6, notes),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND id_user = $8`,
      [email, phone, fullName, gender, customerSource, notes, id, userId]
    );
  }

  /**
   * Insert a new customer record within a transaction.
   *
   * @param {import('pg').PoolClient} client
   * @param {object} params
   * @returns {Promise<object>} inserted row
   */
  async insertCustomer(client, { userId, email, phone, fullName, gender, customerSource, notes }) {
    const result = await client.query(
      `INSERT INTO customers (id_user, email, phone, full_name, gender, customer_source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, email, phone, fullName, gender, customerSource, notes]
    );
    return result.rows[0];
  }

  /**
   * Begin a transaction on the given client.
   *
   * @param {import('pg').PoolClient} client
   * @returns {Promise<void>}
   */
  async beginTransaction(client) {
    await client.query('BEGIN');
  }

  /**
   * Set LOCAL statement_timeout within a transaction.
   *
   * @param {import('pg').PoolClient} client
   * @param {number} timeoutMs 0 disables the limit
   * @returns {Promise<void>}
   */
  async setLocalStatementTimeout(client, timeoutMs) {
    if (timeoutMs > 0) {
      await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    } else {
      await client.query('SET LOCAL statement_timeout = 0');
    }
  }

  /**
   * Commit a transaction on the given client.
   *
   * @param {import('pg').PoolClient} client
   * @returns {Promise<void>}
   */
  async commitTransaction(client) {
    await client.query('COMMIT');
  }

  /**
   * Rollback a transaction on the given client.
   *
   * @param {import('pg').PoolClient} client
   * @returns {Promise<void>}
   */
  async rollbackTransaction(client) {
    await client.query('ROLLBACK');
  }
}

export default new CampaignNodeDataRepository();
