import landingCustomizerService from '../services/landingCustomizer.service.js';

class LandingCustomizerController {
  async list(req, res) {
    try {
      const overrides = await landingCustomizerService.getAllOverrides();
      return res.json({ success: true, data: overrides });
    } catch (error) {
      console.error('[LandingCustomizerController.list]', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải danh sách overrides',
      });
    }
  }

  async getByPage(req, res) {
    try {
      const { page } = req.params;
      const overrides = await landingCustomizerService.getOverridesByPage(page);
      return res.json({ success: true, data: overrides });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingCustomizerController.getByPage]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải overrides',
      });
    }
  }

  async create(req, res) {
    try {
      const override = await landingCustomizerService.createOverride(req.body || {});
      return res.status(201).json({ success: true, data: override });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingCustomizerController.create]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tạo override',
      });
    }
  }

  async update(req, res) {
    try {
      const { id } = req.params;
      const override = await landingCustomizerService.updateOverride(id, req.body || {});
      return res.json({ success: true, data: override });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingCustomizerController.update]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể cập nhật override',
      });
    }
  }

  async delete(req, res) {
    try {
      const { id } = req.params;
      await landingCustomizerService.deleteOverride(id);
      return res.json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingCustomizerController.delete]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể xóa override',
      });
    }
  }

  async bulkUpsert(req, res) {
    try {
      const { items } = req.body || {};
      const overrides = await landingCustomizerService.bulkUpsert(items || []);
      return res.json({ success: true, data: overrides });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingCustomizerController.bulkUpsert]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể bulk upsert overrides',
      });
    }
  }

  async getHtmlMode(req, res) {
    try {
      const { page } = req.params;
      const data = await landingCustomizerService.getFullPageHtmlMode(page);
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingCustomizerController.getHtmlMode]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải chế độ HTML',
      });
    }
  }

  async saveHtmlMode(req, res) {
    try {
      const { page } = req.params;
      const data = await landingCustomizerService.saveFullPageHtmlMode(page, req.body || {});
      return res.json({ success: true, data });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingCustomizerController.saveHtmlMode]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể lưu chế độ HTML',
      });
    }
  }
}

export default new LandingCustomizerController();
