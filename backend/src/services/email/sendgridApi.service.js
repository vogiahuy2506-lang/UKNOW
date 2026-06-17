import axios from 'axios';

/**
 * SendGrid API v3 service — handles domain authentication and verification.
 * Uses the SendGrid Web API (not SMTP) for programmatic control.
 *
 * API base: https://api.sendgrid.com/v3
 * Auth: Bearer token (same as SENDGRID_API_KEY env var)
 */
class SendgridApiService {
  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY;
    this.baseUrl = 'https://api.sendgrid.com/v3';
  }

  isConfigured() {
    return !!(this.apiKey && this.apiKey.trim());
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Authenticate (verify) a domain with SendGrid.
   * Returns DNS records (SPF, DKIM) that the customer must add to their DNS.
   *
   * @param {string} domain e.g. "founderai.biz"
   * @returns {Promise<{success, records?: {spf, dkim_cname}, error?: string}>}
   */
  async authenticateDomain(domain) {
    if (!this.isConfigured()) {
      return { success: false, error: 'SendGrid API key not configured' };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/whitelabel/domains`,
        {
          domain,
          brand_id: null,
          // "custom" = use custom DKIM, "private" = let SendGrid manage
          // We use "custom" so we can show the DKIM record.
          custom_spf: true,
          // "default" means this domain becomes the default sender.
          // We let the user decide later which domain to use.
          default: false,
        },
        { headers: this.getHeaders() }
      );

      const data = response.data;
      const rawSpf = data.dns?.spf_record;
      const rawDkim = data.dns?.dkim_record;

      // SendGrid DNS records come as objects: { host, type, data }
      // Extract actual record values for display / Cloudflare setup.
      const spfValue = rawSpf?.data || rawSpf || `v=spf1 include:sendgrid.net ~all`;
      const dkimHost = rawDkim?.host || `k1._domainkey.${data.subdomain}`;
      const dkimTarget = rawDkim?.data || rawDkim || `${dkimHost}.sendgrid.net`;

      return {
        success: true,
        records: {
          // SPF: TXT record value (full record content)
          spf: spfValue,
          // DKIM CNAME: host -> target (the full record line for display)
          dkim_cname: `${dkimHost} -> ${dkimTarget}`,
          dkim_host: dkimHost,
          dkim_target: dkimTarget,
          // The SendGrid-managed subdomain (e.g. "s1.domain.com")
          subdomain: data.subdomain,
          // The domain ID in SendGrid
          domain_id: data.id,
        },
        sendgrid_domain_id: data.id,
      };
    } catch (error) {
      const message = error.response?.data?.errors?.[0]?.message
        || error.response?.data?.message
        || error.message
        || 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Validate DNS records have been propagated.
   * SendGrid checks the DNS and returns whether SPF/DKIM are valid.
   *
   * @param {number} domainId SendGrid domain ID
   * @returns {Promise<{success, valid: boolean, spf_valid: boolean, dkim_valid: boolean, error?: string}>}
   */
  async validateDomain(domainId) {
    if (!this.isConfigured()) {
      return { success: false, valid: false, error: 'SendGrid API key not configured' };
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/whitelabel/domains/${domainId}`,
        { headers: this.getHeaders() }
      );

      const data = response.data;
      const spfValid = data.dns_spf?.valid === true;
      const dkimValid = data.dns_dkim?.valid === true;

      return {
        success: true,
        valid: spfValid && dkimValid,
        spfValid,
        dkimValid,
        sendgridStatus: data.dns?.dns_status,
      };
    } catch (error) {
      const message = error.response?.data?.errors?.[0]?.message
        || error.response?.data?.message
        || error.message;
      return { success: false, valid: false, error: message };
    }
  }

  /**
   * List all authenticated domains in the SendGrid account.
   */
  async listAuthenticatedDomains() {
    if (!this.isConfigured()) {
      return { success: false, error: 'SendGrid API key not configured', domains: [] };
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/whitelabel/domains`,
        { headers: this.getHeaders() }
      );
      return {
        success: true,
        domains: response.data || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.message || error.message,
        domains: [],
      };
    }
  }

  /**
   * Delete an authenticated domain from SendGrid.
   *
   * @param {number} domainId SendGrid domain ID
   */
  async deleteAuthenticatedDomain(domainId) {
    if (!this.isConfigured()) {
      return { success: false, error: 'SendGrid API key not configured' };
    }

    try {
      await axios.delete(
        `${this.baseUrl}/whitelabel/domains/${domainId}`,
        { headers: this.getHeaders() }
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.errors?.[0]?.message || error.message,
      };
    }
  }
}

export default new SendgridApiService();
