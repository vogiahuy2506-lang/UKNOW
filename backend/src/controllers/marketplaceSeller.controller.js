import marketplaceSellerService from '../services/marketplace/marketplaceSeller.service.js';
import { paginate } from '../helpers.js';
import { resolveWorkspaceOwnerId } from '../utils/workspaceContext.util.js';

class MarketplaceSellerController {
  /**
   * Get seller dashboard stats
   * GET /api/marketplace/seller/dashboard
   */
  async getDashboard(req, res, next) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const stats = await marketplaceSellerService.getDashboardStats(userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get seller's listings with stats
   * GET /api/marketplace/seller/listings
   */
  async getMyListings(req, res, next) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { status, type, page = 1, limit = 20 } = req.query;

      const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);

      const result = await marketplaceSellerService.getMyListingsWithStats(userId, {
        status,
        resourceType: type,
        limit: sanitizedLimit,
        offset: paginate({ page: sanitizedPage, limit: sanitizedLimit }).offset,
      });

      res.json({
        success: true,
        data: result.listings,
        pagination: paginate({ page: sanitizedPage, limit: sanitizedLimit, total: result.total }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get listing stats
   * GET /api/marketplace/seller/listings/:id
   */
  async getListingStats(req, res, next) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { id } = req.params;

      const stats = await marketplaceSellerService.getListingStats(parseInt(id, 10), userId);
      if (!stats) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại hoặc bạn không có quyền xem',
        });
      }

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get earnings history
   * GET /api/marketplace/seller/earnings
   */
  async getEarnings(req, res, next) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { page = 1, limit = 20, startDate, endDate } = req.query;

      const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);

      const result = await marketplaceSellerService.getEarningsHistory(userId, {
        limit: sanitizedLimit,
        offset: paginate({ page: sanitizedPage, limit: sanitizedLimit }).offset,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      res.json({
        success: true,
        data: result.earnings,
        pagination: paginate({ page: sanitizedPage, limit: sanitizedLimit, total: result.total }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get withdrawal history
   * GET /api/marketplace/seller/withdrawals
   */
  async getWithdrawals(req, res, next) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { page = 1, limit = 20 } = req.query;

      const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);

      const result = await marketplaceSellerService.getWithdrawalHistory(userId, {
        limit: sanitizedLimit,
        offset: paginate({ page: sanitizedPage, limit: sanitizedLimit }).offset,
      });

      res.json({
        success: true,
        data: result.withdrawals,
        pagination: paginate({ page: sanitizedPage, limit: sanitizedLimit, total: result.total }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Request withdrawal
   * POST /api/marketplace/seller/withdraw
   */
  async requestWithdrawal(req, res, next) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { amount, paymentMethod, paymentDetails } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Số tiền rút không hợp lệ',
        });
      }

      const result = await marketplaceSellerService.requestWithdrawal(
        userId,
        parseInt(amount, 10),
        paymentMethod || 'bank_transfer',
        paymentDetails || {}
      );

      res.status(201).json({
        success: true,
        message: 'Yêu cầu rút tiền đã được gửi',
        data: result,
      });
    } catch (error) {
      if (error.status === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      next(error);
    }
  }
}

export default new MarketplaceSellerController();
