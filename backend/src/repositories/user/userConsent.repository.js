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
    `SELECT purpose, granted, document_version
     FROM (
       SELECT DISTINCT ON (purpose) purpose, granted, document_version, created_at
       FROM user_consents
       WHERE user_id = $1
       ORDER BY purpose, created_at DESC
     ) latest`,
    [userId]
  );

  if (rows.length === 0) return null;

  const result = {};
  for (const row of rows) {
    result[row.purpose] = {
      granted: row.granted,
      document_version: row.document_version,
    };
  }
  return result;
}

/**
 * Kiểm tra xem người dùng đã đồng ý đủ các mục đích bắt buộc VÀ đúng phiên bản hiện hành hay chưa.
 *
 * @param {Record<string, { granted: boolean, document_version: string } | boolean> | null} consents
 * @returns {boolean}
 */
export function hasConsentedCurrent(consents) {
  if (!consents || typeof consents !== 'object') return false;
  return REQUIRED_REGISTRATION_PURPOSES.every((purpose) => {
    const item = consents[purpose];
    if (!item) return false;
    const granted = typeof item === 'object' ? item.granted : item;
    const version = typeof item === 'object' ? item.document_version : consents[`${purpose}_version`];
    return granted === true && version === LEGAL_DOCUMENTS[purpose]?.version;
  });
}

/**
 * Kiểm tra xem người dùng đã từng đồng ý nhưng có ít nhất một văn bản đã đổi phiên bản (outdated) hay không.
 * Trả về true khi user đã từng đồng ý nhưng hiện tại chưa đạt hasConsentedCurrent.
 *
 * @param {Record<string, { granted: boolean, document_version: string } | boolean> | null} consents
 * @returns {boolean}
 */
export function isConsentVersionOutdated(consents) {
  if (!consents || typeof consents !== 'object') return false;
  const hasAnyGranted = REQUIRED_REGISTRATION_PURPOSES.some((purpose) => {
    const item = consents[purpose];
    if (!item) return false;
    return typeof item === 'object' ? Boolean(item.granted) : Boolean(item);
  });
  if (!hasAnyGranted) return false;
  return !hasConsentedCurrent(consents);
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
 * Kiểm tra xem user đã đồng ý đủ các mục đích bắt buộc hay chưa (chỉ kiểm tra granted, không so version).
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

  return requiredPurposes.every((purpose) => {
    const item = latest[purpose];
    return typeof item === 'object' ? item.granted === true : item === true;
  });
}

export default {
  recordConsents,
  getUserLatestConsents,
  getUserConsentHistory,
  hasUserConsentedToAll,
  hasConsentedCurrent,
  isConsentVersionOutdated,
};

