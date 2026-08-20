import db from '../../config/database.js';

class LandingPageVersionRepository {
  /**
   * Tạo bản ghi phiên bản mới
   */
  async createVersion({
    landingPageId,
    workspaceOwnerId,
    actorUserId = null,
    storageKey,
    title,
    htmlHash,
    sizeBytes,
    source = 'manual',
  }, queryable = db) {
    const { rows } = await queryable.query(
      `INSERT INTO landing_page_versions (
         id_landing_page, id_user, workspace_owner_id, created_by,
         storage_key, title, html_hash, size_bytes, source, created_at
       )
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        landingPageId,
        workspaceOwnerId,
        actorUserId || workspaceOwnerId,
        storageKey,
        title || null,
        htmlHash,
        Number(sizeBytes) || 0,
        source || 'manual',
      ]
    );
    return rows[0] || null;
  }

  /**
   * Lấy danh sách các phiên bản của landing page
   */
  async listByLandingPage(landingPageId, userId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, id_landing_page, id_user, storage_key, title, html_hash, size_bytes, source, created_at
       FROM landing_page_versions
       WHERE id_landing_page = $1
         AND COALESCE(workspace_owner_id, id_user) = $2
       ORDER BY created_at DESC, id DESC`,
      [landingPageId, userId]
    );
    return rows;
  }

  /**
   * Lấy chi tiết một phiên bản
   */
  async findById(versionId, landingPageId, userId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, id_landing_page, id_user, storage_key, title, html_hash, size_bytes, source, created_at
       FROM landing_page_versions
       WHERE id = $1
         AND id_landing_page = $2
         AND COALESCE(workspace_owner_id, id_user) = $3
       LIMIT 1`,
      [versionId, landingPageId, userId]
    );
    return rows[0] || null;
  }

  /**
   * Lấy bản ghi phiên bản gần nhất của landing page
   */
  async findLatestByLandingPage(landingPageId, userId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, id_landing_page, id_user, storage_key, title, html_hash, size_bytes, source, created_at
       FROM landing_page_versions
       WHERE id_landing_page = $1
         AND COALESCE(workspace_owner_id, id_user) = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [landingPageId, userId]
    );
    return rows[0] || null;
  }

  /**
   * Lấy các phiên bản cũ vượt quá giới hạn (để prune)
   */
  async getOldVersionsBeyondLimit(landingPageId, userId, keepCount = 5, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, id_landing_page, id_user, storage_key, size_bytes
       FROM landing_page_versions
       WHERE id_landing_page = $1
         AND COALESCE(workspace_owner_id, id_user) = $2
       ORDER BY created_at DESC, id DESC
       OFFSET $3`,
      [landingPageId, userId, keepCount]
    );
    return rows;
  }

  /**
   * Xóa một phiên bản theo ID
   */
  async deleteById(versionId, queryable = db) {
    const result = await queryable.query(
      `DELETE FROM landing_page_versions WHERE id = $1 RETURNING id, storage_key, size_bytes`,
      [versionId]
    );
    return result.rows[0] || null;
  }

  async deleteByIdInWorkspace(versionId, workspaceOwnerId, queryable = db) {
    const result = await queryable.query(
      `DELETE FROM landing_page_versions
       WHERE id = $1
         AND COALESCE(workspace_owner_id, id_user) = $2
       RETURNING id, storage_key, size_bytes`,
      [versionId, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  /**
   * Lấy tổng dung lượng phiên bản của landing page
   */
  async getTotalSizeBytes(landingPageId, userId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total_bytes
       FROM landing_page_versions
       WHERE id_landing_page = $1
         AND COALESCE(workspace_owner_id, id_user) = $2`,
      [landingPageId, userId]
    );
    return Number(rows[0]?.total_bytes) || 0;
  }
}

export default new LandingPageVersionRepository();
