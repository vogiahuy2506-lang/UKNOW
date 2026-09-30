import landingPageRepository from '../../repositories/landingPage.repository.js';
import landingPageEventRepository from '../../repositories/landingPageEvent.repository.js';
import {
  hostnameOf,
  isAllowedLandingRedirectTarget,
  isValidPublicLandingRedirectUrl,
} from '../../utils/landingRedirectTarget.util.js';
import { resolveFrontendOriginFromEnv } from '../../utils/landingHtmlInjection.util.js';
import { toPublicLeadFormConfig } from '../../utils/landingLeadFormConfig.util.js';
import landingPageDomainService from './landingPageDomain.service.js';

/** Tên miền gốc của subdomain landing (`<slug>.<base>`), cùng nguồn với landingPageDomain.service. */
function landingSubdomainBase() {
  return String(process.env.LP_SUBDOMAIN_BASE || 'founderai.biz').trim().toLowerCase();
}

/**
 * Giá trị tham số `u`/`url` (Express đã giải mã một lần). Link cũ lỡ mã hoá hai lần
 * (`https%3A%2F%2F...`) thì giải mã thêm đúng một lần.
 *
 * @param {unknown} raw
 * @returns {string}
 */
function readRedirectTargetParam(raw) {
  const value = String(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '').trim();
  if (!value || isValidPublicLandingRedirectUrl(value)) return value;
  try {
    const decoded = decodeURIComponent(value).trim();
    return isValidPublicLandingRedirectUrl(decoded) ? decoded : value;
  } catch {
    return value;
  }
}

/**
 * API công khai: HTML landing đã publish, analytics view, redirect click có ghi log.
 */
class LandingPagePublicService {
  /**
   * Payload theo hostname custom (www.*) đã verify — kèm slug để analytics.
   *
   * @param {string} hostname
   * @returns {Promise<{ title: string, htmlContent: string, slug: string }|null>}
   */
  async getPublishedPayloadByHost(hostname) {
    const slug = await landingPageDomainService.getPublishedSlugForHost(hostname);
    if (!slug) return null;
    const payload = await this.getPublishedPayload(slug);
    if (!payload) return null;
    return { ...payload, slug };
  }

