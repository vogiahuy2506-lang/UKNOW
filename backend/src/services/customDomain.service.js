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

    // Generate token once, use for both dnsConfig and database
    const verificationToken = crypto.randomBytes(16).toString('hex');
    const dnsInstructions = this._generateDnsInstructions(domain, verificationToken);

    // Create domain record
    const domainRecord = await customDomainRepository.insert({
      userId,
      domain,
      subdomain,
      landingPageId,
      verificationToken,
      dnsConfig: dnsInstructions,
      cnameTarget: process.env.LP_CNAME_TARGET || 'founderai.biz',
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
   * @param {string} domain
   * @param {string} verificationToken
   */
  _generateDnsInstructions(domain, verificationToken) {
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
          value: process.env.LP_CNAME_TARGET || 'founderai.biz',
          ttl: 3600,
          description: 'Add this CNAME record to enable www subdomain',
        },
      ],
    };
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
