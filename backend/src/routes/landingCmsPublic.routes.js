import express from 'express';
import db from '../config/database.js';
import landingPagePublicController from '../controllers/landingPagePublic.controller.js';
import {
  publicLandingAnalyticsLimiter,
} from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get('/landing-pages-by-host', (req, res) => landingPagePublicController.getPublishedByHost(req, res));

router.get('/landing-pages/:slug/form-config', (req, res) =>
  landingPagePublicController.getPublishedFormConfig(req, res)
);

router.get('/landing-pages/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { rows } = await db.query(
      `SELECT id, title, html_content as "htmlContent"
       FROM landing_pages
       WHERE slug = $1 AND is_published = true`,
      [slug]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy landing page' });
    }
    const { resourceIsLocked, pausedLandingHtml } = await import('../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', rows[0].id)) {
      return res.json({
        success: true,
        data: { title: rows[0].title || 'Trang tạm ngừng', htmlContent: pausedLandingHtml(rows[0].title) },
      });
    }
    return res.json({ success: true, data: { title: rows[0].title, htmlContent: rows[0].htmlContent } });
  } catch (error) {
    console.error('Get landing page error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.post('/landing-analytics/view', publicLandingAnalyticsLimiter, async (req, res) => {
  try {
    const { slug, visitorId, utmSource, utmCampaign, utmMedium } = req.body;

    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      return res.status(400).json({ success: false, message: 'Slug không hợp lệ' });
    }

    if (slug === 'l') {
      await db.query(
        `INSERT INTO landing_page_events (landing_page_slug, event_type, visitor_id, utm_source, utm_campaign, utm_medium)
         VALUES ($1, 'view', $2, $3, $4, $5)`,
        [slug, visitorId || null, utmSource || null, utmCampaign || null, utmMedium || null]
      );
      return res.status(201).json({ success: true });
    }

    const { rows } = await db.query(
      `SELECT id, COALESCE(workspace_owner_id, id_user) AS "workspaceOwnerId"
       FROM landing_pages
       WHERE slug = $1 AND is_published = true`,
      [slug]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy landing page' });
    }
    const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', rows[0].id)) {
      return res.status(503).json({ success: false, message: 'Landing page tạm ngừng', code: 'RESOURCE_LOCKED' });
    }

    await db.query(
      `INSERT INTO landing_page_events
         (landing_page_slug, event_type, visitor_id, utm_source, utm_campaign, utm_medium, id_user)
       VALUES ($1, 'view', $2, $3, $4, $5, $6)`,
      [
        slug,
        visitorId || null,
        utmSource || null,
        utmCampaign || null,
        utmMedium || null,
        rows[0].workspaceOwnerId,
      ]
    );
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Landing analytics view error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.post('/landing-analytics/click', publicLandingAnalyticsLimiter, async (req, res) => {
  try {
    const { slug, targetUrl, visitorId, utmSource, utmCampaign, utmMedium } = req.body || {};

    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      return res.status(400).json({ success: false, message: 'Slug không hợp lệ' });
    }

    const cleanTargetUrl = targetUrl ? String(targetUrl).slice(0, 2048) : null;

    if (slug === 'l') {
      await db.query(
        `INSERT INTO landing_page_events (landing_page_slug, event_type, visitor_id, utm_source, utm_campaign, utm_medium, target_url)
         VALUES ($1, 'click', $2, $3, $4, $5, $6)`,
        [slug, visitorId || null, utmSource || null, utmCampaign || null, utmMedium || null, cleanTargetUrl]
      );
      return res.status(201).json({ success: true });
    }

    const { rows } = await db.query(
      `SELECT id, COALESCE(workspace_owner_id, id_user) AS "workspaceOwnerId"
       FROM landing_pages
       WHERE slug = $1 AND is_published = true`,
      [slug]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy landing page' });
    }
    const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', rows[0].id)) {
      return res.status(503).json({ success: false, message: 'Landing page tạm ngừng', code: 'RESOURCE_LOCKED' });
    }

    await db.query(
      `INSERT INTO landing_page_events
         (landing_page_slug, event_type, visitor_id, utm_source, utm_campaign, utm_medium, target_url, id_user)
       VALUES ($1, 'click', $2, $3, $4, $5, $6, $7)`,
      [
        slug,
        visitorId || null,
        utmSource || null,
        utmCampaign || null,
        utmMedium || null,
        cleanTargetUrl,
        rows[0].workspaceOwnerId,
      ]
    );
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Landing analytics click error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

// Link tracking của landing: chỉ chuyển hướng tới link thuộc chính landing đó (chặn open redirect)
// — kiểm và ghi click ở landingPagePublic.service.buildRedirectUrlForClick.
router.get('/landing-track/go', (req, res) => landingPagePublicController.getTrackGo(req, res));

router.get('/landing-featured-courses', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title_vi as "titleVi", title_en as "titleEn", link_url as "linkUrl", sort_order as "sortOrder"
       FROM landing_featured_courses
       WHERE is_active = true
       ORDER BY sort_order ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get featured courses error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.get('/landing-testimonials', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name_vi as "nameVi", name_en as "nameEn", quote_vi as "quoteVi", quote_en as "quoteEn", star_rating as "starRating", sort_order as "sortOrder"
       FROM landing_testimonials
       WHERE is_active = true
       ORDER BY sort_order ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get testimonials error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
