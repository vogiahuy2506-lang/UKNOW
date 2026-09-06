/**
 * Repository quản lý bằng chứng đồng ý của người dùng (Nghị định 330/2026/NĐ-CP).
 *
 * BẢNG APPEND-ONLY (CHỈ-THÊM):
 * - Rút lại đồng ý = INSERT dòng granted = FALSE.
 * - Tuyệt đối không UPDATE, không DELETE.
 * - Khóa ngoại ON DELETE RESTRICT bảo đảm bằng chứng không biến mất khi xoá user.
 */

import db from '../../config/database.js';
import {
  LEGAL_DOCUMENTS,
  REQUIRED_REGISTRATION_PURPOSES,
  getLegalDocument,
} from '../../config/legalDocuments.config.js';

/**
 * Ghi nhận các sự kiện đồng ý (hoặc rút lại đồng ý) vào user_consents.
 *
 * @param {object} params
 * @param {number|string} params.userId
 * @param {Record<string, boolean>} params.consents Map purpose -> boolean (VD: { terms: true, privacy: true, dpa: true })
 * @param {string} params.source 'register' | 'google_register' | 'settings' | ...
 * @param {string|null} [params.ipAddress]
 * @param {string|null} [params.userAgent]
 * @param {object} [params.client] DB client (nếu đang chạy trong transaction)
 * @returns {Promise<Array<object>>} Danh sách các bản ghi vừa được chèn
 */
export async function recordConsents({
  userId,
  consents,
  source,
  ipAddress = null,
  userAgent = null,
  client = null,
}) {
  const queryable = client || db;
  const recorded = [];

  const entries = Object.entries(consents || {});
  for (const [purpose, granted] of entries) {
    const doc = getLegalDocument(purpose);
    const documentVersion = doc?.version || '2026-09-01';
    const documentHash = doc?.hash || null;

    const { rows } = await queryable.query(
      `INSERT INTO user_consents (
         user_id, purpose, granted, document_version, document_hash, source, ip_address, user_agent, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, user_id, purpose, granted, document_version, document_hash, source, ip_address, user_agent, created_at`,
      [
        userId,
        purpose,
        Boolean(granted),
        documentVersion,
        documentHash,
        source,
        ipAddress || null,
        userAgent || null,
      ]
    );

    if (rows[0]) {
      recorded.push(rows[0]);
    }
  }

  return recorded;
}

/**
 * Lấy trạng thái đồng ý mới nhất của một user theo từng mục đích (purpose).
 *
 * @param {number|string} userId
 * @param {object} [client] DB client
 * @returns {Promise<Record<string, boolean> | null>} Map purpose -> granted hoặc null nếu chưa từng có bản ghi
 */
export async function getUserLatestConsents(userId, client = null) {
  if (!userId) return null;
  const queryable = client || db;

  const { rows } = await queryable.query(
    `SELECT purpose, granted
     FROM (
       SELECT DISTINCT ON (purpose) purpose, granted, created_at
       FROM user_consents
       WHERE user_id = $1
       ORDER BY purpose, created_at DESC
     ) latest`,
    [userId]
  );

  if (rows.length === 0) return null;

  const result = {};
  for (const row of rows) {
    result[row.purpose] = row.granted;
  }
  return result;
}

/**
 * Lấy toàn bộ lịch sử đồng ý của một user (đáp ứng điều kiện kiểm chứng: ai, lúc nào, phiên bản nào).
 *
 * @param {number|string} userId
 * @param {object} [client] DB client
 * @returns {Promise<Array<object>>}
 */
export async function getUserConsentHistory(userId, client = null) {
  if (!userId) return [];
  const queryable = client || db;

  const { rows } = await queryable.query(
    `SELECT id, user_id, purpose, granted, document_version, document_hash, source, ip_address, user_agent, created_at
     FROM user_consents
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );

  return rows;
}

/**
 * Kiểm tra xem user đã đồng ý đủ các mục đích bắt buộc hay chưa.
 *
 * @param {number|string} userId
 * @param {string[]} [requiredPurposes] Mặc định ['terms', 'privacy', 'dpa']
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
export async function hasUserConsentedToAll(
  userId,
  requiredPurposes = REQUIRED_REGISTRATION_PURPOSES,
  client = null
) {
  const latest = await getUserLatestConsents(userId, client);
  if (!latest) return false;

  return requiredPurposes.every((purpose) => latest[purpose] === true);
}

export default {
  recordConsents,
  getUserLatestConsents,
  getUserConsentHistory,
  hasUserConsentedToAll,
};
