import marketplaceListingService from '../services/marketplace/marketplaceListing.service.js';
import marketplacePurchaseService from '../services/marketplace/marketplacePurchase.service.js';
import marketplaceReviewService from '../services/marketplace/marketplaceReview.service.js';
import marketplaceFavoriteService from '../services/marketplace/marketplaceFavorite.service.js';
import { paginate } from '../helpers.js';

const VALID_CATEGORIES = ['marketing', 'automation', 'support'];
const VALID_VISIBILITIES = ['public', 'team'];

class MarketplaceController {
  /**
   * Get user's listings
   * GET /api/marketplace/listings
   */
  async getMyListings(req, res, next) {
    try {
      const userId = req.user.id;
      const { status, page = 1, limit = 20 } = req.query;

      // Sanitize pagination params
      const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);
      const sanitizedStatus = ['draft', 'published', 'paused'].includes(status) ? status : undefined;

      const { listings, total } = await marketplaceListingService.getUserListings(userId, {
        status: sanitizedStatus,
        limit: sanitizedLimit,
        offset: paginate({ page: sanitizedPage, limit: sanitizedLimit }).offset,
      });

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
   * Create listing from campaign
   * POST /api/marketplace/listings
   */
  async create(req, res, next) {
    try {
      const userId = req.user.id;
      const { campaignId, title, description, category, tags, priceCredits, visibility } = req.body;

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          message: 'campaignId là bắt buộc',
        });
      }

