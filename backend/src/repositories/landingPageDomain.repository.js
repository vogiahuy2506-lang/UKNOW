import db from '../config/database.js';
import landingPageRepository from './landingPage.repository.js';

const CF_COLS = `
         d.cf_managed      AS "cfManaged",
         d.cf_zone_id      AS "cfZoneId",
         d.cf_record_id    AS "cfRecordId",
         d.cf_hostname_id  AS "cfHostnameId"`;

const BASE_COLS = `
         d.id,
         d.landing_page_id AS "landingPageId",
         d.hostname,
         d.verification_token AS "verificationToken",
         d.status,
         d.created_at      AS "createdAt",
         d.updated_at      AS "updatedAt",
         d.verified_at     AS "verifiedAt",
         d.is_apex_domain  AS "isApexDomain",${CF_COLS}`;

/**
 * Bảng `landing_page_domains` — hostname `www.*` gắn 1–1 với `landing_pages`.
 */
class LandingPageDomainRepository {
  /**
   * @param {string} hostname
   * @returns {Promise<object|null>}
   */
  async findActiveByHostname(hostname) {
    const h = String(hostname || '').trim().toLowerCase();
    if (!h) return null;
    const result = await db.query(
      `SELECT
         d.id,
         d.landing_page_id AS "landingPageId",
         d.hostname,
         d.verification_token AS "verificationToken",
         d.status,
         d.created_at AS "createdAt",
         d.updated_at AS "updatedAt",
         d.verified_at AS "verifiedAt",
         d.is_apex_domain AS "isApexDomain",
         d.cf_managed   AS "cfManaged",
         d.cf_zone_id   AS "cfZoneId",
         d.cf_record_id AS "cfRecordId",
         d.cf_hostname_id AS "cfHostnameId",
         lp.slug AS "landingSlug"
       FROM landing_page_domains d
       INNER JOIN landing_pages lp ON lp.id = d.landing_page_id
       WHERE LOWER(d.hostname) = $1 AND d.status = 'active' AND lp.is_published = TRUE
       LIMIT 1`,
      [h]
    );
    return result.rows[0] || null;
  }

  /**
   * @param {string} hostname
   * @returns {Promise<object|null>}
   */
  async findByHostnameLower(hostname) {
    const h = String(hostname || '').trim().toLowerCase();
    if (!h) return null;
    const result = await db.query(
      `SELECT id, landing_page_id AS "landingPageId", hostname, status
       FROM landing_page_domains
       WHERE LOWER(hostname) = $1
       LIMIT 1`,
      [h]
    );
    return result.rows[0] || null;
  }

  /**
   * @returns {Promise<Array>}
   */
  async findAllActive() {
    const result = await db.query(
      `SELECT id, landing_page_id AS "landingPageId", hostname, status, is_apex_domain AS "isApexDomain"
       FROM landing_page_domains
       WHERE status = 'active'`
    );
    return result.rows;
  }

  /**
   * @param {number} landingPageId
   * @returns {Promise<object|null>}
   */
  async findByLandingPageId(landingPageId) {
    const result = await db.query(
      `SELECT${BASE_COLS}
       FROM landing_page_domains d
       WHERE d.landing_page_id = $1
       LIMIT 1`,
      [landingPageId]
    );
    return result.rows[0] || null;
  }

  /**
   * Đếm domain đang chiếm quota (pending + active) trong workspace.
   *
   * @param {{ userId: number|string, role?: string, ownerId?: number|string }} scope
   * @returns {Promise<number>}
   */
  async countPendingOrActiveInScope(scope = {}) {
    const { clause, params } = landingPageRepository.buildLandingScopeCondition(scope);
    const result = await db.query(
      `SELECT COUNT(*)::int AS c
       FROM landing_page_domains d
       INNER JOIN landing_pages lp ON lp.id = d.landing_page_id
       WHERE d.status IN ('pending_verification', 'active')
         AND ${clause}`,
      params
    );
    return Number(result.rows[0]?.c || 0);
  }

  /**
   * @param {number} landingPageId
   * @param {{ userId: number|string, role?: string, ownerId?: number|string }} scope
   * @returns {Promise<object|null>}
   */
  async findByLandingPageIdInScope(landingPageId, scope = {}) {
    const { clause, params } = landingPageRepository.buildLandingScopeCondition(scope);
    const result = await db.query(
      `SELECT${BASE_COLS}
       FROM landing_page_domains d
       INNER JOIN landing_pages lp ON lp.id = d.landing_page_id
       WHERE d.landing_page_id = $${params.length + 1}
         AND ${clause}
       LIMIT 1`,
      [...params, landingPageId]
    );
    return result.rows[0] || null;
  }

