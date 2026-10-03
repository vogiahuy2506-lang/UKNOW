import crypto from 'crypto';
import dns from 'dns/promises';
import { spawn } from 'child_process';
import fs from 'fs';
import landingPageDomainRepository from '../../repositories/landingPageDomain.repository.js';
import landingPageRepository from '../../repositories/landingPage.repository.js';
import cloudflareService from '../cloudflare.service.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';
import { resolveFrontendOriginFromEnv } from '../../utils/landingHtmlInjection.util.js';
import { getWorkspaceContext, getWorkspaceScope } from '../../utils/workspaceContext.util.js';

// Lazy import to avoid circular dependency
let clearVerifiedDomainsCache = null;
let clearDomainResolverCache = null;

async function getClearCacheFn(options = {}) {
  if (!clearVerifiedDomainsCache) {
    const corsModule = await import('../../middleware/dynamicCors.middleware.js');
    clearVerifiedDomainsCache = corsModule.clearVerifiedDomainsCache;
  }
  if (!clearDomainResolverCache) {
    const resolverModule = await import('../../middleware/domainResolver.js');
    clearDomainResolverCache = resolverModule.clearDomainResolverCache;
  }

  if (typeof clearVerifiedDomainsCache === 'function') {
    clearVerifiedDomainsCache();
  }
  if (typeof clearDomainResolverCache === 'function') {
    clearDomainResolverCache();
  }

  if (options.hostname || options.slug) {
    cloudflareService.purgeLandingCache(options).catch((e) =>
      console.warn('[LandingPageDomain.getClearCacheFn] Cloudflare purge failed:', e.message)
    );
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

/**
 * Bản ghi DNS khách cần thêm để tên miền trỏ về hệ thống: tên miền chính (apex) → A tới IP cố định; subdomain →
 * CNAME tới `cnameTarget()`. Cùng dạng `{ type, host, value, ttl }` với `dnsRecords` của buildDomainResponse.
 * Apex mà hệ thống chưa cấu hình IP cố định thì không có bản ghi nào để hướng dẫn (trả mảng rỗng, câu giải thích
 * nằm ở buildDnsVerificationErrorMessage).
 *
 * @param {string} hostname
 * @param {boolean} isApex
 * @returns {Array<{ type: string, host: string, value: string, ttl: number }>}
 */
function buildExpectedDnsRecords(hostname, isApex) {
  if (isApex) {
    const platformIp = apexFixedIp();
    return platformIp ? [{ type: 'A', host: '@', value: platformIp, ttl: 3600 }] : [];
  }
  return [{
    type: 'CNAME',
    host: String(hostname || '').split('.')[0] || 'lp',
    value: cnameTarget(),
    ttl: 3600,
  }];
}

/**
 * Kết quả "xem trước DNS" — dùng cho checkHostname (200) và làm `data` của lỗi 422 do setHostname ném khi DNS chưa đúng.
 *
 * @param {{ verified?: boolean, reason?: string, found?: string[], currentIp?: string|null }} dnsStatus
 * @param {string} hostname
 * @param {boolean} isApex
 */
function buildDnsCheckResult(dnsStatus, hostname, isApex) {
  const target = cnameTarget();
  const verified = Boolean(dnsStatus?.verified);
  return {
    hostname,
    isApexDomain: isApex,
    verified,
    reason: dnsStatus?.reason || 'transient',
    found: Array.isArray(dnsStatus?.found) ? dnsStatus.found : [],
    currentIp: dnsStatus?.currentIp || null,
    dnsRecords: buildExpectedDnsRecords(hostname, isApex),
    cnameTarget: target,
    apexFixedIp: apexFixedIp(),
    message: verified
      ? `DNS của ${hostname} đã trỏ đúng về hệ thống.`
      : buildDnsVerificationErrorMessage(dnsStatus, hostname, target),
  };
}

function subdomainBase() {
  return String(process.env.LP_SUBDOMAIN_BASE || 'founderai.biz').trim();
}

function buildAutoHostname(slug) {
  return `${slug}.${subdomainBase()}`;
}

/**
 * Build response object for getForLanding.
 * Custom domains use Certbot. Platform subdomains use Cloudflare Universal SSL.
 */
function buildDomainResponse(row) {
  if (!row) {
    return { configured: false, instructions: null, record: null, dnsRecords: [] };
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
    if (isCfManaged) {
      instructions = `Subdomain ${row.hostname} đang chờ hệ thống cấp DNS qua Cloudflare. Vui lòng bấm «Thử lại» hoặc liên hệ admin nếu lỗi tiếp diễn.`;
      record = null;
    } else if (isApex && platformIp) {
      // Apex domain with Certbot
      instructions = `Thêm bản ghi A tại DNS của bạn:\n- Type: A\n- Name: @\n- Value: ${platformIp}\nSau đó bấm «Kiểm tra lại» để xác minh. SSL sẽ được cấp tự động qua Let's Encrypt.`;
      record = { type: 'A', name: '@', value: platformIp };
    } else {
      // Subdomain with manual CNAME
      instructions = `Thêm bản ghi CNAME tại DNS của bạn:\n- Type: CNAME\n- Name: phần trước dấu chấm (ví dụ "www" hoặc "lp")\n- Value: ${target}\nSau đó bấm «Kiểm tra lại» để xác minh. SSL sẽ được cấp tự động qua Let's Encrypt.`;
      record = { type: 'CNAME', name: row.hostname, value: target };
    }
  }

  // Build dnsRecords array — frontend dùng để hiển thị bảng DNS instructions.
  // Apex → A record trỏ về platformIp. Subdomain → CNAME trỏ về cnameTarget.
  const dnsRecords = [];
  if (isCfManaged) {
    // Platform subdomain do Cloudflare quản lý → user không cần tự thêm DNS.
  } else if (isApex && platformIp) {
    dnsRecords.push({ type: 'A', host: '@', value: platformIp, ttl: 3600 });
  } else {
    dnsRecords.push({
      type: 'CNAME',
      host: row.hostname?.split('.')[0] || 'lp',
      value: `${target}.`,
      ttl: 3600,
      note: 'Trỏ về domain chính',
    });
  }

  return {
    configured: true,
    hostname: row.hostname,
    status: row.status,
    cfManaged: isCfManaged,
    cfHostnameId: row.cfHostnameId || null,
    canRetryAutoProvision: isCfManaged && !row.cfHostnameId && row.status !== 'active',
    verifiedAt: row.verifiedAt,
    instructions,
    record,
    dnsRecords,
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
  async persistPendingAutoProvision(landingPageId, hostname, message) {
    const token = crypto.randomBytes(18).toString('hex');
    try {
      await landingPageDomainRepository.upsertForLanding({
        landingPageId,
        hostname,
        verificationToken: token,
        status: 'pending_verification',
        cfManaged: true,
        cfZoneId: null,
        cfRecordId: null,
        cfHostnameId: null,
        isApexDomain: false,
      });
      await getClearCacheFn({ hostname });
    } catch (e) {
      console.warn(`[LandingPageDomainService] DB upsert pending failed for ${hostname}: ${e.message}`);
      return {
        hostname,
        cfManaged: true,
        ok: false,
        message: `${message}. Không lưu được trạng thái pending: ${e.message}`,
      };
    }

    return { hostname, cfManaged: true, ok: false, message };
  }

  /**
   * @param {number} landingPageId
   * @param {string} hostname
   * @param {{ persistPendingOnFailure?: boolean }} [options] `persistPendingOnFailure` mặc định true: cấp không được
   *   thì ghi hàng `pending_verification` (trang MỚI tạo — thử lại bằng nút «Thử lại»). Đặt false khi trang đang có
   *   hàng khác phải giữ nguyên nếu cấp thất bại (gỡ tên miền riêng, xem remove()): upsert theo landing_page_id sẽ
   *   thay luôn hàng tên miền riêng bằng hàng pending, và khách mất tên miền đang chạy.
   */
  async provisionCloudflareSubdomain(landingPageId, hostname, options = {}) {
    const persistPendingOnFailure = options.persistPendingOnFailure !== false;
    const onFailure = (message) => (persistPendingOnFailure
      ? this.persistPendingAutoProvision(landingPageId, hostname, message)
      : { hostname, cfManaged: true, ok: false, message });

    if (!cloudflareService.isConfigured()) {
      const message = 'Cloudflare API chưa được cấu hình trên backend (thiếu CLOUDFLARE_API_TOKEN)';
      console.log(`[LandingPageDomainService] CF not configured, skipping auto-provision for ${hostname}`);
      return onFailure(message);
    }

    const cfResult = await cloudflareService.setupLandingPageDNS(hostname, cnameTarget());
    if (!cfResult.success) {
      const message = cfResult.message || 'Cloudflare API không tạo được DNS record';
      console.warn(`[LandingPageDomainService] CF auto-provision failed for ${hostname}: ${message}`);
      return onFailure(message);
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
        cfHostnameId: null,
        isApexDomain: false,
      });
      // Clear CORS cache so auto-provisioned subdomain is immediately allowed + purge Cloudflare
      await getClearCacheFn({ hostname });
      console.log(`[LandingPageDomainService] Auto-provisioned ${hostname} → CF zone=${cfResult.zoneId}`);

      return {
        hostname,
        cfManaged: true,
        ok: true,
        message: cfResult.message || 'Đã cấp subdomain qua Cloudflare',
      };
    } catch (e) {
      console.warn(`[LandingPageDomainService] DB upsert failed for ${hostname}: ${e.message}`);
      return {
        hostname,
        cfManaged: true,
        ok: false,
        message: `Cloudflare đã tạo DNS nhưng không lưu được domain vào DB: ${e.message}`,
      };
    }
  }

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
    if (!row) return null;
    if (row.landingSlug) {
      return String(row.landingSlug).trim().toLowerCase();
    }
    return null;
  }

  /**
   * Public: resolve hostname → landingPageId (dùng cho landing không có slug
   * nhưng vẫn được phục vụ qua custom hostname).
   *
   * @param {string} hostname
   * @returns {Promise<{ id: number, slug: string|null }|null>}
   */
  async getPublishedLandingIdForHost(hostname) {
    const h = String(hostname || '').trim().toLowerCase();
    if (!h) return null;
    if (h === 'founderai.biz' || h === 'www.founderai.biz') return null;
    const row = await landingPageDomainRepository.findActiveByHostname(h);
    if (!row) return null;
    const id = row.landingPageId ? Number.parseInt(row.landingPageId, 10) : null;
    if (!Number.isFinite(id)) return null;
    return { id, slug: row.landingSlug ? String(row.landingSlug).trim().toLowerCase() : null };
  }

  /**
   * @param {number} landingPageId
   * @param {object} authUser
   */
  async getForLanding(landingPageId, authUser) {
    const lp = await landingPageRepository.findByIdInScope(
      landingPageId,
      getWorkspaceScope(authUser)
    );
    if (!lp) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const row = await landingPageDomainRepository.findByLandingPageId(landingPageId);
    return buildDomainResponse(row);
  }

  /**
   * Điều kiện chung để một landing kết nối tên miền riêng — setHostname (ghi) và checkHostname (xem trước, không ghi)
   * dùng CHUNG nên "Kiểm tra" báo trước đúng những gì "Kết nối" sẽ từ chối (trang chưa xuất bản, hết hạn mức,
   * hostname đã gắn trang khác) thay vì để khách cài DNS xong mới bị chặn.
   *
   * @returns {Promise<{ h: string, lp: object, scope: object, resourceOwnerId: number, existing: object|null }>}
   */
  async _prepareConnect(landingPageId, hostname, authUser) {
    const context = getWorkspaceContext(authUser);
    const scope = getWorkspaceScope(authUser);
    const h = assertValidHostname(hostname);
    const lp = await landingPageRepository.findByIdInScope(landingPageId, scope);
    if (!lp) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    if (!lp.isPublished) {
      const err = new Error('Landing cần được công bố trước khi gắn tên miền. Bật Xuất bản và bấm Lưu trang trước.');
      err.statusCode = 400;
      throw err;
    }
    const resourceOwnerId = context.isSuperAdmin
      ? Number(lp.workspaceOwnerId || lp.idUser)
      : context.workspaceOwnerId;

    const existing = await landingPageDomainRepository.findByLandingPageId(landingPageId);
    const count = await landingPageDomainRepository.countPendingOrActiveInScope(scope);
    const limitCheck = await checkUserResourceLimit({
      userId: resourceOwnerId,
      roleCode: authUser?.role,
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

    return { h, lp, scope, resourceOwnerId, existing };
  }

  /**
   * Xem trước DNS cho một tên miền riêng — KHÔNG ghi gì (không đụng hàng landing_page_domains, domain_type,
   * Cloudflare). Trả `{ verified, dnsRecords, message, ... }`: bảng bản ghi khách cần thêm + DNS hiện tại đã đúng chưa.
   * Gọi bao nhiêu lần cũng được; giao diện dùng nó cho nút "Kiểm tra" trước khi "Kết nối tên miền".
   *
   * @param {number} landingPageId
   * @param {string} hostname
   * @param {boolean} isApexDomain tên miền chính (apex) hay subdomain — khách chọn
   * @param {object} authUser
   */
  async checkHostname(landingPageId, hostname, isApexDomain, authUser) {
    const { h } = await this._prepareConnect(landingPageId, hostname, authUser);
    const isApex = isApexDomain === true;
    const dnsStatus = await checkCnameStatus(h, cnameTarget(), isApex);
    return buildDnsCheckResult(dnsStatus, h, isApex);
  }

  /**
   * Gắn tên miền riêng cho landing page — CHỈ KHI DNS ĐÃ TRỎ ĐÚNG.
   *
   * Flow:
   * 1. Khách nhập hostname (subdomain hoặc apex) và cài bản ghi CNAME/A ở nhà cung cấp tên miền của họ.
   * 2. Backend kiểm DNS (checkCnameStatus) TRƯỚC khi ghi bất cứ thứ gì.
   * 3. DNS chưa đúng → ném lỗi 422 (`error.data` = bảng bản ghi cần thêm + lý do). KHÔNG ghi gì, KHÔNG đụng
   *    subdomain miễn phí: link miễn phí vẫn chạy cho tới khi tên miền riêng kết nối xong. (Trước đây hàm này xoá
   *    subdomain miễn phí NGAY rồi ghi hàng `pending_verification` — khách không cài DNS thì trang mất link vô thời hạn.)
   * 4. DNS đúng → upsert hàng tên miền riêng `active` thay luôn hàng miễn phí (một câu lệnh, theo landing_page_id —
   *    không có cửa sổ "mất cả hai"), đặt domain_type='custom', dọn bản ghi DNS Cloudflare của subdomain cũ, kích
   *    hoạt SSL (cron trên host lo, xem provisionSsl).
   *
   * Không còn cờ ghi `pending_verification`: không client nào cần (giao diện duy nhất gọi hàm này là modal Cài đặt
   * trang, và nó kiểm trước bằng checkHostname). Hàng `pending_verification` cũ vẫn do verifyDns / scheduler xử lý.
   *
   * @param {number} landingPageId
   * @param {string} hostname
   * @param {boolean} isApexDomain - user-chosen apex vs subdomain flag
   * @param {object} authUser
   */
  async setHostname(landingPageId, hostname, isApexDomain, authUser) {
    const { h, lp, scope, resourceOwnerId, existing } = await this._prepareConnect(
      landingPageId,
      hostname,
      authUser
    );

    const isApex = isApexDomain === true;
    const target = cnameTarget();

    // Verify DNS: kiểm tra CNAME/A record đã được thêm chưa
    // (Customer tự thêm CNAME/A record ở DNS provider của họ, ta chỉ verify)
    const dnsStatus = await checkCnameStatus(h, target, isApex);
    if (!dnsStatus.verified) {
      const err = new Error(buildDnsVerificationErrorMessage(dnsStatus, h, target));
      err.statusCode = 422;
      err.data = buildDnsCheckResult(dnsStatus, h, isApex);
      throw err;
    }

    const token = crypto.randomBytes(18).toString('hex');
    try {
      await landingPageDomainRepository.upsertForLanding({
        landingPageId,
        hostname: h,
        verificationToken: token,
        status: 'active',
        cfManaged: false,
        cfZoneId: null,
        cfRecordId: null,
        cfHostnameId: null,
        isApexDomain: isApex,
      });
    } catch (e) {
      if (e?.code === '23505') {
        const err = new Error('Hostname đã tồn tại trên hệ thống');
        err.statusCode = 409;
        throw err;
      }
      throw e;
    }

    // Hàng miễn phí cũ đã bị upsert thay thế; chỉ còn dọn bản ghi DNS của nó trên Cloudflare (lỗi CF không làm
    // hỏng việc kết nối — bản ghi mồ côi vô hại hơn một tên miền khách đã cài DNS xong mà không chạy).
    if (existing?.cfManaged && existing.cfZoneId && existing.cfRecordId) {
      try {
        const cfResult = await cloudflareService.deleteDnsRecord(existing.cfZoneId, existing.cfRecordId);
        if (!cfResult?.success) {
          console.warn(`[LandingPageDomainService.setHostname] CF cleanup failed for ${existing.hostname}: ${cfResult?.message}`);
        }
      } catch (e) {
        console.warn(`[LandingPageDomainService.setHostname] CF cleanup failed for ${existing.hostname}: ${e.message}`);
      }
    }

    await getClearCacheFn({
      hostname: h,
      hostnames: [existing?.hostname, h].filter(Boolean),
      slug: lp?.slug,
    });

    // Đồng bộ landing_pages.domain_type = custom để query nhanh.
    try {
      await landingPageRepository.updateByIdInScope(landingPageId, {
        slug: lp.slug,
        title: lp.title,
        htmlContent: lp.htmlContent,
        isPublished: lp.isPublished,
        idUser: resourceOwnerId,
        domainType: 'custom',
        domainSubtype: isApex ? 'apex' : 'subdomain',
      }, scope);
    } catch (e) {
      console.error(`[LandingPageDomainService.setHostname] update domain_type failed: ${e.message}`);
    }

    // DNS đã đúng → kích hoạt SSL qua Certbot
    this.provisionSsl(h).catch((err) => {
      console.error(`[LandingPageDomainService] SSL provisioning failed for ${h}:`, err.message);
    });

    return this.getForLanding(landingPageId, authUser);
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
    const scope = getWorkspaceScope(authUser);
    const row = await landingPageDomainRepository.findByLandingPageIdInScope(landingPageId, scope);
    if (!row) {
      const err = new Error('Chưa cấu hình tên miền cho landing này');
      err.statusCode = 404;
      throw err;
    }

    if (row.status === 'active') {
      if (!row.cfManaged) {
        this.provisionSsl(row.hostname).catch((err) => {
          console.error(`[LandingPageDomainService] SSL provisioning failed for ${row.hostname}:`, err.message);
        });
      }
      return buildDomainResponse(row);
    }

    if (row.cfManaged && !row.cfHostnameId) {
      const result = await this.provisionCloudflareSubdomain(row.landingPageId, row.hostname);
      if (!result.ok) {
        const err = new Error(result.message || 'Chưa cấp được subdomain qua Cloudflare');
        err.statusCode = 400;
        throw err;
      }
      return this.getForLanding(landingPageId, authUser);
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
    await getClearCacheFn({ hostname: row.hostname });

    // Trigger SSL provisioning via Certbot

    this.provisionSsl(row.hostname).catch((err) => {
      console.error(`[LandingPageDomainService] SSL provisioning failed for ${row.hostname}:`, err.message);
    });

    return this.getForLanding(landingPageId, authUser);
  }

  /**
   * Hostname đã chuẩn hoá nếu an toàn để làm đối số dòng lệnh cho script cấp SSL, ngược lại null.
   * Cùng cú pháp với assertValidHostname nhưng KHÔNG xét danh sách chặn: domain đã active vẫn phải
   * gia hạn được. Kiểm lại ngay trước khi spawn vì hostname ở đây còn đến từ DB (cron gia hạn),
   * không chỉ từ request đã qua assertValidHostname.
   * @param {unknown} hostname
   * @returns {string|null}
   */
  _scriptSafeHostname(hostname) {
    const h = String(hostname ?? '').trim().toLowerCase();
    if (!h || h.length > 253) return null;
    if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) return null;
    return h;
  }

  /**
   * Trigger SSL certificate provisioning for a domain.
   * Script chạy KHÔNG qua shell: hostname chỉ là một phần tử argv, không bao giờ được shell diễn giải.
   * @param {string} hostname
   */
  async provisionSsl(hostname) {
    const scriptPath = String(process.env.SSL_PROVISION_SCRIPT || '').trim();
    if (!scriptPath) {
      console.log(`[LandingPageDomainService] SSL provision skipped: SSL_PROVISION_SCRIPT not set`);
      return;
    }

    const safeHostname = this._scriptSafeHostname(hostname);
    if (!safeHostname) {
      const err = new Error('Hostname không hợp lệ — không chạy script cấp SSL');
      err.statusCode = 400;
      throw err;
    }

    // SSL_PROVISION_SCRIPT do vận hành đặt. Vẫn nhận dạng "lệnh + tham số" (vd. "sudo /opt/x.sh")
    // bằng cách tách theo khoảng trắng như shell từng làm, nhưng không còn shell nào ở giữa.
    const [command, ...scriptArgs] = scriptPath.split(/\s+/);

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      let proc;
      try {
        proc = spawn(command, [...scriptArgs, safeHostname], {
          shell: false,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } catch (err) {
        console.error(`[LandingPageDomainService] SSL provision could not start for ${safeHostname}: ${err.message}`);
        done();
        return;
      }

      let stderr = '';
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      // Không có shell thì script thiếu/không chạy được sẽ phát 'error' (ENOENT/EACCES) — phải
      // nghe, nếu không EventEmitter ném lỗi và làm sập tiến trình.
      proc.on('error', (err) => {
        console.error(`[LandingPageDomainService] SSL provision could not start for ${safeHostname}: ${err.message}`);
        done();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`[LandingPageDomainService] SSL provisioned for ${safeHostname}`);
        } else {
          console.error(`[LandingPageDomainService] SSL provision failed for ${safeHostname}: ${stderr}`);
        }
        done();
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
      return { total: 0, attempted: 0, skipped: 0, failed: 0 };
    }

    try {
      const domains = await landingPageDomainRepository.findAllActive();

      if (!domains || domains.length === 0) {
        console.log(`[LandingPageDomainService] No active domains found for SSL provisioning`);
        return { total: 0, attempted: 0, skipped: 0, failed: 0 };
      }

      console.log(`[LandingPageDomainService] Found ${domains.length} active domain(s), checking SSL status...`);

      let attempted = 0;
      let skipped = 0;
      let failed = 0;
      for (const domain of domains) {
        // Cloudflare-managed platform subdomains use Universal SSL, not Certbot/Let's Encrypt.
        if (domain.cfManaged && !domain.cfHostnameId) {
          skipped += 1;
          continue;
        }

        attempted += 1;
        try {
          // Script tự check expiry (openssl x509 -checkend) và chỉ renew khi
          // cert còn < 30 ngày hoặc chưa tồn tại — an toàn để gọi mỗi ngày.
          await this.provisionSsl(domain.hostname);
        } catch (err) {
          failed += 1;
          console.error(`[LandingPageDomainService] SSL provisioning failed for ${domain.hostname}:`, err.message);
        }
      }
      return { total: domains.length, attempted, skipped, failed };
    } catch (err) {
      console.error(`[LandingPageDomainService] Failed to get active domains for SSL provisioning:`, err.message);
      return { total: 0, attempted: 0, skipped: 0, failed: 0, error: err.message };
    }
  }

  /**
   * Gỡ tên miền riêng và TRẢ trang về link miễn phí `<slug>.founderai.biz`.
   * DNS của tên miền riêng do khách quản lý (không phải hệ thống) nên không có gì để dọn ở phía DNS.
   *
   * Thứ tự an toàn (giống update() custom → system): cấp subdomain miễn phí TRƯỚC. upsertForLanding là
   * ON CONFLICT (landing_page_id) nên hàng miễn phí THAY hàng tên miền riêng trong một câu lệnh — không có cửa sổ
   * "mất cả hai". Cấp thất bại thì giữ nguyên tên miền riêng (`persistPendingOnFailure:false`, nếu không hàng
   * pending sẽ ghi đè hàng tên miền đang chạy) và báo lỗi, khách thử lại sau.
   *
   * - Trang không có slug: không có link miễn phí để quay về → lỗi 400, KHÔNG xoá gì.
   * - Trang đang dùng link miễn phí (không có tên miền riêng): 400 — hàng đó là link miễn phí, không phải tên miền
   *   riêng. Ngoại lệ: domain_type còn 'custom' (lần gỡ trước dừng giữa chừng, hàng đã thành miễn phí) thì chỉ sửa nốt
   *   domain_type — gỡ chạy lại được.
   *
   * @param {number} landingPageId
   * @param {object} authUser
   */
  async remove(landingPageId, authUser) {
    const context = getWorkspaceContext(authUser);
    const scope = getWorkspaceScope(authUser);
    const landingPage = await landingPageRepository.findByIdInScope(landingPageId, scope);
    if (!landingPage) {
      const err = new Error('Không tìm thấy landing page');
      err.statusCode = 404;
      throw err;
    }
    const resourceOwnerId = context.isSuperAdmin
      ? Number(landingPage.workspaceOwnerId || landingPage.idUser)
      : context.workspaceOwnerId;
    const row = await landingPageDomainRepository.findByLandingPageIdInScope(landingPageId, scope);
    if (!row) {
      const err = new Error('Chưa cấu hình tên miền');
      err.statusCode = 404;
      throw err;
    }

    const setDomainTypeSystem = () => landingPageRepository.updateByIdInScope(landingPageId, {
      slug: landingPage.slug,
      title: landingPage.title,
      htmlContent: landingPage.htmlContent,
      isPublished: landingPage.isPublished,
      idUser: resourceOwnerId,
      domainType: 'system',
      domainSubtype: null,
    }, scope);

    if (row.cfManaged) {
      if (landingPage.domainType === 'custom') {
        await setDomainTypeSystem();
        return { ok: true, ...buildDomainResponse(row) };
      }
      const err = new Error('Trang đang dùng link miễn phí, không có tên miền riêng để gỡ.');
      err.statusCode = 400;
      throw err;
    }

    const slug = String(landingPage.slug || '').trim().toLowerCase();
    if (!slug) {
      const err = new Error(
        'Trang cần đường dẫn (slug) trước khi gỡ tên miền riêng — để có link miễn phí thay thế. Đặt slug rồi lưu trang, sau đó gỡ lại.'
      );
      err.statusCode = 400;
      throw err;
    }

    const provision = await this.autoProvisionSubdomain(landingPageId, slug, { persistPendingOnFailure: false });
    if (!provision.ok) {
      const err = new Error(
        `Chưa cấp được link miễn phí ${provision.hostname} nên tên miền riêng được giữ nguyên. ${provision.message || ''}`.trim()
      );
      err.statusCode = 502;
      throw err;
    }

    // Hàng miễn phí đã thay hàng tên miền riêng. Lỗi từ đây trở xuống KHÔNG được nuốt: nuốt thì trang để lại hàng
    // miễn phí + domain_type='custom' (lệch) mà người dùng tưởng đã gỡ xong; ném lỗi thì gỡ lại là chạy tiếp (nhánh
    // cfManaged phía trên sửa nốt domain_type).
    await getClearCacheFn({ hostname: row.hostname, slug: landingPage.slug });
    await setDomainTypeSystem();

    const freeRow = await landingPageDomainRepository.findByLandingPageId(landingPageId);
    return { ok: true, ...buildDomainResponse(freeRow) };
  }

  /**
   * Tự động cấp subdomain `slug.founderai.biz` khi tạo landing page.
   * Gọi sau khi landing page đã được insert vào DB.
   * Lỗi CF không làm fail toàn bộ — chỉ log warning.
   *
   * @param {number} landingPageId
   * @param {string} slug
   * @param {{ persistPendingOnFailure?: boolean }} [options] xem provisionCloudflareSubdomain
   * @returns {Promise<{hostname:string, cfManaged:boolean, ok:boolean, message?:string}>}
   */
  async autoProvisionSubdomain(landingPageId, slug, options = {}) {
    const hostname = buildAutoHostname(slug);
    return this.provisionCloudflareSubdomain(landingPageId, hostname, options);
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
    // Clear CORS & L1 cache so removed subdomain is no longer allowed and purged
    await getClearCacheFn({ hostname: row.hostname });
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
          await getClearCacheFn({ hostname: domain.hostname });
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
