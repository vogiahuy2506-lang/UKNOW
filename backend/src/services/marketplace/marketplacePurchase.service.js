import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import aiCreditMeter from '../ai/aiCreditMeter.service.js';
import marketplaceWalletService from './marketplaceWallet.service.js';
import db from '../../config/database.js';
import { checkUserResourceLimit, enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';
import { getWalletBalance } from '../../repositories/payment/topup.repository.js';
import chatbotCloneRepository from '../../repositories/ai/chatbotClone.repository.js';
import { assertChatbotSlotAvailable } from '../ai/chatbotSlot.service.js';
import campaignNodeReferences from '../campaign/campaignNodeReferences.service.js';
import marketplaceCampaignContentService from './marketplaceCampaignContent.service.js';
import {
  sanitizeLandingSnapshotForSharing,
  stripSellerPrivateLandingConfig,
} from '../../utils/marketplaceLandingSnapshot.util.js';
import {
  stripSellerBoundFlowJson,
  stripSellerBoundNodeConfig,
} from '../../utils/marketplaceCampaignSnapshot.util.js';
import {
  createTemplateIdMaps,
  remapTemplateIdsInConfig,
  remapTemplateIdsInFlowJson,
} from '../../utils/campaignTemplateReference.util.js';
import { neutralizeAppFormLinks, replaceFormEmbedsWithSlots } from '../../utils/landingHtmlInjection.util.js';
import {
  remapBlockAttachments,
  remapBlockAttachmentsInFlowJson,
  collectBlockAttachments,
} from '../../utils/marketplaceBlockAttachments.util.js';

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
   * @param {{ roleCode?: string|null }} [options] roleCode: vai của người mua (super admin bỏ qua trần chatbot)
   * @returns {Promise<object>}
   */
  async purchase(listingId, buyerId, { roleCode } = {}) {
    const client = await db.getClient();
    // Tệp đã chép sang kho của người mua (chiến dịch kèm mẫu có tệp đính kèm): nằm NGOÀI transaction DB nên phải tự dọn khi rollback.
    const copiedKeys = [];

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
      if (Number(listing.id_user) === Number(buyerId)) {
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

      // 4b. Check chatbot limit BEFORE trừ credit + cloning (chỉ kiểm tra nếu listing là chatbot). Dùng chung hàm với
      // cổng tạo chatbot (đếm chatbot đang hoạt động vs trần gói + slot mua thêm), trong CÙNG transaction + khoá tư vấn
      // để hai lượt mua song song của một người không cùng lọt qua "còn 1 suất". Ném CHATBOT_LIMIT_EXCEEDED.
      if (listing.resource_type === 'chatbot') {
        await assertChatbotSlotAvailable(buyerId, { client, roleCode });
      }

      // 4c. Chiến dịch: gom nội dung mẫu đi kèm (snapshot, hoặc mẫu sống của người bán với listing cũ) và chặn bán hàng hỏng — thiếu
      // mẫu / mất tệp đính kèm → LISTING_CONTENT_UNAVAILABLE; không đủ dung lượng cho tệp → MARKETPLACE_STORAGE_QUOTA_EXCEEDED —
      // TRƯỚC khi trừ credit. Bước này không ghi gì, không chép tệp.
      let preparedContent = null;
      if (listing.resource_type === 'campaign') {
        preparedContent = await marketplaceCampaignContentService.prepareForPurchase({ client, listing, buyerId });
        // 4d. Mua chiến dịch kèm mẫu TẠO bản sao mẫu email / Zalo cho người mua → phải nằm trong trần số mẫu của gói (trước đây không áp trần,
        // mua là vượt). Kiểm TRƯỚC khi trừ credit, cùng khoá tư vấn với cổng tạo mẫu nên hai lượt song song không cùng lọt qua.
        await this._assertTemplateCapacity(client, buyerId, preparedContent, roleCode);
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

        // Add earnings to seller wallet (90% after platform fee)
        const sellerAmount = Math.floor(listing.price_credits * 0.9);
        await marketplaceWalletService.creditSeller(client, listing.id_user, sellerAmount);
      }

      // 6. Clone resource
      let clonedResource;
      if (listing.resource_type === 'campaign') {
        clonedResource = await this._cloneCampaign(client, buyerId, listing, preparedContent, copiedKeys);
      } else if (listing.resource_type === 'chatbot') {
        clonedResource = await this._cloneChatbot(client, buyerId, listing);
      } else {
        clonedResource = await this._cloneLandingPage(client, buyerId, listing);
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
      await marketplaceCampaignContentService.discardCopiedFiles(copiedKeys);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Số mẫu email / Zalo sắp được tạo cho người mua (`prepared.sources`) cộng số đang có phải ≤ trần mẫu của gói (+ slot mua thêm).
   * Không có mẫu nào cần tạo thì không kiểm. Vượt → 400 `TEMPLATE_LIMIT_EXCEEDED` (nêu cần bao nhiêu, còn chỗ bao nhiêu).
   * @private
   */
  async _assertTemplateCapacity(client, buyerId, prepared, roleCode) {
    const needs = [
      ['emailTemplates', prepared?.sources?.email?.size || 0],
      ['zaloTemplates', prepared?.sources?.zalo?.size || 0],
    ];
    for (const [resourceKey, adding] of needs) {
      if (!(adding > 0)) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await enforceResourceLimitTx(client, { userId: buyerId, roleCode, resourceKey, adding });
      } catch (limitError) {
        if (limitError?.code !== 'RESOURCE_LIMIT_EXCEEDED') throw limitError;
        const error = new Error(limitError.message);
        error.status = 400;
        error.code = 'TEMPLATE_LIMIT_EXCEEDED';
        error.resource = resourceKey;
        throw error;
      }
    }
  }

  /**
   * Cấu hình một khối của snapshot → cấu hình cho người mua: gỡ dữ liệu gắn người bán (tài khoản gửi, danh sách người nhận, nguồn dữ
   * liệu…) rồi đổi id mẫu của người bán sang id bản sao của người mua. Cùng một hàm cho `campaign_nodes.config` và `flow_json`.
   * @private
   */
  _buyerNodeConfig(subtype, config, templateMaps, blockFileMap = null, sellerId = null) {
    const remapped = remapTemplateIdsInConfig(subtype, stripSellerBoundNodeConfig(subtype, config), templateMaps);
    // Tệp đính kèm cấp khối: đổi sang tệp đã chép cho người mua; tệp không chép được (không thuộc người bán) bị bỏ — để lại khoá người bán
    // thì bộ chạy bỏ qua tệp mà người mua không hay.
    return blockFileMap ? remapBlockAttachments(remapped, sellerId, blockFileMap) : remapped;
  }

  /**
   * Clone campaign from listing snapshot.
   * Snapshot phải chứa nodes (với id) và connections (với sourceNodeId/targetNodeId).
   * Bỏ qua connections nếu thiếu node tương ứng (defensive — bản cũ có thể đã lỡ).
   *
   * @param {object} client client của transaction mua
   * @param {number|string} userId người mua (chủ workspace)
   * @param {object} listing
   * @param {object|null} [preparedContent] kết quả `marketplaceCampaignContentService.prepareForPurchase` (null = không kèm mẫu)
   * @param {string[]} [copiedKeys] nhận các khoá tệp đã chép sang kho người mua để người gọi dọn khi rollback
   * @private
   */
  async _cloneCampaign(client, userId, listing, preparedContent = null, copiedKeys = []) {
    const snapshot = listing.snapshot_data || {};

    // Bản sao mẫu của người mua (+ tệp đính kèm) → bản đồ id mẫu cũ → mới. Không có mẫu nào cần chép thì bản đồ rỗng.
    const { maps: templateMaps } = preparedContent
      ? await marketplaceCampaignContentService.materializeTemplates(client, { buyerId: userId, prepared: preparedContent, copiedKeys })
      : { maps: createTemplateIdMaps() };

    // Tệp đính kèm cấp khối (email `attachments`, Zalo nhóm `zaloGroupAttachments`, Telegram/WhatsApp `steps[].attachments`): chép sang kho người
    // mua, bản đồ khoá người bán → tệp mới. Luôn có bản đồ (có thể rỗng) để tệp không thuộc người bán bị bỏ khỏi cấu hình.
    const { keyMap: blockFileMap } = preparedContent?.blockFiles?.size > 0
      ? await marketplaceCampaignContentService.materializeBlockAttachments(client, { buyerId: userId, prepared: preparedContent, copiedKeys })
      : { keyMap: new Map() };
    const sellerId = listing.id_user;

    // flow_json là NGUỒN HIỂN THỊ của trình dựng (config trong đó đè lên campaign_nodes) và được ghi ngược khi lưu, nên phải gỡ dữ liệu
    // người bán + đổi id mẫu ở đây giống hệt campaign_nodes. Id khối trong flow_json giữ nguyên (cùng không gian id với cạnh của nó).
    const flowJson = snapshot.flowJson
      ? remapBlockAttachmentsInFlowJson(
        remapTemplateIdsInFlowJson(stripSellerBoundFlowJson(snapshot.flowJson), templateMaps),
        sellerId,
        blockFileMap
      )
      : { nodes: [], connections: [] };

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
        JSON.stringify(flowJson),
      ]
    );

    const newCampaign = campaignRows[0];

    // Clone nodes (bỏ qua node không hợp lệ)
    const nodeIdMap = new Map();
    const blockFileLedgerLinked = new Set();
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    const buyerConfigs = new Map();
    for (const node of nodes) {
      if (!node || node.id == null) continue;
      const buyerConfig = node.config
        ? this._buyerNodeConfig(node.nodeSubtype, node.config, templateMaps, blockFileMap, sellerId)
        : node.config;
      buyerConfigs.set(String(node.id), buyerConfig);
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
          buyerConfig ? JSON.stringify(buyerConfig) : null,
          Number.isFinite(node.executionOrder) ? node.executionOrder : null,
        ]
      );
      nodeIdMap.set(String(node.id), rows[0].id);
      // Sổ dung lượng của tệp cấp khối: gắn dòng sổ vào khối đầu tiên dùng tệp (chỉ là nhãn tham chiếu cho thư viện tệp; dòng sổ đã ghi lúc chép).
      for (const attachment of collectBlockAttachments(buyerConfig)) {
        if (!attachment?.key || blockFileLedgerLinked.has(attachment.key)) continue;
        blockFileLedgerLinked.add(attachment.key);
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `UPDATE storage_objects SET reference_id = $2, updated_at = NOW()
            WHERE storage_key = $1 AND owner_user_id = $3 AND reference_type = 'campaign_node' AND reference_id IS NULL`,
          [attachment.key, String(rows[0].id), userId]
        );
      }
    }

    // Lượt 2 — snapshot chứa config nguyên văn của khối gốc; tham chiếu giữa các khối (zaloGroupNodeId, recipientNodeId,
    // templateMappings[].nodeId…) trỏ id khối của chiến dịch người bán → đổi sang id khối vừa tạo, không thì mỗi lượt mua
    // sinh thêm một chiến dịch hụt nguồn. Khoá/giá trị đều là chuỗi (BIGSERIAL pg trả chuỗi, snapshot có thể lưu số).
    const referenceIdMap = new Map(
      [...nodeIdMap.entries()].map(([oldId, newId]) => [String(oldId), String(newId)])
    );
    for (const node of nodes) {
      if (!node || node.id == null || !node.config) continue;
      const buyerConfig = buyerConfigs.get(String(node.id));
      const nextConfig = campaignNodeReferences.remapNodeReferencesDeep(buyerConfig, referenceIdMap);
      if (nextConfig === buyerConfig) continue;
      await client.query(
        'UPDATE campaign_nodes SET config = $1 WHERE id = $2',
        [JSON.stringify(nextConfig), nodeIdMap.get(String(node.id))]
      );
    }

    // Clone connections — bỏ qua nếu source/target không có trong node map
    const connections = Array.isArray(snapshot.connections) ? snapshot.connections : [];
    for (const conn of connections) {
      if (!conn) continue;
      const newSourceId = nodeIdMap.get(String(conn.sourceNodeId));
      const newTargetId = nodeIdMap.get(String(conn.targetNodeId));
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
   * Clone landing page từ listing snapshot.
   * @private
   */
  async _cloneLandingPage(client, userId, listing) {
    const snapshot = listing.snapshot_data || {};
    // Snapshot đã lưu trước đây có thể còn khoá riêng của người bán (webhook Google Sheet — lead của NGƯỜI MUA sẽ bị đẩy về Sheet
    // của người bán — và id biểu mẫu của người bán): lọc ngay lúc clone.
    const customConfig = stripSellerPrivateLandingConfig(snapshot.customConfig || snapshot.custom_config);
    // Khối nhúng biểu mẫu của người bán (`data-founderai-form="<publicKey>"`) trỏ tới biểu mẫu CÔNG KHAI của người bán: để nguyên thì
    // trang của người mua hiện biểu mẫu của người bán và bài nộp của khách người mua chảy về người bán. Đổi thành chỗ trống — lúc người
    // mua lưu trang, hệ thống tạo biểu mẫu thuộc về người mua (landingPageAdmin.service.js).
    // Liên kết `<a href=".../f/<key>">` người bán tự đặt (mở biểu mẫu của người bán) → `href="#"`, giữ chữ; chỉ lúc clone, landing của chính chủ giữ nguyên.
    const htmlContent = neutralizeAppFormLinks(
      replaceFormEmbedsWithSlots(snapshot.htmlContent || snapshot.html_content || '')
    );

    // Tạo landing page mới
    const { rows } = await client.query(
      `INSERT INTO landing_pages (id_user, title, slug, html_content, custom_config, is_published)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id`,
      [
        userId,
        snapshot.title || 'Imported Landing Page',
        `${snapshot.slug || 'landing'}-${Date.now()}`,
        htmlContent,
        customConfig ? JSON.stringify(customConfig) : '{}',
      ]
    );

    return { id: rows[0].id, type: 'landing_page' };
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
      marketplacePurchaseRepository.countByUserId(userId, { resourceType: options.resourceType }),
    ]);
    // Danh sách đã mua kèm `snapshot_data` đầy đủ: với landing, bỏ cấu hình riêng của người bán (snapshot cũ có thể còn khoá đó).
    const sanitized = purchases.map((purchase) => (
      purchase.resource_type === 'landing_page' && purchase.snapshot_data
        ? { ...purchase, snapshot_data: sanitizeLandingSnapshotForSharing(purchase.snapshot_data) }
        : purchase
    ));
    return { purchases: sanitized, total };
  }
}

export default new MarketplacePurchaseService();
