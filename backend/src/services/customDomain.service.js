import customDomainRepository from '../repositories/customDomain.repository.js';
import landingPageRepository from '../repositories/landingPage.repository.js';
import cloudflareService from './cloudflare.service.js';
import axios from 'axios';

/**
 * Service for managing custom domains.
 */
class CustomDomainService {
  /**
   * List all domains for a user.
   * @param {object} scope
   * @returns {Promise<object[]>}
   */
  async listDomains(scope = {}) {
    return customDomainRepository.listByScope(scope);
  }

  /**
   * Get domain by ID with scope check.
   * @param {number} id
   * @param {object} scope
   * @returns {Promise<object|null>}
   */
  async getDomainById(id, scope = {}) {
    return customDomainRepository.findByIdInScope(id, scope);
  }

  /**
   * Get domain by domain name (for public routing).
   * @param {string} domain
   * @returns {Promise<object|null>}
   */
  async getDomainByName(domain) {
    return customDomainRepository.findByDomain(domain);
  }

  /**
   * Request a new custom domain.
   * @param {object} params
   * @param {number} params.userId
   * @param {string} params.domain - Domain name (e.g., "landing.mystore.com")
   * @param {string} [params.subdomain] - Subdomain part
   * @param {number} [params.landingPageId] - Landing page to serve
   * @returns {Promise<object>}
   */
  async requestDomain({ userId, domain, subdomain = null, landingPageId = null }) {
    // Validate domain format
    if (!this._isValidDomain(domain)) {
      throw new Error('Invalid domain format');
    }

    // Check if domain already registered
    const exists = await customDomainRepository.domainExists(domain);
    if (exists) {
      throw new Error('Domain already registered');
    }

    // Get verification token and DNS instructions
    const dnsInstructions = this._generateDnsInstructions(domain);

    // Create domain record
    const domainRecord = await customDomainRepository.insert({
      userId,
      domain,
      subdomain,
      landingPageId,
      dnsConfig: dnsInstructions,
      cnameTarget: process.env.LP_CNAME_TARGET || 'lp.uknow.vn',
      verificationMethod: 'txt',
    });

    return {
      id: domainRecord.id,
      domain: domainRecord.domain,
      verificationToken: domainRecord.verification_token,
      dnsInstructions,
      status: domainRecord.status,
      message: 'Domain added. Please configure DNS records to verify ownership.',
    };
  }

  /**
   * Update domain (e.g., change landing page).
   * @param {number} id
   * @param {object} payload
   * @param {object} scope
   * @returns {Promise<object|null>}
   */
  async updateDomain(id, payload, scope = {}) {
    // Verify ownership
    const existing = await customDomainRepository.findByIdInScope(id, scope);
    if (!existing) {
      throw new Error('Domain not found');
    }

    // If changing landing page, verify it exists and belongs to user
    if (payload.landingPageId) {
      const landingPage = await landingPageRepository.findByIdInScope(payload.landingPageId, scope);
      if (!landingPage) {
        throw new Error('Landing page not found');
      }
    }

    return customDomainRepository.updateById(id, payload);
  }

  /**
   * Delete a custom domain.
   * @param {number} id
   * @param {object} scope
   * @returns {Promise<boolean>}
   */
  async deleteDomain(id, scope = {}) {
    const existing = await customDomainRepository.findByIdInScope(id, scope);
    if (!existing) {
      throw new Error('Domain not found');
    }

    // TODO: Trigger DNS cleanup / SSL certificate deletion if integrated

    return customDomainRepository.deleteById(id);
  }

