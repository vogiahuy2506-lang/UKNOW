import db from '../../config/database.js';

class CourseRepository {
  async list({ workspaceOwnerId, isAdmin, search, category, statuses, limit, offset }) {
    const params = [];
    const whereClauses = [];
    if (!isAdmin) {
      params.push(workspaceOwnerId);
      whereClauses.push(`COALESCE(courses.workspace_owner_id, courses.id_user) = $${params.length}`);
    }

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

  async findById(id, { workspaceOwnerId, isAdmin = false } = {}) {
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
      WHERE id = $1
        ${isAdmin ? '' : 'AND COALESCE(workspace_owner_id, id_user) = $2'}`,
      isAdmin ? [id] : [id, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Tenant-scoped lookup for LandingBrief catalog resolve (404 when missing/wrong owner).
   */
  async findByIdAndUser(id, ownerUserId) {
    const result = await db.query(
      `SELECT
        id,
        course_name,
        description,
        category,
        price,
        original_price
      FROM courses
      WHERE id = $1 AND COALESCE(workspace_owner_id, id_user) = $2
      LIMIT 1`,
      [id, ownerUserId]
    );
    return result.rows[0] || null;
  }

  /**
   * Batch tenant-scoped lookup for CampaignBrief catalog_set.
   * Missing/wrong-owner IDs are simply absent from the result set.
   */
  async findByIdsAndUser(ids, ownerUserId) {
    const uniqueIds = [...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];
    if (!uniqueIds.length || !Number.isFinite(Number(ownerUserId)) || Number(ownerUserId) <= 0) {
      return [];
    }
    const result = await db.query(
      `SELECT
        id,
        course_name,
        description,
        category,
        price,
        original_price
      FROM courses
      WHERE COALESCE(workspace_owner_id, id_user) = $1 AND id = ANY($2::int[])`,
      [ownerUserId, uniqueIds]
    );
    return result.rows;
  }

  async findAllByUser(userId) {
    const result = await db.query(
      `SELECT id, course_code, course_name, price, original_price, description, category, thumbnail_url, status
       FROM courses
       WHERE COALESCE(workspace_owner_id, id_user) = $1`,
      [userId]
    );
    return result.rows;
  }

  async insert({ workspaceOwnerId, createdBy, courseCode, courseName, description, price, originalPrice, category, thumbnailUrl, status }) {
    await db.query(
      `INSERT INTO courses (
        id_user, workspace_owner_id, created_by, course_code, course_name, description,
        price, original_price, category, thumbnail_url, status
      ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [workspaceOwnerId, createdBy, courseCode, courseName, description, price, originalPrice, category, thumbnailUrl, status]
    );
  }

  async update(id, workspaceOwnerId, { courseName, price, originalPrice, description, category, thumbnailUrl, status }) {
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
       WHERE id = $8
         AND COALESCE(workspace_owner_id, id_user) = $9`,
      [courseName, price, originalPrice, description, category, thumbnailUrl, status, id, workspaceOwnerId]
    );
  }
}

export default new CourseRepository();
