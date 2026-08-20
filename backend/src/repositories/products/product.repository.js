import db from '../../config/database.js';

class ProductRepository {
  async list({ workspaceOwnerId, isAdmin, search, category, statuses, limit, offset }) {
    const params = [];
    const whereClauses = [];
    if (!isAdmin) {
      params.push(workspaceOwnerId);
      whereClauses.push(`COALESCE(products.workspace_owner_id, products.id_user) = $${params.length}`);
    }

    let paramIndex = params.length + 1;

    if (search) {
      whereClauses.push(`(product_name ILIKE $${paramIndex} OR product_code ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex += 1;
    }

    if (category) {
      whereClauses.push(`category ILIKE $${paramIndex}`);
      params.push(`%${category}%`);
      paramIndex += 1;
    }

    if (statuses.length > 0) {
      whereClauses.push(`status = ANY($${paramIndex})`);
      params.push(statuses);
      paramIndex += 1;
    }

    const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
    const dataQuery = `
      SELECT
        id,
        product_code,
        product_name,
        price,
        original_price,
        status,
        description,
        usp,
        category,
        thumbnail_url,
        product_url,
        target_audience,
        created_at,
        updated_at
      FROM products AS products
      ${whereSql}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

    const countQuery = `SELECT COUNT(*) FROM products AS products${whereSql}`;

    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, [...params, limit, offset]),
      db.query(countQuery, params),
    ]);

    return {
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  }

  async findById(id, { workspaceOwnerId, isAdmin = false } = {}) {
    const result = await db.query(
      `SELECT
        id,
        id_user,
        workspace_owner_id,
        product_code,
        product_name,
        price,
        original_price,
        status,
        description,
        usp,
        category,
        thumbnail_url,
        product_url,
        target_audience,
        created_at,
        updated_at
      FROM products
      WHERE id = $1
        ${isAdmin ? '' : 'AND COALESCE(workspace_owner_id, id_user) = $2'}`,
      isAdmin ? [id] : [id, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  async findAllByUser(userId) {
    const result = await db.query(
      `SELECT id, product_code, product_name, price, original_price, description, usp, category, thumbnail_url, product_url, target_audience, status
       FROM products
       WHERE COALESCE(workspace_owner_id, id_user) = $1
       ORDER BY updated_at DESC, id DESC`,
      [userId]
    );
    return result.rows;
  }

  async insert({
    workspaceOwnerId,
    createdBy,
    productCode,
    productName,
    description,
    usp,
    price,
    originalPrice,
    category,
    thumbnailUrl,
    productUrl,
    targetAudience,
    status,
  }) {
    const { rows } = await db.query(
      `INSERT INTO products (
        id_user, workspace_owner_id, created_by, product_code, product_name, description, usp,
        price, original_price, category, thumbnail_url, product_url, target_audience, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
      [workspaceOwnerId, workspaceOwnerId, createdBy, productCode, productName, description, usp, price, originalPrice, category, thumbnailUrl, productUrl, targetAudience, status]
    );
    return rows[0]?.id || null;
  }

  async update(id, workspaceOwnerId, {
    productCode,
    productName,
    price,
    originalPrice,
    description,
    usp,
    category,
    thumbnailUrl,
    productUrl,
    targetAudience,
    status,
  }) {
    const { rows } = await db.query(
      `UPDATE products
       SET
         product_code = $1,
         product_name = $2,
         price = $3,
         original_price = $4,
         description = $5,
         usp = $6,
         category = $7,
         thumbnail_url = $8,
         product_url = $9,
         target_audience = $10,
         status = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
         AND COALESCE(workspace_owner_id, id_user) = $13
       RETURNING id`,
      [productCode, productName, price, originalPrice, description, usp, category, thumbnailUrl, productUrl, targetAudience, status, id, workspaceOwnerId]
    );
    return rows[0] || null;
  }

  async listCategories(userId) {
    const result = await db.query(
      `SELECT DISTINCT category
       FROM products
       WHERE COALESCE(workspace_owner_id, id_user) = $1
         AND category IS NOT NULL
         AND TRIM(category) <> ''
       ORDER BY category ASC`,
      [userId]
    );
    return result.rows.map((row) => String(row.category || '').trim()).filter(Boolean);
  }

  async deleteById(id, workspaceOwnerId) {
    const { rows } = await db.query(
      `DELETE FROM products
       WHERE id = $1 AND COALESCE(workspace_owner_id, id_user) = $2
       RETURNING id`,
      [id, workspaceOwnerId]
    );
    return rows[0] || null;
  }
}

export default new ProductRepository();
