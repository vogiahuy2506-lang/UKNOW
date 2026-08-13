import marketplaceFavoriteRepository from '../../repositories/marketplace/marketplaceFavorite.repository.js';
import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';

class MarketplaceFavoriteService {
  /**
   * Add to favorites
   * @param {number} listingId
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async addFavorite(listingId, userId) {
    // Verify listing exists - dùng repository trực tiếp để KHÔNG tăng view_count khi favorite
    const listing = await marketplaceListingRepository.findById(listingId);
    if (!listing) {
      const error = new Error('Listing không tồn tại');
      error.status = 404;
      throw error;
    }

    return marketplaceFavoriteRepository.add(userId, listingId);
  }

  /**
   * Remove from favorites
   * @param {number} listingId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async removeFavorite(listingId, userId) {
    return marketplaceFavoriteRepository.remove(userId, listingId);
  }

  /**
   * Check if listing is favorited
   * @param {number} listingId
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async isFavorited(listingId, userId) {
    return marketplaceFavoriteRepository.isFavorited(userId, listingId);
  }

  /**
   * Get user's favorites
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getUserFavorites(userId, options = {}) {
    const [favorites, total] = await Promise.all([
      marketplaceFavoriteRepository.findByUserId(userId, options),
      marketplaceFavoriteRepository.countByUserId(userId),
    ]);
    return { favorites, total };
  }
}

export default new MarketplaceFavoriteService();
