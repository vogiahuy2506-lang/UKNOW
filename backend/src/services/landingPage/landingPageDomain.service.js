import crypto from 'crypto';
import dns from 'dns/promises';
import { spawn } from 'child_process';
import landingPageDomainRepository from '../../repositories/landingPageDomain.repository.js';
import landingPageRepository from '../../repositories/landingPage.repository.js';
import cloudflareService from '../cloudflare.service.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';
import { resolveFrontendOriginFromEnv } from '../../utils/landingHtmlInjection.util.js';

// Lazy import to avoid circular dependency
let clearVerifiedDomainsCache = null;
async function getClearCacheFn() {
  if (!clearVerifiedDomainsCache) {
    const module = await import('../../middleware/dynamicCors.middleware.js');
    clearVerifiedDomainsCache = module.clearVerifiedDomainsCache;
  }
  return clearVerifiedDomainsCache;
}

const WWW_HOST_RE = /^www\.([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const APEX_SUBDOMAIN_PREFIXES = new Set(['www', 'lp', 'm', 'blog', 'app', 'admin', 'crm', 'api', 'dev', 'staging', 'test']);

function isApexDomain(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  const parts = h.split('.').filter(Boolean);
  if (parts.length > 3) return false;
  if (parts.length >= 2 && APEX_SUBDOMAIN_PREFIXES.has(parts[0])) return false;
  return true;
}

function normalizeAuthScope(authUser) {
  return {
    userId: authUser?.id,
    role: authUser?.role,
    ownerId: authUser?.activeContext?.ownerId,
  };
}

function parseHostnameFromUrl(urlStr) {
  try {
    const u = new URL(String(urlStr || '').trim());
    return String(u.hostname || '').toLowerCase();
  } catch {
    return '';
  }
}

function getBlockedHostnames() {
  const set = new Set(['localhost', '127.0.0.1', 'founderai.biz', 'www.founderai.biz']);
  const fe = parseHostnameFromUrl(resolveFrontendOriginFromEnv());
  if (fe) {
    set.add(fe);
    if (fe.startsWith('www.')) set.add(fe.slice(4));
    else set.add(`www.${fe}`);
  }
  const be = parseHostnameFromUrl(String(process.env.BACKEND_PUBLIC_URL || '').trim());
  if (be) set.add(be);
  const extra = String(process.env.CUSTOM_DOMAIN_EXTRA_BLOCKED_HOSTNAMES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  extra.forEach((h) => set.add(h));
  return set;
}

function assertValidHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) {
    const err = new Error('Thiếu hostname');
    err.statusCode = 400;
    throw err;
  }
  if (h.length > 253) {
    const err = new Error('Hostname quá dài');
    err.statusCode = 400;
    throw err;
  }
  // Hỗ trợ cả apex domain (example.com) và www domain (www.example.com)
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(h)) {
    const err = new Error('Hostname không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  if (getBlockedHostnames().has(h)) {
    const err = new Error('Không được dùng hostname này');
    err.statusCode = 400;
    throw err;
  }
  return h;
}

function cnameTarget() {
  return String(process.env.LP_CNAME_TARGET || 'founderai.biz').trim();
}

function apexFixedIp() {
  return String(process.env.LP_APEX_FIXED_IP || '').trim() || null;
}

function flattenDnsRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .flatMap((record) => (Array.isArray(record) ? record : [record]))
    .map((record) => String(record || '').trim().replace(/\.$/, '').toLowerCase())
    .filter(Boolean);
}

function getNsLookupHintDomain(hostname) {
  // Always return the full hostname for NS lookup - users need to check nameservers for their own domain
  return String(hostname || '').trim().toLowerCase();
}

async function hasMatchingARecord(hostname, target) {
  const platformIp = apexFixedIp();
  const h = String(hostname || '').trim().toLowerCase();
  try {
    const hostnameIps = await dns.resolve4(h);
    // For apex domains: check if the apex IP matches the platform's fixed IP
    if (platformIp) {
      const apexIp = hostnameIps[0];
      if (apexIp === platformIp) return true;
    }
    // Fallback: check if IP matches target's A record
    const targetIps = await dns.resolve4(target);
    const targetSet = new Set(flattenDnsRecords(targetIps));
    return flattenDnsRecords(hostnameIps).some((ip) => targetSet.has(ip));
  } catch {
    return false;
  }
}

