import crypto from 'crypto';
import dns from 'dns/promises';
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

function flattenDnsRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .flatMap((record) => (Array.isArray(record) ? record : [record]))
    .map((record) => String(record || '').trim().replace(/\.$/, '').toLowerCase())
    .filter(Boolean);
}

function getNsLookupHintDomain(hostname) {
  const labels = String(hostname || '').trim().toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  return labels.slice(1).join('.');
}

async function hasMatchingARecord(hostname, target) {
  try {
    const [hostnameIps, targetIps] = await Promise.all([
      dns.resolve4(hostname),
      dns.resolve4(target),
    ]);
    const targetSet = new Set(flattenDnsRecords(targetIps));
    return flattenDnsRecords(hostnameIps).some((ip) => targetSet.has(ip));
  } catch {
    return false;
  }
}

export async function checkCnameStatus(hostname, target) {
  const h = String(hostname || '').trim().toLowerCase();
  const expected = String(target || '').trim().replace(/\.$/, '').toLowerCase();

  try {
    const cnameRecords = await dns.resolve(h, 'CNAME');
    const found = flattenDnsRecords(cnameRecords);
    const verified = found.some((cname) => cname === expected);
    return {
      verified,
      reason: verified ? 'ok' : 'wrong_target',
      found,
    };
  } catch (error) {
    const code = String(error?.code || '').trim().toUpperCase();
    if (code === 'ENOTFOUND') {
      return { verified: false, reason: 'not_found', found: [] };
    }

    if (code === 'ENODATA') {
      const verifiedByARecord = await hasMatchingARecord(h, expected);
      return {
        verified: verifiedByARecord,
        reason: verifiedByARecord ? 'ok' : 'no_cname',
        found: [],
      };
    }

    return {
      verified: false,
      reason: 'transient',
      found: [],
    };
  }
}

export function buildDnsVerificationErrorMessage(status, hostname, target) {
  const reason = status?.reason || 'transient';
  const found = Array.isArray(status?.found) ? status.found : [];

  if (reason === 'not_found') {
    const nsHint = getNsLookupHintDomain(hostname);
    return `${hostname} chưa tồn tại trong DNS công khai. Kiểm tra: `
      + `(1) bản ghi đã thêm đúng nhà cung cấp đang giữ nameserver của domain chưa? `
      + `(Tra bằng: dig NS ${nsHint}) `
      + `(2) trường Name chỉ điền phần subdomain, ví dụ "giahuy", không điền full domain.`;
  }

  if (reason === 'no_cname') {
    return `${hostname} có tồn tại nhưng không có bản ghi CNAME. `
      + `Nếu đây là domain gốc (apex) thì không thể dùng CNAME theo chuẩn DNS; `
      + `hãy dùng subdomain như www/lp trỏ CNAME về ${target}, hoặc trỏ A record về cùng IP với ${target}.`;
  }

  if (reason === 'wrong_target') {
    return `CNAME chưa đúng. Cần trỏ về: ${target}\nHiện tại: ${found.join(', ') || 'không có'}`;
  }

  return `Đang chờ DNS propagate cho ${hostname}, vui lòng thử lại sau vài phút.`;
}

function subdomainBase() {
  return String(process.env.LP_SUBDOMAIN_BASE || 'founderai.biz').trim();
}

function buildAutoHostname(slug) {
  return `${slug}.${subdomainBase()}`;
}

/**
 * Build response object for getForLanding.
 * CF-managed domains skip DNS verification — already active on creation.
 */
function buildDomainResponse(row) {
  if (!row) {
    return { configured: false, instructions: null, record: null };
  }

  const isActive = row.status === 'active';
  const isCfManaged = Boolean(row.cfManaged);

  let instructions;
  let record = null;
  const target = cnameTarget();

  if (isActive) {
    instructions = isCfManaged
      ? `Đã kích hoạt tự động qua Cloudflare.`
      : `Đã kích hoạt. Domain đã trỏ về ${target}.`;
  } else {
    instructions = `Thêm bản ghi CNAME tại DNS của bạn:\n- Type: CNAME\n- Name: ${row.hostname}\n- Value: ${target}\nSau đó bấm «Kiểm tra lại» để xác minh.`;
    record = {
      type: 'CNAME',
      name: row.hostname,
      value: target,
    };
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
  };
}

