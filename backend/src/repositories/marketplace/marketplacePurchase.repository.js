import db from '../../config/database.js';

class MarketplacePurchaseRepository {
  /**
   * Check if user has already purchased a listing
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<object|null>}
   */
  async findByUserAndListing(userId, listingId) {
    const { rows } = await db.query(
      `SELECT * FROM marketplace_purchases WHERE id_user = $1 AND listing_id = $2`,
      [userId, listingId]
    );
    return rows[0] || null;
  }

  /**
   * Check within transaction
   * @param {object} client
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<object|null>}
   */
  async findByUserAndListingTx(client, userId, listingId) {
    const { rows } = await client.query(
      `SELECT * FROM marketplace_purchases WHERE id_user = $1 AND listing_id = $2`,
      [userId, listingId]
    );
    return rows[0] || null;
  }

  /**
   * Create purchase record within transaction
   * @param {object} client
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createTx(client, data) {
    const {
      idUser,
      listingId,
      sellerId,
      creditsSpent,
      transactionType,
      clonedResourceId,
      clonedResourceType,
    } = data;

    const { rows } = await client.query(
      `INSERT INTO marketplace_purchases
       (id_user, listing_id, seller_id, credits_spent, transaction_type, cloned_resource_id, cloned_resource_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [idUser, listingId, sellerId, creditsSpent, transactionType, clonedResourceId, clonedResourceType]
    );
    return rows[0];
  }

  /**
   * Get user's purchases
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object[]>}
   */
  async findByUserId(userId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT mp.*,
              ml.title, ml.description, ml.resource_type, ml.snapshot_data,
              COALESCE(u.full_name, u.username) as seller_name
       FROM marketplace_purchases mp
       JOIN marketplace_listings ml ON mp.listing_id = ml.id
       LEFT JOIN users u ON mp.seller_id = u.id
       WHERE mp.id_user = $1 AND mp.transaction_type = 'purchase'
       ORDER BY mp.purchased_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  }

  /**
   * Count user's purchases
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async countByUserId(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM marketplace_purchases
       WHERE id_user = $1 AND transaction_type = 'purchase'`,
      [userId]
    );
    return parseInt(rows[0].count, 10);
  }

  /**
   * Check if a chatbot was purchased from marketplace
   * @param {number} chatbotId
   * @returns {Promise<boolean>}
   */
  async isChatbotPurchased(chatbotId) {
    const { rows } = await db.query(
      `SELECT 1 FROM marketplace_purchases
       WHERE cloned_resource_type = 'chatbot' AND cloned_resource_id = $1
       LIMIT 1`,
      [chatbotId]
    );
    return rows.length > 0;
  }
}

export default new MarketplacePurchaseRepository();
