import express from 'express';
import db from '../config/database.js';
import landingPagePublicController from '../controllers/landingPagePublic.controller.js';
import {
  publicLandingAnalyticsLimiter,
  publicLeadLimiter,
} from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get('/landing-pages-by-host', (req, res) => landingPagePublicController.getPublishedByHost(req, res));

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
      `SELECT id FROM landing_pages WHERE slug = $1 AND is_published = true`,
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
      `INSERT INTO landing_page_events (landing_page_slug, event_type, visitor_id, utm_source, utm_campaign, utm_medium)
       VALUES ($1, 'view', $2, $3, $4, $5)`,
      [slug, visitorId || null, utmSource || null, utmCampaign || null, utmMedium || null]
    );
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Landing analytics view error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

router.get('/landing-track/go', async (req, res) => {
  try {
    const { slug, u } = req.query;

    if (!u || typeof u !== 'string') {
      return res.status(400).json({ success: false, message: 'Thiếu URL đích' });
    }

    let targetUrl;
    try {
      targetUrl = new URL(u);
    } catch {
      return res.status(400).json({ success: false, message: 'URL không hợp lệ' });
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return res.status(400).json({ success: false, message: 'URL chỉ hỗ trợ http/https' });
    }

    const normalizedSlug = slug || 'l';

    if (normalizedSlug === 'l') {
      if (!targetUrl.searchParams.has('utm_source')) {
        targetUrl.searchParams.set('utm_source', 'landing_page');
      }
      if (!targetUrl.searchParams.has('utm_medium')) {
        targetUrl.searchParams.set('utm_medium', 'fixed');
      }
      await db.query(
        `INSERT INTO landing_page_events (landing_page_slug, event_type, utm_source, utm_medium)
         VALUES ($1, 'click', 'landing_page', 'fixed')`,
        [normalizedSlug]
      );
      return res.redirect(302, targetUrl.toString());
    }

    const { rows } = await db.query(
      `SELECT id FROM landing_pages WHERE slug = $1 AND is_published = true`,
      [normalizedSlug]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy landing page' });
    }
    const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', rows[0].id)) {
      return res.status(503).json({ success: false, message: 'Landing page tạm ngừng', code: 'RESOURCE_LOCKED' });
    }

    if (!targetUrl.searchParams.has('utm_source')) {
      targetUrl.searchParams.set('utm_source', 'landing_page');
    }
    if (!targetUrl.searchParams.has('utm_medium')) {
      targetUrl.searchParams.set('utm_medium', normalizedSlug);
    }

    await db.query(
      `INSERT INTO landing_page_events (landing_page_slug, event_type, utm_source, utm_medium, target_url)
       VALUES ($1, 'click', 'landing_page', $2, $3)`,
      [normalizedSlug, normalizedSlug, targetUrl.toString()]
    );

    return res.redirect(302, targetUrl.toString());
  } catch (error) {
    console.error('Landing track go error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

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

router.post('/leads', publicLeadLimiter, async (req, res) => {
  try {
    const { lastName, firstName, email, phone, marketingConsent, landingPageSlug, utmSource, utmCampaign } = req.body;

    if (!lastName?.trim() || !firstName?.trim()) {
      return res.status(400).json({ success: false, message: 'Họ và Tên không được để trống' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ' });
    }

    if (!phone || phone.length < 8) {
      return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ' });
    }

    if (!marketingConsent) {
      return res.status(400).json({ success: false, message: 'Bạn cần đồng ý nhận email marketing' });
    }

    const slug = typeof landingPageSlug === 'string' ? landingPageSlug.trim() : '';
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu trang đích hợp lệ để ghi nhận lead',
      });
    }

    const { rows: landingRows } = await db.query(
      `SELECT id, id_user FROM landing_pages WHERE slug = $1 AND is_published = true`,
      [slug]
    );
    if (!landingRows[0]?.id_user) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy landing page' });
    }
    const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', landingRows[0].id)) {
      return res.status(503).json({ success: false, message: 'Landing page tạm ngừng', code: 'RESOURCE_LOCKED' });
    }

    const idUser = landingRows[0].id_user;
    await db.query(
      `INSERT INTO landing_page_events (id_landing_page, landing_page_slug, event_type, utm_source, utm_campaign)
       VALUES ($1, $2, 'submit', $3, $4)`,
      [landingRows[0].id, slug, utmSource || null, utmCampaign || null]
    );

    const { rows } = await db.query(
      `INSERT INTO leads (id_user, last_name, first_name, email, phone, marketing_consent, landing_page_slug, utm_source, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [idUser, lastName, firstName, email, phone, marketingConsent, slug, utmSource || null, utmCampaign || null]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Create lead error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
