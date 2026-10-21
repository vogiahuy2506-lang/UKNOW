import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import campaignCrudRepository from '../../repositories/campaign/campaignCrud.repository.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import landingPageRepository from '../../repositories/landingPage.repository.js';
import db from '../../config/database.js';
import {
  sanitizeLandingSnapshotForSharing,
  stripSellerPrivateLandingConfig,
} from '../../utils/marketplaceLandingSnapshot.util.js';
import {
  stripSellerBoundFlowJson,
  stripSellerBoundSnapshotNodes,
} from '../../utils/marketplaceCampaignSnapshot.util.js';
import marketplaceCampaignContentService from './marketplaceCampaignContent.service.js';
import {
  keepOwnedBlockAttachmentsInFlowJson,
  keepOwnedBlockAttachmentsInNodes,
} from '../../utils/marketplaceBlockAttachments.util.js';

// Mapping resource_type -> auto category (không cho user chọn category thủ công)
const AUTO_CATEGORY_MAP = {
  campaign: 'marketing',
  chatbot: 'chatbot',
  landing_page: 'landing',
};

// Phạm vi hiển thị của listing: chỉ 'public'. Giá trị 'team' từng có trong CSDL nhưng không có luật nào định nghĩa nó (browse / mua không xét
// visibility, giao diện không gửi trường này; production 20/10/2026: 10/10 listing public) — nhận 'team' là hứa một giới hạn không tồn tại.
export const ALLOWED_LISTING_VISIBILITIES = Object.freeze(['public']);

function assertListingVisibility(visibility) {
  if (!ALLOWED_LISTING_VISIBILITIES.includes(visibility)) {
    const error = new Error('Visibility chỉ nhận giá trị "public"');
    error.status = 400;
    throw error;
  }
}

