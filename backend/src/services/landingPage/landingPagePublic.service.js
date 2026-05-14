import landingPageRepository from '../../repositories/landingPage.repository.js';
import landingPageEventRepository from '../../repositories/landingPageEvent.repository.js';
import { isValidPublicLandingRedirectUrl } from '../../utils/landingRedirectTarget.util.js';
import landingPageDomainService from './landingPageDomain.service.js';

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
   * Payload cho SPA render iframe (chỉ khi đã publish).
   *
   * @param {string} slug
   * @returns {Promise<{ title: string, htmlContent: string }|null>}
   */
  async getPublishedPayload(slug) {
    const row = await landingPageRepository.findPublishedBySlug(slug);
    if (!row) return null;
    /** HTML trong DB đã được chuẩn hóa khi admin Lưu (link tracking + lp-track.js; iframe form do admin dán). */
    const htmlContent = row.htmlContent || '';
    return {
      title: row.title || '',
      htmlContent,
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
    });
    return { ok: true };
  }

  /**
   * Redirect có log click; bổ sung UTM landing nếu URL đích chưa có.
   *
   * @param {object} query
   * @param {import('express').Request} req
   * @returns {Promise<string>} URL đích sau khi gắn UTM
   */
  async buildRedirectUrlForClick(query, req) {
    const slug = String(query.slug || '').trim().toLowerCase();
    const rawU = String(query.u || query.url || '').trim();
    if (!landingPageRepository.isValidSlug(slug)) {
      const err = new Error('Tham số slug không hợp lệ');
      err.statusCode = 400;
      throw err;
    }
    let dest;
    try {
      dest = decodeURIComponent(rawU);
    } catch {
      dest = rawU;
    }
    if (!dest || !isValidPublicLandingRedirectUrl(dest)) {
      const err = new Error('URL đích không được phép hoặc không hợp lệ');
      err.statusCode = 400;
      throw err;
    }

    if (slug !== 'l') {
      const published = await landingPageRepository.findPublishedBySlug(slug);
      if (!published) {
        const err = new Error('Landing page không tồn tại hoặc chưa được công bố');
        err.statusCode = 404;
        throw err;
      }
    }

    const u = new URL(dest);
    if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', 'landing_page');
    if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', slug);
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
    });

    return finalUrl;
  }
}

export default new LandingPagePublicService();