export async function checkCnameStatus(hostname, target, forceApex = null) {
  const h = String(hostname || '').trim().toLowerCase();
  const expected = String(target || '').trim().replace(/\.$/, '').toLowerCase();
  // Use user-chosen flag if provided, otherwise auto-detect
  const isApex = forceApex !== null ? Boolean(forceApex) : isApexDomain(h);
  const platformIp = apexFixedIp();

  // Apex domain: skip CNAME lookup, go straight to A record check
  if (isApex) {
    let currentIp = null;
    try {
      currentIp = (await dns.resolve4(h))[0] || null;
    } catch {
      // ignore
    }

    const verified = platformIp ? currentIp === platformIp : false;
    return {
      verified,
      reason: verified ? 'ok' : (currentIp ? 'wrong_target' : 'not_found'),
      found: [],
      isApexDomain: isApex,
      currentIp,
    };
  }

  // Subdomain: try CNAME first
  try {
    const cnameRecords = await dns.resolve(h, 'CNAME');
    const found = flattenDnsRecords(cnameRecords);
    const verified = found.some((cname) => cname === expected);
    return {
      verified,
      reason: verified ? 'ok' : 'wrong_target',
      found,
      isApexDomain: isApex,
      currentIp: null,
    };
  } catch (error) {
    const code = String(error?.code || '').trim().toUpperCase();
    if (code === 'ENOTFOUND') {
      return { verified: false, reason: 'not_found', found: [], isApexDomain: isApex, currentIp: null };
    }

    if (code === 'ENODATA') {
      let currentIp = null;
      try {
        const ips = await dns.resolve4(h);
        currentIp = ips[0] || null;
      } catch { /* ignore */ }

      const verifiedByARecord = platformIp ? currentIp === platformIp : false;
      const reason = verifiedByARecord ? 'ok' : 'no_cname';
      return {
        verified: verifiedByARecord,
        reason,
        found: [],
        isApexDomain: isApex,
        currentIp,
      };
    }

    // Transient/other DNS error → mark as transient for retry
    return {
      verified: false,
      reason: 'transient',
      found: [],
      isApexDomain: isApex,
      currentIp: null,
    };
  }
}

