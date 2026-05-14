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
   * GET /api/public/lp
   * Get landing page for custom domain (resolved from Host header by middleware).
   * The landingPage is attached to req by domainResolver middleware.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getByDomain(req, res) {
    try {
      // If domain was resolved, req.landingPage contains the data
      if (req.landingPage) {
        const data = await landingPagePublicService.getPublishedPayloadById(req.landingPage.id);
        if (!data) {
          return res.status(404).json({
            success: false,
            message: 'Landing page not found or not published',
          });
        }

        // Return as HTML document (not JSON) for direct serving
        const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title)}</title>
  <meta name="description" content="Landing page">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  ${data.htmlContent}
</body>
</html>`;

        return res.type('html').send(html);
      }

      // No custom domain match - return 404
      return res.status(404).json({
        success: false,
        message: 'Landing page not found',
      });
    } catch (error) {
      console.error('[LandingPagePublicController.getByDomain]', error);
      return res.status(500).json({
        success: false,
        message: 'Cannot load landing page',
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

/**
 * Escape HTML special characters for safe embedding.
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default new LandingPagePublicController();
