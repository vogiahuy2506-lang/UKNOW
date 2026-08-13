import api from './api';

const MARKETPLACE_URL = '/marketplace';

export const marketplaceService = {
  // Listings management
  getMyListings(params = {}) {
    return api.get(`${MARKETPLACE_URL}/listings`, { params });
  },

  createListing(data) {
    return api.post(`${MARKETPLACE_URL}/listings`, data);
  },

  getListing(id) {
    return api.get(`${MARKETPLACE_URL}/listings/${id}`);
  },

  updateListing(id, data) {
    return api.put(`${MARKETPLACE_URL}/listings/${id}`, data);
  },

  deleteListing(id) {
    return api.delete(`${MARKETPLACE_URL}/listings/${id}`);
  },

  publishListing(id) {
    return api.post(`${MARKETPLACE_URL}/listings/${id}/publish`);
  },

  pauseListing(id) {
    return api.post(`${MARKETPLACE_URL}/listings/${id}/pause`);
  },

  // Browse
  browse(params = {}) {
    return api.get(`${MARKETPLACE_URL}/browse`, { params });
  },

  getFeatured(limit = 10) {
    return api.get(`${MARKETPLACE_URL}/featured`, { params: { limit } });
  },

  getCategories() {
    return api.get(`${MARKETPLACE_URL}/categories`);
  },

  // Purchase
  purchase(listingId) {
    return api.post(`${MARKETPLACE_URL}/purchase/${listingId}`);
  },

  getMyPurchases(params = {}) {
    return api.get(`${MARKETPLACE_URL}/purchases`, { params });
  },

  // Reviews
  createReview(listingId, data) {
    return api.post(`${MARKETPLACE_URL}/listings/${listingId}/reviews`, data);
  },

  getReviews(listingId, params = {}) {
    return api.get(`${MARKETPLACE_URL}/listings/${listingId}/reviews`, { params });
  },

  getMyReview(listingId) {
    return api.get(`${MARKETPLACE_URL}/listings/${listingId}/my-review`);
  },

  // Favorites
  getMyFavorites(params = {}) {
    return api.get(`${MARKETPLACE_URL}/favorites`, { params });
  },

  checkFavorite(listingId) {
    return api.get(`${MARKETPLACE_URL}/favorites/${listingId}/check`);
  },

  addFavorite(listingId) {
    return api.post(`${MARKETPLACE_URL}/favorites/${listingId}`);
  },

  removeFavorite(listingId) {
    return api.delete(`${MARKETPLACE_URL}/favorites/${listingId}`);
  },

  // Vote review as helpful
  voteReviewHelpful(reviewId) {
    return api.post(`${MARKETPLACE_URL}/reviews/${reviewId}/helpful`);
  },
};

export default marketplaceService;