export function buildDnsVerificationErrorMessage(status, hostname, target) {
  const reason = status?.reason || 'transient';
  const found = Array.isArray(status?.found) ? status.found : [];
  const isApex = status?.isApexDomain;
  const currentIp = status?.currentIp;
  const platformIp = apexFixedIp();

  if (reason === 'not_found') {
    const nsHint = getNsLookupHintDomain(hostname);
    if (isApex) {
      return `${hostname} chưa tồn tại trong DNS công khai. Kiểm tra: `
        + `(1) bản ghi A đã được thêm tại nhà cung cấp domain chưa?\n`
        + `(2) Nameserver của domain đã trỏ đúng nhà cung cấp chưa? (Tra bằng: dig NS ${nsHint})`;
    }
    return `${hostname} chưa tồn tại trong DNS công khai. Kiểm tra: `
      + `(1) bản ghi đã thêm đúng nhà cung cấp đang giữ nameserver của domain chưa? `
      + `(Tra bằng: dig NS ${nsHint}) `
      + `(2) trường Name chỉ điền phần subdomain, ví dụ "giahuy", không điền full domain.`;
  }

  if (reason === 'no_cname') {
    if (isApex) {
      if (currentIp && platformIp && currentIp !== platformIp) {
        return `${hostname} có tồn tại nhưng bản ghi A chưa đúng.\n`
          + `- Domain hiện tại trỏ về IP: ${currentIp}\n`
          + `- IP cần trỏ về: ${platformIp}\n`
          + `Vui lòng đổi bản ghi A tại nhà cung cấp domain:\n`
          + `- Type: A\n`
          + `- Name: @\n`
          + `- Value: ${platformIp}`;
      }
      if (currentIp && platformIp && currentIp === platformIp) {
        return `${hostname} đã trỏ đúng IP ${platformIp}, nhưng hệ thống chưa nhận diện được.\n`
          + `Vui lòng thử lại sau vài phút, hoặc liên hệ hỗ trợ.`;
      }
      return `${hostname} đang được đặt là domain gốc (apex), nhưng hệ thống chưa cấu hình IP mặc định cho apex domain.\n`
        + `Vui lòng liên hệ hỗ trợ để cấu hình, hoặc chuyển sang dùng subdomain (ví dụ: www.${hostname}) với bản ghi CNAME trỏ về ${target}.`;
    }
    return `${hostname} có tồn tại nhưng không có bản ghi CNAME. `
      + `Vui lòng thêm bản ghi CNAME tại nhà cung cấp domain:\n`
      + `- Type: CNAME\n`
      + `- Name: phần trước dấu chấm (ví dụ "www" hoặc "lp")\n`
      + `- Value: ${target}`;
  }

  if (reason === 'wrong_target') {
    if (isApex && currentIp && platformIp) {
      return `${hostname} có tồn tại nhưng bản ghi A chưa đúng.\n`
        + `- Domain hiện tại trỏ về IP: ${currentIp}\n`
        + `- IP cần trỏ về: ${platformIp}\n`
        + `Vui lòng đổi bản ghi A tại nhà cung cấp domain:\n`
        + `- Type: A\n`
        + `- Name: @\n`
        + `- Value: ${platformIp}`;
    }

    return `CNAME chưa đúng.\n`
      + `- Cần trỏ về: ${target}\n`
      + `- Hiện tại: ${found.join(', ') || 'không có'}`;
  }

  const detail = currentIp
    ? `\nIP hiện tại của ${hostname}: ${currentIp}`
    : '';
  const note = reason === 'transient'
    ? 'Lỗi DNS tạm thời (timeout/network), vui lòng thử lại sau vài phút.'
    : 'Vui lòng kiểm tra lại bản ghi DNS hoặc thử lại sau vài phút.';
  return `Đang chờ xác minh DNS cho ${hostname}. ${note}${detail}`;
}

function subdomainBase() {
  return String(process.env.LP_SUBDOMAIN_BASE || 'founderai.biz').trim();
}

function buildAutoHostname(slug) {
  return `${slug}.${subdomainBase()}`;
}

/**
 * Build response object for getForLanding.
 * All domains use Certbot for SSL provisioning.
 */
function buildDomainResponse(row) {
  if (!row) {
    return { configured: false, instructions: null, record: null };
  }

  const isActive = row.status === 'active';
  const isCfManaged = Boolean(row.cfManaged);
  // Use stored user-chosen flag, fall back to auto-detect for existing rows
  const isApex = row.isApexDomain !== undefined && row.isApexDomain !== null
    ? Boolean(row.isApexDomain)
    : isApexDomain(row.hostname);
  const platformIp = apexFixedIp();
  const target = cnameTarget();

  let instructions;
  let record = null;

  if (isActive) {
    if (isCfManaged) {
      instructions = `Đã kích hoạt tự động qua Cloudflare (subdomain).`;
    } else if (isApex) {
      instructions = `Đã kích hoạt. Domain đã trỏ về địa chỉ IP của máy chủ. SSL được cấp qua Let's Encrypt.`;
    } else {
      instructions = `Đã kích hoạt. Domain đã trỏ về ${target}. SSL được cấp qua Let's Encrypt.`;
    }
  } else {
    if (isApex && platformIp) {
      // Apex domain with Certbot
      instructions = `Thêm bản ghi A tại DNS của bạn:\n- Type: A\n- Name: @\n- Value: ${platformIp}\nSau đó bấm «Kiểm tra lại» để xác minh. SSL sẽ được cấp tự động qua Let's Encrypt.`;
      record = { type: 'A', name: '@', value: platformIp };
    } else {
      // Subdomain with manual CNAME
      instructions = `Thêm bản ghi CNAME tại DNS của bạn:\n- Type: CNAME\n- Name: phần trước dấu chấm (ví dụ "www" hoặc "lp")\n- Value: ${target}\nSau đó bấm «Kiểm tra lại» để xác minh. SSL sẽ được cấp tự động qua Let's Encrypt.`;
      record = { type: 'CNAME', name: row.hostname, value: target };
    }
  }

  return {
    configured: true,
    hostname: row.hostname,
    status: row.status,
    cfManaged: isCfManaged,
    verifiedAt: row.verifiedAt,
    instructions,
    record,
    cnameTarget: target,
    apexFixedIp: platformIp,
    isApexDomain: isApex,
  };
}

