import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import usageTrackingService from '../payment/usageTracking.service.js';
import aiCreditMeter, { AI_CREDIT_RESOURCE } from '../ai/aiCreditMeter.service.js';
import campaignCrudService from '../campaign/campaignCrud.service.js';
import db from '../../config/database.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';
import { getWalletBalance } from '../../repositories/payment/topup.repository.js';
import chatbotCloneRepository from '../../repositories/ai/chatbotClone.repository.js';

class MarketplacePurchaseService {
  /**
   * Check if user has enough AI credits for purchase (uses same logic as aiCreditMeter).
   * Returns { hasEnough: boolean, available: number, limit: number, walletRemaining: number }
   */
  async _checkCreditAvailability(userId, amount) {
    const ctx = await aiCreditMeter.resolveCreditContext(userId, { forceBillable: true });
    if (ctx.skip) {
      return { hasEnough: true, available: Infinity, limit: Infinity, walletRemaining: 0 };
    }

    // For billOnly context (no plan limit), check wallet only
    if (ctx.billOnly) {
      const wallet = await getWalletBalance(ctx.billingUserId, 'ai_credits');
      const walletRemaining = Number(wallet?.remaining || 0);
      const hasEnough = walletRemaining >= amount;
      return { hasEnough, available: walletRemaining, limit: 0, walletRemaining, ctx };
    }

    const used = Number(ctx.used || 0);
    const limit = Number(ctx.limit || 0);
    const walletRemaining = Number(ctx.walletRemaining || 0);
    const planAvailable = Math.max(0, limit - used);
    const totalAvailable = planAvailable + walletRemaining;
    const hasEnough = totalAvailable >= amount;

    return { hasEnough, available: totalAvailable, limit, used, walletRemaining, ctx };
  }

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

      // 4b. Check chatbot limit BEFORE cloning (chỉ kiểm tra nếu listing là chatbot)
      if (listing.resource_type === 'chatbot') {
        const limitCheck = await checkUserResourceLimit({
          userId: buyerId,
          resourceKey: 'chatbots',
        });
        if (!limitCheck.allowed) {
          const error = new Error(limitCheck.message);
          error.status = 400;
          error.code = 'CHATBOT_LIMIT_EXCEEDED';
          throw error;
        }
      }

      // 5. Process credits if price > 0 (sau khi check limit)
      if (listing.price_credits > 0) {
        const amount = listing.price_credits;

        // Check availability using same logic as aiCreditMeter
        const check = await this._checkCreditAvailability(buyerId, amount);
        if (!check.hasEnough) {
          const error = new Error(
            `Không đủ credits. Bạn có ${check.available} credits, cần ${amount} credits cho listing này.`
          );
          error.status = 400;
          error.code = 'INSUFFICIENT_CREDITS';
          error.available = check.available;
          error.required = amount;
          throw error;
        }

        // Deduct credits using aiCreditMeter (handles plan + wallet correctly)
        // aiCreditMeter.deductCredits already tracks usage and debits wallet
        await aiCreditMeter.deductCredits(buyerId, amount, {
          feature: `marketplace_purchase:${listingId}`,
          ctx: check.ctx,
          externalClient: client,
        });

        // Add credits to seller (90% after platform fee)
        const sellerAmount = Math.floor(listing.price_credits * 0.9);
        await usageTrackingService.trackUsage(listing.id_user, AI_CREDIT_RESOURCE, sellerAmount, {
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

      // 7b. Link cloned chatbot to purchase record (for marketplace_purchased tracking)
      if (listing.resource_type === 'chatbot') {
        await client.query(
          `UPDATE custom_chatbots SET widget_key = $1 WHERE id = $2`,
          [`chatbot_${clonedResource.id}`, clonedResource.id]
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
   * Clone chatbot từ listing snapshot.
   * Ủy quyền cho chatbotCloneRepository.cloneFromSnapshot để đảm bảo 1 đường
   * clone duy nhất giữa marketplace purchase và share.
   * @private
   */
  async _cloneChatbot(client, userId, listing) {
    return chatbotCloneRepository.cloneFromSnapshot(client, userId, listing?.snapshot_data || {});
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
