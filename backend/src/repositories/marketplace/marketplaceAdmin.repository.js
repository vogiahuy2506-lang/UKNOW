import db from '../../config/database.js';

class MarketplaceAdminRepository {
  /**
   * Get all listings for admin (including unpublished)
   * @param {object} filters
   * @returns {Promise<object[]>}
   */
  async findAll({ status, resourceType, search, limit = 50, offset = 0 }) {
    let query = `
      SELECT ml.*, COALESCE(u.full_name, u.username) as seller_name, u.email as seller_email
      FROM marketplace_listings ml
      LEFT JOIN users u ON ml.id_user = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND ml.status = $${params.length}`;
    }

    if (resourceType) {
      params.push(resourceType);
      query += ` AND ml.resource_type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (ml.title ILIKE $${params.length} OR ml.description ILIKE $${params.length})`;
    }

    query += ` ORDER BY ml.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * Count all listings for admin
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async countAll({ status, resourceType, search }) {
    let query = 'SELECT COUNT(*) FROM marketplace_listings ml WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND ml.status = $${params.length}`;
    }

    if (resourceType) {
      params.push(resourceType);
      query += ` AND ml.resource_type = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (ml.title ILIKE $${params.length} OR ml.description ILIKE $${params.length})`;
    }

    const { rows } = await db.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  /**
   * Update listing status (admin)
   * @param {number} id
   * @param {string} status
   * @returns {Promise<object|null>}
   */
  async updateStatus(id, status) {
    const { rows } = await db.query(
      `UPDATE marketplace_listings
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status]
    );
    return rows[0] || null;
  }

  /**
   * Delete listing (admin)
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const { rowCount } = await db.query(
      'DELETE FROM marketplace_listings WHERE id = $1',
      [id]
    );
    return rowCount > 0;
  }

  /**
   * Get marketplace statistics
   * @returns {Promise<object>}
   */
  async getStats() {
    const { rows: totalRows } = await db.query(
      `SELECT COUNT(*) as total FROM marketplace_listings`
    );

    const { rows: statusRows } = await db.query(
      `SELECT status, COUNT(*) as count
       FROM marketplace_listings
       GROUP BY status`
    );

    const { rows: revenueRows } = await db.query(
      `SELECT SUM(credits_spent) as total_credits
       FROM marketplace_purchases
       WHERE transaction_type = 'purchase'`
    );

    const { rows: topSellers } = await db.query(
      `SELECT ml.id_user, u.full_name, u.username,
              COUNT(*) as listing_count,
              COALESCE(SUM(mp.credits_spent), 0) as total_revenue
       FROM marketplace_listings ml
       JOIN users u ON ml.id_user = u.id
       LEFT JOIN marketplace_purchases mp ON ml.id = mp.listing_id AND mp.transaction_type = 'purchase'
       WHERE ml.status = 'published'
       GROUP BY ml.id_user, u.full_name, u.username
       ORDER BY total_revenue DESC
       LIMIT 10`
    );

    return {
      totalListings: parseInt(totalRows[0].total, 10),
      byStatus: statusRows.reduce((acc, r) => {
        acc[r.status] = parseInt(r.count, 10);
        return acc;
      }, {}),
      totalRevenue: parseInt(revenueRows[0].total_credits || 0, 10),
      topSellers,
    };
  }
}

export default new MarketplaceAdminRepository();
