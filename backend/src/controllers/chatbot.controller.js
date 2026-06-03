import knowledgeBaseService from '../services/chatbot/knowledgeBase.service.js';
import subAssistantService from '../services/chatbot/subAssistant.service.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import zaloOAAdapter from '../services/chatbot/channelAdapters/zaloOA.adapter.js';
import facebookAdapter from '../services/chatbot/channelAdapters/facebook.adapter.js';
import db from '../config/database.js';
import uploadController from './upload.controller.js';

class ChatbotController {
  // ── Knowledge Base ─────────────────────────────────────────────

  async listKBs(req, res) {
    try {
      const kbs = await knowledgeBaseService.getKBs(req.user.id);
      return res.json({ success: true, data: kbs });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getKB(req, res) {
    try {
      const kb = await knowledgeBaseService.getKBById(parseInt(req.params.id), req.user.id);
      if (!kb) return res.status(404).json({ success: false, message: 'Knowledge base not found' });
      return res.json({ success: true, data: kb });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async createKB(req, res) {
    try {
      const kb = await knowledgeBaseService.createKB(req.user.id, req.body);
      return res.status(201).json({ success: true, data: kb });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateKB(req, res) {
    try {
      const kb = await knowledgeBaseService.updateKB(parseInt(req.params.id), req.user.id, req.body);
      if (!kb) return res.status(404).json({ success: false, message: 'Knowledge base not found' });
      return res.json({ success: true, data: kb });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteKB(req, res) {
    try {
      const deleted = await knowledgeBaseService.deleteKB(parseInt(req.params.id), req.user.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Knowledge base not found' });
      return res.json({ success: true, message: 'Knowledge base deleted' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── KB Documents ──────────────────────────────────────────────

  async listDocuments(req, res) {
    try {
      const docs = await knowledgeBaseService.getDocuments(parseInt(req.params.kbId), req.user.id);
      return res.json({ success: true, data: docs });
    } catch (err) {
      return res.status(err.message.includes('not found') ? 404 : 500)
        .json({ success: false, message: err.message });
    }
  }

  async uploadDocument(req, res) {
    try {
      const kbId = parseInt(req.params.kbId);
      const kb = await knowledgeBaseService.getKBById(kbId, req.user.id);
      if (!kb) return res.status(404).json({ success: false, message: 'Knowledge base not found' });

      const file = req.file;
      if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

      const title = req.body.title || file.originalname;
      const doc = await knowledgeBaseService.addDocument(kbId, req.user.id, {
        title,
        source_type: 'file',
        file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
      });

      // Process asynchronously
      knowledgeBaseService.processDocument(doc.id, kbId, req.user.id, {
        chunkSize: kb.chunk_size,
        chunkingMode: kb.chunking_mode,
      }).catch(err => {
        console.error(`[KB] Background processing failed for doc ${doc.id}:`, err.message);
      });

      return res.status(201).json({
        success: true,
        data: doc,
        message: 'Document uploaded and processing started',
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async addTextDocument(req, res) {
    try {
      const kbId = parseInt(req.params.kbId);
      const kb = await knowledgeBaseService.getKBById(kbId, req.user.id);
      if (!kb) return res.status(404).json({ success: false, message: 'Knowledge base not found' });

      const { title, content } = req.body;
      if (!content?.trim()) return res.status(400).json({ success: false, message: 'Content is required' });

      const doc = await knowledgeBaseService.addDocument(kbId, req.user.id, {
        title: title || 'Text Entry',
        source_type: 'text',
        content_text: content,
      });

      knowledgeBaseService.processDocument(doc.id, kbId, req.user.id, {
        chunkSize: kb.chunk_size,
        chunkingMode: kb.chunking_mode,
      }).catch(err => {
        console.error(`[KB] Background processing failed for doc ${doc.id}:`, err.message);
      });

      return res.status(201).json({
        success: true,
        data: doc,
        message: 'Document added and processing started',
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async addUrlDocument(req, res) {
    try {
      const kbId = parseInt(req.params.kbId);
      const kb = await knowledgeBaseService.getKBById(kbId, req.user.id);
      if (!kb) return res.status(404).json({ success: false, message: 'Knowledge base not found' });

      const { title, url } = req.body;
      if (!url?.trim()) return res.status(400).json({ success: false, message: 'URL is required' });

      // Scrape URL content
      let content = '';
      try {
        const axios = (await import('axios')).default;
        const response = await axios.get(url, { timeout: 15000 });
        // Simple text extraction - strip HTML tags
        content = String(response.data || '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 50000);
      } catch (e) {
        console.warn(`[KB] Failed to scrape URL ${url}:`, e.message);
      }

      const doc = await knowledgeBaseService.addDocument(kbId, req.user.id, {
        title: title || url,
        source_type: 'url',
        source_url: url,
        content_text: content,
      });

      knowledgeBaseService.processDocument(doc.id, kbId, req.user.id, {
        chunkSize: kb.chunk_size,
        chunkingMode: kb.chunking_mode,
      }).catch(err => {
        console.error(`[KB] Background processing failed for doc ${doc.id}:`, err.message);
      });

      return res.status(201).json({
        success: true,
        data: doc,
        message: content ? 'URL content captured and processing started' : 'URL added (content extraction failed)',
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteDocument(req, res) {
    try {
      const deleted = await knowledgeBaseService.deleteDocument(parseInt(req.params.docId), req.user.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Document not found' });
      return res.json({ success: true, message: 'Document deleted' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async reprocessDocument(req, res) {
    try {
      const kb = await knowledgeBaseService.getKBById(parseInt(req.params.kbId), req.user.id);
      if (!kb) return res.status(404).json({ success: false, message: 'Knowledge base not found' });

      await knowledgeBaseService.reprocessDocument(parseInt(req.params.docId), req.user.id, {
        chunkSize: kb.chunk_size,
        chunkingMode: kb.chunking_mode,
      });

      return res.json({ success: true, message: 'Document reprocessed' });
    } catch (err) {
      return res.status(err.message.includes('not found') ? 404 : 500)
        .json({ success: false, message: err.message });
    }
  }

  async getChunks(req, res) {
    try {
      const chunks = await knowledgeBaseService.getChunks(
        parseInt(req.params.kbId),
        req.user.id,
        { limit: parseInt(req.query.limit) || 100, offset: parseInt(req.query.offset) || 0 }
      );
      return res.json({ success: true, data: chunks });
    } catch (err) {
      return res.status(err.message.includes('not found') ? 404 : 500)
        .json({ success: false, message: err.message });
    }
  }

  // ── Sub-Assistant ─────────────────────────────────────────────

  async listSubAssistants(req, res) {
    try {
      const assistants = await subAssistantService.getAll(req.user.id);
      return res.json({ success: true, data: assistants });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getSubAssistant(req, res) {
    try {
      const assistant = await subAssistantService.getById(parseInt(req.params.id), req.user.id);
      if (!assistant) return res.status(404).json({ success: false, message: 'Sub-assistant not found' });
      return res.json({ success: true, data: assistant });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async createSubAssistant(req, res) {
    try {
      const assistant = await subAssistantService.create(req.user.id, req.body);
      return res.status(201).json({ success: true, data: assistant });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateSubAssistant(req, res) {
    try {
      const assistant = await subAssistantService.update(parseInt(req.params.id), req.user.id, req.body);
      if (!assistant) return res.status(404).json({ success: false, message: 'Sub-assistant not found' });
      return res.json({ success: true, data: assistant });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteSubAssistant(req, res) {
    try {
      const deleted = await subAssistantService.delete(parseInt(req.params.id), req.user.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Sub-assistant not found' });
      return res.json({ success: true, message: 'Sub-assistant deleted' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── Chatbot Settings ──────────────────────────────────────────

  async getChatbotSettings(req, res) {
    try {
      const settings = await chatbotRepository.getSettings(req.user.id, req.params.channel);
      return res.json({ success: true, data: settings });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateChatbotSettings(req, res) {
    try {
      const settings = await chatbotRepository.upsertSettings(req.user.id, req.params.channel, req.body);
      return res.json({ success: true, data: settings });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── Channel Connections ───────────────────────────────────────

  async listChannels(req, res) {
    try {
      const channels = await chatbotRepository.findAllChannelsByUser(req.user.id);
      // Strip credentials before sending
      const sanitized = channels.map(ch => ({
        ...ch,
        credentials: {},
      }));
      return res.json({ success: true, data: sanitized });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async connectZaloOA(req, res) {
    try {
      const { zalo_app_id, zalo_app_secret, display_name } = req.body;
      if (!zalo_app_id || !zalo_app_secret) {
        return res.status(400).json({ success: false, message: 'App ID và App Secret là bắt buộc' });
      }

      // Gọi Zalo API để lấy Access Token
      const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Client-Id': zalo_app_id,
          'Client-Secret': zalo_app_secret,
        },
        body: 'grant_type=app_credentials',
      });

      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ 
          success: false, 
          message: `Lỗi Zalo: ${data.message || data.error_description || 'Không thể lấy Access Token'}` 
        });
      }

      const access_token = data.access_token;

      const channel = await chatbotRepository.upsertChannel(req.user.id, 'zalo_oa', {
        display_name: display_name || 'Zalo OA',
        credentials: { 
          zalo_app_id, 
          zalo_app_secret,
          access_token, 
          token_expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
          connected_at: new Date().toISOString() 
        },
        webhook_url: `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/zalo-oa`,
      });

      return res.json({ success: true, data: { id: channel.id, display_name: channel.display_name }, message: 'Zalo OA đã được kết nối' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async connectFacebook(req, res) {
    try {
      const { page_access_token, page_id, page_name } = req.body;
      if (!page_access_token) return res.status(400).json({ success: false, message: 'Page access token required' });

      const channel = await chatbotRepository.upsertChannel(req.user.id, 'facebook', {
        display_name: page_name || page_id || 'Facebook Page',
        credentials: { page_access_token, page_id, connected_at: new Date().toISOString() },
        webhook_url: `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/facebook`,
      });

      return res.json({ success: true, data: channel, message: 'Facebook Page connected' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async disconnectChannel(req, res) {
    try {
      await chatbotRepository.deactivateChannel(req.user.id, req.params.channel);
      return res.json({ success: true, message: `Channel ${req.params.channel} disconnected` });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── Web Widget ────────────────────────────────────────────────

  async listWidgets(req, res) {
    try {
      const widgets = await chatbotRepository.findWidgetsByUser(req.user.id);
      return res.json({ success: true, data: widgets });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async createWidget(req, res) {
    try {
      console.log('[createWidget] req.body:', req.body);
      const crypto = await import('crypto');
      const widgetKey = crypto.randomUUID().split('-')[0];
      const widget = await chatbotRepository.createWidget(req.user.id, {
        ...req.body,
        widget_key: widgetKey,
      });
      console.log('[createWidget] Success:', widget);
      return res.status(201).json({ success: true, data: widget });
    } catch (err) {
      console.error('[createWidget] Error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateWidget(req, res) {
    try {
      const widget = await chatbotRepository.updateWidget(parseInt(req.params.id), req.user.id, req.body);
      if (!widget) return res.status(404).json({ success: false, message: 'Widget not found' });
      return res.json({ success: true, data: widget });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteWidget(req, res) {
    try {
      await chatbotRepository.deleteWidget(parseInt(req.params.id), req.user.id);
      return res.json({ success: true, message: 'Widget deleted' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Public widget config (no auth required)
  async getWidgetConfig(req, res) {
    try {
      const widget = await chatbotRepository.findWidgetByKey(req.params.widgetKey);
      if (!widget) return res.status(404).json({ success: false, message: 'Widget not found' });
      return res.json({
        success: true,
        data: {
          widgetKey: widget.widget_key,
          displayName: widget.display_name,
          themeColor: widget.theme_color,
          position: widget.position,
          welcomeMessage: widget.welcome_message || widget.greeting_msg,
          subAssistantName: widget.sub_assistant_name,
          avatarUrl: widget.avatar_url,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Start or resume a web chat conversation
  async startWebChat(req, res) {
    try {
      const { widgetKey, sessionId, visitorName, visitorEmail, visitorInfo } = req.body;
      if (!widgetKey) return res.status(400).json({ success: false, message: 'widgetKey is required' });

      const widget = await chatbotRepository.findWidgetByKey(widgetKey);
      if (!widget) return res.status(404).json({ success: false, message: 'Widget not found' });

      const conv = await chatbotRepository.getOrCreateWebChatConversation({
        widgetConfigId: widget.id,
        userId: widget.id_user,
        sessionId: sessionId || null,
        visitorName,
        visitorEmail,
        visitorInfo,
      });

      const messages = await chatbotRepository.getWebChatMessages(conv.id, { limit: 50 });

      return res.json({
        success: true,
        data: {
          conversationId: conv.id,
          messages,
          welcomeMessage: widget.welcome_message || widget.greeting_msg,
          subAssistantName: widget.sub_assistant_name,
          avatarUrl: widget.avatar_url,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getWebChatMessages(req, res) {
    try {
      const messages = await chatbotRepository.getWebChatMessages(
        parseInt(req.params.conversationId),
        { limit: parseInt(req.query.limit) || 50 }
      );
      return res.json({ success: true, data: messages });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async sendWebChatMessage(req, res) {
    try {
      const { conversationId, content, attachments } = req.body;
      if (!conversationId || !content?.trim()) {
        return res.status(400).json({ success: false, message: 'conversationId and content are required' });
      }

      const conv = await db.query(
        `SELECT wc.*, ww.id_user FROM webchat_conversations wc
         JOIN web_widget_configs ww ON ww.id = wc.id_widget_config
         WHERE wc.id = $1`,
        [conversationId]
      );

      if (!conv.rows[0]) return res.status(404).json({ success: false, message: 'Conversation not found' });

      const userId = conv.rows[0].id_user;
      const widgetConfigId = conv.rows[0].id_widget_config;

      // Log visitor message
      await chatbotRepository.addWebChatMessage(conversationId, userId, {
        role: 'visitor',
        content,
        attachments,
      });

      // Get widget config for AI routing
      const widget = await chatbotRepository.findWidgetByKey(conv.rows[0].session_id);

      // Route to AI
      const result = await chatRouterService.routeMessage({
        channel: 'web',
        userId,
        message: content,
        conversationId,
        attachments: attachments || [],
      });

      // Get bot message from log
      const messages = await chatbotRepository.getWebChatMessages(conversationId, { limit: 2 });

      return res.json({
        success: true,
        data: {
          result,
          messages,
        },
      });
    } catch (err) {
      console.error('[WebChat] Send message error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── Custom AI Chatbot Widget ─────────────────────────────────────

  async getPublicChatbotById(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      const chatbot = await chatbotRepository.findChatbotById(id);

      if (!chatbot) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      return res.json({
        success: true,
        data: {
          id: chatbot.id,
          name: chatbot.name || 'AI Assistant',
          description: chatbot.description || '',
          greeting_msg: chatbot.greeting_msg || chatbot.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?',
          avatar_url: chatbot.avatar_url || null,
          theme_color: chatbot.theme_color || '#6366f1',
          is_active: chatbot.is_active,
          // Widget UI customization
          primary_color: chatbot.primary_color || '#6366F1',
          background_color: chatbot.background_color || '#FFFFFF',
          text_color: chatbot.text_color || '#1F2937',
          accent_color: chatbot.accent_color || '#60A5FA',
          logo_url: chatbot.logo_url || null,
          show_avatar: chatbot.show_avatar !== false,
          position: chatbot.position || 'bottom-right',
          border_radius: chatbot.border_radius || 16,
          chat_height: chatbot.chat_height || '600px',
          // Suggested questions - applies to all deployment types
          suggested_questions: chatbot.suggested_questions || [],
        },
      });
    } catch (err) {
      console.error('[CustomChatbot] getPublicChatbotById error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getCustomChatbotConfig(req, res) {
    try {
      const { widgetKey } = req.params;

      // Query chatbot from database
      const chatbot = await chatbotRepository.findChatbotByWidgetKey(widgetKey);

      if (!chatbot) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chatbot',
        });
      }

      return res.json({
        success: true,
        data: {
          widgetKey: chatbot.widget_key,
          name: chatbot.name,
          welcomeMessage: chatbot.greeting_msg || chatbot.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?',
          description: chatbot.description,
          avatarUrl: chatbot.avatar_url,
          logoUrl: chatbot.logo_url,
          primaryColor: chatbot.primary_color || '#6366F1',
          backgroundColor: chatbot.background_color || '#FFFFFF',
          textColor: chatbot.text_color || '#1F2937',
          accentColor: chatbot.accent_color || '#60A5FA',
          showAvatar: chatbot.show_avatar !== false,
          suggestedQuestions: chatbot.suggested_questions || [],
          position: chatbot.position || 'bottom-right',
        },
      });
    } catch (err) {
      console.error('[CustomChatbot] Config error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── Custom Chatbots (Studio) ──────────────────────────────────────

  async listCustomChatbots(req, res) {
    try {
      const chatbots = await chatbotRepository.listChatbotsByUser(req.user.id);
      return res.json({ success: true, data: chatbots });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async createCustomChatbot(req, res) {
    try {
      const crypto = await import('crypto');
      const widgetKey = crypto.randomUUID().split('-')[0];
      const chatbot = await chatbotRepository.createChatbot(req.user.id, {
        ...req.body,
        widget_key: widgetKey,
      });
      return res.status(201).json({ success: true, data: chatbot });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateCustomChatbot(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      const updated = await chatbotRepository.updateChatbot(id, req.user.id, req.body);

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      return res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      console.error('[CustomChatbot] updateCustomChatbot error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteCustomChatbot(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      const deleted = await chatbotRepository.deleteChatbot(id, req.user.id);

      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      return res.json({
        success: true,
        message: 'Chatbot deleted',
      });
    } catch (err) {
      console.error('[CustomChatbot] deleteCustomChatbot error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async getCustomChatbotDocuments(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      const result = await db.query(`
        SELECT id, chunk_text, source, chunk_index, created_at
        FROM custom_chatbot_chunks
        WHERE chatbot_id = $1
        ORDER BY chunk_index
      `, [id]);

      // Group by source (document)
      const docsMap = {};
      for (const row of result.rows) {
        const source = row.source || 'Unknown';
        if (!docsMap[source]) {
          docsMap[source] = {
            id: row.id,
            title: source,
            type: 'file',
            status: 'ready',
            chunk_count: 0,
            created_at: row.created_at,
          };
        }
        docsMap[source].chunk_count++;
      }

      return res.json({
        success: true,
        documents: Object.values(docsMap),
      });
    } catch (err) {
      console.error('[CustomChatbot] Get documents error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async chatWithCustomChatbot(req, res) {
    try {
      const { widgetKey } = req.params;
      const { message, history } = req.body;

      if (!message?.trim()) {
        return res.status(400).json({ success: false, message: 'message is required' });
      }

      // Get chatbot settings by widget_key from database
      const chatbot = await chatbotRepository.findChatbotByWidgetKey(widgetKey);

      if (!chatbot) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy chatbot' });
      }

      // Use chatbot's system instruction or default
      const systemInstruction = chatbot.system_instruction || 'Bạn là một trợ lý AI hữu ích, thân thiện và chính xác. Trả lời bằng tiếng Việt.';

      // Build history
      const fullHistory = [
        ...(history || []),
        { role: 'user', content: message }
      ];

      // Build prompt
      const prompt = `Hệ thống: ${systemInstruction}\n\n${fullHistory.map(m => `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content}`).join('\n')}\n\nTrợ lý:`;

      // Get Gemini API key từ env
      const apiKey = process.env.GEMINI_API_KEY;
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

      if (!apiKey) {
        return res.status(500).json({ success: false, message: 'GEMINI_API_KEY not configured' });
      }

      // Call Gemini
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: chatbot.temperature || 0.7,
            maxOutputTokens: chatbot.max_tokens || 2048,
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        return res.status(500).json({ success: false, message: data.error.message });
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Xin lỗi, tôi không có câu trả lời.';

      return res.json({
        success: true,
        data: {
          role: 'assistant',
          content: content,
          created_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[CustomChatbot] Chat error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

export default new ChatbotController();
