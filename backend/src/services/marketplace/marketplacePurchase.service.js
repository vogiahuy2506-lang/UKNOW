import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import usageTrackingService from '../payment/usageTracking.service.js';
import campaignCrudService from '../campaign/campaignCrud.service.js';
import db from '../../config/database.js';

class MarketplacePurchaseService {
  /**
   * Purchase a listing
   * @param {number} listingId
   * @param {number} buyerId
   * @returns {Promise<object>}
   */
  async purchase(listingId, buyerId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // 1. Verify listing exists & published
      const listing = await marketplaceListingRepository.findByIdTx(client, listingId);
      if (!listing || listing.status !== 'published') {
        const error = new Error('Listing không tồn tại hoặc chưa publish');
        error.status = 404;
        throw error;
      }

      // 2. Check buyer hasn't purchased yet
      const existingPurchase = await marketplacePurchaseRepository.findByUserAndListingTx(
        client, buyerId, listingId
      );
      if (existingPurchase) {
        const error = new Error('Bạn đã mua listing này rồi');
        error.status = 400;
        throw error;
      }

      // 3. Check buyer != seller
      if (listing.id_user === buyerId) {
        const error = new Error('Bạn không thể mua listing của chính mình');
        error.status = 400;
        throw error;
      }

      // 4. Process credits if price > 0
      if (listing.price_credits > 0) {
        // Deduct credits from buyer
        await usageTrackingService.deductCredits(buyerId, listing.price_credits, {
          listing_id: listingId,
          listing_title: listing.title,
          seller_id: listing.id_user,
        }, client);

        // Add credits to seller (90% after platform fee)
        const sellerAmount = Math.floor(listing.price_credits * 0.9);
        await usageTrackingService.trackUsage(listing.id_user, 'ai_credit', sellerAmount, {
          type: 'marketplace_sale',
          listing_id: listingId,
          buyer_id: buyerId,
        }, client);
      }

      // 5. Clone resource
      let clonedResource;
      if (listing.resource_type === 'campaign') {
        clonedResource = await this._cloneCampaign(client, buyerId, listing);
      } else {
        clonedResource = await this._cloneChatbot(client, buyerId, listing);
      }

      // 6. Create purchase record
      await marketplacePurchaseRepository.createTx(client, {
        idUser: buyerId,
        listingId,
        sellerId: listing.id_user,
        creditsSpent: listing.price_credits,
        transactionType: 'purchase',
        clonedResourceId: clonedResource.id,
        clonedResourceType: listing.resource_type,
      });

      // 7. Update listing stats
      await marketplaceListingRepository.incrementPurchaseCountTx(client, listingId);

      await client.query('COMMIT');
      return { success: true, clonedResource };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clone campaign from listing snapshot
   * @private
   */
  async _cloneCampaign(client, userId, listing) {
    const snapshot = listing.snapshot_data;

    // Create new campaign
    const { rows: campaignRows } = await client.query(
      `INSERT INTO campaigns (id_user, campaign_name, description, campaign_type, flow_json, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING *`,
      [userId, snapshot.campaignName, listing.description, snapshot.campaignType, JSON.stringify(snapshot.flowJson)]
    );

    const newCampaign = campaignRows[0];

    // Clone nodes
    const nodeIdMap = new Map();
    for (const node of snapshot.nodes || []) {
      const { rows } = await client.query(
        `INSERT INTO campaign_nodes
         (id_campaign, node_type, node_subtype, node_name, node_description, position_x, position_y, config, execution_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [newCampaign.id, node.nodeType, node.nodeSubtype, node.nodeName, node.nodeDescription, node.positionX, node.positionY, node.config, node.executionOrder]
      );
      nodeIdMap.set(node.id, rows[0].id);
    }

    // Clone connections
    for (const conn of snapshot.connections || []) {
      const newSourceId = nodeIdMap.get(conn.sourceNodeId);
      const newTargetId = nodeIdMap.get(conn.targetNodeId);
      if (newSourceId && newTargetId) {
        await client.query(
          `INSERT INTO campaign_connections
           (id_campaign, source_node_id, target_node_id, connection_type, connection_label, condition_config)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newCampaign.id, newSourceId, newTargetId, conn.connectionType, conn.connectionLabel, conn.conditionConfig]
        );
      }
    }

    return { id: newCampaign.id, type: 'campaign' };
  }

  /**
   * Clone chatbot from listing snapshot
   * @private
   */
  async _cloneChatbot(client, userId, listing) {
    const snapshot = listing.snapshot_data;

    // Create new chatbot settings
    const { rows } = await client.query(
      `INSERT INTO chatbot_settings
       (id_user, channel, settings)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, snapshot.channel || 'webchat', JSON.stringify(snapshot.settings || {})]
    );

    return { id: rows[0].id, type: 'chatbot' };
  }

  /**
   * Get user's purchases
   * @param {number} userId
   * @param {object} options
   * @returns {Promise<object>}
   */
  async getUserPurchases(userId, options = {}) {
    const [purchases, total] = await Promise.all([
      marketplacePurchaseRepository.findByUserId(userId, options),
      marketplacePurchaseRepository.countByUserId(userId),
    ]);
    return { purchases, total };
  }
}

export default new MarketplacePurchaseService();
