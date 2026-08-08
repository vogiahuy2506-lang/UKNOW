import marketplaceReviewRepository from '../../repositories/marketplace/marketplaceReview.repository.js';
import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';

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

    // Verify user has purchased the listing
    const purchase = await marketplacePurchaseRepository.findByUserAndListing(userId, listingId);
    if (!purchase) {
      const error = new Error('Bạn cần mua listing trước khi đánh giá');
      error.status = 403;
      throw error;
    }

    // Create/update review
    const review = await marketplaceReviewRepository.create({
      idUser: userId,
      listingId,
      rating,
      reviewText,
    });

    // Recalculate listing rating
    const stats = await marketplaceReviewRepository.getAverageRating(listingId);
    await marketplaceListingRepository.updateRating(listingId, stats.avg, stats.count);

    return review;
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
