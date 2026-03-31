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
    return trackingShortLinkService.redirectByCode(req, res);
  }
}

export default new TrackingShortLinkController();

