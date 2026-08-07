import express from 'express';
import db from '../config/database.js';
import landingCustomizerService from '../services/landingCustomizer.service.js';
import { publicLeadLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get('/landing-overrides', async (req, res) => {
  try {
    const overrides = await landingCustomizerService.getActiveOverrides();
    const overridesMap = landingCustomizerService.getOverridesMap(overrides);
    return res.json({ success: true, data: overridesMap });
  } catch (error) {
    console.error('[PublicLandingOverrides]', error);
    return res.status(500).json({
      success: false,
      message: 'Không thể tải landing overrides',
    });
  }
});

router.get('/landing-page-html/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const locale = String(req.query.lang || req.query.locale || 'vi').trim().toLowerCase();
    const data = await landingCustomizerService.getPublicFullPageHtml(page, locale);
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[PublicLandingPageHtml]', error);
    return res.status(status).json({
      success: false,
      message: error.message || 'Không thể tải HTML trang',
    });
  }
});

router.get('/landing-overrides/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const result = await landingCustomizerService.getOverridesByPage(page);
    const overrides = Array.isArray(result) ? result : (result.raw || []);
    const map = {};
    for (const override of overrides) {
      if (!map[override.section]) {
        map[override.section] = {};
      }
      map[override.section][override.key] = {
        valueVi: override.valueVi,
        valueEn: override.valueEn,
        extraData: override.extraData,
      };
    }
    return res.json({ success: true, data: map });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[PublicLandingOverrides.page]', error);
    return res.status(status).json({
      success: false,
      message: error.message || 'Không thể tải landing overrides',
    });
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

    let idUser = null;
    if (landingPageSlug) {
      const { rows: landingRows } = await db.query(
        `SELECT id, id_user FROM landing_pages WHERE slug = $1 AND is_published = true`,
        [landingPageSlug]
      );
      if (landingRows[0]) {
        const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
        if (await resourceIsLocked('landing_pages', landingRows[0].id)) {
          return res.status(503).json({
            success: false,
            message: 'Landing page tạm ngừng',
            code: 'RESOURCE_LOCKED',
          });
        }
        idUser = landingRows[0].id_user;
        await db.query(
          `INSERT INTO landing_page_events (landing_page_slug, event_type, utm_source, utm_campaign)
           VALUES ($1, 'submit', $2, $3)`,
          [landingPageSlug, utmSource || null, utmCampaign || null]
        );
      }
    }

    if (!idUser) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu trang đích hợp lệ để ghi nhận lead',
      });
    }

    const { rows } = await db.query(
      `INSERT INTO leads (id_user, last_name, first_name, email, phone, marketing_consent, landing_page_slug, utm_source, utm_campaign)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [idUser, lastName, firstName, email, phone, marketingConsent, landingPageSlug || null, utmSource || null, utmCampaign || null]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Create lead error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
