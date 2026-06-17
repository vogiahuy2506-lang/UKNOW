import emailSettingsRepository from '../../repositories/email/emailSettings.repository.js';
import sendgridApiService from './sendgridApi.service.js';
import cloudflareService from '../cloudflare.service.js';
import { isAdminRole } from '../../utils/roleScope.util.js';

function createServiceError(message, statusCode, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

/**
 * Domain Verification Service
 *
 * Handles the full flow for SendGrid domain authentication (Hướng 2):
 * 1. User enters a custom domain (e.g. uef.edu.vn)
 * 2. Platform calls SendGrid API → gets SPF + DKIM records
 * 3. Platform sets up DNS records in Cloudflare (if domain is managed there)
 * 4. Platform polls SendGrid to check DNS propagation
 * 5. On success: from address uses the custom domain
 *
 * Fallback: if Cloudflare is not managing the domain, the customer gets
 * manual DNS instructions to add records themselves.
 */
class EmailDomainVerificationService {
  /**
   * Initiate domain verification for an email setting.
   *
   * @param {object} params
   * @param {number} params.userId
   * @param {string} params.roleCode
   * @param {number} params.settingId
   * @returns {Promise<{success, step: 'sendgrid_created'|'cf_dns_setup'|'manual', dnsRecords?, instruction?, error?}>}
   */
  async initiate({ userId, roleCode, settingId }) {
    const setting = await emailSettingsRepository.getById(userId, settingId, { roleCode });
    if (!setting) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }

    const brandDomain = setting.brand_domain;
    if (!brandDomain) {
      throw createServiceError('Cấu hình email không có domain hợp lệ', 400);
    }

    // Already verified?
    if (setting.domain_verification_status === 'verified') {
      return { success: true, step: 'already_verified', message: 'Domain đã được xác thực' };
    }

    // Step 1: Authenticate domain in SendGrid
    const sendgridResult = await sendgridApiService.authenticateDomain(brandDomain);
    if (!sendgridResult.success) {
      // If domain already exists in SendGrid, try to get its records instead
      if (sendgridResult.error?.includes('already exists') || sendgridResult.error?.includes('already been taken')) {
        const listResult = await sendgridApiService.listAuthenticatedDomains();
        const existing = (listResult.domains || []).find(d => d.domain === brandDomain);
        if (existing) {
          const validateResult = await sendgridApiService.validateDomain(existing.id);
          if (validateResult.valid) {
            await emailSettingsRepository.updateDomainVerification(settingId, {
              status: 'verified',
              dnsRecords: { sendgrid_domain_id: existing.id, note: 'domain already authenticated' },
              verifiedAt: new Date().toISOString(),
            });
            return { success: true, step: 'already_verified', message: 'Domain đã được xác thực trong SendGrid' };
          }
          return {
            success: true,
            step: 'cf_dns_setup',
            dnsRecords: existing.dns,
            message: 'Domain đã tồn tại trong SendGrid. Vui lòng đợi DNS propagation hoặc kiểm tra DNS records.',
            sendgrid_domain_id: existing.id,
          };
        }
      }
      throw createServiceError(`Lỗi SendGrid: ${sendgridResult.error}`, 400);
    }

    const { records, sendgrid_domain_id } = sendgridResult;

    // Step 2: Try to set up DNS in Cloudflare automatically
    const cfResult = await this._setupCloudflareDns(brandDomain, records);

    if (cfResult.success) {
      // Cloudflare DNS was set up automatically
      await emailSettingsRepository.updateDomainVerification(settingId, {
        status: 'dns_records_created',
        dnsRecords: {
          ...records,
          sendgrid_domain_id,
          cf_zone_id: cfResult.zoneId,
          cf_record_ids: cfResult.recordIds,
          dns_setup_method: 'cloudflare_auto',
        },
      });

      return {
        success: true,
        step: 'cf_dns_setup',
        dnsRecords: records,
        sendgrid_domain_id,
        message: `Đã tự động tạo DNS records cho domain ${brandDomain} trên Cloudflare. Đang chờ SendGrid xác thực...`,
      };
    }

    // Fallback: manual DNS setup
    await emailSettingsRepository.updateDomainVerification(settingId, {
      status: 'pending',
      dnsRecords: {
        ...records,
        sendgrid_domain_id,
        dns_setup_method: 'manual',
      },
    });

    return {
      success: true,
      step: 'manual',
      dnsRecords: records,
      sendgrid_domain_id,
      message: `Domain ${brandDomain} chưa được quản lý trên Cloudflare. Vui lòng thêm DNS records bên dưới vào DNS provider của bạn.`,
    };
  }

  /**
   * Check verification status by polling SendGrid.
   */
  async checkStatus({ userId, roleCode, settingId }) {
    const setting = await emailSettingsRepository.getById(userId, settingId, { roleCode });
    if (!setting) {
      throw createServiceError('Không tìm thấy cấu hình email', 404);
    }

    const { domain_dns_records, domain_verification_status } = setting;
    if (domain_verification_status === 'verified') {
      return { success: true, status: 'verified', message: 'Domain đã được xác thực' };
    }

    if (domain_verification_status === 'failed') {
      return { success: true, status: 'failed', message: 'Xác thực domain thất bại. Vui lòng thử lại.' };
    }

    const dnsRecords = domain_dns_records || {};
    const sendgridDomainId = dnsRecords.sendgrid_domain_id;

    if (!sendgridDomainId) {
      return { success: true, status: domain_verification_status || 'pending', message: 'Chưa có SendGrid domain ID' };
    }

    const validateResult = await sendgridApiService.validateDomain(sendgridDomainId);

    if (!validateResult.success) {
      return { success: true, status: domain_verification_status, message: validateResult.error };
    }

    if (validateResult.valid) {
      await emailSettingsRepository.updateDomainVerification(settingId, {
        status: 'verified',
        verifiedAt: new Date().toISOString(),
      });
      return { success: true, status: 'verified', message: 'Domain đã được xác thực thành công!' };
    }

    // Not yet valid
    await emailSettingsRepository.updateDomainVerification(settingId, {
      status: 'verifying',
    });

    return {
      success: true,
      status: 'verifying',
      spfValid: validateResult.spfValid,
      dkimValid: validateResult.dkimValid,
      sendgridStatus: validateResult.sendgridStatus,
      message: `DNS chưa hoàn toàn hợp lệ. SPF: ${validateResult.spfValid ? '✓' : '✗'}, DKIM: ${validateResult.dkimValid ? '✓' : '✗'}`,
    };
  }

  /**
   * Attempt to set up DNS records in Cloudflare for a domain.
   *
   * @param {string} domain e.g. "uef.edu.vn"
   * @param {object} records { spf, dkim_cname }
   * @returns {Promise<{success, zoneId?, recordIds?, error?}>}
   */
  async _setupCloudflareDns(domain, records) {
    if (!cloudflareService.isConfigured()) {
      return { success: false, error: 'Cloudflare not configured' };
    }

    // Get zone for domain
    const zoneResult = await cloudflareService.getZoneByName(domain);
    if (!zoneResult.success || !zoneResult.zone) {
      return { success: false, error: `Cloudflare zone not found for ${domain}` };
    }

    const { zone } = zoneResult;
    const recordIds = [];

    try {
      // Add SPF TXT record
      if (records.spf) {
        const spfResult = await cloudflareService.addDnsRecord(zone.zone_id, {
          type: 'TXT',
          name: domain,
          content: records.spf,
          proxied: false,
        });
        if (spfResult.success && spfResult.record?.id) {
          recordIds.push({ type: 'SPF', id: spfResult.record.id });
        }
      }

      // Add DKIM CNAME record
      // Use dkim_host + dkim_target from sendgridApi response if available.
      // Falls back to parsing dkim_cname string if not available (backward compat).
      const dkimHost = records.dkim_host
        || records.dkim_cname?.split('->')[0]?.trim()
        || null;
      const dkimTarget = records.dkim_target
        || records.dkim_cname?.split('->')[1]?.trim()
        || null;

      if (dkimHost && dkimTarget) {
        const dkimResult = await cloudflareService.addDnsRecord(zone.zone_id, {
          type: 'CNAME',
          name: dkimHost,
          content: dkimTarget,
          proxied: false,
        });
        if (dkimResult.success && dkimResult.record?.id) {
          recordIds.push({ type: 'DKIM', id: dkimResult.record.id });
        }
      }

      return {
        success: true,
        zoneId: zone.zone_id,
        recordIds,
        message: `Added ${recordIds.length} DNS records for ${domain}`,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

export default new EmailDomainVerificationService();
