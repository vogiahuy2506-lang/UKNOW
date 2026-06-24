import landingTestimonialService from '../services/landing/landingTestimonial.service.js';

/**
 * API quản trị — CRUD đánh giá landing (auth + admin).
 */
class LandingTestimonialAdminController {
  /**
   * GET /api/admin/landing-testimonials
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
        
      const rows = await landingTestimonialService.listAdmin(effectiveOwnerId);
      return res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[LandingTestimonialAdminController.list]', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải danh sách',
      });
    }
  }

  /**
   * POST /api/admin/landing-testimonials
   *
   * Body JSON: quoteVi, quoteEn, nameVi, nameEn (bắt buộc); starRating 1–5; roleVi, roleEn, locationVi, locationEn;
   * imageUrl (http(s) hoặc rỗng) hoặc imageTempId + imageOriginalName sau khi POST `/api/uploads/temp`;
   * sortOrder, isActive.
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

      const row = await landingTestimonialService.create(req.body || {}, effectiveOwnerId);
      return res.status(201).json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingTestimonialAdminController.create]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tạo bản ghi',
      });
    }
  }

  /**
   * PUT /api/admin/landing-testimonials/:id
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

      const row = await landingTestimonialService.update(
        req.params.id,
        req.body || {},
        effectiveOwnerId,
        req.user?.role
      );
      return res.json({ success: true, data: row });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingTestimonialAdminController.update]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể cập nhật',
      });
    }
  }

  /**
   * DELETE /api/admin/landing-testimonials/:id
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
        
      await landingTestimonialService.remove(req.params.id, effectiveOwnerId, req.user?.role);
      return res.json({ success: true });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LandingTestimonialAdminController.remove]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể xóa',
      });
    }
  }
}

export default new LandingTestimonialAdminController();