      // Sanitize and validate
      const sanitizedCampaignId = parseInt(campaignId, 10);
      if (isNaN(sanitizedCampaignId) || sanitizedCampaignId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'campaignId không hợp lệ',
        });
      }

      const sanitizedTitle = title?.trim().substring(0, 255) || undefined;
      const sanitizedDescription = description?.trim().substring(0, 2000) || undefined;
      const sanitizedCategory = VALID_CATEGORIES.includes(category) ? category : undefined;
      const sanitizedTags = Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).substring(0, 50)) : undefined;
      const sanitizedPriceCredits = Math.max(parseInt(priceCredits, 10) || 0, 0);
      const sanitizedVisibility = VALID_VISIBILITIES.includes(visibility) ? visibility : 'public';

      const listing = await marketplaceListingService.createFromCampaign(userId, {
        campaignId: sanitizedCampaignId,
        title: sanitizedTitle,
        description: sanitizedDescription,
        category: sanitizedCategory,
        tags: sanitizedTags,
        priceCredits: sanitizedPriceCredits,
        visibility: sanitizedVisibility,
      });

      res.status(201).json({
        success: true,
        data: listing,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get listing by ID
   * GET /api/marketplace/listings/:id
   */
  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const listing = await marketplaceListingService.getById(parseInt(id, 10));
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại',
        });
      }

      // Check if user has purchased
      let hasPurchased = false;
      if (userId) {
        hasPurchased = await marketplaceListingService.hasPurchased(userId, parseInt(id, 10));
      }

      res.json({
        success: true,
        data: {
          ...listing,
          hasPurchased,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update listing
   * PUT /api/marketplace/listings/:id
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { title, description, category, tags, priceCredits, visibility } = req.body;

      const listing = await marketplaceListingService.update(parseInt(id, 10), userId, {
        title,
        description,
        category,
        tags,
        priceCredits,
        visibility,
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại hoặc bạn không có quyền chỉnh sửa',
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
   * Delete listing
   * DELETE /api/marketplace/listings/:id
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const deleted = await marketplaceListingService.delete(parseInt(id, 10), userId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại hoặc bạn không có quyền xóa',
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
   * Publish listing
   * POST /api/marketplace/listings/:id/publish
   */
  async publish(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const listing = await marketplaceListingService.publish(parseInt(id, 10), userId);
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại hoặc bạn không có quyền publish',
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
   * Pause listing
   * POST /api/marketplace/listings/:id/pause
   */
  async pause(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const listing = await marketplaceListingService.pause(parseInt(id, 10), userId);
      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing không tồn tại hoặc bạn không có quyền',
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
   * Browse marketplace
   * GET /api/marketplace/browse
   */
  async browse(req, res, next) {
    try {
      const { type, category, sort, page = 1, limit = 20, search } = req.query;

      // Sanitize params
      const sanitizedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const sanitizedPage = Math.max(parseInt(page, 10) || 1, 1);
      const sanitizedType = ['campaign', 'chatbot'].includes(type) ? type : undefined;
      const sanitizedCategory = VALID_CATEGORIES.includes(category) ? category : undefined;
      const sanitizedSort = ['rating', 'newest', 'popular', 'price_asc', 'price_desc'].includes(sort) ? sort : 'rating';
      const sanitizedSearch = search?.trim().substring(0, 100) || undefined;

      const { listings, total } = await marketplaceListingService.browse({
        resourceType: sanitizedType,
        category: sanitizedCategory,
        sort: sanitizedSort,
        page: sanitizedPage,
        limit: sanitizedLimit,
        search: sanitizedSearch,
      });

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
   * Get featured listings
   * GET /api/marketplace/featured
   */
  async getFeatured(req, res, next) {
    try {
      const { limit = 10 } = req.query;
      const listings = await marketplaceListingService.getFeatured(parseInt(limit, 10));

      res.json({
        success: true,
        data: listings,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get categories
   * GET /api/marketplace/categories
   */
  async getCategories(req, res, next) {
    try {
      const categories = await marketplaceListingService.getCategories();

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Purchase a listing
   * POST /api/marketplace/purchase/:id
   */
  async purchase(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await marketplacePurchaseService.purchase(parseInt(id, 10), userId);

      res.json({
        success: true,
        message: 'Mua listing thành công',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's purchases
   * GET /api/marketplace/purchases
   */
  async getMyPurchases(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const { purchases, total } = await marketplacePurchaseService.getUserPurchases(userId, {
        limit: parseInt(limit, 10),
        offset: paginate({ page, limit }).offset,
      });

      res.json({
        success: true,
        data: purchases,
        pagination: paginate({ page, limit, total }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create review
   * POST /api/marketplace/listings/:id/reviews
   */
  async createReview(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const { rating, reviewText } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating phải từ 1 đến 5',
        });
      }

      const review = await marketplaceReviewService.createOrUpdate(parseInt(id, 10), userId, {
        rating,
        reviewText,
      });

      res.status(201).json({
        success: true,
        data: review,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get reviews for a listing
   * GET /api/marketplace/listings/:id/reviews
   */
  async getReviews(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const { reviews, total } = await marketplaceReviewService.getByListing(parseInt(id, 10), {
        limit: parseInt(limit, 10),
        offset: paginate({ page, limit }).offset,
      });

      res.json({
        success: true,
        data: reviews,
        pagination: paginate({ page, limit, total }),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's review for a listing
   * GET /api/marketplace/listings/:id/my-review
   */
  async getMyReview(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const review = await marketplaceReviewService.getUserReview(userId, parseInt(id, 10));

      res.json({
        success: true,
        data: review || null,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add to favorites
   * POST /api/marketplace/favorites/:id
   */
  async addFavorite(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Validate ID
      const listingId = parseInt(id, 10);
      if (isNaN(listingId) || listingId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'ID không hợp lệ',
        });
      }

      await marketplaceFavoriteService.addFavorite(listingId, userId);

      res.json({
        success: true,
        message: 'Đã thêm vào yêu thích',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove from favorites
   * DELETE /api/marketplace/favorites/:id
   */
  async removeFavorite(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      await marketplaceFavoriteService.removeFavorite(parseInt(id, 10), userId);

      res.json({
        success: true,
        message: 'Đã xóa khỏi yêu thích',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if listing is favorited
   * GET /api/marketplace/favorites/:id/check
   */
  async checkFavorite(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const isFavorited = await marketplaceFavoriteService.isFavorited(parseInt(id, 10), userId);

      res.json({
        success: true,
        data: { isFavorited },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's favorites
   * GET /api/marketplace/favorites
   */
  async getMyFavorites(req, res, next) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const { favorites, total } = await marketplaceFavoriteService.getUserFavorites(userId, {
        limit: parseInt(limit, 10),
        offset: paginate({ page, limit }).offset,
      });

      res.json({
        success: true,
        data: favorites,
        pagination: paginate({ page, limit, total }),
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new MarketplaceController();
