import express from 'express';
import landingCustomizerService from '../services/landingCustomizer.service.js';

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

// Contact form submission from hero page
router.post('/hero/contact', async (req, res) => {
  try {
    const { visitorId, visitorIp, name, email, phone, message, topic } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin bắt buộc.'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ.'
      });
    }

    // TODO: Save to database and send notification
    // For now, just log and return success
    console.log('[Hero Contact Form]', {
      visitorId,
      visitorIp,
      name,
      email,
      phone,
      topic,
      message,
      timestamp: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Liên hệ của bạn đã được gửi thành công!'
    });

  } catch (error) {
    console.error('[Hero Contact]', error);
    return res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra. Vui lòng thử lại sau.'
    });
  }
});

export default router;
