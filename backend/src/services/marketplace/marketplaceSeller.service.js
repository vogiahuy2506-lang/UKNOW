import marketplaceWalletService from './marketplaceWallet.service.js';
import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import db from '../../config/database.js';

/**
 * Marketplace Seller Dashboard Service
 * Thống kê và dashboard cho người bán
 */
class MarketplaceSellerService {
  /**
   * Lấy thống kê dashboard của seller
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async getDashboardStats(userId) {
    // Lấy balance từ wallet service
    const balance = await marketplaceWalletService.getBalance(userId);

    // Lấy thống kê listings
    const { rows: listings } = await db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'published') as active_listings,
         COUNT(*) FILTER (WHERE status = 'draft') as draft_listings,
         COUNT(*) FILTER (WHERE status = 'paused') as paused_listings,
         SUM(view_count) as total_views,
         SUM(purchase_count) as total_purchases,
         AVG(rating_avg) FILTER (WHERE rating_count > 0) as avg_rating
       FROM marketplace_listings
       WHERE id_user = $1`,
      [userId]
    );

    const listingsStats = listings[0] || {};

    // Lấy top performing listings
    const { rows: topListings } = await db.query(
      `SELECT 
         id, title, resource_type, purchase_count, view_count, rating_avg, price_credits
       FROM marketplace_listings
       WHERE id_user = $1 AND status = 'published'
       ORDER BY purchase_count DESC
       LIMIT 5`,
      [userId]
    );

    // Lấy monthly stats
    const monthlyStats = await marketplaceWalletService.getMonthlyStats(userId, 6);

    return {
      balance,
      listings: {
        active: Number(listingsStats.active_listings || 0),
        draft: Number(listingsStats.draft_listings || 0),
        paused: Number(listingsStats.paused_listings || 0),
        totalViews: Number(listingsStats.total_views || 0),
        totalPurchases: Number(listingsStats.total_purchases || 0),
        avgRating: listingsStats.avg_rating ? Number(listingsStats.avg_rating) : null,
      },
      topListings: topListings.map(l => ({
        id: l.id,
        title: l.title,
        type: l.resource_type,
        purchases: Number(l.purchase_count || 0),
        views: Number(l.view_count || 0),
        rating: l.rating_avg ? Number(l.rating_avg) : null,
        price: Number(l.price_credits || 0),
      })),
      monthlyStats,
    };
  }

  /**
   * Lấy danh sách listings của seller với thống kê chi tiết
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getMyListingsWithStats(userId, options = {}) {
    const { limit = 20, offset = 0, status, resourceType } = options;

    let query = `
      SELECT 
        ml.*,
        COALESCE(u.full_name, u.username) as seller_name,
        (SELECT COUNT(*) FROM marketplace_reviews mr WHERE mr.listing_id = ml.id) as review_count
      FROM marketplace_listings ml
      LEFT JOIN users u ON ml.id_user = u.id
      WHERE ml.id_user = $1
    `;
    const params = [userId];

    if (status) {
      params.push(status);
      query += ` AND ml.status = $${params.length}`;
    }
    if (resourceType) {
      params.push(resourceType);
      query += ` AND ml.resource_type = $${params.length}`;
    }

    query += ` ORDER BY ml.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows: listings, rowCount } = await db.query(query, params);

    return {
      listings: listings.map(l => ({
        id: l.id,
        title: l.title,
        resourceType: l.resource_type,
        status: l.status,
        price: Number(l.price_credits || 0),
        viewCount: Number(l.view_count || 0),
        purchaseCount: Number(l.purchase_count || 0),
        ratingAvg: l.rating_avg ? Number(l.rating_avg) : null,
        reviewCount: Number(l.review_count || 0),
        createdAt: l.created_at,
        publishedAt: l.published_at,
      })),
      total: rowCount,
    };
  }

  /**
   * Lấy chi tiết thống kê một listing
   * @param {number} listingId
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getListingStats(listingId, userId) {
    const listing = await marketplaceListingRepository.findById(listingId);
    if (!listing || listing.id_user !== userId) {
      return null;
    }

    // Lấy reviews gần đây
    const { rows: recentReviews } = await db.query(
      `SELECT mr.*, u.full_name as reviewer_name
       FROM marketplace_reviews mr
       LEFT JOIN users u ON mr.id_user = u.id
       WHERE mr.listing_id = $1
       ORDER BY mr.created_at DESC
       LIMIT 5`,
      [listingId]
    );

    // Lấy purchases gần đây
    const { rows: recentPurchases } = await db.query(
      `SELECT mp.*, u.full_name as buyer_name
       FROM marketplace_purchases mp
       LEFT JOIN users u ON mp.id_user = u.id
       WHERE mp.listing_id = $1 AND mp.transaction_type = 'purchase'
       ORDER BY mp.purchased_at DESC
       LIMIT 5`,
      [listingId]
    );

    return {
      listing: {
        id: listing.id,
        title: listing.title,
        resourceType: listing.resource_type,
        status: listing.status,
        price: Number(listing.price_credits || 0),
        viewCount: Number(listing.view_count || 0),
        purchaseCount: Number(listing.purchase_count || 0),
        ratingAvg: listing.rating_avg ? Number(listing.rating_avg) : null,
        ratingCount: Number(listing.rating_count || 0),
      },
      recentReviews: recentReviews.map(r => ({
        id: r.id,
        rating: r.rating,
        reviewText: r.review_text,
        reviewerName: r.reviewer_name,
        createdAt: r.created_at,
      })),
      recentPurchases: recentPurchases.map(p => ({
        id: p.id,
        buyerName: p.buyer_name,
        creditsSpent: Number(p.credits_spent || 0),
        sellerEarnings: Math.floor(Number(p.credits_spent || 0) * 0.9),
        purchasedAt: p.purchased_at,
      })),
    };
  }

  /**
   * Lấy earnings history
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getEarningsHistory(userId, options = {}) {
    return marketplaceWalletService.getEarningsHistory(userId, options);
  }

  /**
   * Lấy withdrawal history
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getWithdrawalHistory(userId, options = {}) {
    return marketplaceWalletService.getWithdrawalHistory(userId, options);
  }

  /**
   * Yêu cầu rút tiền
   * @param {number} userId
   * @param {number} amount
   * @param {string} paymentMethod
   * @param {object} paymentDetails
   * @returns {Promise<object>}
   */
  async requestWithdrawal(userId, amount, paymentMethod, paymentDetails) {
    return marketplaceWalletService.requestWithdrawal(userId, amount, paymentMethod, paymentDetails);
  }
}

export default new MarketplaceSellerService();