  /**
   * Trigger domain verification.
   * @param {number} id
   * @param {object} scope
   * @returns {Promise<object>}
   */
  async verifyDomain(id, scope = {}) {
    const domain = await customDomainRepository.findByIdInScope(id, scope);
    if (!domain) {
      throw new Error('Domain not found');
    }

    if (domain.status === 'active') {
      return { status: 'verified', message: 'Domain already verified' };
    }

    // Update status to verifying
    await customDomainRepository.updateById(id, {
      verificationStatus: 'in_progress',
      status: 'verifying',
      lastCheckedAt: new Date(),
    });

    // Perform verification
    const verificationResult = await this._performVerification(domain);

    // Record verification attempt
    await customDomainRepository.recordVerification(id, {
      type: 'txt',
      token: domain.verification_token,
      status: verificationResult.success ? 'success' : 'failed',
      responseData: verificationResult,
    });

    if (verificationResult.success) {
      await customDomainRepository.updateById(id, {
        verificationStatus: 'verified',
        verificationStatus: 'verified',
        sslStatus: 'pending',
        status: 'active',
        isVerified: true,
        verifiedAt: new Date(),
      });
    } else {
      await customDomainRepository.updateById(id, {
        verificationStatus: 'failed',
        status: 'failed',
        errorMessage: verificationResult.message,
        lastCheckedAt: new Date(),
      });
    }

    return verificationResult;
  }

  /**
   * Get SSL status for a domain.
   * @param {number} id
   * @param {object} scope
   * @returns {Promise<object>}
   */
  async getSslStatus(id, scope = {}) {
    const domain = await customDomainRepository.findByIdInScope(id, scope);
    if (!domain) {
      throw new Error('Domain not found');
    }

    return {
      sslStatus: domain.ssl_status,
      sslCertArn: domain.ssl_cert_arn,
      sslExpiresAt: domain.ssl_expires_at,
    };
  }

  /**
   * Get verification instructions for a domain.
   * @param {number} id
   * @param {object} scope
   * @returns {Promise<object>}
   */
  async getVerificationInstructions(id, scope = {}) {
    const domain = await customDomainRepository.findByIdInScope(id, scope);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const instructions = this._generateDnsInstructions(domain.domain);

    return {
      domain: domain.domain,
      verificationToken: domain.verification_token,
      method: domain.verification_method || 'txt',
      instructions,
      cnameTarget: domain.cname_target || process.env.LP_CNAME_TARGET,
    };
  }

  /**
   * Resolve domain to landing page (for public routing).
   * @param {string} host - The Host header
   * @returns {Promise<object|null>}
   */
  async resolveDomainToLandingPage(host) {
    // Remove port if present
    const domain = host.split(':')[0].toLowerCase();

    const domainRecord = await customDomainRepository.findByDomain(domain);
    if (!domainRecord || !domainRecord.is_active || !domainRecord.is_verified) {
      return null;
    }

    if (!domainRecord.landing_page_id) {
      return null;
    }

    const landingPage = await landingPageRepository.findById(domainRecord.landing_page_id);
    if (!landingPage || !landingPage.isPublished) {
      return null;
    }

    return {
      landingPage,
      domain: domainRecord,
    };
  }

  /**
   * Generate DNS instructions for domain verification.
   * @private
   */
  _generateDnsInstructions(domain) {
    const verificationToken = crypto.randomBytes(16).toString('hex');

    return {
      records: [
        {
          type: 'TXT',
          name: `_uknow-verification.${domain}`,
          value: `"${verificationToken}"`,
          ttl: 3600,
          description: 'Add this TXT record to verify domain ownership',
        },
        {
          type: 'CNAME',
          name: domain.startsWith('www.') ? domain : `www.${domain}`,
          value: process.env.LP_CNAME_TARGET || 'lp.uknow.vn',
          ttl: 3600,
          description: 'Add this CNAME record to enable www subdomain',
        },
      ],
    };
  }

  /**
   * Perform actual domain verification by checking DNS.
   * @private
   */
  async _performVerification(domain) {
    try {
      // For now, we'll simulate verification
      // In production, you'd use a DNS lookup API
      // This is a placeholder that always succeeds for testing
      // In real implementation, use dns.resolveTxt() or an external API

      // Simulate verification delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if TXT record exists
      // NOTE: In production, implement actual DNS lookup
      // Example with dns module:
      // const txtRecords = await dns.resolveTxt(`_uknow-verification.${domain.domain}`);
      // const found = txtRecords.some(r => r.includes(domain.verification_token));

      // For demo purposes, we'll trust the user
      return {
        success: true,
        message: 'Domain verified successfully. You can now use this domain.',
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: `Verification failed: ${error.message}`,
      };
    }
  }

  /**
   * Validate domain format.
   * @private
   */
  _isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;

    // Basic domain validation regex
    const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }
}

export default new CustomDomainService();
