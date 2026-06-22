import db from '../../config/database.js';
import { buildUserScopeClause } from '../../utils/roleScope.util.js';

class ProductRepository {
  async list({ userId, role, activeContext, search, category, statuses, limit, offset }) {
    const { clause: scopeClause, params: scopedParams } = buildUserScopeClause({
      tableAlias: 'products',
      userId,
      role,
      activeContext,
    });

    const params = [...scopedParams];
    const whereClauses = [];
    if (scopeClause) whereClauses.push(scopeClause);

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

  async findById(id) {
    const result = await db.query(
      `SELECT
        id,
        id_user,
        product_code,
        product_name,
        price,
        original_price,
        status,
        description,
        usp,
        category,
        thumbnail_url,
        created_at,
        updated_at
      FROM products
      WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAllByUser(userId) {
    const result = await db.query(
      `SELECT id, product_code, product_name, price, original_price, description, usp, category, thumbnail_url, status
       FROM products
       WHERE id_user = $1
       ORDER BY updated_at DESC, id DESC`,
      [userId]
    );
    return result.rows;
  }

  async insert({
    userId,
    productCode,
    productName,
    description,
    usp,
    price,
    originalPrice,
    category,
    thumbnailUrl,
    status,
  }) {
    const { rows } = await db.query(
      `INSERT INTO products (
        id_user, product_code, product_name, description, usp,
        price, original_price, category, thumbnail_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [userId, productCode, productName, description, usp, price, originalPrice, category, thumbnailUrl, status]
    );
    return rows[0]?.id || null;
  }

  async update(id, {
    productCode,
    productName,
    price,
    originalPrice,
    description,
    usp,
    category,
    thumbnailUrl,
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
         status = $9,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING id`,
      [productCode, productName, price, originalPrice, description, usp, category, thumbnailUrl, status, id]
    );
    return rows[0] || null;
  }

  async deleteById(id) {
    const { rows } = await db.query(
      `DELETE FROM products WHERE id = $1 RETURNING id`,
      [id]
    );
    return rows[0] || null;
  }
}

export default new ProductRepository();
