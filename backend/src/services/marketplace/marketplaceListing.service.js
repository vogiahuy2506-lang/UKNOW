import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import campaignCrudRepository from '../../repositories/campaign/campaignCrud.repository.js';
import db from '../../config/database.js';

class MarketplaceListingService {
  /**
   * Create a listing from a campaign
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createFromCampaign(userId, data) {
    const { campaignId, title, description, category, tags, priceCredits, visibility } = data;

    // Get campaign data
    const campaign = await campaignCrudRepository.findCampaignById({
      campaignId,
      isAdmin: false,
      userId,
    });

    if (!campaign) {
      const error = new Error('Chiến dịch không tồn tại');
      error.status = 404;
      throw error;
    }

    // Get nodes and connections
    const nodes = await campaignCrudRepository.findNodesByCampaignId(campaignId);
    const connections = await campaignCrudRepository.findConnectionsByCampaignId(campaignId);

    // Create snapshot
    const snapshotData = {
      campaignName: campaign.campaign_name,
      campaignType: campaign.campaign_type,
      flowJson: campaign.flow_json,
      nodes: nodes.map(n => ({
        id: n.id,
        nodeType: n.node_type,
        nodeSubtype: n.node_subtype,
        nodeName: n.node_name,
        nodeDescription: n.node_description,
        positionX: n.position_x,
        positionY: n.position_y,
        config: n.config,
        executionOrder: n.execution_order,
      })),
      connections: connections.map(c => ({
        id: c.id,
        sourceNodeId: c.source_node_id,
        targetNodeId: c.target_node_id,
        connectionType: c.connection_type,
        connectionLabel: c.connection_label,
        conditionConfig: c.condition_config,
      })),
    };

    return marketplaceListingRepository.create({
      idUser: userId,
      resourceType: 'campaign',
      resourceId: campaignId,
      title: title || campaign.campaign_name,
      description,
      category,
      tags,
      priceCredits,
      visibility,
      snapshotData,
    });
  }

  /**
   * Get listing by ID
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async getById(id) {
    const listing = await marketplaceListingRepository.findById(id);
    if (listing) {
      // Increment view count
      await marketplaceListingRepository.incrementViewCount(id);
    }
    return listing;
  }

  /**
   * Get user's listings
   * @param {number} userId
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getUserListings(userId, filters = {}) {
    const [listings, total] = await Promise.all([
      marketplaceListingRepository.findByUserId(userId, filters),
      marketplaceListingRepository.countByUserId(userId, filters),
    ]);
    return { listings, total };
  }

  /**
   * Update listing
   * @param {number} id
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object|null>}
   */
  async update(id, userId, data) {
    return marketplaceListingRepository.update(id, userId, data);
  }

  /**
   * Delete listing
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async delete(id, userId) {
    return marketplaceListingRepository.delete(id, userId);
  }

  /**
   * Publish listing
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async publish(id, userId) {
    const listing = await marketplaceListingRepository.findById(id);
    if (!listing) {
      const error = new Error('Listing không tồn tại');
      error.status = 404;
      throw error;
    }

    if (listing.id_user !== userId) {
      const error = new Error('Bạn không có quyền chỉnh sửa listing này');
      error.status = 403;
      throw error;
    }

    return marketplaceListingRepository.update(id, userId, { status: 'published' });
  }

  /**
   * Pause listing
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async pause(id, userId) {
    return marketplaceListingRepository.update(id, userId, { status: 'paused' });
  }

  /**
   * Browse marketplace listings
   * @param {object} params
   * @returns {Promise<object>}
   */
  async browse(params) {
    const [listings, total] = await Promise.all([
      marketplaceListingRepository.browse(params),
      marketplaceListingRepository.countBrowse(params),
    ]);
    return { listings, total };
  }

  /**
   * Get featured listings
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async getFeatured(limit = 10) {
    return marketplaceListingRepository.getFeatured(limit);
  }

  /**
   * Get categories
   * @returns {Promise<object[]>}
   */
  async getCategories() {
    return marketplaceListingRepository.getCategories();
  }

  /**
   * Check if user has purchased a listing
   * @param {number} userId
   * @param {number} listingId
   * @returns {Promise<boolean>}
   */
  async hasPurchased(userId, listingId) {
    const purchase = await marketplacePurchaseRepository.findByUserAndListing(userId, listingId);
    return !!purchase;
  }
}

export default new MarketplaceListingService();
