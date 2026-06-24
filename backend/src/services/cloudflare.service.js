import axios from 'axios';

/**
 * Cloudflare API Service
 * Handles DNS management and SSL provisioning for custom domains
 */
class CloudflareService {
  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.baseUrl = 'https://api.cloudflare.com/client/v4';
  }

  /**
   * Check if Cloudflare is configured
   */
  isConfigured() {
    return !!(this.apiToken);
  }

  /**
   * Get default headers for Cloudflare API
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Verify API token and get account info
   */
  async verifyCredentials() {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Cloudflare API token not configured. Set CLOUDFLARE_API_TOKEN in environment variables.'
      };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/user/tokens/verify`, {
        headers: this.getHeaders(),
      });

      if (response.data.result.status === 'active') {
        return { success: true, message: 'Cloudflare credentials verified' };
      }

      return { success: false, message: 'Cloudflare API token is invalid or expired' };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || 'Failed to verify Cloudflare credentials'
      };
    }
  }

  /**
   * List all zones (domains) in Cloudflare account
   */
  async listZones() {
    try {
      const response = await axios.get(`${this.baseUrl}/zones`, {
        headers: this.getHeaders(),
      });
      return {
        success: true,
        zones: response.data.result || []
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || 'Failed to list zones'
      };
    }
  }

  /**
   * Get zone info by domain name.
   * If CF_ZONE_NAME env is set, looks up that zone directly (avoids extractBaseDomain guessing).
   * @param {string} domain - e.g., "slug.lp.uknow.vn" or "www.example.com"
   */
  async getZone(domain) {
    const zoneName = process.env.CF_ZONE_NAME
      ? String(process.env.CF_ZONE_NAME).trim().toLowerCase()
      : this.extractBaseDomain(domain);

    return this.getZoneByName(zoneName);
  }

  /**
   * Look up a Cloudflare zone by exact name.
   * @param {string} zoneName - e.g., "lp.uknow.vn" or "uknow.vn"
   */
  async getZoneByName(zoneName) {
    try {
      const response = await axios.get(`${this.baseUrl}/zones`, {
        headers: this.getHeaders(),
        params: { name: zoneName },
      });

      const zone = response.data.result?.[0];
      if (!zone) {
        return {
          success: false,
          message: `Zone not found for ${zoneName}. Domain must be added to Cloudflare first.`,
        };
      }

      return { success: true, zone };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || 'Failed to get zone',
      };
    }
  }

  /**
   * Add DNS record (CNAME or A)
   * @param {string} zoneId - Cloudflare zone ID
   * @param {object} record - { type, name, content, proxied, ttl }
   */
  async addDnsRecord(zoneId, record) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/zones/${zoneId}/dns_records`,
        {
          type: record.type || 'CNAME',
          name: record.name,
          content: record.content,
          proxied: record.proxied !== false,
          ttl: record.ttl || 3600,
        },
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        recordId: response.data.result.id,
        record: response.data.result
      };
    } catch (error) {
      const errorMsg = error.response?.data?.errors?.[0]?.message || 'Failed to add DNS record';

      // Handle duplicate record
      if (error.response?.status === 400 && errorMsg.includes('already exists')) {
        return { success: true, message: 'DNS record already exists', duplicate: true };
      }

      return { success: false, message: errorMsg };
    }
  }

  /**
   * Get DNS record by name
   * @param {string} zoneId - Cloudflare zone ID
   * @param {string} name - Record name
   */
  async getDnsRecord(zoneId, name) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/zones/${zoneId}/dns_records`,
        {
          headers: this.getHeaders(),
          params: { name, per_page: 1 }
        }
      );

      const record = response.data.result?.[0];
      return { success: true, record: record || null };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || 'Failed to get DNS record'
      };
    }
  }

  /**
   * Delete DNS record
   * @param {string} zoneId - Cloudflare zone ID
   * @param {string} recordId - DNS record ID
   */
  async deleteDnsRecord(zoneId, recordId) {
    try {
      await axios.delete(
        `${this.baseUrl}/zones/${zoneId}/dns_records/${recordId}`,
        { headers: this.getHeaders() }
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || 'Failed to delete DNS record'
      };
    }
  }

  /**
   * Provision SSL certificate for domain
   * @param {string} domain - e.g., "landing.example.com"
   */
  async provisionSSL(domain) {
    try {
      // Get zone first
      const zoneResult = await this.getZone(domain);
      if (!zoneResult.success) {
        return zoneResult;
      }

      const zoneId = zoneResult.zone.id;

      // Check if SSL is already active
      const sslStatus = await this.getSSLStatus(zoneId);
      if (sslStatus.success && sslStatus.status === 'active') {
        return {
          success: true,
          message: 'SSL certificate already active',
          certId: sslStatus.certId,
          status: sslStatus.status
        };
      }

      // Enable Universal SSL (free) - Cloudflare provides this automatically
      // We just need to ensure the domain is proxied
      return {
        success: true,
        message: 'SSL will be automatically provisioned by Cloudflare Universal SSL',
        status: 'pending',
        note: 'Cloudflare Universal SSL is free and auto-provisions within 24 hours after DNS setup'
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.errors?.[0]?.message || 'Failed to provision SSL'
      };
    }
  }

  /**
   * Get SSL certificate status for a zone
   * @param {string} zoneId - Cloudflare zone ID
   */
  async getSSLStatus(zoneId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/zones/${zoneId}/ssl/verification`,
        { headers: this.getHeaders() }
      );

      const sslStatus = response.data.result;
      return {
        success: true,
        status: sslStatus.status === 'active' ? 'active' : 'pending',
        certId: sslStatus.certId || null
      };
    } catch (error) {
      // SSL might not be set up yet
      return {
        success: true,
        status: 'pending',
        message: 'SSL not yet configured'
      };
    }
  }

  // ==================== End Cloudflare for SaaS ====================

  /**
   * Setup CNAME for landing page (proxied through Cloudflare).
   * Returns zoneId and recordId so they can be stored for future cleanup.
   * @param {string} domain - Full domain, e.g., "www.landing.example.com"
   * @param {string} target - CNAME target, e.g., "lp.uknow.vn"
   * @returns {Promise<{success:boolean, zoneId?:string, recordId?:string, message?:string}>}
   */
  async setupLandingPageDNS(domain, target) {
    const zoneResult = await this.getZone(domain);
    if (!zoneResult.success) {
      return zoneResult;
    }

    const zoneId = zoneResult.zone.id;
    const name = this.extractSubdomain(domain, zoneResult.zone.name);

    const cnameResult = await this.addDnsRecord(zoneId, {
      type: 'CNAME',
      name,
      content: target,
      proxied: true,
      ttl: 3600,
    });

    if (!cnameResult.success && !cnameResult.duplicate) {
      return cnameResult;
    }

    let recordId = cnameResult.recordId || null;
    if (cnameResult.duplicate || !recordId) {
      const existing = await this.getDnsRecord(zoneId, name);
      recordId = existing?.record?.id || null;
    }

    return {
      success: true,
      zoneId,
      recordId,
      message: cnameResult.duplicate ? 'CNAME record already exists' : 'CNAME record created successfully',
    };
  }

  /**
   * Full domain setup: DNS + SSL
   * @param {string} domain - e.g., "landing.example.com"
   * @param {string} cnameTarget - Target for CNAME
   */
  async setupDomain(domain, cnameTarget) {
    if (!this.isConfigured()) {
      return {
        success: false,
        message: 'Cloudflare API not configured. Please set CLOUDFLARE_API_TOKEN.'
      };
    }

    // Step 1: Setup DNS
    const dnsResult = await this.setupLandingPageDNS(domain, cnameTarget);
    if (!dnsResult.success) {
      return dnsResult;
    }

    // Step 2: Provision SSL
    const sslResult = await this.provisionSSL(domain);

    return {
      success: true,
      dns: dnsResult,
      ssl: sslResult,
      message: 'Domain configured successfully. SSL will be active within 24 hours.'
    };
  }

  /**
   * Delete all DNS records for a domain
   * @param {string} domain - Full domain
   */
  async cleanupDomain(domain) {
    const zoneResult = await this.getZone(domain);
    if (!zoneResult.success) {
      return zoneResult;
    }

    const zoneId = zoneResult.zone.id;
    const name = this.extractSubdomain(domain, zoneResult.zone.name);

    // Find and delete the CNAME record
    const recordResult = await this.getDnsRecord(zoneId, name);
    if (recordResult.success && recordResult.record) {
      await this.deleteDnsRecord(zoneId, recordResult.record.id);
    }

    return { success: true, message: 'Domain DNS cleaned up' };
  }

  /**
   * Extract base domain from full domain
   * e.g., "sub.example.com" -> "example.com"
   */
  extractBaseDomain(domain) {
    const parts = domain.split('.');
    if (parts.length > 2) {
      return parts.slice(-2).join('.');
    }
    return domain;
  }

  /**
   * Extract subdomain part
   * e.g., "sub.example.com" + "example.com" -> "sub"
   */
  extractSubdomain(fullDomain, baseDomain) {
    if (fullDomain === baseDomain) {
      return '@';
    }
    return fullDomain.replace(`.${baseDomain}`, '');
  }
}

export default new CloudflareService();
