import knowledgeBaseService from '../services/chatbot/knowledgeBase.service.js';
import subAssistantService from '../services/chatbot/subAssistant.service.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import chatbotChannelRepository from '../repositories/ai/chatbotChannel.repository.js';
import chatbotZaloAccountRepository from '../repositories/chatbot/chatbotZaloAccount.repository.js';
import chatRouterService from '../services/chatbot/chatRouter.service.js';
import zaloOAAdapter from '../services/chatbot/channelAdapters/zaloOA.adapter.js';
import facebookAdapter from '../services/chatbot/channelAdapters/facebook.adapter.js';
import sseService from '../services/sse.service.js';
import uploadController from './upload.controller.js';

const ZALO_OA_API_BASE = 'https://openapi.zalo.me/v3.0';

/**
 * Extract readable text content from HTML, preserving structure
 */
function extractTextFromHtml(html) {
  if (!html || typeof html !== 'string') return '';

  let text = html;

  // Remove script and style tags with content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  text = text.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remove common non-content elements
  text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ');
  text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ');
  text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');
  text = text.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ');
  text = text.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ');

  // Replace block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");

  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.replace(/^\s+|\s+$/g, '');

  // Limit to 50000 chars
  return text.slice(0, 50000);
}

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

      // Validate URL format
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return res.status(400).json({ success: false, message: 'Only HTTP/HTTPS URLs are supported' });
        }
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid URL format' });
      }

      // Scrape URL content with realistic browser headers
      let content = '';
      let scrapeStatus = 'failed';
      try {
        const axios = (await import('axios')).default;
        const response = await axios.get(url, {
          timeout: 20000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          },
          // Handle compressed responses
          decompress: true,
        });

        const html = String(response.data || '');

        // Extract content from HTML
        content = extractTextFromHtml(html);

        if (content.length > 100) {
          scrapeStatus = 'success';
        } else if (html.length > 1000) {
          // HTML is large but extracted text is small - likely a JS-rendered page
          scrapeStatus = 'partial';
          content = `⚠️ This page may require JavaScript to render content. Extracted text:\n\n${content}`;
        }
      } catch (e) {
        console.warn(`[KB] Failed to scrape URL ${url}:`, e.message);
        scrapeStatus = `error: ${e.message}`;
      }

      const doc = await knowledgeBaseService.addDocument(kbId, req.user.id, {
        title: title || url,
        source_type: 'url',
        source_url: url,
        content_text: content || `⚠️ Failed to extract content from ${url}. Status: ${scrapeStatus}`,
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
        message: content.length > 100
          ? 'URL content captured and processing started'
          : `URL added. ${scrapeStatus === 'partial' ? 'Content may be incomplete (page requires JavaScript).' : 'Content extraction had issues but URL was saved.'}`,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteDocument(req, res) {
    try {
      const docId = parseInt(req.params.docId);
      const deleted = await knowledgeBaseService.deleteDocument(docId, req.user.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Document not found' });
      return res.json({ success: true, message: 'Document deleted' });
    } catch (err) {
      console.error('[Chatbot] Delete document error:', err);
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

  // ── Zalo Personal Account Chatbot Settings ─────────────────────────────────

  /**
   * Get chatbot settings for a specific Zalo account
   * GET /api/ai/chatbot/zalo-account/:zaloSettingId/chatbot
   */
  async getZaloAccountChatbotSettings(req, res) {
    try {
      const zaloSettingId = parseInt(req.params.zaloSettingId);
      if (!zaloSettingId) {
        return res.status(400).json({ success: false, message: 'Invalid Zalo account ID' });
      }
      const settings = await chatbotZaloAccountRepository.getSettings(req.user.id, zaloSettingId);
      return res.json({ success: true, data: settings });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Update chatbot settings for a specific Zalo account
   * PUT /api/ai/chatbot/zalo-account/:zaloSettingId/chatbot
   * Note: Only is_enabled is saved per-account; other settings use unified chatbot settings
   */
  async updateZaloAccountChatbotSettings(req, res) {
    try {
      const zaloSettingId = parseInt(req.params.zaloSettingId);
      if (!zaloSettingId) {
        return res.status(400).json({ success: false, message: 'Invalid Zalo account ID' });
      }
      // Only save is_enabled - other settings use unified chatbot settings
      const settings = await chatbotZaloAccountRepository.setEnabled(
        req.user.id, 
        zaloSettingId, 
        req.body.is_enabled
      );
      return res.json({ success: true, data: settings });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Toggle chatbot for a specific Zalo account
   * POST /api/ai/chatbot/zalo-account/:zaloSettingId/chatbot/toggle
   */
  async toggleZaloAccountChatbot(req, res) {
    try {
      const zaloSettingId = parseInt(req.params.zaloSettingId);
      if (!zaloSettingId) {
        return res.status(400).json({ success: false, message: 'Invalid Zalo account ID' });
      }
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'enabled must be a boolean' });
      }
      const settings = await chatbotZaloAccountRepository.setEnabled(req.user.id, zaloSettingId, enabled);
      return res.json({ success: true, data: settings });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * List all Zalo accounts with their chatbot settings for current user
   * GET /api/ai/chatbot/zalo-accounts/chatbot
   */
  async listZaloAccountsWithChatbotSettings(req, res) {
    try {
      const settings = await chatbotZaloAccountRepository.getAllSettingsForUser(req.user.id);
      return res.json({ success: true, data: settings });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Get sub-assistants for dropdown selection
   * GET /api/ai/chatbot/sub-assistants/chatbot-dropdown
   */
  async getSubAssistantsForChatbot(req, res) {
    try {
      const subAssistants = await chatbotZaloAccountRepository.getSubAssistants(req.user.id);
      return res.json({ success: true, data: subAssistants });
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

      // Generate unique webhook token
      const crypto = await import('crypto');
      const webhookToken = crypto.randomBytes(32).toString('hex');
      const verifyToken = crypto.randomBytes(16).toString('hex');

      const channel = await chatbotRepository.upsertChannel(req.user.id, 'zalo_oa', {
        display_name: display_name || 'Zalo OA',
        credentials: { 
          zalo_app_id, 
          zalo_app_secret,
          access_token, 
          verify_token: verifyToken,
          token_expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
          connected_at: new Date().toISOString() 
        },
        webhook_url: `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/zalo-oa/${webhookToken}`,
        webhook_token: webhookToken,
      });

      return res.json({ 
        success: true, 
        data: { 
          id: channel.id, 
          display_name: channel.display_name,
          webhook_url: channel.webhook_url,
          verify_token: verifyToken,
        }, 
        message: 'Zalo OA đã được kết nối' 
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async connectFacebook(req, res) {
    try {
      const { page_access_token, page_id, page_name } = req.body;
      if (!page_access_token) return res.status(400).json({ success: false, message: 'Page access token required' });

      // Generate unique webhook token
      const crypto = await import('crypto');
      const webhookToken = crypto.randomBytes(32).toString('hex');
      const verifyToken = crypto.randomBytes(16).toString('hex');

      const channel = await chatbotRepository.upsertChannel(req.user.id, 'facebook', {
        display_name: page_name || page_id || 'Facebook Page',
        credentials: { 
          page_access_token, 
          page_id, 
          verify_token: verifyToken,
          connected_at: new Date().toISOString() 
        },
        webhook_url: `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/facebook/${webhookToken}`,
        webhook_token: webhookToken,
      });

      return res.json({ 
        success: true, 
        data: {
          id: channel.id,
          display_name: channel.display_name,
          webhook_url: channel.webhook_url,
          verify_token: verifyToken,
        },
        message: 'Facebook Page đã được kết nối' 
      });
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

  // ── Test Connection ────────────────────────────────────────────

  async testZaloOAConnection(req, res) {
    try {
      const { zalo_app_id, zalo_app_secret } = req.body;
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
          message: `Lỗi Zalo: ${data.message || data.error_description || 'Không thể kết nối'}`,
          error_code: data.error,
        });
      }

      // Lấy thông tin OA Profile
      let oaInfo = {};
      try {
        const profileResponse = await fetch(`${ZALO_OA_API_BASE}/oa/getprofile`, {
          method: 'GET',
          headers: { access_token: data.access_token },
        });
        oaInfo = await profileResponse.json();
      } catch (e) {
        console.warn('[ZaloOA] Could not fetch profile:', e.message);
      }

      return res.json({
        success: true,
        message: 'Kết nối Zalo OA thành công!',
        data: {
          oa_name: oaInfo?.name || 'Zalo OA',
          oa_id: oaInfo?.oa_id || zalo_app_id,
          is_verified: oaInfo?.is_verified || false,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async testFacebookConnection(req, res) {
    try {
      const { page_access_token, page_id } = req.body;
      if (!page_access_token) {
        return res.status(400).json({ success: false, message: 'Page Access Token là bắt buộc' });
      }

      // Verify token bằng cách gọi Facebook Graph API
      const response = await fetch(
        `https://graph.facebook.com/v18.0/me?access_token=${page_access_token}`
      );
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({
          success: false,
          message: `Lỗi Facebook: ${data.error?.message || 'Token không hợp lệ'}`,
          error_code: data.error?.type,
        });
      }

      // Kiểm tra page_id nếu được cung cấp
      if (page_id && data.id !== page_id) {
        return res.status(400).json({
          success: false,
          message: `Page ID không khớp. Token thuộc về Page ID: ${data.id}`,
        });
      }

      return res.json({
        success: true,
        message: 'Kết nối Facebook thành công!',
        data: {
          page_name: data.name,
          page_id: data.id,
        },
      });
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

      const conv = await chatbotRepository.findWebChatConversationWithOwner(conversationId);

      if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

      const userId = conv.id_user;

      // Log visitor message
      await chatbotRepository.addWebChatMessage(conversationId, userId, {
        role: 'visitor',
        content,
        attachments,
      });

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

      const documents = await chatbotRepository.getCustomChatbotDocuments(id);

      return res.json({
        success: true,
        documents,
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

  // Chat with chatbot by ID (not widgetKey) - for PublicChatbotPage
  async chatWithCustomChatbotById(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      const { message, history, sessionId } = req.body;

      if (!message?.trim()) {
        return res.status(400).json({ success: false, message: 'message is required' });
      }

      // Get chatbot by ID from database
      const chatbot = await chatbotRepository.findChatbotById(id);

      if (!chatbot) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy chatbot' });
      }

      // Get or create widget config for this chatbot
      let widgetConfigs = await chatbotRepository.findWidgetsByUser(chatbot.id_user);
      let widgetConfig = widgetConfigs.find(w => w.id_sub_assistant === chatbot.id_sub_assistant);
      
      // If no widget exists, create a default one for this chatbot
      if (!widgetConfig) {
        const widgetKey = `chatbot_${chatbot.id}_${Date.now()}`;
        const newWidget = await chatbotRepository.createWidget(chatbot.id_user, {
          id_sub_assistant: chatbot.id_sub_assistant,
          widget_key: widgetKey,
          display_name: chatbot.name || 'Web Chat',
          theme_color: chatbot.primary_color || '#6366f1',
          primary_color: chatbot.primary_color || '#6366f1',
          welcome_message: chatbot.welcome_message || 'Xin chào! Tôi có thể giúp gì cho bạn?',
        });
        widgetConfig = newWidget;
      }

      // Create or find conversation
      const visitorSessionId = sessionId || `pub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let conversation;
      
      if (widgetConfig) {
        // Find existing conversation by session
        conversation = await chatbotRepository.getOrCreateWebChatConversation({
          userId: chatbot.id_user,
          widgetConfigId: widgetConfig.id,
          sessionId: visitorSessionId,
        });
      }

      // Save visitor message
      if (conversation) {
        await chatbotRepository.addWebChatMessage(conversation.id, chatbot.id_user, {
          role: 'visitor',
          content: message,
        });

    // Broadcast SSE for real-time update
    sseService.broadcast(String(chatbot.id_user), 'inbox:new_message', {
      conversationId: conversation.id,
      conversationType: 'webchat',
      channel: 'web',
      message: message,
      senderName: 'Khách',
      timestamp: new Date().toISOString(),
    });

    // Broadcast unread count change
    sseService.broadcast(String(chatbot.id_user), 'inbox:unread_change', {
      conversationId: conversation.id,
      conversationType: 'webchat',
      change: 1,
    });
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

      // Save assistant response
      if (conversation) {
        await chatbotRepository.addWebChatMessage(conversation.id, chatbot.id_user, {
          role: 'assistant',
          content: content,
        });
      }

      return res.json({
        success: true,
        data: {
          role: 'assistant',
          content: content,
          created_at: new Date().toISOString(),
          sessionId: visitorSessionId,
        },
      });
    } catch (err) {
      console.error('[CustomChatbot] Chat by ID error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // Get messages for a session (for polling new agent replies)
  async getChatMessages(req, res) {
    try {
      const { chatbotId } = req.params;
      const { sessionId, lastMessageId } = req.query;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      if (!sessionId) {
        return res.status(400).json({ success: false, message: 'sessionId is required' });
      }

      // Get chatbot
      const chatbot = await chatbotRepository.findChatbotById(id);
      if (!chatbot) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      // Get widget config
      const widgetConfigs = await chatbotRepository.findWidgetsByUser(chatbot.id_user);
      const widgetConfig = widgetConfigs.find(w => w.id_sub_assistant === chatbot.id_sub_assistant);

      if (!widgetConfig) {
        return res.json({ success: true, data: { messages: [], sessionId } });
      }

      // Find conversation
      const conversationId = await chatbotRepository.findActiveWebChatConversationId({
        widgetConfigId: widgetConfig.id,
        sessionId,
      });

      if (!conversationId) {
        return res.json({ success: true, data: { messages: [], sessionId } });
      }

      const messages = await chatbotRepository.getAgentWebChatMessagesAfter({
        conversationId,
        lastMessageId,
      });

      return res.json({
        success: true,
        data: {
          messages: messages.map(m => ({
            id: m.id,
            role: 'assistant',
            content: m.content,
            createdAt: m.created_at,
          })),
          sessionId,
        },
      });
    } catch (err) {
      console.error('[CustomChatbot] Get messages error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ── Chatbot Channel Connections ─────────────────────────────────

  /**
   * Get all channel connections for a chatbot
   * GET /ai/chatbot/custom-chatbots/:chatbotId/channels
   */
  async getChatbotChannels(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      // Verify chatbot belongs to user
      const chatbot = await chatbotRepository.findChatbotById(id);
      if (!chatbot) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      const channels = await chatbotChannelRepository.findByChatbotId(id);

      // Strip sensitive credentials
      const sanitized = channels.map(ch => ({
        id: ch.id,
        channel_type: ch.channel_type,
        display_name: ch.display_name,
        external_channel_id: ch.external_channel_id,
        is_active: ch.is_active,
        webhook_url: ch.webhook_url,
        connected_at: ch.connected_at,
        last_activity_at: ch.last_activity_at,
      }));

      return res.json({ success: true, data: sanitized });
    } catch (err) {
      console.error('[ChatbotChannel] Get channels error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Connect Zalo OA to chatbot
   * POST /ai/chatbot/custom-chatbots/:chatbotId/channels/zalo-oa
   */
  async connectChatbotZaloOA(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      const { zalo_app_id, zalo_app_secret, display_name } = req.body;
      if (!zalo_app_id || !zalo_app_secret) {
        return res.status(400).json({ success: false, message: 'App ID và App Secret là bắt buộc' });
      }

      // Get access token from Zalo
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
      
      console.log('[Zalo OA] Token response:', JSON.stringify(data));

      if (data.error || !data.access_token) {
        return res.status(400).json({
          success: false,
          message: `Lỗi kết nối Zalo: ${data.message || data.error_description || 'App ID hoặc App Secret không đúng. Vui lòng kiểm tra lại trên Zalo Developer Console.'}`,
        });
      }

      // Generate unique webhook token
      const crypto = await import('crypto');
      const webhookToken = crypto.randomBytes(32).toString('hex');
      const verifyToken = crypto.randomBytes(16).toString('hex');

      // Save channel connection
      const channel = await chatbotChannelRepository.upsertChannel(id, 'zalo_oa', {
        display_name: display_name || 'Zalo OA',
        external_channel_id: zalo_app_id,
        credentials: {
          zalo_app_id,
          zalo_app_secret,
          access_token: data.access_token,
          verify_token: verifyToken,
          token_expires_at: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000).toISOString()
            : null,
        },
        webhook_token: webhookToken,
        webhook_url: `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/chatbot/zalo-oa/${webhookToken}`,
      });

      return res.json({
        success: true,
        data: {
          id: channel.id,
          display_name: channel.display_name,
          webhook_url: channel.webhook_url,
          verify_token: verifyToken,
        },
        message: 'Zalo OA đã được kết nối với chatbot',
      });
    } catch (err) {
      console.error('[ChatbotChannel] Connect Zalo error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Connect Facebook to chatbot
   * POST /ai/chatbot/custom-chatbots/:chatbotId/channels/facebook
   */
  async connectChatbotFacebook(req, res) {
    try {
      const { chatbotId } = req.params;
      const id = parseInt(chatbotId);

      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      const { page_access_token, page_id, page_name } = req.body;
      if (!page_access_token || !page_id) {
        return res.status(400).json({ success: false, message: 'Page Access Token và Page ID là bắt buộc' });
      }

      // Generate unique webhook token
      const crypto = await import('crypto');
      const webhookToken = crypto.randomBytes(32).toString('hex');
      const verifyToken = crypto.randomBytes(16).toString('hex');

      // Save channel connection
      const channel = await chatbotChannelRepository.upsertChannel(id, 'facebook', {
        display_name: page_name || `Page ${page_id}`,
        external_channel_id: page_id,
        credentials: {
          page_access_token,
          page_id,
          verify_token: verifyToken,
        },
        webhook_token: webhookToken,
        webhook_url: `${process.env.BACKEND_PUBLIC_URL}/api/webhooks/chatbot/facebook/${webhookToken}`,
      });

      return res.json({
        success: true,
        data: {
          id: channel.id,
          display_name: channel.display_name,
          webhook_url: channel.webhook_url,
          verify_token: verifyToken,
        },
        message: 'Facebook Page đã được kết nối với chatbot',
      });
    } catch (err) {
      console.error('[ChatbotChannel] Connect Facebook error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * Disconnect channel from chatbot
   * DELETE /ai/chatbot/custom-chatbots/:chatbotId/channels/:channelType
   */
  async disconnectChatbotChannel(req, res) {
    try {
      const { chatbotId, channelType } = req.params;

      if (!['zalo_oa', 'facebook'].includes(channelType)) {
        return res.status(400).json({ success: false, message: 'Invalid channel type' });
      }

      await chatbotChannelRepository.deactivateChannel(parseInt(chatbotId), channelType);

      return res.json({ success: true, message: 'Channel đã được ngắt kết nối' });
    } catch (err) {
      console.error('[ChatbotChannel] Disconnect error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

export default new ChatbotController();
