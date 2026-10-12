import db from '../config/database.js';

/**
 * Truy vấn bảng `form_file_uploads` (migration 300) — phiên tải tệp tạm của trường `file` trong biểu mẫu
 * (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4b). Toàn bộ SQL của luồng nằm ở đây; nghiệp vụ ở
 * services/formFileUpload.service.js.
 */

const SELECT_COLUMNS = `
  id,
  form_id AS "formId",
  workspace_owner_id AS "workspaceOwnerId",
  field_key AS "fieldKey",
  object_key AS "objectKey",
  file_name AS "fileName",
  file_ext AS "fileExt",
  content_type AS "contentType",
  declared_size AS "declaredSize",
  max_bytes AS "maxBytes",
  status,
  submission_id AS "submissionId",
  expires_at AS "expiresAt",
  used_at AS "usedAt",
  created_at AS "createdAt"`;

const formFileUploadRepository = {
  /**
   * @param {object} data
   * @param {string} data.id uuid (cũng nằm trong khoá object tạm)
   * @param {number|string} data.formId
   * @param {number|string} data.workspaceOwnerId
   * @param {string} data.fieldKey
   * @param {string} data.objectKey
   * @param {string} data.fileName
   * @param {string} data.fileExt
   * @param {string} data.contentType
   * @param {number} data.declaredSize
   * @param {number} data.maxBytes
   * @param {Date} data.expiresAt
   * @param {object} [queryable]
   */
  async insert(data, queryable = db) {
    const { rows } = await queryable.query(
      `INSERT INTO form_file_uploads
         (id, form_id, workspace_owner_id, field_key, object_key, file_name, file_ext, content_type,
          declared_size, max_bytes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${SELECT_COLUMNS}`,
      [
        data.id,
        data.formId,
        data.workspaceOwnerId,
        data.fieldKey,
        data.objectKey,
        data.fileName,
        data.fileExt,
        data.contentType,
        data.declaredSize,
        data.maxBytes,
        data.expiresAt,
      ]
    );
    return rows[0];
  },

  /**
   * Dòng theo id (mọi trạng thái). id sai định dạng uuid → null (không ném lỗi 22P02).
   * @param {string} id
   * @param {object} [queryable]
   */
  async findById(id, queryable = db) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''))) return null;
    const { rows } = await queryable.query(
      `SELECT ${SELECT_COLUMNS} FROM form_file_uploads WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Các dòng theo danh sách id, giới hạn trong MỘT biểu mẫu (id của form khác không bao giờ khớp).
   * @param {string[]} ids
   * @param {number|string} formId
   * @param {object} [queryable]
   */
  async findByIdsForForm(ids, formId, queryable = db) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const { rows } = await queryable.query(
      `SELECT ${SELECT_COLUMNS} FROM form_file_uploads WHERE id = ANY($1::uuid[]) AND form_id = $2`,
      [ids, formId]
    );
    return rows;
  },

  /**
   * Tổng cỡ KHAI của các phiên còn chờ (chưa hết hạn) của một chủ — giữ chỗ dung lượng khi xin URL mới,
   * để khách không xin URL ồ ạt vượt quá phần còn lại của chủ.
   * @param {number|string} workspaceOwnerId
   * @param {object} [queryable]
   * @returns {Promise<number>}
   */
  async sumPendingDeclaredBytes(workspaceOwnerId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT COALESCE(SUM(declared_size), 0)::text AS total
         FROM form_file_uploads
        WHERE workspace_owner_id = $1 AND status = 'pending' AND expires_at > NOW()`,
      [workspaceOwnerId]
    );
    return Number(rows[0]?.total || 0);
  },

  /**
   * Đánh dấu đã dùng — chỉ dòng còn 'pending' (nguyên tử: hai bài nộp cùng một uploadId thì chỉ một bài thắng).
   * @param {string[]} ids
   * @param {number|string} submissionId
   * @param {object} [queryable]
   * @returns {Promise<string[]>} id thực sự được đánh dấu
   */
  async markUsed(ids, submissionId, queryable = db) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const { rows } = await queryable.query(
      `UPDATE form_file_uploads
          SET status = 'used', submission_id = $2, used_at = NOW()
        WHERE id = ANY($1::uuid[]) AND status = 'pending'
        RETURNING id`,
      [ids, submissionId]
    );
    return rows.map((row) => row.id);
  },

  /**
   * Phiên cần dọn: 'pending' đã hết hạn + 'used' đã quá `usedRetentionMs` (chỉ còn để nhặt đối tượng tạm sót).
   * @param {{ now?: Date, usedRetentionMs?: number, limit?: number }} [options]
   * @param {object} [queryable]
   */
  async listCleanupCandidates({ now = new Date(), usedRetentionMs = 2 * 24 * 60 * 60 * 1000, limit = 200 } = {}, queryable = db) {
    const usedBefore = new Date(now.getTime() - usedRetentionMs);
    const { rows } = await queryable.query(
      `SELECT id, object_key AS "objectKey", status
         FROM form_file_uploads
        WHERE (status = 'pending' AND expires_at <= $1)
           OR (status = 'used' AND used_at <= $2)
        ORDER BY created_at ASC
        LIMIT $3`,
      [now, usedBefore, limit]
    );
    return rows;
  },

  /**
   * @param {string[]} ids
   * @param {object} [queryable]
   * @returns {Promise<number>} số dòng đã xoá
   */
  async deleteByIds(ids, queryable = db) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const result = await queryable.query(`DELETE FROM form_file_uploads WHERE id = ANY($1::uuid[])`, [ids]);
    return result.rowCount || 0;
  },

  /**
   * Khoá object tạm của một biểu mẫu (mọi trạng thái) — dọn khi xoá biểu mẫu (FK CASCADE sẽ xoá dòng, kho thì không).
   * @param {number|string} formId
   * @param {object} [queryable]
   * @returns {Promise<string[]>}
   */
  async listObjectKeysByForm(formId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT object_key AS "objectKey" FROM form_file_uploads WHERE form_id = $1`,
      [formId]
    );
    return rows.map((row) => row.objectKey);
  },
};

export default formFileUploadRepository;
