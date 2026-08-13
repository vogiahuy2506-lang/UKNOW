import marketplaceReviewRepository from '../../repositories/marketplace/marketplaceReview.repository.js';
import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import db from '../../config/database.js';

class MarketplaceReviewService {
  /**
   * Create or update a review
   * @param {number} listingId
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createOrUpdate(listingId, userId, data) {
    const { rating, reviewText } = data;
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Verify user has purchased the listing (trong transaction để tránh TOCTOU)
      const purchase = await marketplacePurchaseRepository.findByUserAndListingTx(
        client, userId, listingId
      );
      if (!purchase) {
        const error = new Error('Bạn cần mua listing trước khi đánh giá');
        error.status = 403;
        throw error;
      }

      // Create/update review trong transaction
      const review = await marketplaceReviewRepository.createTx(client, {
        idUser: userId,
        listingId,
        rating,
        reviewText,
      });

      // Recalculate listing rating dựa trên dữ liệu mới nhất
      const stats = await marketplaceReviewRepository.getAverageRatingTx(client, listingId);
      await marketplaceListingRepository.updateRating(listingId, stats.avg, stats.count);

      await client.query('COMMIT');
      return review;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get reviews for a listing
   * @param {number} listingId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getByListing(listingId, options = {}) {
    const [reviews, total] = await Promise.all([
      marketplaceReviewRepository.findByListingId(listingId, options),
      marketplaceReviewRepository.countByListingId(listingId),
    ]);
    return { reviews, total };
  }

  /**
   * Get user's review for a listing
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<object|null>}
   */
  async getUserReview(userId, listingId) {
    return marketplaceReviewRepository.findByUserAndListing(userId, listingId);
  }
}

export default new MarketplaceReviewService();
