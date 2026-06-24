import landingFeaturedCourseService from '../services/landing/landingFeaturedCourse.service.js';

/**
 * API quản trị — CRUD khóa học nổi bật landing (auth + admin).
 */
class LandingFeaturedCourseAdminController {
  /**
   * GET /api/admin/landing-featured-courses
   *
   * Mục đích: trả về tất cả bản ghi (kèm inactive) để chỉnh sửa trên CMS.
   * Response: `{ success, data: [...] }`.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async list(req, res) {
    try {
      const userId = req.user?.id;
      const effectiveOwnerId = req.user.activeContext?.type === 'employee'
        ? req.user.activeContext.ownerId
        : userId;
        
      const rows = await landingFeaturedCourseService.listAdmin(effectiveOwnerId);
      return res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[LandingFeaturedCourseAdminController.list]', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải danh sách',
      });
    }
  }

  /**
   * POST /api/admin/landing-featured-courses
   *
   * Body JSON: titleVi, titleEn, linkUrl (bắt buộc http(s)); tagVi, tagEn; imageUrl (http(s) hoặc rỗng) hoặc imageTempId + imageOriginalName sau POST `/api/uploads/temp`; sortOrder, isActive.
   * Response: `{ success, data: { ... } }` — bản ghi mới.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async create(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      const effectiveOwnerId = req.user.activeContext?.type === 'employee'
        ? req.user.activeContext.ownerId
        : userId;

      const row = await landingFeaturedCourseService.create(req.body || {}, effectiveOwnerId);
      return res.status(201).json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingFeaturedCourseAdminController.create]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tạo bản ghi',
      });
    }
  }

  /**
   * PUT /api/admin/landing-featured-courses/:id
   *
   * Body JSON: các trường cần cập nhật (merge với bản ghi hiện có).
   * Response: `{ success, data: { ... } }`.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async update(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Thiếu thông tin người dùng' });
      }
      const effectiveOwnerId = req.user.activeContext?.type === 'employee'
        ? req.user.activeContext.ownerId
        : userId;

      const row = await landingFeaturedCourseService.update(
        req.params.id,
        req.body || {},
        effectiveOwnerId,
        req.user?.role
      );
      return res.json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingFeaturedCourseAdminController.update]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể cập nhật',
      });
    }
  }

  /**
   * DELETE /api/admin/landing-featured-courses/:id
   *
   * Response: `{ success: true }`.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async remove(req, res) {
    try {
      const userId = req.user?.id;
      const effectiveOwnerId = req.user.activeContext?.type === 'employee'
        ? req.user.activeContext.ownerId
        : userId;
        
      await landingFeaturedCourseService.remove(req.params.id, effectiveOwnerId, req.user?.role);
      return res.json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingFeaturedCourseAdminController.remove]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể xóa',
      });
    }
  }
}

export default new LandingFeaturedCourseAdminController();
