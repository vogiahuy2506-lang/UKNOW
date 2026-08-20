import db from '../../config/database.js';

class MarketplaceListingRepository {
  /**
   * Create a new marketplace listing
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create(data) {
    const {
      idUser,
      resourceType,
      resourceId,
      title,
      description,
      category,
      tags,
      priceCredits,
      visibility,
      status,
      snapshotData,
    } = data;

    const { rows } = await db.query(
      `INSERT INTO marketplace_listings
       (id_user, resource_type, resource_id, title, description, category, tags, price_credits, visibility, status, snapshot_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [idUser, resourceType, resourceId, title, description, category, tags, priceCredits || 0, visibility || 'public', status || 'draft', JSON.stringify(snapshotData)]
    );
    return rows[0];
  }

  /**
   * Find listing by ID
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const { rows } = await db.query(
      `SELECT ml.*, u.full_name as seller_name, u.username as seller_username
       FROM marketplace_listings ml
       LEFT JOIN users u ON ml.id_user = u.id
       WHERE ml.id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Find listing by ID within transaction
   * @param {object} client
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findByIdTx(client, id) {
    const { rows } = await client.query(
      `SELECT ml.*, u.full_name as seller_name, u.username as seller_username
       FROM marketplace_listings ml
       LEFT JOIN users u ON ml.id_user = u.id
       WHERE ml.id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Find all listings by user
   * @param {number} userId
   * @param {object} filters
   * @returns {Promise<object[]>}
   */
  async findByUserId(userId, filters = {}) {
    const { status, limit = 20, offset = 0 } = filters;
    let query = `
      SELECT ml.*,
             COALESCE(u.full_name, u.username) as seller_name
      FROM marketplace_listings ml
      LEFT JOIN users u ON ml.id_user = u.id
      WHERE ml.id_user = $1
    `;
    const params = [userId];

    if (status) {
      params.push(status);
      query += ` AND ml.status = $${params.length}`;
    }

    query += ` ORDER BY ml.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * Count listings by user
   * @param {number} userId
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async countByUserId(userId, filters = {}) {
    const { status } = filters;
    let query = 'SELECT COUNT(*) FROM marketplace_listings WHERE id_user = $1';
    const params = [userId];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    const { rows } = await db.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  /**
   * Update listing
   * @param {number} id
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  async update(id, userId, data) {
    const { title, description, category, tags, priceCredits, visibility, status } = data;
    const updates = [];
    const params = [id, userId];

    if (title !== undefined) {
      params.push(title);
      updates.push(`title = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${params.length}`);
    }
    if (category !== undefined) {
      params.push(category);
      updates.push(`category = $${params.length}`);
    }
    if (tags !== undefined) {
      params.push(tags);
      updates.push(`tags = $${params.length}`);
    }
    if (priceCredits !== undefined) {
      params.push(priceCredits);
      updates.push(`price_credits = $${params.length}`);
    }
    if (visibility !== undefined) {
      params.push(visibility);
      updates.push(`visibility = $${params.length}`);
    }
    if (status !== undefined) {
      params.push(status);
      updates.push(`status = $${params.length}`);
      if (status === 'published') {
        updates.push('published_at = COALESCE(published_at, NOW())');
      }
    }

    if (updates.length === 0) return this.findById(id);

    const { rows } = await db.query(
      `UPDATE marketplace_listings SET ${updates.join(', ')}
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      params
    );
    return rows[0] || null;
  }

  /**
   * Delete listing
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async delete(id, userId) {
    const { rowCount } = await db.query(
      'DELETE FROM marketplace_listings WHERE id = $1 AND id_user = $2',
      [id, userId]
    );
    return rowCount > 0;
  }

  /**
   * Browse listings (public)
   * @param {object} params
   * @returns {Promise<object[]>}
   */
  async browse({
    resourceType,
    category,
    sort = 'rating',
    page = 1,
    limit = 20,
    search,
  }) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT ml.*,
             COALESCE(u.full_name, u.username) as seller_name
      FROM marketplace_listings ml
      LEFT JOIN users u ON ml.id_user = u.id
      WHERE ml.status = 'published'
    `;
    const params = [];

    if (resourceType) {
      params.push(resourceType);
      query += ` AND ml.resource_type = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND ml.category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (ml.title ILIKE $${params.length} OR ml.description ILIKE $${params.length})`;
    }

    const sortOptions = {
      rating: 'ml.rating_avg DESC, ml.purchase_count DESC',
      newest: 'ml.created_at DESC',
      popular: 'ml.purchase_count DESC, ml.view_count DESC',
      price_asc: 'ml.price_credits ASC',
      price_desc: 'ml.price_credits DESC',
    };

    query += ` ORDER BY ${sortOptions[sort] || sortOptions.rating} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * Count browse results
   * @param {object} params
   * @returns {Promise<number>}
   */
  async countBrowse({ resourceType, category, search }) {
    let query = 'SELECT COUNT(*) FROM marketplace_listings WHERE status = $1';
    const params = ['published'];

    if (resourceType) {
      params.push(resourceType);
      query += ` AND resource_type = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    const { rows } = await db.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  /**
   * Get featured listings
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async getFeatured(limit = 10) {
    const { rows } = await db.query(
      `SELECT ml.*, COALESCE(u.full_name, u.username) as seller_name
       FROM marketplace_listings ml
       LEFT JOIN users u ON ml.id_user = u.id
       WHERE ml.status = 'published' AND ml.purchase_count > 0
       ORDER BY ml.rating_avg DESC, ml.purchase_count DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  /**
   * Increment view count
   * @param {number} id
   * @returns {Promise<void>}
   */
  async incrementViewCount(id) {
    await db.query(
      'UPDATE marketplace_listings SET view_count = view_count + 1 WHERE id = $1',
      [id]
    );
  }

  /**
   * Increment purchase count within transaction
   * @param {object} client
   * @param {number} id
   * @returns {Promise<void>}
   */
  async incrementPurchaseCountTx(client, id) {
    await client.query(
      'UPDATE marketplace_listings SET purchase_count = purchase_count + 1 WHERE id = $1',
      [id]
    );
  }

  /**
   * Update listing rating
   * @param {number} id
   * @param {number} avg
   * @param {number} count
   * @returns {Promise<void>}
   */
  async updateRating(id, avg, count) {
    await db.query(
      `UPDATE marketplace_listings SET rating_avg = $2, rating_count = $3 WHERE id = $1`,
      [id, avg, count]
    );
  }

  /**
   * Get categories with counts
   * @returns {Promise<object[]>}
   */
  async getCategories() {
    const { rows } = await db.query(
      `SELECT category, COUNT(*) as count
       FROM marketplace_listings
       WHERE status = 'published' AND category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC`
    );
    return rows;
  }

  /**
   * Find listing by chatbot ID
   * @param {number} chatbotId
   * @returns {Promise<object|null>}
   */
  async findByChatbotId(chatbotId) {
    const { rows } = await db.query(
      `SELECT * FROM marketplace_listings
       WHERE resource_type = 'chatbot' AND resource_id = $1`,
      [chatbotId]
    );
    return rows[0] || null;
  }
}

export default new MarketplaceListingRepository();
