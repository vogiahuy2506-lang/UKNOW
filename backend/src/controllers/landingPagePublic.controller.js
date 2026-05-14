import landingPagePublicService from '../services/landingPage/landingPagePublic.service.js';

/**
 * API công khai — HTML landing đã publish, analytics, redirect click.
 */
class LandingPagePublicController {
  /**
   * GET /api/public/landing-pages/:slug
   *
   * Mục đích: trả JSON `title`, `htmlContent` cho SPA render iframe (chỉ bản ghi đã publish).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getPublished(req, res) {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const data = await landingPagePublicService.getPublishedPayload(slug);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy landing page hoặc chưa được công bố',
        });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[LandingPagePublicController.getPublished]', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải landing page',
      });
    }
  }

  /**
   * GET /api/public/landing-pages-by-host?host=www.example.com
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getPublishedByHost(req, res) {
    try {
      const host = String(req.query.host || '').trim().toLowerCase();
      if (!host) {
        return res.status(400).json({ success: false, message: 'Thiếu tham số host' });
      }
      const data = await landingPagePublicService.getPublishedPayloadByHost(host);
      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy landing cho hostname này hoặc chưa xác minh DNS',
        });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error('[LandingPagePublicController.getPublishedByHost]', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải landing page',
      });
    }
  }

  /**
   * POST /api/public/landing-analytics/view
   *
   * Body: slug (bắt buộc), visitorId?, referrer?, utmSource?, utmMedium?, utmCampaign?, utmContent?, utmTerm?
   * Ghi event `view` (slug `l` = /l không cần bản ghi DB).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async postView(req, res) {
    try {
      await landingPagePublicService.recordView(req.body || {}, req);
      return res.status(201).json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPagePublicController.postView]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không ghi nhận view',
      });
    }
  }

  /**
   * GET /api/public/landing-track/go
   *
   * Query: slug (bắt buộc), u hoặc url = URL đích (encode), utm_* tùy chọn.
   * Ghi `click` rồi 302 sang đích (URL đích phải là http/https hợp lệ; không giới hạn host).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getTrackGo(req, res) {
    try {
      const finalUrl = await landingPagePublicService.buildRedirectUrlForClick(req.query || {}, req);
      return res.redirect(302, finalUrl);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPagePublicController.getTrackGo]', error);
      const message = error.message || 'Không thể chuyển hướng';
      return res.status(status).json({ success: false, message });
    }
  }
}

export default new LandingPagePublicController();