/**
 * Custom domain cho landing — hỗ trợ 2 chế độ:
 *
 * Mode 1 (Auto-provisioned subdomain): slug.founderai.biz được tạo tự động
 * khi tạo landing page. DNS được tạo qua Cloudflare API.
 *
 * Mode 2 (Custom domain): User tự thêm CNAME/A record ở DNS provider.
 * Sau khi verify DNS, SSL được cấp tự động qua Let's Encrypt (Certbot).
 */
class LandingPageDomainService {
  /**
   * Public: resolve hostname → slug (chỉ active + landing publish).
   * Skip apex domain founderai.biz vì nó trỏ về WordPress.
   */
  async getPublishedSlugForHost(hostname) {
    const h = String(hostname || '').trim().toLowerCase();
    if (!h) return null;
    // Skip apex domain - nó phải trỏ về WordPress, không phải landing page
    if (h === 'founderai.biz' || h === 'www.founderai.biz') return null;
    const row = await landingPageDomainRepository.findActiveByHostname(h);
    if (!row?.landingSlug) return null;
    return String(row.landingSlug).trim().toLowerCase();
  }

  /**
   * @param {number} landingPageId
   * @param {object} authUser
   */
  async getForLanding(landingPageId, authUser) {
    const lp = await landingPageRepository.findByIdInScope(landingPageId, normalizeAuthScope(authUser));
    if (!lp) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const row = await landingPageDomainRepository.findByLandingPageId(landingPageId);
    return buildDomainResponse(row);
  }

