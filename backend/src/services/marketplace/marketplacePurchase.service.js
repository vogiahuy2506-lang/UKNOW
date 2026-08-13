import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import usageTrackingService from '../payment/usageTracking.service.js';
import campaignCrudService from '../campaign/campaignCrud.service.js';
import db from '../../config/database.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';

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

      // 4. Check campaign limit BEFORE cloning (chỉ kiểm tra nếu listing là campaign)
      if (listing.resource_type === 'campaign') {
        const limitCheck = await checkUserResourceLimit({
          userId: buyerId,
          resourceKey: 'campaigns',
        });
        if (!limitCheck.allowed) {
          const error = new Error(limitCheck.message);
          error.status = 400;
          error.code = 'CAMPAIGN_LIMIT_EXCEEDED';
          throw error;
        }
      }

      // 5. Process credits if price > 0 (sau khi check limit)
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

      // 6. Clone resource
      let clonedResource;
      if (listing.resource_type === 'campaign') {
        clonedResource = await this._cloneCampaign(client, buyerId, listing);
      } else {
        clonedResource = await this._cloneChatbot(client, buyerId, listing);
      }

      // 6. Create purchase record FIRST to get ID
      const purchaseRecord = await marketplacePurchaseRepository.createTx(client, {
        idUser: buyerId,
        listingId,
        sellerId: listing.id_user,
        creditsSpent: listing.price_credits,
        transactionType: 'purchase',
        clonedResourceId: clonedResource.id,
        clonedResourceType: listing.resource_type,
      });

      // 7. Link cloned campaign to purchase record (for marketplace_purchased tracking)
      if (listing.resource_type === 'campaign') {
        await client.query(
          `UPDATE campaigns SET marketplace_purchase_id = $1 WHERE id = $2`,
          [purchaseRecord.id, clonedResource.id]
        );
      }

      // 8. Update listing stats
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
   * Clone campaign from listing snapshot.
   * Snapshot phải chứa nodes (với id) và connections (với sourceNodeId/targetNodeId).
   * Bỏ qua connections nếu thiếu node tương ứng (defensive — bản cũ có thể đã lỡ).
   * @private
   */
  async _cloneCampaign(client, userId, listing) {
    const snapshot = listing.snapshot_data || {};

    // Tạo campaign mới. flow_json lưu trực tiếp để giữ nguyên trạng thái.
    // marketplace_purchase_id sẽ được SET bởi trigger sau khi INSERT
    const { rows: campaignRows } = await client.query(
      `INSERT INTO campaigns (id_user, campaign_name, description, campaign_type, flow_json, status, origin)
       VALUES ($1, $2, $3, $4, $5, 'draft', 'self_created')
       RETURNING *`,
      [
        userId,
        snapshot.campaignName || 'Imported Campaign',
        listing.description || null,
        snapshot.campaignType || 'email',
        JSON.stringify(snapshot.flowJson || { nodes: [], connections: [] }),
      ]
    );

    const newCampaign = campaignRows[0];

    // Clone nodes (bỏ qua node không hợp lệ)
    const nodeIdMap = new Map();
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    for (const node of nodes) {
      if (!node || node.id == null) continue;
      const { rows } = await client.query(
        `INSERT INTO campaign_nodes
         (id_campaign, node_type, node_subtype, node_name, node_description, position_x, position_y, config, execution_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          newCampaign.id,
          node.nodeType || 'unknown',
          node.nodeSubtype || null,
          node.nodeName || null,
          node.nodeDescription || null,
          node.positionX ?? 0,
          node.positionY ?? 0,
          node.config ? JSON.stringify(node.config) : null,
          Number.isFinite(node.executionOrder) ? node.executionOrder : null,
        ]
      );
      nodeIdMap.set(node.id, rows[0].id);
    }

    // Clone connections — bỏ qua nếu source/target không có trong node map
    const connections = Array.isArray(snapshot.connections) ? snapshot.connections : [];
    for (const conn of connections) {
      if (!conn) continue;
      const newSourceId = nodeIdMap.get(conn.sourceNodeId);
      const newTargetId = nodeIdMap.get(conn.targetNodeId);
      if (!newSourceId || !newTargetId) continue; // defensive skip
      await client.query(
        `INSERT INTO campaign_connections
         (id_campaign, source_node_id, target_node_id, connection_type, connection_label, condition_config)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newCampaign.id,
          newSourceId,
          newTargetId,
          conn.connectionType || null,
          conn.connectionLabel || null,
          conn.conditionConfig ? JSON.stringify(conn.conditionConfig) : null,
        ]
      );
    }

    return { id: newCampaign.id, type: 'campaign' };
  }

  /**
   * Clone chatbot from listing snapshot
   * Snapshot phải chứa toàn bộ config của chatbot_settings (channel, settings,
   * system_instruction, welcome_message, ai_model, ...). Mọi field quan trọng
   * đều phải được copy sang bản ghi mới, không chỉ vào `settings` JSONB.
   * @private
   */
  async _cloneChatbot(client, userId, listing) {
    const snapshot = listing.snapshot_data || {};
    const settings = snapshot.settings || {};

    // Channel whitelist — chỉ nhận các channel đã biết, fallback webchat
    const VALID_CHANNELS = ['webchat', 'zalo', 'messenger', 'web'];
    const channel = VALID_CHANNELS.includes(snapshot.channel) ? snapshot.channel : 'webchat';

    const { rows } = await client.query(
      `INSERT INTO chatbot_settings
       (id_user, channel, id_sub_assistant, is_enabled, welcome_message,
        ai_model, temperature, max_tokens, response_style, system_instruction, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        channel,
        snapshot.id_sub_assistant ?? null,
        snapshot.is_enabled !== undefined ? snapshot.is_enabled : true,
        snapshot.welcome_message ?? null,
        snapshot.ai_model || 'gemini-2.5-flash',
        snapshot.temperature ?? 0.7,
        snapshot.max_tokens ?? 2048,
        snapshot.response_style || 'friendly',
        snapshot.system_instruction ?? null,
        JSON.stringify(settings),
      ]
    );

    const newChatbot = rows[0];

    // Clone knowledge base chunks nếu snapshot có
    const chunks = Array.isArray(snapshot.chunks) ? snapshot.chunks : [];
    for (const chunk of chunks) {
      if (!chunk || typeof chunk.chunk_text !== 'string') continue;
      await client.query(
        `INSERT INTO custom_chatbot_chunks
         (chatbot_id, chunk_text, source, chunk_index, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          newChatbot.id,
          chunk.chunk_text,
          chunk.source || null,
          Number.isFinite(chunk.chunk_index) ? chunk.chunk_index : null,
          chunk.metadata ? JSON.stringify(chunk.metadata) : null,
        ]
      );
    }

    return { id: newChatbot.id, type: 'chatbot' };
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
