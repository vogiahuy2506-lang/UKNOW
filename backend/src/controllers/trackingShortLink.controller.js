import trackingShortLinkService from '../services/tracking/trackingShortLink.service.js';

class TrackingShortLinkController {
  /**
   * Redirect từ mã ngắn `/t/:code` sang URL tracking đầy đủ đã map trong DB.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<import('express').Response>}
   */
  async redirectByCode(req, res) {
    try {
      const result = await trackingShortLinkService.resolveByCode(req.params.code);

      if (result.status === 'invalid') {
        return res.status(404).json({
          success: false,
          message: 'Link rút gọn không hợp lệ hoặc đã hết hạn.',
        });
      }

      if (result.status === 'not_found') {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy link rút gọn hoặc link đã hết hạn.',
        });
      }

      return res.redirect(302, result.destinationUrl);
    } catch (error) {
      console.error('Resolve tracking short code error:', error);
      return res.status(500).json({
        success: false,
        message: 'Không thể xử lý link rút gọn lúc này.',
      });
    }
  }
}

export default new TrackingShortLinkController();

