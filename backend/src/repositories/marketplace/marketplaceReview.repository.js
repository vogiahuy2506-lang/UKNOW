import db from '../../config/database.js';

class MarketplaceReviewRepository {
  /**
   * Create a review
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const { idUser, listingId, rating, reviewText } = data;
    const { rows } = await db.query(
      `INSERT INTO marketplace_reviews (id_user, listing_id, rating, review_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id_user, listing_id)
       DO UPDATE SET rating = $3, review_text = $4, updated_at = NOW()
       RETURNING *`,
      [idUser, listingId, rating, reviewText]
    );
    return rows[0];
  }

  /**
   * Find reviews by listing ID
   * @param {number} listingId
   * @param {object} options
   * @returns {Promise<object[]>}
   */
  async findByListingId(listingId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT mr.*, COALESCE(u.full_name, u.username) as reviewer_name
       FROM marketplace_reviews mr
       LEFT JOIN users u ON mr.id_user = u.id
       WHERE mr.listing_id = $1
       ORDER BY mr.created_at DESC
       LIMIT $2 OFFSET $3`,
      [listingId, limit, offset]
    );
    return rows;
  }

  /**
   * Count reviews by listing ID
   * @param {number} listingId
   * @returns {Promise<number>}
   */
  async countByListingId(listingId) {
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM marketplace_reviews WHERE listing_id = $1',
      [listingId]
    );
    return parseInt(rows[0].count, 10);
  }

  /**
   * Get user's review for a listing
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<object|null>}
   */
  async findByUserAndListing(userId, listingId) {
    const { rows } = await db.query(
      'SELECT * FROM marketplace_reviews WHERE id_user = $1 AND listing_id = $2',
      [userId, listingId]
    );
    return rows[0] || null;
  }

  /**
   * Calculate average rating for a listing
   * @param {number} listingId
   * @returns {Promise<{avg: number, count: number}>}
   */
  async getAverageRating(listingId) {
    const { rows } = await db.query(
      `SELECT COALESCE(AVG(rating), 0) as avg, COUNT(*) as count
       FROM marketplace_reviews WHERE listing_id = $1`,
      [listingId]
    );
    return {
      avg: parseFloat(rows[0].avg) || 0,
      count: parseInt(rows[0].count, 10) || 0,
    };
  }
}

export default new MarketplaceReviewRepository();
