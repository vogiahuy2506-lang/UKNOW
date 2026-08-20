import marketplaceListingRepository from '../../repositories/marketplace/marketplaceListing.repository.js';
import marketplacePurchaseRepository from '../../repositories/marketplace/marketplacePurchase.repository.js';
import campaignCrudRepository from '../../repositories/campaign/campaignCrud.repository.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
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

    // Validate campaignId
    if (!campaignId || !Number.isFinite(Number(campaignId)) || Number(campaignId) <= 0) {
      const error = new Error('campaignId không hợp lệ');
      error.status = 400;
      throw error;
    }

    // Validate category nếu được truyền
    if (category !== undefined && category !== null && category !== '') {
      const VALID_CATEGORIES = ['marketing', 'automation', 'support'];
      if (!VALID_CATEGORIES.includes(category)) {
        const error = new Error('Category không hợp lệ');
        error.status = 400;
        throw error;
      }
    }

    // Validate visibility
    if (visibility !== undefined) {
      const VALID_VISIBILITIES = ['public', 'team'];
      if (!VALID_VISIBILITIES.includes(visibility)) {
        const error = new Error('Visibility không hợp lệ');
        error.status = 400;
        throw error;
      }
    }

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

    // Ensure title is not empty
    const finalTitle = (title?.trim() || campaign?.campaign_name?.trim() || '').substring(0, 255) || `Template ${campaignId}`;
    
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
      status: visibility === 'public' ? 'published' : 'draft',
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
    const { chatbotId, title, description, category, tags, priceCredits, visibility, includeKnowledgeBase } = data;

    // Validate chatbotId
    if (!chatbotId || !Number.isFinite(Number(chatbotId)) || Number(chatbotId) <= 0) {
      const error = new Error('chatbotId không hợp lệ');
      error.status = 400;
      throw error;
    }

    // Validate category
    if (category !== undefined && category !== null && category !== '') {
      const VALID_CATEGORIES = ['marketing', 'automation', 'support'];
      if (!VALID_CATEGORIES.includes(category)) {
        const error = new Error('Category không hợp lệ');
        error.status = 400;
        throw error;
      }
    }

    // Validate visibility
    if (visibility !== undefined) {
      const VALID_VISIBILITIES = ['public', 'team'];
      if (!VALID_VISIBILITIES.includes(visibility)) {
        const error = new Error('Visibility không hợp lệ');
        error.status = 400;
        throw error;
      }
    }

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

    // Verify ownership
    if (chatbot.id_user !== userId) {
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
      status: visibility === 'public' ? 'published' : 'draft',
      snapshotData,
    });
  }

  /**
   * Get listing by ID (increment view count unless viewer is the seller)
   * @param {number} id
   * @param {number} [viewerUserId] - Optional viewer; chính chủ không tính view
   * @returns {Promise<object|null>}
   */
  async getById(id, viewerUserId = null) {
    const listing = await marketplaceListingRepository.findById(id);
    if (listing && Number(listing.id_user) !== Number(viewerUserId)) {
      // Tăng view nếu người xem không phải chính chủ listing
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

    // Validate category nếu được cập nhật
    if (data.category !== undefined) {
      const VALID_CATEGORIES = ['marketing', 'automation', 'support'];
      if (data.category !== null && data.category !== '' && !VALID_CATEGORIES.includes(data.category)) {
        const error = new Error('Category không hợp lệ');
        error.status = 400;
        throw error;
      }
    }
    // Validate visibility
    if (data.visibility !== undefined) {
      const VALID_VISIBILITIES = ['public', 'team'];
      if (!VALID_VISIBILITIES.includes(data.visibility)) {
        const error = new Error('Visibility không hợp lệ');
        error.status = 400;
        throw error;
      }
    }
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
