import db from '../../config/database.js';
import { buildUserScopeClause } from '../../utils/roleScope.util.js';

class CourseRepository {
  async list({ userId, role, activeContext, search, category, statuses, limit, offset }) {
    const { clause: scopeClause, params: scopedParams } = buildUserScopeClause({
      tableAlias: 'courses',
      userId,
      role,
      activeContext,
    });

    const params = [...scopedParams];
    const whereClauses = [];
    if (scopeClause) whereClauses.push(scopeClause);

    let paramIndex = params.length + 1;

    if (search) {
      whereClauses.push(`course_name ILIKE $${paramIndex}`);
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
        course_code,
        course_name,
        price,
        original_price,
        status,
        description,
        category,
        thumbnail_url,
        created_at,
        updated_at
      FROM courses AS courses
      ${whereSql}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

    const countQuery = `SELECT COUNT(*) FROM courses AS courses${whereSql}`;

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
        course_code,
        course_name,
        price,
        original_price,
        status,
        description,
        category,
        thumbnail_url,
        created_at,
        updated_at
      FROM courses
      WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findAllByUser(userId) {
    const result = await db.query(
      `SELECT id, course_code, course_name, price, original_price, description, category, thumbnail_url, status
       FROM courses
       WHERE id_user = $1`,
      [userId]
    );
    return result.rows;
  }

  async insert({ userId, courseCode, courseName, description, price, originalPrice, category, thumbnailUrl, status }) {
    await db.query(
      `INSERT INTO courses (
        id_user, course_code, course_name, description,
        price, original_price, category, thumbnail_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, courseCode, courseName, description, price, originalPrice, category, thumbnailUrl, status]
    );
  }

  async update(id, { courseName, price, originalPrice, description, category, thumbnailUrl, status }) {
    await db.query(
      `UPDATE courses
       SET
         course_name = $1,
         price = $2,
         original_price = $3,
         description = $4,
         category = $5,
         thumbnail_url = $6,
         status = $7,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [courseName, price, originalPrice, description, category, thumbnailUrl, status, id]
    );
  }
}

export default new CourseRepository();
