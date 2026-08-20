import { serverError } from '../helpers.js';
import courseService from '../services/courses/course.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';

class CoursesController {
  /**
   * Lấy danh sách khóa học (có phân trang và tìm kiếm)
   * GET /api/courses?page=1&limit=20&search=keyword&category=...&status=publish,pending
   */
  async getAll(req, res) {
    try {
      const data = await courseService.getAll({
        query: req.query,
        user: req.user,
      });

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      return serverError(res, 'getAll courses', error);
    }
  }

  /**
   * Lấy thông tin một khóa học theo ID
   * GET /api/courses/:id
   */
  async getById(req, res) {
    try {
      const course = await courseService.getById({
        courseId: req.params.id,
        user: req.user,
      });

      return res.json({
        success: true,
        data: course,
      });
    } catch (error) {
      if (error.status === 404 || error.status === 403) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
        });
      }
      return serverError(res, 'getById course', error);
    }
  }

  /**
   * Đồng bộ khóa học từ Founder AI API (thủ công)
   * POST /api/courses/sync
   */
  async syncManual(req, res) {
    try {
      const { actorUserId, workspaceOwnerId } = getWorkspaceContext(req.user);

      console.log(`[Manual Sync] Bắt đầu đồng bộ khóa học bởi user ${actorUserId} cho owner ${workspaceOwnerId}`);
      const result = await courseService.syncCoursesFromFounderAI({ workspaceOwnerId, actorUserId });

      return res.json({
        success: result.success,
        message: result.success
          ? `Đồng bộ thành công: ${result.totalInserted} khóa học mới, ${result.totalUpdated} khóa học được cập nhật`
          : 'Đồng bộ thất bại',
        data: result,
      });
    } catch (error) {
      return serverError(res, 'syncManual courses', error);
    }
  }

  async syncCoursesFromFounderAI(userId = 1) {
    return courseService.syncCoursesFromFounderAI(userId);
  }
}

export default new CoursesController();
