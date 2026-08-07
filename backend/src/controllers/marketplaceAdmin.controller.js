import marketplaceAdminRepository from '../repositories/marketplace/marketplaceAdmin.repository.js';
import { paginate } from '../helpers.js';

class MarketplaceAdminController {
  /**
   * Get all listings (admin view)
   * GET /api/admin/marketplace/listings
   */
  async getAllListings(req, res, next) {
    try {
      const { status, type, search, page = 1, limit = 50 } = req.query;

      const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);

      const [listings, total] = await Promise.all([
        marketplaceAdminRepository.findAll({
          status,
          resourceType: type,
          search,
          limit: sanitizedLimit,
          offset: paginate({ page: sanitizedPage, limit: sanitizedLimit }).offset,
        }),
        marketplaceAdminRepository.countAll({
          status,
          resourceType: type,
          search,
        }),
      ]);

      res.json({
        success: true,
        data: listings,
        pagination: paginate({ page: sanitizedPage, limit: sanitizedLimit, total }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update listing status (admin)
   * PUT /api/admin/marketplace/listings/:id/status
   */
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['draft', 'published', 'paused'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status không hợp lệ',
        });
      }

      const listing = await marketplaceAdminRepository.updateStatus(parseInt(id, 10), status);
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại',
        });
      }

      res.json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete listing (admin)
   * DELETE /api/admin/marketplace/listings/:id
   */
  async deleteListing(req, res, next) {
    try {
      const { id } = req.params;

      const deleted = await marketplaceAdminRepository.delete(parseInt(id, 10));
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại',
        });
      }

      res.json({
        success: true,
        message: 'Đã xóa listing',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get marketplace statistics
   * GET /api/admin/marketplace/stats
   */
  async getStats(req, res, next) {
    try {
      const stats = await marketplaceAdminRepository.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new MarketplaceAdminController();