  /**
   * Payload cho SPA render landing (chỉ khi đã publish).
   *
   * @param {string} slug
   * @returns {Promise<{ title: string, htmlContent: string }|null>}
   */
  async getPublishedPayload(slug) {
    const row = await landingPageRepository.findPublishedBySlug(slug);
    if (!row) return null;
    const { resourceIsLocked, pausedLandingHtml } = await import('../../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', row.id)) {
      return {
        id: row.id,
        slug: row.slug,
        title: row.title || 'Trang tạm ngừng',
        htmlContent: pausedLandingHtml(row.title),
        isLocked: true,
      };
    }
    /** HTML trong DB đã được chuẩn hóa khi admin Lưu (link tracking + lp-track.js + founderai-capture.js). */
    const htmlContent = row.htmlContent || '';
    return {
      id: row.id,
      slug: row.slug,
      title: row.title || '',
      htmlContent,
    };
  }

  /**
   * Get landing page payload by ID (for custom domain resolution).
   * Returns the full payload including ID for tracking.
   *
   * @param {number} landingPageId
   * @returns {Promise<{ id: number, title: string, slug: string, htmlContent: string }|null>}
   */
  async getPublishedPayloadById(landingPageId) {
    const row = await landingPageRepository.findById(landingPageId);
    if (!row || !row.isPublished) return null;

    const { resourceIsLocked, pausedLandingHtml } = await import('../../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', row.id)) {
      return {
        id: row.id,
        title: row.title || 'Trang tạm ngừng',
        slug: row.slug,
        htmlContent: pausedLandingHtml(row.title),
        isLocked: true,
      };
    }

    return {
      id: row.id,
      title: row.title || '',
      slug: row.slug,
      htmlContent: row.htmlContent || '',
    };
  }

  /**
   * Ghi view (gọi từ parent /lp khi mount).
   *
   * @param {object} body
   * @param {import('express').Request} req
   */
  async recordView(body, req) {
    const slug = String(body?.slug || '').trim().toLowerCase();
    let workspaceOwnerId = null;
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Slug không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    // Slug `l` = landing React cố định (/l), không có bản ghi `landing_pages`.
    if (slug !== 'l') {
      const published = await landingPageRepository.findPublishedBySlug(slug);
      if (!published) {
        const err = new Error('Landing page không tồn tại hoặc chưa được công bố');
        err.statusCode = 404;
        throw err;
      }
      const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
      if (await resourceIsLocked('landing_pages', published.id)) {
        const err = new Error('Landing page tạm ngừng');
        err.statusCode = 503;
        err.code = 'RESOURCE_LOCKED';
        throw err;
      }
      workspaceOwnerId = published.workspaceOwnerId || published.idUser || null;
    }
    await landingPageEventRepository.insert({
      eventType: 'view',
      landingPageSlug: slug,
      targetUrl: null,
      utmSource: body?.utmSource,
      utmMedium: body?.utmMedium,
      utmCampaign: body?.utmCampaign,
      utmContent: body?.utmContent,
      utmTerm: body?.utmTerm,
      visitorId: body?.visitorId,
      referrer: body?.referrer,
      userAgent: req.headers['user-agent'],
      idUser: workspaceOwnerId,
    });
    return { ok: true };
  }

  /**
   * Redirect có log click; bổ sung UTM landing nếu URL đích chưa có.
   *
   * Chỉ chuyển hướng tới đích thuộc chính landing (xem utils/landingRedirectTarget.util.js):
   *   - slug thường: landing phải đã publish; đích phải là một link có trong HTML đã lưu, hoặc nằm
   *     trên host của chính landing (`<slug>.<LP_SUBDOMAIN_BASE>`, tên miền riêng đã trỏ về landing)
   *     hoặc host frontend;
   *   - slug `l` (landing React cố định, không có HTML trong DB): chỉ host frontend.
   * Đích không thuộc landing → trả URL trang landing (không ghi click), KHÔNG chuyển hướng ra ngoài.
   *
   * @param {object} query
   * @param {import('express').Request} req
   * @returns {Promise<string>} URL đích sau khi gắn UTM, hoặc URL trang landing nếu đích bị chặn
   */
  async buildRedirectUrlForClick(query, req) {
    // Thiếu slug = landing cố định `l` (giữ hành vi route cũ).
    const slug = String(query.slug || '').trim().toLowerCase() || 'l';
    let workspaceOwnerId = null;
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Tham số slug không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    const dest = readRedirectTargetParam(query.u ?? query.url);
    if (!dest || !isValidPublicLandingRedirectUrl(dest)) {
      const err = new Error('URL đích không được phép hoặc không hợp lệ');
      err.statusCode = 400;
      throw err;
    }

    const frontendOrigin = resolveFrontendOriginFromEnv();
    const frontendHost = hostnameOf(frontendOrigin);
    let allowed = false;
    let landingUrl;

    if (slug !== 'l') {
      const published = await landingPageRepository.findPublishedBySlug(slug);
      if (!published) {
        const err = new Error('Landing page không tồn tại hoặc chưa được công bố');
        err.statusCode = 404;
        throw err;
      }
      const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
      if (await resourceIsLocked('landing_pages', published.id)) {
        const err = new Error('Landing page tạm ngừng');
        err.statusCode = 503;
        err.code = 'RESOURCE_LOCKED';
        throw err;
      }
      workspaceOwnerId = published.workspaceOwnerId || published.idUser || null;
      const ownSubdomain = `${slug}.${landingSubdomainBase()}`;
      landingUrl = `https://${ownSubdomain}/`;
      allowed = isAllowedLandingRedirectTarget(dest, {
        html: published.htmlContent,
        allowedHosts: [ownSubdomain, frontendHost],
      });
      if (!allowed) {
        // Tên miền riêng đã xác minh của chính landing này (tra DB chỉ khi cần).
        const targetHost = hostnameOf(dest);
        const hostSlug = targetHost
          ? await landingPageDomainService.getPublishedSlugForHost(targetHost).catch(() => null)
          : null;
        allowed = hostSlug === slug;
      }
    } else {
      landingUrl = `${frontendOrigin}/`;
      allowed = isAllowedLandingRedirectTarget(dest, { allowedHosts: [frontendHost] });
    }

    if (!allowed) {
      console.warn(`[LandingTrack] Đích không thuộc landing slug=${slug} — chuyển về trang landing`);
      return landingUrl;
    }

    const u = new URL(dest);
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'landing_page');
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', slug === 'l' ? 'fixed' : slug);
    if (query.utm_campaign && !u.searchParams.has('utm_campaign')) {
      u.searchParams.set('utm_campaign', String(query.utm_campaign));
    }
    if (query.utm_content && !u.searchParams.has('utm_content')) {
      u.searchParams.set('utm_content', String(query.utm_content));
    }
    if (query.utm_term && !u.searchParams.has('utm_term')) {
      u.searchParams.set('utm_term', String(query.utm_term));
    }
    const finalUrl = u.toString();

    await landingPageEventRepository.insert({
      eventType: 'click',
      landingPageSlug: slug,
      targetUrl: finalUrl,
      utmSource: query.utm_source || query.utmSource,
      utmMedium: query.utm_medium || query.utmMedium,
      utmCampaign: query.utm_campaign || query.utmCampaign,
      utmContent: query.utm_content || query.utmContent,
      utmTerm: query.utm_term || query.utmTerm,
      visitorId: query.visitor_id || query.visitorId,
      referrer: query.referrer,
      userAgent: req.headers['user-agent'],
      idUser: workspaceOwnerId,
    });

    return finalUrl;
  }

  /**
   * Lấy lead form config (DTO hẹp) cho landing đã publish. Trả `null` nếu chưa publish / không tồn tại.
   * Không lộ raw `custom_config` — chỉ trả cấu hình đã chuẩn hoá.
   *
   * @param {string} slug
   * @returns {Promise<{ leadFormConfig: object }|null>}
   */
  async getPublishedFormConfig(slug) {
    const row = await landingPageRepository.findPublishedBySlug(slug);
    if (!row) return null;
    return {
      leadFormConfig: toPublicLeadFormConfig(row.customConfig),
    };
  }
}

export default new LandingPagePublicService();
