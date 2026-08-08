import db from '../../config/database.js';

class MarketplaceFavoriteRepository {
  /**
   * Add favorite
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<object>}
   */
  async add(userId, listingId) {
    const { rows } = await db.query(
      `INSERT INTO marketplace_favorites (id_user, listing_id)
       VALUES ($1, $2)
       ON CONFLICT (id_user, listing_id) DO NOTHING
       RETURNING *`,
      [userId, listingId]
    );
    return rows[0];
  }

  /**
   * Remove favorite
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<boolean>}
   */
  async remove(userId, listingId) {
    const { rowCount } = await db.query(
      'DELETE FROM marketplace_favorites WHERE id_user = $1 AND listing_id = $2',
      [userId, listingId]
    );
    return rowCount > 0;
  }

  /**
   * Check if listing is favorited
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<boolean>}
   */
  async isFavorited(userId, listingId) {
    const { rows } = await db.query(
      'SELECT 1 FROM marketplace_favorites WHERE id_user = $1 AND listing_id = $2',
      [userId, listingId]
    );
    return rows.length > 0;
  }

  /**
   * Get user's favorites
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object[]>}
   */
  async findByUserId(userId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT ml.*, COALESCE(u.full_name, u.username) as seller_name, mf.created_at as favorited_at
       FROM marketplace_favorites mf
       JOIN marketplace_listings ml ON mf.listing_id = ml.id
       LEFT JOIN users u ON ml.id_user = u.id
       WHERE mf.id_user = $1 AND ml.status = 'published'
       ORDER BY mf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  }

  /**
   * Count user's favorites
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async countByUserId(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM marketplace_favorites mf
       JOIN marketplace_listings ml ON mf.listing_id = ml.id
       WHERE mf.id_user = $1 AND ml.status = 'published'`,
      [userId]
    );
    return parseInt(rows[0].count, 10);
  }
}

export default new MarketplaceFavoriteRepository();