  /**
   * Gắn hostname cho landing page.
   * 
   * Flow:
   * 1. User nhập hostname (subdomain hoặc apex)
   * 2. Backend verify DNS (CNAME/A record)
   * 3. Nếu DNS OK → status = active, trigger SSL provisioning
   * 4. Nếu DNS chưa OK → status = pending_verification
   *
   * @param {number} landingPageId
   * @param {string} hostname
   * @param {boolean} isApexDomain - user-chosen apex vs subdomain flag
   * @param {object} authUser
   */
  async setHostname(landingPageId, hostname, isApexDomain, authUser) {
    const h = assertValidHostname(hostname);
    const lp = await landingPageRepository.findByIdInScope(landingPageId, normalizeAuthScope(authUser));
    if (!lp) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    if (!lp.isPublished) {
      const err = new Error('Landing cần được công bố trước khi gắn tên miền.');
      err.statusCode = 400;
      throw err;
    }

    const scope = normalizeAuthScope(authUser);
    const existing = await landingPageDomainRepository.findByLandingPageId(landingPageId);
    const count = await landingPageDomainRepository.countPendingOrActiveInScope(scope);
    const planUserId = authUser?.activeContext?.ownerId ?? authUser.id;
    const limitCheck = await checkUserResourceLimit({
      userId: planUserId,
      role: authUser?.role,
      resourceKey: 'landingPages',
    });
    const max = limitCheck.limit;
    const alreadyInQuota =
      existing && ['pending_verification', 'active'].includes(existing.status);
    if (max != null && Number.isFinite(max)) {
      if (!alreadyInQuota && count >= max) {
        const err = new Error(
          `Đã đạt giới hạn tên miền tùy chỉnh theo gói (tối đa ${max}, cùng giới hạn số landing page).`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    const other = await landingPageDomainRepository.findByHostnameLower(h);
    if (other && Number(other.landingPageId) !== Number(landingPageId)) {
      const err = new Error('Hostname đã được dùng cho landing khác');
      err.statusCode = 409;
      throw err;
    }

    const token = crypto.randomBytes(18).toString('hex');
    const target = cnameTarget();

    // Determine domain type from user choice or auto-detect
    const isApex = isApexDomain === true;

    // All domains use Certbot for SSL provisioning
    // Verify DNS: kiểm tra CNAME/A record đã được thêm chưa
    // (Customer tự thêm CNAME/A record ở DNS provider của họ, ta chỉ verify)
    const dnsStatus = await checkCnameStatus(h, target, isApexDomain);
    const isVerified = dnsStatus.verified;

    const status = isVerified ? 'active' : 'pending_verification';
    try {
      await landingPageDomainRepository.upsertForLanding({
        landingPageId,
        hostname: h,
        verificationToken: token,
        status,
        cfManaged: false,
        cfZoneId: null,
        cfRecordId: null,
        cfHostnameId: null,
        isApexDomain: isApex,
      });
      await getClearCacheFn();

      // If verified, trigger SSL provisioning via Certbot
      if (isVerified) {
        this.provisionSsl(h).catch((err) => {
          console.error(`[LandingPageDomainService] SSL provisioning failed for ${h}:`, err.message);
        });
      }

      return this.getForLanding(landingPageId, authUser);
    } catch (e) {
      if (e?.code === '23505') {
        const err = new Error('Hostname đã tồn tại trên hệ thống');
        err.statusCode = 409;
        throw err;
      }
      throw e;
    }
  }

  /**
   * Xác minh DNS bằng CNAME record hoặc A record.
   * Kiểm tra CNAME có trỏ về founderai.biz không, hoặc A record có trỏ về IP platform không.
   * Sau khi verify thành công, trigger SSL provisioning qua Certbot.
   *
   * @param {number} landingPageId
   * @param {object} authUser
   */
  async verifyDns(landingPageId, authUser) {
    const scope = normalizeAuthScope(authUser);
    const row = await landingPageDomainRepository.findByLandingPageIdInScope(landingPageId, scope);
    if (!row) {
      const err = new Error('Chưa cấu hình tên miền cho landing này');
      err.statusCode = 404;
      throw err;
    }

    if (row.status === 'active') {
      this.provisionSsl(row.hostname).catch((err) => {
        console.error(`[LandingPageDomainService] SSL provisioning failed for ${row.hostname}:`, err.message);
      });
      return buildDomainResponse(row);
    }

    const expectedTarget = cnameTarget();
    const storedIsApex = row.isApexDomain !== undefined && row.isApexDomain !== null
      ? Boolean(row.isApexDomain)
      : null;
    const dnsStatus = await checkCnameStatus(row.hostname, expectedTarget, storedIsApex);

    const ok = dnsStatus.verified;
    console.log(`[LandingPageDomainService.verifyDns] expectedTarget=${expectedTarget}, reason=${dnsStatus.reason}, found=${(dnsStatus.found || []).join(',')}, ok=${ok}, isApex=${dnsStatus.isApexDomain}, currentIp=${dnsStatus.currentIp}`);

    if (!ok) {
      const err = new Error(buildDnsVerificationErrorMessage(dnsStatus, row.hostname, expectedTarget));
      err.statusCode = 400;
      throw err;
    }

    await landingPageDomainRepository.updateStatusById(row.id, 'active');
    await getClearCacheFn();

    // Trigger SSL provisioning via Certbot
    this.provisionSsl(row.hostname).catch((err) => {
      console.error(`[LandingPageDomainService] SSL provisioning failed for ${row.hostname}:`, err.message);
    });

    return this.getForLanding(landingPageId, authUser);
  }

  /**
   * Trigger SSL certificate provisioning for a domain.
   * @param {string} hostname
   */
  async provisionSsl(hostname) {
    const scriptPath = process.env.SSL_PROVISION_SCRIPT;
    if (!scriptPath) {
      console.log(`[LandingPageDomainService] SSL provision skipped: SSL_PROVISION_SCRIPT not set`);
      return;
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(scriptPath, [hostname], { shell: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`[LandingPageDomainService] SSL provisioned for ${hostname}`);
          resolve();
        } else {
          console.error(`[LandingPageDomainService] SSL provision failed: ${stderr}`);
          reject(new Error(stderr || `Exit code ${code}`));
        }
      });
    });
  }

