import landingPageAdminService from '../services/landingPage/landingPageAdmin.service.js';

/**
 * API quản trị — CRUD landing page HTML (auth + admin).
 */
class LandingPageAdminController {
  /**
   * GET /api/admin/landing-pages
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async list(req, res) {
    try {
      const rows = await landingPageAdminService.list();
      return res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[LandingPageAdminController.list]', error);
      return res.status(500).json({ success: false, message: 'Không thể tải danh sách' });
    }
  }

  /**
   * GET /api/admin/landing-pages/:id
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getById(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const row = await landingPageAdminService.getById(id);
      return res.json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.getById]', error);
      return res.status(status).json({ success: false, message: error.message || 'Lỗi' });
    }
  }

  /**
   * POST /api/admin/landing-pages
   *
   * Body: slug, title?, htmlContent?, isPublished?
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async create(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      const row = await landingPageAdminService.create(req.body || {}, userId);
      return res.status(201).json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.create]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể tạo' });
    }
  }

  /**
   * PUT /api/admin/landing-pages/:id
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async update(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      const row = await landingPageAdminService.update(id, req.body || {}, userId);
      return res.json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.update]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể cập nhật' });
    }
  }

  /**
   * DELETE /api/admin/landing-pages/:id
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async remove(req, res) {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Id không hợp lệ' });
      }
      await landingPageAdminService.remove(id);
      return res.json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingPageAdminController.remove]', error);
      return res.status(status).json({ success: false, message: error.message || 'Không thể xóa' });
    }
  }
}

export default new LandingPageAdminController();
