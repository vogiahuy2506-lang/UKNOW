import express from 'express';
import db from '../config/database.js';
import { publicLeadLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.post('/', publicLeadLimiter, async (req, res) => {
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
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy landing page',
      });
    }

    const { resourceIsLocked } = await import('../utils/topupLockGate.util.js');
    if (await resourceIsLocked('landing_pages', landingRows[0].id)) {
      return res.status(503).json({
        success: false,
        message: 'Landing page tạm ngừng',
        code: 'RESOURCE_LOCKED',
      });
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