  /**
   * Auto-provision SSL for all active domains that don't have certificates.
   * Called on backend startup.
   */
  async provisionSslForAllActiveDomains() {
    const scriptPath = process.env.SSL_PROVISION_SCRIPT;
    if (!scriptPath) {
      console.log(`[LandingPageDomainService] SSL auto-provision skipped: SSL_PROVISION_SCRIPT not set`);
      return;
    }

    try {
      const domains = await landingPageDomainRepository.findAllActive();

      if (!domains || domains.length === 0) {
        console.log(`[LandingPageDomainService] No active domains found for SSL provisioning`);
        return;
      }

      console.log(`[LandingPageDomainService] Found ${domains.length} active domain(s), checking SSL status...`);

      for (const domain of domains) {
        // Check if cert already exists and is valid
        // We can't check from Node, so just try to provision - script will skip if valid
        this.provisionSsl(domain.hostname).catch((err) => {
          console.error(`[LandingPageDomainService] SSL provisioning failed for ${domain.hostname}:`, err.message);
        });
      }
    } catch (err) {
      console.error(`[LandingPageDomainService] Failed to get active domains for SSL provisioning:`, err.message);
    }
  }

  /**
   * Trigger SSL certificate provisioning for a domain by landing page ID.
   * @param {number} landingPageId
   * @param {object} authUser
   * @returns {Promise<object>}
   */
  async provisionSslForDomain(landingPageId, authUser) {
    const row = await this.getForLanding(landingPageId, authUser);
    if (!row) {
      const err = new Error('Chưa cấu hình tên miền');
      err.statusCode = 404;
      throw err;
    }

    const hostname = String(row.hostname || '').trim().toLowerCase();
    if (!hostname) {
      const err = new Error('Domain không hợp lệ');
      err.statusCode = 400;
      throw err;
    }

    await this.provisionSsl(hostname);

    return { hostname, status: row.status };
  }

  /**
   * Xóa custom domain.
   * DNS record được quản lý bởi khách hàng (không phải platform).
   *
   * @param {number} landingPageId
   * @param {object} authUser
   */
  async remove(landingPageId, authUser) {
    const row = await landingPageDomainRepository.findByLandingPageIdInScope(landingPageId, normalizeAuthScope(authUser));
    if (!row) {
      const err = new Error('Chưa cấu hình tên miền');
      err.statusCode = 404;
      throw err;
    }

    // Xóa domain khỏi database
    // SSL certificate sẽ được cleanup bởi certbot renewal hooks hoặc manual
    await landingPageDomainRepository.deleteByLandingPageId(landingPageId);
    await getClearCacheFn();
    return { ok: true };
  }

