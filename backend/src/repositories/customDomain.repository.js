import db from '../config/database.js';
import crypto from 'crypto';

/**
 * Repository for custom_domains table.
 */
class CustomDomainRepository {
  /**
   * Build scope condition for user's domains.
   * @param {object} scope
   * @returns {{ clause: string, params: any[] }}
   */
  buildScopeCondition(scope = {}) {
    const userId = Number.parseInt(scope?.userId, 10);
    if (!Number.isFinite(userId)) {
      return { clause: '1 = 0', params: [] };
    }
    return { clause: 'user_id = $1', params: [userId] };
  }

  /**
   * List all domains for a user.
   * @param {object} scope
   * @returns {Promise<object[]>}
   */
  async listByScope(scope = {}) {
    const { clause, params } = this.buildScopeCondition(scope);
    const result = await db.query(
      `SELECT
         cd.id,
         cd.domain,
         cd.subdomain,
         cd.status,
         cd.verification_status,
         cd.ssl_status,
         cd.cname_target,
         cd.is_primary,
         cd.is_verified,
         cd.is_active,
         cd.error_message,
         cd.landing_page_id,
         cd.created_at,
         cd.updated_at,
         lp.slug AS landing_page_slug,
         lp.title AS landing_page_title
       FROM custom_domains cd
       LEFT JOIN landing_pages lp ON cd.landing_page_id = lp.id
       WHERE ${clause}
       ORDER BY cd.created_at DESC`,
      params
    );
    return result.rows;
  }

  /**
   * Find by domain.
   * @param {string} domain
   * @returns {Promise<object|null>}
   */
  async findByDomain(domain) {
    const result = await db.query(
      `SELECT
         cd.id,
         cd.user_id,
         cd.domain,
         cd.subdomain,
         cd.status,
         cd.verification_status,
         cd.ssl_status,
         cd.verification_token,
         cd.cname_target,
         cd.is_primary,
         cd.is_verified,
         cd.is_active,
         cd.landing_page_id,
         cd.created_at,
         cd.updated_at
       FROM custom_domains cd
       WHERE LOWER(TRIM(cd.domain)) = LOWER(TRIM($1))
       LIMIT 1`,
      [domain]
    );
    return result.rows[0] || null;
  }

  /**
   * Find by ID.
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const result = await db.query(
      `SELECT
         cd.*,
         lp.slug AS landing_page_slug,
         lp.title AS landing_page_title
       FROM custom_domains cd
       LEFT JOIN landing_pages lp ON cd.landing_page_id = lp.id
       WHERE cd.id = $1
       LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find by ID with scope check.
   * @param {number} id
   * @param {object} scope
   * @returns {Promise<object|null>}
   */
  async findByIdInScope(id, scope = {}) {
    const { clause, params } = this.buildScopeCondition(scope);
    const result = await db.query(
      `SELECT
         cd.id,
         cd.domain,
         cd.subdomain,
         cd.status,
         cd.verification_status,
         cd.ssl_status,
         cd.cname_target,
         cd.is_primary,
         cd.is_verified,
         cd.is_active,
         cd.landing_page_id,
         cd.created_at,
         cd.updated_at
       FROM custom_domains cd
       WHERE cd.id = $${params.length + 1} AND ${clause}
       LIMIT 1`,
      [...params, id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new domain registration.
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async insert(payload) {
    const verificationToken = crypto.randomBytes(16).toString('hex');

    const result = await db.query(
      `INSERT INTO custom_domains (
         user_id, domain, subdomain, landing_page_id,
         verification_token, verification_method, status,
         verification_status, ssl_status, dns_config, cname_target,
         is_primary, is_active
       ) VALUES ($1, LOWER(TRIM($2)), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        payload.userId,
        payload.domain,
        payload.subdomain || null,
        payload.landingPageId || null,
        verificationToken,
        payload.verificationMethod || 'txt',
        'pending',
        'pending',
        'pending',
        JSON.stringify(payload.dnsConfig || {}),
        payload.cnameTarget || null,
        payload.isPrimary !== false,
        true,
      ]
    );
    return result.rows[0];
  }

  /**
   * Update domain by ID.
   * @param {number} id
   * @param {object} payload
   * @returns {Promise<object|null>}
   */
  async updateById(id, payload) {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    const fieldMappings = {
      landingPageId: 'landing_page_id',
      verificationStatus: 'verification_status',
      sslStatus: 'ssl_status',
      status: 'status',
      isVerified: 'is_verified',
      isActive: 'is_active',
      isPrimary: 'is_primary',
      sslCertArn: 'ssl_cert_arn',
      sslExpiresAt: 'ssl_expires_at',
      errorMessage: 'error_message',
      dnsConfig: 'dns_config',
      lastCheckedAt: 'last_checked_at',
      verifiedAt: 'verified_at',
    };

    for (const [key, column] of Object.entries(fieldMappings)) {
      if (payload[key] !== undefined) {
        updates.push(`${column} = $${paramIndex}`);
        values.push(key === 'landingPageId'
          ? payload[key] || null
          : key === 'dnsConfig'
            ? JSON.stringify(payload[key])
            : payload[key]);
        paramIndex++;
      }
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    const result = await db.query(
      `UPDATE custom_domains SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete domain by ID.
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async deleteById(id) {
    const result = await db.query('DELETE FROM custom_domains WHERE id = $1', [id]);
    return Number(result.rowCount || 0) > 0;
  }

  /**
   * Check if domain already exists.
   * @param {string} domain
   * @param {number} excludeId - Exclude this ID from check
   * @returns {Promise<boolean>}
   */
  async domainExists(domain, excludeId = null) {
    let query = 'SELECT 1 FROM custom_domains WHERE LOWER(TRIM(domain)) = LOWER(TRIM($1))';
    const params = [domain];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await db.query(query + ' LIMIT 1', params);
    return result.rows.length > 0;
  }

  /**
   * Record verification attempt.
   * @param {number} domainId
   * @param {object} verification
   * @returns {Promise<object>}
   */
  async recordVerification(domainId, verification) {
    const result = await db.query(
      `INSERT INTO custom_domain_verifications (domain_id, verification_type, verification_token, status, response_data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        domainId,
        verification.type,
        verification.token,
        verification.status,
        JSON.stringify(verification.responseData || {}),
      ]
    );
    return result.rows[0];
  }

  /**
   * Get verification history.
   * @param {number} domainId
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async getVerificationHistory(domainId, limit = 10) {
    const result = await db.query(
      `SELECT * FROM custom_domain_verifications
       WHERE domain_id = $1
       ORDER BY checked_at DESC
       LIMIT $2`,
      [domainId, limit]
    );
    return result.rows;
  }
}

export default new CustomDomainRepository();