class MarketplaceListingService {
  /**
   * Create a listing from a campaign
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createFromCampaign(userId, data) {
    const { campaignId, title, description, category: userCategory, tags, priceCredits, visibility, status } = data;

    // Validate campaignId
    if (!campaignId || !Number.isFinite(Number(campaignId)) || Number(campaignId) <= 0) {
      const error = new Error('campaignId không hợp lệ');
      error.status = 400;
      throw error;
    }

    // Auto category - không cho user chọn category thủ công
    const category = AUTO_CATEGORY_MAP.campaign;

    // Validate visibility
    if (visibility !== undefined) assertListingVisibility(visibility);

    // Validate priceCredits
    let sanitizedPrice = 0;
    if (priceCredits !== undefined && priceCredits !== null && priceCredits !== '') {
      const price = Number(priceCredits);
      if (!Number.isFinite(price) || price < 0) {
        const error = new Error('Price credits không hợp lệ');
        error.status = 400;
        throw error;
      }
      sanitizedPrice = Math.floor(price);
    }

    // Get campaign data. `allowShared: false` — chiến dịch người khác CHIA SẺ cho mình (xem/sửa được) không phải của mình:
    // đăng bán là đưa cả sơ đồ node + cấu hình của nó cho bất kỳ ai mua, nên chỉ chủ workspace mới được đăng.
    const campaign = await campaignCrudRepository.findCampaignById({
      campaignId,
      isAdmin: false,
      userId,
      allowShared: false,
    });

    if (!campaign) {
      const error = new Error('Chiến dịch không tồn tại');
      error.status = 404;
      throw error;
    }

    // Chiến dịch mua từ Marketplace không được bán lại (cùng quy tắc với chatbot).
    if (await marketplacePurchaseRepository.isClonedResourcePurchased('campaign', campaignId)) {
      const error = new Error('Không thể bán chiến dịch đã mua từ marketplace');
      error.status = 403;
      throw error;
    }

    // Get nodes and connections
    const nodes = await campaignCrudRepository.findNodesByCampaignId(campaignId);
    const connections = await campaignCrudRepository.findConnectionsByCampaignId(campaignId);

    // Create snapshot
    const rawSnapshotNodes = nodes.map(n => ({
      id: n.id,
      nodeType: n.node_type,
      nodeSubtype: n.node_subtype,
      nodeName: n.node_name,
      nodeDescription: n.node_description,
      positionX: n.position_x,
      positionY: n.position_y,
      config: n.config,
      executionOrder: n.execution_order,
    }));

    // Nội dung MẪU mà khối gửi thật sự dùng (email / Zalo) chụp vào snapshot: id mẫu trong config trỏ mẫu của NGƯỜI BÁN, mà đường gửi
    // lọc mẫu theo chủ chiến dịch — người mua chỉ gửi được nhờ bản sao mẫu tạo lúc mua. Mẫu bị xoá / không thuộc người bán → 400
    // (nêu tên khối), không đăng hàng hỏng.
    const templates = await marketplaceCampaignContentService.buildListingTemplates({
      sellerId: userId,
      nodes: rawSnapshotNodes,
    });

    // Snapshot không mang dữ liệu gắn người bán (tài khoản gửi, người nhận nhúng, nguồn dữ liệu…) — gỡ cả ở `nodes` lẫn `flowJson`
    // (trình dựng mở sơ đồ từ flow_json). Id mẫu giữ nguyên làm khoá tra `templates`; đổi sang id của người mua lúc mua.
    const snapshotData = {
      campaignName: campaign.campaign_name,
      campaignType: campaign.campaign_type,
      // Tệp đính kèm cấp khối: chỉ giữ tệp nằm trong không gian của người bán (danh sách chụp lúc đăng bán, như mẫu); khoá của chủ khác bị bỏ.
      flowJson: keepOwnedBlockAttachmentsInFlowJson(stripSellerBoundFlowJson(campaign.flow_json), userId),
      nodes: keepOwnedBlockAttachmentsInNodes(stripSellerBoundSnapshotNodes(rawSnapshotNodes), userId),
      connections: connections.map(c => ({
        id: c.id,
        sourceNodeId: c.source_node_id,
        targetNodeId: c.target_node_id,
        connectionType: c.connection_type,
        connectionLabel: c.connection_label,
        conditionConfig: c.condition_config,
      })),
      templates,
    };

    // Ensure title is not empty
    const finalTitle = (title?.trim() || campaign?.campaign_name?.trim() || '').substring(0, 255) || `Template ${campaignId}`;

    // Validate status nếu client gửi lên
    const VALID_STATUSES = ['draft', 'published', 'paused'];
    const finalStatus = status && VALID_STATUSES.includes(status)
      ? status
      : (visibility === 'public' ? 'published' : 'draft');

    return marketplaceListingRepository.create({
      idUser: userId,
      resourceType: 'campaign',
      resourceId: campaignId,
      title: finalTitle,
      description,
      category,
      tags,
      priceCredits: sanitizedPrice,
      visibility,
      status: finalStatus,
      snapshotData,
    });
  }

  /**
   * Create a listing from a chatbot
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createFromChatbot(userId, data) {
    const { chatbotId, title, description, category: userCategory, tags, priceCredits, visibility, includeKnowledgeBase, status } = data;

    // Validate chatbotId
    if (!chatbotId || !Number.isFinite(Number(chatbotId)) || Number(chatbotId) <= 0) {
      const error = new Error('chatbotId không hợp lệ');
      error.status = 400;
      throw error;
    }

    // Auto category - không cho user chọn category thủ công
    const category = AUTO_CATEGORY_MAP.chatbot;

    // Validate visibility
    if (visibility !== undefined) assertListingVisibility(visibility);

    // Validate priceCredits
    let sanitizedPrice = 0;
    if (priceCredits !== undefined && priceCredits !== null && priceCredits !== '') {
      const price = Number(priceCredits);
      if (!Number.isFinite(price) || price < 0) {
        const error = new Error('Price credits không hợp lệ');
        error.status = 400;
        throw error;
      }
      sanitizedPrice = Math.floor(price);
    }

    // Get chatbot data
    const chatbot = await chatbotRepository.findChatbotById(chatbotId);
    if (!chatbot) {
      const error = new Error('Chatbot không tồn tại');
      error.status = 404;
      throw error;
    }

    // Verify ownership. So bằng Number: `chatbot.id_user` là BIGINT nên pg trả CHUỖI ("146"), còn id chủ không gian của
    // nhân viên (auth.middleware activeContext.ownerId) là Number — `!==` thẳng thì nhân viên có quyền Marketplace luôn
    // nhận 403 dù bot đúng của công ty mình (S-15).
    if (Number(chatbot.id_user) !== Number(userId)) {
      const error = new Error('Bạn không có quyền tạo listing từ chatbot này');
      error.status = 403;
      throw error;
    }

    // Check if chatbot was purchased from marketplace (cannot sell purchased chatbots)
    const isPurchased = await marketplacePurchaseRepository.isChatbotPurchased(chatbotId);
    if (isPurchased) {
      const error = new Error('Không thể bán chatbot đã mua từ marketplace');
      error.status = 403;
      throw error;
    }

    // Chatbot người khác CHIA SẺ cho mình (origin = 'shared', chatbotClone.repository.js#cloneFromSource) là bản sao của bot
    // của chủ khác — không phải sản phẩm của mình để bán.
    if (chatbot.origin === 'shared') {
      const error = new Error('Không thể bán chatbot được chia sẻ từ tài khoản khác');
      error.status = 403;
      throw error;
    }

    // Check if chatbot already has a listing
    const existingListing = await marketplaceListingRepository.findByChatbotId(chatbotId);
    if (existingListing) {
      const error = new Error('Chatbot này đã có listing trên marketplace');
      error.status = 400;
      throw error;
    }

    // Get knowledge base chunks if requested
    let chunks = [];
    if (includeKnowledgeBase) {
      const { rows: chunkRows } = await db.query(
        `SELECT chunk_text, source, chunk_index
         FROM custom_chatbot_chunks
         WHERE chatbot_id = $1
         ORDER BY chunk_index`,
        [chatbotId]
      );
      chunks = chunkRows.map(row => ({
        chunkText: row.chunk_text,
        source: row.source,
        chunkIndex: row.chunk_index,
      }));
    }

    // Create snapshot
    const snapshotData = {
      chatbotName: chatbot.name,
      chatbotDescription: chatbot.description,
      systemInstruction: chatbot.system_instruction,
      greetingMsg: chatbot.greeting_msg,
      welcomeMessage: chatbot.welcome_message,
      aiModel: chatbot.ai_model || 'gemini-2.5-flash',
      temperature: chatbot.temperature || 0.7,
      maxTokens: chatbot.max_tokens || 2048,
      themeColor: chatbot.theme_color,
      position: chatbot.position,
      logoUrl: chatbot.logo_url,
      primaryColor: chatbot.primary_color,
      backgroundColor: chatbot.background_color,
      textColor: chatbot.text_color,
      accentColor: chatbot.accent_color,
      showAvatar: chatbot.show_avatar,
      borderRadius: chatbot.border_radius,
      chatHeight: chatbot.chat_height,
      suggestedQuestions: chatbot.suggested_questions || [],
      includeKnowledgeBase: !!includeKnowledgeBase,
      chunks,
    };

    // Ensure title is not empty
    const finalTitle = (title?.trim() || chatbot.name?.trim() || '').substring(0, 255) || `Chatbot ${chatbotId}`;

    return marketplaceListingRepository.create({
      idUser: userId,
      resourceType: 'chatbot',
      resourceId: chatbotId,
      title: finalTitle,
      description,
      category,
      tags,
      priceCredits: sanitizedPrice,
      visibility,
      status: status && ['draft', 'published', 'paused'].includes(status)
        ? status
        : (visibility === 'public' ? 'published' : 'draft'),
      snapshotData,
    });
  }

  /**
   * Build a safe, truncated preview of snapshot data for unpurchased users.
   * Strips sensitive configurations, full prompts, knowledge base chunks, etc.
   * @param {string} resourceType
   * @param {object} snapshotData
   * @returns {object|null}
   */
  _buildSafePreview(resourceType, snapshotData) {
    if (!snapshotData || typeof snapshotData !== 'object') {
      return null;
    }

    if (resourceType === 'landing_page') {
      const html = typeof snapshotData.htmlContent === 'string'
        ? snapshotData.htmlContent.substring(0, 500)
        : '';
      return {
        title: snapshotData.title || '',
        slug: snapshotData.slug || '',
        htmlContent: html,
        // Snapshot cũ đã lưu có thể còn khoá riêng của người bán (webhook Google Sheet...) — lọc lúc ĐỌC, không chỉ lúc tạo.
        customConfig: stripSellerPrivateLandingConfig(snapshotData.customConfig) || {},
      };
    }

    if (resourceType === 'campaign') {
      return {
        campaignName: snapshotData.campaignName || '',
        campaignType: snapshotData.campaignType || '',
        nodes: Array.isArray(snapshotData.nodes)
          ? snapshotData.nodes.map(n => ({
              id: n.id,
              nodeType: n.nodeType,
              nodeSubtype: n.nodeSubtype,
              nodeName: n.nodeName,
              positionX: n.positionX,
              positionY: n.positionY,
            }))
          : [],
        connections: Array.isArray(snapshotData.connections)
          ? snapshotData.connections
          : [],
      };
    }

    if (resourceType === 'chatbot') {
      return {
        chatbotName: snapshotData.chatbotName || '',
        chatbotDescription: typeof snapshotData.chatbotDescription === 'string'
          ? snapshotData.chatbotDescription.substring(0, 150)
          : '',
        systemInstruction: typeof snapshotData.systemInstruction === 'string'
          ? snapshotData.systemInstruction.substring(0, 100)
          : '',
        greetingMsg: snapshotData.greetingMsg || '',
        aiModel: snapshotData.aiModel || '',
        themeColor: snapshotData.themeColor,
        primaryColor: snapshotData.primaryColor,
        backgroundColor: snapshotData.backgroundColor,
        textColor: snapshotData.textColor,
        suggestedQuestions: Array.isArray(snapshotData.suggestedQuestions)
          ? snapshotData.suggestedQuestions.slice(0, 4)
          : [],
        includeKnowledgeBase: Boolean(snapshotData.includeKnowledgeBase),
        chunks: [],
      };
    }

    return null;
  }

