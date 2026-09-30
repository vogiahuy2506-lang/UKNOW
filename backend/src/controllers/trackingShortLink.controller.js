import trackingShortLinkService from '../services/tracking/trackingShortLink.service.js';

/**
 * URL đích lưu trong DB chỉ được chuyển hướng khi là URL tuyệt đối http/https có hostname —
 * chặn `javascript:`, `data:`, URL tương đối kiểu `//host` hay giá trị hỏng.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isSafeRedirectDestination(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  let u;
  try {
    u = new URL(value.trim());
  } catch {
    return false;
  }
  return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
}

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

      if (!isSafeRedirectDestination(result.destinationUrl)) {
        console.warn('[TrackingShortLink] Bỏ qua đích không phải http/https cho mã ngắn');
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy link rút gọn hoặc link đã hết hạn.',
        });
      }

      return res.redirect(302, result.destinationUrl.trim());
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

