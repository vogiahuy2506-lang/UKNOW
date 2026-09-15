import formService from '../services/form.service.js';
import { clientIpKey } from '../middleware/rateLimiter.middleware.js';

class FormPublicController {
  async getPublic(req, res) {
    try {
      const { publicKey } = req.params;
      const form = await formService.getPublicForm(publicKey);
      return res.json({
        success: true,
        data: form,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.getPublic]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async getSlots(req, res) {
    try {
      const { publicKey } = req.params;
      const { from, days } = req.query || {};
      const result = await formService.getPublicSlots(publicKey, { from, days });
      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.getSlots]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải danh sách khung giờ',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async submitPublic(req, res) {
    try {
      const { publicKey } = req.params;
      // clientIpKey — CÙNG cách lấy IP với publicFormSubmissionLimiter (rateLimiter.middleware.js)
      // để "cùng IP" ở chốt chống giữ chỗ hàng loạt (PR-3a) khớp đúng cách limiter nhóm IP.
      const ipKey = clientIpKey(req);
      const result = await formService.submitPublicForm(publicKey, req.body || {}, ipKey);

      return res.status(201).json({
        success: true,
        message: 'Nộp biểu mẫu thành công',
        data: {
          accessToken: result.accessToken,
          payment: result.payment || null,
        },
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.submitPublic]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể nộp biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * GET /api/public/forms/:publicKey/submissions/:accessToken — trang trạng thái công khai
   * cho người đặt (PR-3a mục 4). Không gắn limiter riêng — cùng mức với getPublic/getSlots.
   */
  async getSubmissionStatus(req, res) {
    try {
      const { publicKey, accessToken } = req.params;
      const result = await formService.getSubmissionStatus(publicKey, accessToken);
      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormPublicController.getSubmissionStatus]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải trạng thái bài nộp',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }
}

export default new FormPublicController();
