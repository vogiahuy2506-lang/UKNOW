import landingTestimonialService from '../services/landing/landingTestimonial.service.js';

/**
 * API công khai — danh sách đánh giá landing (chỉ bản ghi active).
 */
class LandingTestimonialPublicController {
  /**
   * GET /api/public/landing-testimonials
   *
   * Mục đích: trả về đánh giá để hiển thị trên `/l` (không cần đăng nhập).
   * Response: `{ success, data: [...] }`.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async list(req, res) {
    try {
      const rows = await landingTestimonialService.listPublic();
      return res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[LandingTestimonialPublicController.list]', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải đánh giá',
      });
    }
  }
}

export default new LandingTestimonialPublicController();
