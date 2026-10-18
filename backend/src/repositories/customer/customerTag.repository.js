import db from '../../config/database.js';

const TAG_COLUMNS = 'id, name, color, created_at, updated_at';

/**
 * SQL cho tag khách hàng. MỌI hàm nhận `workspaceOwnerId` và lọc theo nó ở CẢ phía tag lẫn phía khách
 * (khách: `COALESCE(workspace_owner_id, id_user)`), nên id lạ từ workspace khác bị bỏ qua thay vì ghi chéo.
 */
class CustomerTagRepository {
  /** Mọi tag của workspace kèm số khách đang mang. */
  async listWithCounts(workspaceOwnerId) {
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.color, t.created_at, t.updated_at,
              COUNT(a.customer_id)::INTEGER AS customer_count
       FROM customer_tags t
       LEFT JOIN customer_tag_assignments a ON a.tag_id = t.id
       WHERE t.workspace_owner_id = $1
       GROUP BY t.id
       ORDER BY LOWER(t.name) ASC, t.id ASC`,
      [workspaceOwnerId],
    );
    return rows;
  }

  async countTags(workspaceOwnerId) {
    const { rows } = await db.query(
      'SELECT COUNT(*)::INTEGER AS count FROM customer_tags WHERE workspace_owner_id = $1',
      [workspaceOwnerId],
    );
    return rows[0].count;
  }

  /** Tìm theo tên KHÔNG phân biệt hoa/thường (khớp unique index `uq_customer_tags_ws_lower_name`). */
  async findByName(workspaceOwnerId, name) {
    const { rows } = await db.query(
      `SELECT ${TAG_COLUMNS} FROM customer_tags
       WHERE workspace_owner_id = $1 AND LOWER(name) = LOWER($2)`,
      [workspaceOwnerId, name],
    );
    return rows[0] || null;
  }

  async findById(workspaceOwnerId, tagId) {
    const { rows } = await db.query(
      `SELECT ${TAG_COLUMNS} FROM customer_tags WHERE workspace_owner_id = $1 AND id = $2`,
      [workspaceOwnerId, tagId],
    );
    return rows[0] || null;
  }

  /** Chỉ trả những tag THUỘC workspace — id của workspace khác không xuất hiện trong kết quả. */
  async findByIds(workspaceOwnerId, tagIds) {
    if (!tagIds.length) return [];
    const { rows } = await db.query(
      `SELECT ${TAG_COLUMNS} FROM customer_tags
       WHERE workspace_owner_id = $1 AND id = ANY($2::bigint[])`,
      [workspaceOwnerId, tagIds],
    );
    return rows;
  }

  async create(workspaceOwnerId, { name, color }) {
    const { rows } = await db.query(
      `INSERT INTO customer_tags (workspace_owner_id, name, color)
       VALUES ($1, $2, $3)
       RETURNING ${TAG_COLUMNS}`,
      [workspaceOwnerId, name, color],
    );
    return rows[0];
  }

  /** `color === undefined` giữ màu cũ; `null` xoá màu. */
  async update(workspaceOwnerId, tagId, { name, color }) {
    const { rows } = await db.query(
      `UPDATE customer_tags
       SET name = COALESCE($3, name),
           color = CASE WHEN $4::boolean THEN $5 ELSE color END,
           updated_at = NOW()
       WHERE workspace_owner_id = $1 AND id = $2
       RETURNING ${TAG_COLUMNS}`,
      [workspaceOwnerId, tagId, name ?? null, color !== undefined, color ?? null],
    );
    return rows[0] || null;
  }

  /** Xoá tag (gán bị xoá theo ON DELETE CASCADE). Trả `{ deleted, customerCount }`. */
  async remove(workspaceOwnerId, tagId) {
    const { rows } = await db.query(
      `WITH target AS (
         SELECT id FROM customer_tags WHERE workspace_owner_id = $1 AND id = $2
       ), used AS (
         SELECT COUNT(*)::INTEGER AS n FROM customer_tag_assignments WHERE tag_id IN (SELECT id FROM target)
       ), gone AS (
         DELETE FROM customer_tags WHERE id IN (SELECT id FROM target) RETURNING id
       )
       SELECT (SELECT COUNT(*) FROM gone)::INTEGER AS deleted, (SELECT n FROM used) AS customer_count`,
      [workspaceOwnerId, tagId],
    );
    return { deleted: rows[0].deleted > 0, customerCount: rows[0].customer_count };
  }

  /**
   * Gắn mọi tag cho mọi khách (tích Descartes), BỎ QUA cặp đã có. Cả khách lẫn tag phải thuộc workspace —
   * id workspace khác không khớp dòng nào nên không ghi. Trả số cặp MỚI được gắn.
   */
  async assign(workspaceOwnerId, { customerIds, tagIds, assignedBy = null, source = 'manual', campaignId = null, runId = null }) {
    if (!customerIds.length || !tagIds.length) return 0;
    const { rowCount } = await db.query(
      `INSERT INTO customer_tag_assignments (customer_id, tag_id, assigned_by, source, campaign_id, run_id)
       SELECT c.id, t.id, $3, $4, $5, $6
       FROM customers c
       CROSS JOIN customer_tags t
       WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
         AND c.id = ANY($2::bigint[])
         AND t.workspace_owner_id = $1
         AND t.id = ANY($7::bigint[])
       ON CONFLICT (customer_id, tag_id) DO NOTHING`,
      [workspaceOwnerId, customerIds, assignedBy, source, campaignId, runId, tagIds],
    );
    return rowCount;
  }

  /** Bỏ các tag khỏi các khách (chỉ trong workspace). Trả số dòng gỡ. */
  async unassign(workspaceOwnerId, { customerIds, tagIds }) {
    if (!customerIds.length || !tagIds.length) return 0;
    const { rowCount } = await db.query(
      `DELETE FROM customer_tag_assignments a
       USING customers c, customer_tags t
       WHERE a.customer_id = c.id AND a.tag_id = t.id
         AND COALESCE(c.workspace_owner_id, c.id_user) = $1
         AND t.workspace_owner_id = $1
         AND a.customer_id = ANY($2::bigint[])
         AND a.tag_id = ANY($3::bigint[])`,
      [workspaceOwnerId, customerIds, tagIds],
    );
    return rowCount;
  }

  /** Tag của một nhóm khách (id đã được lọc theo workspace ở truy vấn danh sách). Trả hàng phẳng. */
  async listForCustomers(customerIds) {
    if (!customerIds.length) return [];
    const { rows } = await db.query(
      `SELECT a.customer_id, t.id, t.name, t.color
       FROM customer_tag_assignments a
       JOIN customer_tags t ON t.id = a.tag_id
       WHERE a.customer_id = ANY($1::bigint[])
       ORDER BY LOWER(t.name) ASC, t.id ASC`,
      [customerIds],
    );
    return rows;
  }

  /** Khách có tồn tại trong workspace không (cho hồ sơ khách). */
  async customerExists(workspaceOwnerId, customerId) {
    const { rows } = await db.query(
      'SELECT 1 FROM customers WHERE id = $1 AND COALESCE(workspace_owner_id, id_user) = $2',
      [customerId, workspaceOwnerId],
    );
    return rows.length > 0;
  }
}

export default new CustomerTagRepository();
