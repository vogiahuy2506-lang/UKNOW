import leadService from '../services/lead/lead.service.js';

/**
 * Controller công khai — ghi lead từ form landing (không auth).
 */
class PublicLeadController {
  /**
   * Tạo lead mới từ form landing UKnow.
   *
   * Luồng hoạt động:
   * 1. Nhận JSON body (họ, tên, email, SĐT, nghề, lĩnh vực, đồng ý marketing).
   * 2. Service validate và INSERT vào `leads`.
   * 3. Trả 201 kèm `id` hoặc lỗi 4xx/5xx có `message` tiếng Việt.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async create(req, res) {
    try {
      const { row } = await leadService.createPublicLead(req.body || {});
      return res.status(201).json({
        success: true,
        message: 'Đăng ký thành công',
        data: {
          id: row.id,
        },
      });
    } catch (error) {
      const status = error.statusCode || 500;
      const message = error.message || 'Không thể xử lý yêu cầu';
      if (status >= 500) {
        console.error('[PublicLeadController.create]', error);
      }
      return res.status(status).json({
        success: false,
        message,
      });
    }
  }
}

export default new PublicLeadController();