  /**
   * Get listing by ID (increment view count unless viewer is the seller)
   * @param {number} id
   * @param {number} [viewerUserId] - Optional viewer; chính chủ không tính view
   * @returns {Promise<object|null>}
   */
  async getById(id, viewerUserId = null) {
    const listing = await marketplaceListingRepository.findById(id);
    if (!listing) return null;

    const isOwner = viewerUserId != null && Number(listing.id_user) === Number(viewerUserId);

    // Bản nháp (status != 'published') chỉ chủ xem được
    if (listing.status !== 'published' && !isOwner) {
      return null;
    }

    if (!isOwner) {
      // Tăng view nếu người xem không phải chính chủ listing
      await marketplaceListingRepository.incrementViewCount(id);
    }

    // Check if viewer has purchased
    let hasPurchased = false;
    if (viewerUserId && !isOwner) {
      hasPurchased = await this.hasPurchased(viewerUserId, id);
    }

    // Với người CHƯA mua và KHÔNG phải chủ: không trả snapshot_data, chỉ trả bản preview an toàn
    if (!isOwner && !hasPurchased) {
      if (listing.snapshot_data) {
        listing.preview_data = this._buildSafePreview(listing.resource_type, listing.snapshot_data);
        delete listing.snapshot_data;
      }
    } else if (!isOwner && listing.resource_type === 'landing_page' && listing.snapshot_data) {
      // Người ĐÃ MUA nhận nội dung đầy đủ nhưng KHÔNG nhận cấu hình riêng của người bán (webhook + secret Google Sheet, id biểu mẫu).
      listing.snapshot_data = sanitizeLandingSnapshotForSharing(listing.snapshot_data);
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
    // Validate title
    if (data.title !== undefined) {
      const title = String(data.title).trim();
      if (title.length === 0) {
        const error = new Error('Title không được để trống');
        error.status = 400;
        throw error;
      }
      if (title.length > 255) {
        const error = new Error('Title không được quá 255 ký tự');
        error.status = 400;
        throw error;
      }
      data.title = title;
    }

    // Validate description length
    if (data.description !== undefined && data.description !== null) {
      const desc = String(data.description);
      if (desc.length > 2000) {
        const error = new Error('Description không được quá 2000 ký tự');
        error.status = 400;
        throw error;
      }
    }

    // Validate category nếu được cập nhật (cho phép tất cả categories vì auto-assigned)
    // Categories: 'marketing', 'automation', 'support', 'landing'
    if (data.category !== undefined) {
      const VALID_CATEGORIES = ['marketing', 'chatbot', 'landing'];
      if (data.category !== null && data.category !== '' && !VALID_CATEGORIES.includes(data.category)) {
        const error = new Error('Category không hợp lệ');
        error.status = 400;
        throw error;
      }
    }
    // Validate visibility
    if (data.visibility !== undefined) assertListingVisibility(data.visibility);
    // Validate price credits
    if (data.priceCredits !== undefined) {
      const price = Number(data.priceCredits);
      if (!Number.isFinite(price) || price < 0) {
        const error = new Error('Price credits không hợp lệ');
        error.status = 400;
        throw error;
      }
      data.priceCredits = Math.floor(price);
    }
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

    if (Number(listing.id_user) !== Number(userId)) {
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
    const listing = await marketplaceListingRepository.findById(id);
    if (!listing) {
      const error = new Error('Listing không tồn tại');
      error.status = 404;
      throw error;
    }
    if (Number(listing.id_user) !== Number(userId)) {
      const error = new Error('Bạn không có quyền chỉnh sửa listing này');
      error.status = 403;
      throw error;
    }
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

  /**
   * Create a listing from a landing page
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createFromLandingPage(userId, data) {
    const { landingPageId, title, description, tags, priceCredits, visibility, status } = data;

    // Validate landingPageId
    if (!landingPageId || !Number.isFinite(Number(landingPageId)) || Number(landingPageId) <= 0) {
      const error = new Error('landingPageId không hợp lệ');
      error.status = 400;
      throw error;
    }

    // Auto category - không cho user chọn category thủ công
    const category = AUTO_CATEGORY_MAP.landing_page;

    // Validate visibility
    if (visibility !== undefined) assertListingVisibility(visibility);

    // Validate priceCredits
    let sanitizedPrice = 0;
    if (priceCredits !== undefined && priceCredits !== null && priceCredits !== '') {
      const price = Number(priceCredits);
      if (!Number.isFinite(price) || price < 0) {
        const error = new Error('Price credits không hợp lệ');
        error.status = 400;
        throw error;
      }
      sanitizedPrice = Math.floor(price);
    }

    // Get landing page data
    const landingPage = await landingPageRepository.findById(landingPageId);
    if (!landingPage) {
      const error = new Error('Landing page không tồn tại');
      error.status = 404;
      throw error;
    }

    // Verify ownership
    const ownerId = Number(landingPage.workspaceOwnerId || landingPage.idUser);
    // userId từ req.user.id là chuỗi (BIGINT) — chủ luôn bị 403 nếu so thẳng với Number.
    if (ownerId !== Number(userId)) {
      const error = new Error('Bạn không có quyền tạo listing từ landing page này');
      error.status = 403;
      throw error;
    }

    // Landing page mua từ Marketplace không được bán lại (cùng quy tắc với chatbot).
    if (await marketplacePurchaseRepository.isClonedResourcePurchased('landing_page', landingPageId)) {
      const error = new Error('Không thể bán landing page đã mua từ marketplace');
      error.status = 403;
      throw error;
    }

    // Check if landing page already has a listing
    const existingListing = await marketplaceListingRepository.findByLandingPageId(landingPageId);
    if (existingListing) {
      const error = new Error('Landing page này đã có listing trên marketplace');
      error.status = 400;
      throw error;
    }

    // Create snapshot
    const snapshotData = {
      title: landingPage.title || landingPage.slug,
      slug: landingPage.slug,
      htmlContent: landingPage.htmlContent || landingPage.html_content,
      // Không chép cấu hình riêng của người bán (webhook Google Sheet, id biểu mẫu) vào bản chia sẻ.
      customConfig: stripSellerPrivateLandingConfig(landingPage.customConfig || landingPage.custom_config),
    };

    // Ensure title is not empty
    const finalTitle = (title?.trim() || landingPage.title?.trim() || landingPage.slug?.trim() || '').substring(0, 255) || `Landing Page ${landingPageId}`;

    // Auto-assign tags based on landing page category if available
    const autoTags = tags || [];
    if (landingPage.customConfig?.category && !autoTags.includes(landingPage.customConfig.category)) {
      autoTags.push(landingPage.customConfig.category);
    }

    return marketplaceListingRepository.create({
      idUser: userId,
      resourceType: 'landing_page',
      resourceId: landingPageId,
      title: finalTitle,
      description,
      category,
      tags: autoTags.length > 0 ? autoTags : null,
      priceCredits: sanitizedPrice,
      visibility,
      status: status && ['draft', 'published', 'paused'].includes(status)
        ? status
        : (visibility === 'public' ? 'published' : 'draft'),
      snapshotData,
    });
  }
}

export default new MarketplaceListingService();
