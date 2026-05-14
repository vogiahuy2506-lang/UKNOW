import crypto from 'crypto';
import dns from 'dns/promises';
import landingPageDomainRepository from '../../repositories/landingPageDomain.repository.js';
import landingPageRepository from '../../repositories/landingPage.repository.js';
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

/**
 * Custom domain cho landing (TXT verify, quota = max_landing_pages).
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
    if (!row) {
      return {
        configured: false,
        instructions: null,
        record: null,
      };
    }
    const token = row.verificationToken;
    const challenge = txtChallengeName(row.hostname);
    return {
      configured: true,
      hostname: row.hostname,
      status: row.status,
      verifiedAt: row.verifiedAt,
      instructions:
        row.status === 'active'
          ? `Đã kích hoạt. Trỏ DNS (CNAME) www về host frontend của nền tảng theo hướng dẫn vận hành; apex nên redirect 301 → www.`
          : `Thêm bản ghi TXT tại DNS của bạn:\n- Tên (host): ${challenge}\n- Giá trị: ${expectedTxtContent(token)}\nSau đó bấm «Xác minh DNS».`,
      record:
        row.status === 'pending_verification'
          ? {
              type: 'TXT',
              name: challenge,
              value: expectedTxtContent(token),
            }
          : null,
    };
  }

  /**
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
    try {
      await landingPageDomainRepository.upsertForLanding({
        landingPageId,
        hostname: h,
        verificationToken: token,
        status: 'pending_verification',
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
    await landingPageDomainRepository.deleteByLandingPageId(landingPageId);
    return { ok: true };
  }
}

export default new LandingPageDomainService();