  /**
   * @param {object} row
   * @returns {Promise<object>}
   */
  async upsertForLanding(row) {
    const {
      landingPageId,
      hostname,
      verificationToken,
      status = 'pending_verification',
      cfManaged = false,
      cfZoneId = null,
      cfRecordId = null,
      cfHostnameId = null,
      isApexDomain = false,
    } = row;
    const result = await db.query(
      `INSERT INTO landing_page_domains
         (landing_page_id, hostname, verification_token, status, cf_managed, cf_zone_id, cf_record_id, cf_hostname_id, is_apex_domain, created_at, updated_at, verified_at)
       VALUES ($1, LOWER(TRIM($2)), $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), $10)
       ON CONFLICT (landing_page_id) DO UPDATE SET
         hostname           = LOWER(TRIM(EXCLUDED.hostname)),
         verification_token = EXCLUDED.verification_token,
         status             = EXCLUDED.status,
         cf_managed         = EXCLUDED.cf_managed,
         cf_zone_id         = EXCLUDED.cf_zone_id,
         cf_record_id       = EXCLUDED.cf_record_id,
         cf_hostname_id     = EXCLUDED.cf_hostname_id,
         is_apex_domain     = EXCLUDED.is_apex_domain,
         updated_at         = NOW(),
         verified_at        = CASE
           WHEN EXCLUDED.status = 'active' THEN COALESCE(landing_page_domains.verified_at, NOW())
           ELSE NULL
         END
       RETURNING
         id,
         landing_page_id   AS "landingPageId",
         hostname,
         verification_token AS "verificationToken",
         status,
         cf_managed        AS "cfManaged",
         cf_zone_id        AS "cfZoneId",
         cf_record_id      AS "cfRecordId",
         cf_hostname_id    AS "cfHostnameId",
         is_apex_domain    AS "isApexDomain",
         created_at        AS "createdAt",
         updated_at        AS "updatedAt",
         verified_at       AS "verifiedAt"`,
      [
        landingPageId,
        hostname,
        verificationToken,
        status,
        cfManaged,
        cfZoneId,
        cfRecordId,
        cfHostnameId,
        isApexDomain,
        status === 'active' ? new Date() : null,
      ]
    );
    return result.rows[0];
  }

  /**
   * @param {number} landingPageId
   * @returns {Promise<boolean>}
   */
  async deleteByLandingPageId(landingPageId) {
    const r = await db.query(`DELETE FROM landing_page_domains WHERE landing_page_id = $1`, [landingPageId]);
    return Number(r.rowCount || 0) > 0;
  }

  /**
   * @param {number} id
   * @param {string} status
   * @returns {Promise<object|null>}
   */
  async updateStatusById(id, status) {
    const result = await db.query(
      `UPDATE landing_page_domains SET
         status = $2,
         updated_at = NOW(),
         verified_at = CASE WHEN $2 = 'active' THEN COALESCE(verified_at, NOW()) ELSE verified_at END
       WHERE id = $1
       RETURNING
         id,
         landing_page_id AS "landingPageId",
         hostname,
         verification_token AS "verificationToken",
         status,
         cf_managed   AS "cfManaged",
         cf_zone_id   AS "cfZoneId",
         cf_record_id AS "cfRecordId",
         cf_hostname_id AS "cfHostnameId",
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         verified_at AS "verifiedAt"`,
      [id, status]
    );
    return result.rows[0] || null;
  }

  /**
   * Tìm tất cả domain đang chờ verify (pending_verification).
   * @returns {Promise<object[]>}
   */
  async findPendingDomains() {
    const result = await db.query(
      `SELECT
         d.id,
         d.landing_page_id AS "landingPageId",
         d.hostname,
         d.status,
         d.cf_managed   AS "cfManaged",
         lp.slug AS "landingSlug"
       FROM landing_page_domains d
       INNER JOIN landing_pages lp ON lp.id = d.landing_page_id
       WHERE d.status = 'pending_verification'
         AND lp.is_published = TRUE
       ORDER BY d.created_at ASC`
    );
    return result.rows || [];
  }
}

export default new LandingPageDomainRepository();
