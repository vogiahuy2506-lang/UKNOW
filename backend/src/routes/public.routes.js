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

router.get('/landing-overrides/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const overrides = await landingCustomizerService.getOverridesByPage(page);
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

export default router;
