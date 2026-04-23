import landingFeaturedCourseService from '../services/landing/landingFeaturedCourse.service.js';

/**
 * API công khai — danh sách khóa học nổi bật landing (không auth).
 */
class LandingFeaturedCoursePublicController {
  /**
   * GET /api/public/landing-featured-courses
   *
   * Mục đích: trả về các bản ghi `is_active = true`, sắp xếp `sort_order`.
   * Response: `{ success, data: [...] }` — mỗi phần tử gồm titleVi/titleEn, imageUrl, linkUrl, ...
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async list(req, res) {
    try {
      const rows = await landingFeaturedCourseService.listPublic();
      return res.json({ success: true, data: rows });
    } catch (error) {
      console.error('[LandingFeaturedCoursePublicController.list]', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể tải danh sách khóa học nổi bật',
      });
    }
  }
}

export default new LandingFeaturedCoursePublicController();