  /**
   * Tự động cấp subdomain `slug.founderai.biz` khi tạo landing page.
   * Gọi sau khi landing page đã được insert vào DB.
   * Lỗi CF không làm fail toàn bộ — chỉ log warning.
   *
   * @param {number} landingPageId
   * @param {string} slug
   * @returns {Promise<{hostname:string, cfManaged:boolean}>}
   */
  async autoProvisionSubdomain(landingPageId, slug) {
    const hostname = buildAutoHostname(slug);

    if (!cloudflareService.isConfigured()) {
      console.log(`[LandingPageDomainService] CF not configured, skipping auto-provision for ${hostname}`);
      return { hostname, cfManaged: false };
    }

    const cfResult = await cloudflareService.setupLandingPageDNS(hostname, cnameTarget());
    if (!cfResult.success) {
      console.warn(`[LandingPageDomainService] CF auto-provision failed for ${hostname}: ${cfResult.message}`);
      return { hostname, cfManaged: false };
    }

    const token = crypto.randomBytes(18).toString('hex');
    try {
      await landingPageDomainRepository.upsertForLanding({
        landingPageId,
        hostname,
        verificationToken: token,
        status: 'active',
        cfManaged: true,
        cfZoneId: cfResult.zoneId,
        cfRecordId: cfResult.recordId,
      });
      // Clear CORS cache so auto-provisioned subdomain is immediately allowed
      await getClearCacheFn();
      console.log(`[LandingPageDomainService] Auto-provisioned ${hostname} → CF zone=${cfResult.zoneId}`);
      return { hostname, cfManaged: true };
    } catch (e) {
      console.warn(`[LandingPageDomainService] DB upsert failed for ${hostname}: ${e.message}`);
      return { hostname, cfManaged: false };
    }
  }

  /**
   * Xóa subdomain tự động (gọi khi landing page bị xóa hoặc đổi slug).
   * Lỗi CF không throw — chỉ log warning.
   *
   * @param {number} landingPageId
   */
  async removeSubdomain(landingPageId) {
    const row = await landingPageDomainRepository.findByLandingPageId(landingPageId);
    if (!row) return;

    // Delete DNS record for auto-provisioned subdomains (slug.founderai.biz)
    if (row.cfManaged && row.cfZoneId && row.cfRecordId) {
      const cfResult = await cloudflareService.deleteDnsRecord(row.cfZoneId, row.cfRecordId);
      if (!cfResult.success) {
        console.warn(`[LandingPageDomainService] CF cleanup failed for ${row.hostname}: ${cfResult.message}`);
      } else {
        console.log(`[LandingPageDomainService] CF record removed for ${row.hostname}`);
      }
    }

    await landingPageDomainRepository.deleteByLandingPageId(landingPageId);
    // Clear CORS cache so removed subdomain is no longer allowed
    await getClearCacheFn();
  }

  /**
   * Auto-verify pending domains - được gọi bởi scheduler mỗi 5 phút.
   * Tìm các domain đang pending, kiểm tra DNS và activate nếu đúng.
   * Sau khi verify thành công, trigger SSL provisioning qua Certbot.
   * @returns {{total: number, verified: number, failed: number}}
   */
  async autoVerifyPendingDomains() {
    const pendingDomains = await landingPageDomainRepository.findPendingDomains();
    if (!pendingDomains?.length) {
      return { total: 0, verified: 0, failed: 0 };
    }

    let verified = 0;
    let failed = 0;
    const target = cnameTarget();

    for (const domain of pendingDomains) {
      try {
        // Skip auto-provisioned *.founderai.biz subdomains (cfManaged=true, no custom domain)
        if (domain.cfManaged && !domain.cfHostnameId) continue;

        const dnsStatus = await checkCnameStatus(domain.hostname, target);
        if (dnsStatus.verified) {
          await landingPageDomainRepository.updateStatusById(domain.id, 'active');
          await getClearCacheFn();
          console.log(`[LandingPageDomainService] Auto-verified (DNS): ${domain.hostname}`);
          
          // Trigger SSL provisioning
          this.provisionSsl(domain.hostname).catch((err) => {
            console.error(`[LandingPageDomainService] SSL provision failed for ${domain.hostname}:`, err.message);
          });
          
          verified++;
        } else {
          failed++;
        }
      } catch (e) {
        console.warn(`[LandingPageDomainService] Auto-verify failed for ${domain.hostname}: ${e.message}`);
        failed++;
      }
    }

    if (verified > 0) {
      console.log(`[LandingPageDomainService] Auto-verify done: ${verified}/${pendingDomains.length} domains activated`);
    }

    return { total: pendingDomains.length, verified, failed };
  }
}

export default new LandingPageDomainService();