/**
 * Custom domain cho landing — hỗ trợ 2 chế độ:
 *
 * Mode 1 (Cloudflare tự động): nếu CLOUDFLARE_API_TOKEN được cấu hình VÀ
 * base domain của hostname có trong tài khoản CF của platform →
 * backend tự tạo CNAME record, domain active ngay, không cần user verify DNS.
 *
 * Mode 2 (Manual CNAME): nếu CF không cấu hình hoặc zone không tìm thấy →
 * CNAME target = LP_CNAME_TARGET (founderai.biz). Nếu user đã thêm CNAME →
 * tự động active. Nếu chưa → pending với hướng dẫn.
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
   * Nếu Cloudflare được cấu hình và base domain nằm trong tài khoản CF →
   * tự động tạo CNAME và kích hoạt ngay (cfManaged = true).
   * Ngược lại → tự động verify CNAME record và kích hoạt nếu đúng.
   *
   * @param {number} landingPageId
   * @param {string} hostname
   * @param {object} authUser
   */
  async setHostname(landingPageId, hostname, authUser) {
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

    // --- Mode 1: Cloudflare tự động ---
    if (cloudflareService.isConfigured()) {
      const cfResult = await cloudflareService.setupLandingPageDNS(h, cnameTarget());
      if (cfResult.success) {
        console.log(`[LandingPageDomainService] CF auto-setup OK for ${h} → zone=${cfResult.zoneId} record=${cfResult.recordId}`);
        try {
          await landingPageDomainRepository.upsertForLanding({
            landingPageId,
            hostname: h,
            verificationToken: token,
            status: 'active',
            cfManaged: true,
            cfZoneId: cfResult.zoneId,
            cfRecordId: cfResult.recordId,
          });
          // Clear CORS cache so new domain is immediately allowed
          await getClearCacheFn();
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
      // Zone không thuộc CF account của platform → fall through sang Mode 2
      console.log(`[LandingPageDomainService] CF zone not found for ${h}, falling back to manual CNAME verify. Reason: ${cfResult.message}`);
    }

    // --- Mode 2: Manual CNAME verification tự động ---
    // CNAME target là founderai.biz (không phải verify.founderai.biz)
    const target = cnameTarget();
    const dnsStatus = await checkCnameStatus(h, target);
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
      });
      // Clear CORS cache so new domain is immediately allowed (even if pending)
      await getClearCacheFn();
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
   * Xác minh DNS bằng CNAME record.
   * Kiểm tra CNAME có trỏ về founderai.biz không.
   * Nếu domain đã được CF quản lý và active → trả về ngay, không cần verify.
   *
   * @param {number} landingPageId
   * @param {object} authUser
   */
  async verifyDns(landingPageId, authUser) {
    const row = await landingPageDomainRepository.findByLandingPageIdInScope(landingPageId, normalizeAuthScope(authUser));
    if (!row) {
      const err = new Error('Chưa cấu hình tên miền cho landing này');
      err.statusCode = 404;
      throw err;
    }

    // CF-managed domain đã active ngay từ lúc tạo
    if (row.cfManaged && row.status === 'active') {
      return buildDomainResponse(row);
    }

    if (row.status === 'active') {
      return buildDomainResponse(row);
    }

    const expectedTarget = cnameTarget();
    const dnsStatus = await checkCnameStatus(row.hostname, expectedTarget);
    const ok = dnsStatus.verified;

    if (!ok) {
      const err = new Error(buildDnsVerificationErrorMessage(dnsStatus, row.hostname, expectedTarget));
      err.statusCode = 400;
      throw err;
    }

    await landingPageDomainRepository.updateStatusById(row.id, 'active');
    // Clear CORS cache so verified domain is immediately allowed
    await getClearCacheFn();
    return this.getForLanding(landingPageId, authUser);
  }

  /**
   * Xóa custom domain (BYOD).
   * Nếu domain được CF quản lý → tự động xóa CNAME record trên Cloudflare.
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

    if (row.cfManaged && row.cfZoneId && row.cfRecordId) {
      const cfResult = await cloudflareService.deleteDnsRecord(row.cfZoneId, row.cfRecordId);
      if (cfResult.success) {
        console.log(`[LandingPageDomainService] CF DNS record deleted for ${row.hostname}`);
      } else {
        console.warn(`[LandingPageDomainService] CF DNS cleanup failed for ${row.hostname}: ${cfResult.message}`);
      }
    }

    await landingPageDomainRepository.deleteByLandingPageId(landingPageId);
    // Clear CORS cache so removed domain is no longer allowed
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
   * Tìm các domain đang pending, kiểm tra CNAME và activate nếu đúng.
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
        // Skip CF-managed domains
        if (domain.cfManaged) continue;

        const dnsStatus = await checkCnameStatus(domain.hostname, target);
        if (dnsStatus.verified) {
          await landingPageDomainRepository.updateStatusById(domain.id, 'active');
          await getClearCacheFn();
          console.log(`[LandingPageDomainService] Auto-verified: ${domain.hostname}`);
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
