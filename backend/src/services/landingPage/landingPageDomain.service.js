import crypto from 'crypto';
import dns from 'dns/promises';
import landingPageDomainRepository from '../../repositories/landingPageDomain.repository.js';
import landingPageRepository from '../../repositories/landingPage.repository.js';
import cloudflareService from '../cloudflare.service.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';
import { resolveFrontendOriginFromEnv } from '../../utils/landingHtmlInjection.util.js';

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
  const set = new Set(['localhost', '127.0.0.1']);
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

function assertValidWwwHostname(hostname) {
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
  if (!h.startsWith('www.')) {
    const err = new Error('Chỉ hỗ trợ hostname dạng www.ví-dụ.com (apex domain.com redirect về www — cấu hình DNS/nginx).');
    err.statusCode = 400;
    throw err;
  }
  if (!WWW_HOST_RE.test(h)) {
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

function txtChallengeName(hostname) {
  return `_uknow-verify.${hostname}`;
}

function expectedTxtContent(token) {
  return `uknow-verify=${token}`;
}

function cnameTarget() {
  return String(process.env.LP_CNAME_TARGET || 'lp.uknow.vn').trim();
}

function subdomainBase() {
  return String(process.env.LP_SUBDOMAIN_BASE || process.env.LP_CNAME_TARGET || 'lp.uknow.vn').trim();
}

function buildAutoHostname(slug) {
  return `${slug}.${subdomainBase()}`;
}

/**
 * Build response object for getForLanding.
 * CF-managed domains skip TXT verification — already active on creation.
 */
function buildDomainResponse(row) {
  if (!row) {
    return { configured: false, instructions: null, record: null };
  }

  const token = row.verificationToken;
  const challenge = txtChallengeName(row.hostname);
  const isActive = row.status === 'active';
  const isCfManaged = Boolean(row.cfManaged);

  let instructions;
  let record = null;

  if (isActive) {
    instructions = isCfManaged
      ? `Đã kích hoạt tự động qua Cloudflare. CNAME đã được tạo trỏ về ${cnameTarget()}. SSL được Cloudflare tự cấp trong vài phút.`
      : `Đã kích hoạt. Trỏ DNS (CNAME) www về ${cnameTarget()} theo hướng dẫn vận hành; apex nên redirect 301 → www.`;
  } else {
    instructions = `Thêm bản ghi TXT tại DNS của bạn:\n- Tên (host): ${challenge}\n- Giá trị: ${expectedTxtContent(token)}\nSau đó bấm «Xác minh DNS».`;
    record = {
      type: 'TXT',
      name: challenge,
      value: expectedTxtContent(token),
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
    cnameTarget: cnameTarget(),
  };
}

/**
 * Custom domain cho landing — hỗ trợ 2 chế độ:
 *
 * Mode 1 (Cloudflare tự động): nếu CLOUDFLARE_API_TOKEN được cấu hình VÀ
 * base domain của hostname có trong tài khoản CF của platform →
 * backend tự tạo CNAME record, domain active ngay, không cần user verify DNS.
 *
 * Mode 2 (Manual TXT verify): nếu CF không cấu hình hoặc zone không tìm thấy →
 * user phải thêm TXT record rồi bấm «Xác minh DNS».
 */
class LandingPageDomainService {
  /**
   * Public: resolve hostname → slug (chỉ active + landing publish).
   */
  async getPublishedSlugForHost(hostname) {
    const h = String(hostname || '').trim().toLowerCase();
    if (!h) return null;
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
   * Ngược lại → pending_verification với hướng dẫn TXT record.
   *
   * @param {number} landingPageId
   * @param {string} hostname
   * @param {object} authUser
   */
  async setHostname(landingPageId, hostname, authUser) {
    const h = assertValidWwwHostname(hostname);
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
      console.log(`[LandingPageDomainService] CF zone not found for ${h}, falling back to manual TXT verify. Reason: ${cfResult.message}`);
    }

    // --- Mode 2: TXT verification thủ công ---
    try {
      await landingPageDomainRepository.upsertForLanding({
        landingPageId,
        hostname: h,
        verificationToken: token,
        status: 'pending_verification',
        cfManaged: false,
        cfZoneId: null,
        cfRecordId: null,
      });
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
   * Xác minh DNS bằng TXT record (chỉ dành cho Mode 2 — manual).
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

    const name = txtChallengeName(row.hostname);
    const want = expectedTxtContent(row.verificationToken);
    let records = [];
    try {
      records = await dns.resolveTxt(name);
    } catch {
      const err = new Error(
        `Chưa đọc được TXT tại ${name}. Kiểm tra DNS đã lưu và chờ propagate (có thể vài phút đến vài giờ).`
      );
      err.statusCode = 400;
      throw err;
    }
    const flat = records.map((arr) => arr.join(''));
    const ok = flat.some((t) => String(t).trim() === want);
    if (!ok) {
      const err = new Error(`Giá trị TXT chưa khớp. Cần đúng: ${want}`);
      err.statusCode = 400;
      throw err;
    }
    await landingPageDomainRepository.updateStatusById(row.id, 'active');
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
    return { ok: true };
  }

  /**
   * Tự động cấp subdomain `slug.lp.uknow.vn` khi tạo landing page.
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
  }
}

export default new LandingPageDomainService();
