import aiCampaignService from '../services/ai/aiCampaign.service.js';
import aiLandingPageService from '../services/ai/aiLandingPage.service.js';
import aiCampaignDraftService from '../services/ai/aiCampaignDraft.service.js';
import businessProfileService from '../services/ai/businessProfile.service.js';
import customChatService from '../services/ai/customChat.service.js';
import campaignController from './campaign.controller.js';
import campaignCrudService from '../services/campaign/campaignCrud.service.js';
import * as aiSessionRepo from '../repositories/aiSession.repository.js';

class AiController {
  /**
   * Generate campaign script from AI (V2 - Registry-based, multi-step support).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async generateCampaignV2(req, res) {
    try {
      const { prompt, files } = req.body;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập yêu cầu cho AI',
        });
      }

      const script = await aiCampaignService.generateCampaignWithRegistry({
        prompt,
        files: files || [],
        userId: req.user.id,
      });

      const validation = aiCampaignService.validateCampaignScript(script);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'AI tạo script không hợp lệ: ' + validation.errors.join(', '),
        });
      }

      return res.json({
        success: true,
        data: script,
        warnings: validation.warnings,
      });
    } catch (error) {
      console.error('AI generate campaign V2 error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi khi xử lý yêu cầu AI',
      });
    }
  }

  /**
   * Generate campaign script from AI.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async generateCampaign(req, res) {
    try {
      const { prompt, files } = req.body;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập yêu cầu cho AI',
        });
      }

      const script = await aiCampaignService.generateCampaignScript({
        prompt,
        files: files || [],
        userId: req.user.id,
      });

      return res.json({
        success: true,
        data: script,
      });
    } catch (error) {
      console.error('AI generate campaign error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi khi xử lý yêu cầu AI',
      });
    }
  }

  /**
   * Smart interactive chat.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async chat(req, res) {
    try {
      const { history, files, sessionId, locale } = req.body;

      if (!history || !history.length) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu lịch sử trò chuyện',
        });
      }

      const response = await aiCampaignService.processSmartChat({
        history,
        files: files || [],
        userId: req.user.id,
        userRole: req.user.role,
        locale: locale || 'vi',
      });

      // Persist session + messages (bỏ qua lỗi DB để không block chat)
      let finalSessionId = sessionId || null;
      let sessionTitle = null;
      try {
        const lastUserMsg = history[history.length - 1];
        const userContent = lastUserMsg?.content ?? '';

        if (!finalSessionId) {
          const title = userContent.slice(0, 80).trim() || 'Cuộc trò chuyện mới';
          const session = await aiSessionRepo.createSession(req.user.id, title);
          finalSessionId = session.id;
          sessionTitle = session.title;
        }

        await aiSessionRepo.saveMessages(finalSessionId, userContent, response);
      } catch (dbErr) {
        console.warn('[AI] Không lưu được session:', dbErr.message);
      }

      return res.json({
        success: true,
        data: { ...response, sessionId: finalSessionId, sessionTitle },
      });
    } catch (error) {
      console.error('AI chat error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi khi xử lý trò chuyện AI',
      });
    }
  }

  /**
   * Smart interactive chat V2 - sử dụng CampaignNodeRegistry (multi-step support).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async chatV2(req, res) {
    try {
      const { history, files, locale } = req.body;

      if (!history || !history.length) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu lịch sử trò chuyện',
        });
      }

      const response = await aiCampaignService.processSmartChatV2({
        history,
        files: files || [],
        userId: req.user.id,
        userRole: req.user.role,
        locale: locale || 'vi',
      });

      return res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('AI chat V2 error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi khi xử lý trò chuyện AI V2',
      });
    }
  }

  async getSessions(req, res) {
    try {
      const sessions = await aiSessionRepo.getUserSessions(req.user.id);
      return res.json({ success: true, data: sessions });
    } catch (error) {
      console.error('Get AI sessions error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi khi lấy danh sách session' });
    }
  }

  async getSessionMessages(req, res) {
    try {
      const messages = await aiSessionRepo.getSessionMessages(Number(req.params.id), req.user.id);
      if (messages === null) {
        return res.status(404).json({ success: false, message: 'Session không tồn tại' });
      }
      return res.json({ success: true, data: messages });
    } catch (error) {
      console.error('Get session messages error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi khi lấy tin nhắn' });
    }
  }

  async deleteSession(req, res) {
    try {
      const deleted = await aiSessionRepo.deleteSession(Number(req.params.id), req.user.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Session không tồn tại' });
      return res.json({ success: true });
    } catch (error) {
      console.error('Delete session error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi khi xóa session' });
    }
  }

  /**
   * Execute (Create & Run) the generated campaign.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async executeCampaign(req, res) {
    try {
      // Re-use campaignController.create logic
      // req.body should contain the script generated by AI
      const createRes = await new Promise((resolve, reject) => {
        const mockRes = {
          status: (code) => ({
            json: (data) => resolve({ status: code, data }),
          }),
          json: (data) => resolve({ status: 200, data }),
        };
        campaignController.create(req, mockRes).catch(reject);
      });

      if (createRes.status >= 400) {
        return res.status(createRes.status).json(createRes.data);
      }

      // If user wants to run immediately
      if (req.body.autoRun && createRes.data?.success) {
        const campaignId = createRes.data.data.id;
        const runReq = {
          ...req,
          params: { id: campaignId },
          body: {
            runName: `AI Auto Run - ${new Date().toLocaleString()}`,
            source: 'campaign_run',
          },
        };

        const runRes = await new Promise((resolve, reject) => {
          const mockRes = {
            status: (code) => ({
              json: (data) => resolve({ status: code, data }),
            }),
            json: (data) => resolve({ status: 200, data }),
          };
          campaignController.run(runReq, mockRes).catch(reject);
        });

        return res.json({
          success: true,
          message: 'Đã tạo và kích hoạt chiến dịch tự động thành công!',
          campaign: createRes.data.data,
          run: runRes.data,
        });
      }

      return res.json(createRes.data);
    } catch (error) {
      console.error('AI execute campaign error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi thực thi chiến dịch AI',
      });
    }
  }

  /**
   * Create campaign from AI draft (NO auto-run).
   * User will review and run manually.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async createCampaignFromDraft(req, res) {
    try {
      const { script } = req.body;

      if (!script || !script.nodes || !script.connections) {
        return res.status(400).json({
          success: false,
          message: 'Script không hợp lệ. Cần có nodes và connections.',
        });
      }

      // Tự động tạo email templates từ inline content trước khi normalize
      await aiCampaignDraftService.autoCreateEmailTemplates(script.nodes, req.user.id);

      // Normalize AI nodes to match database schema (uses snake_case: node_type, node_subtype)
      // AI returns: { nodeType: "action", nodeSubtype: "send_email" } but DB needs: { node_type: "send_email", node_subtype: "send_email" }
      console.log('[AI Controller] Raw script nodes:', JSON.stringify(script.nodes, null, 2));
      const normalizedNodes = aiCampaignDraftService.normalizeNodes(script.nodes);

      // Auto-fill fromEmailId và zaloAccountId với channel đầu tiên của user
      await aiCampaignDraftService.autoFillEmailChannels(normalizedNodes, req.user.id);
      await aiCampaignDraftService.autoFillZaloAccounts(normalizedNodes, req.user.id);

      // Normalize connections: support { source, target } or { sourceNodeId, targetNodeId }
      const normalizedConnections = (script.connections || []).map(conn => ({
        sourceNodeId: conn.sourceNodeId || conn.source || conn.from,
        targetNodeId: conn.targetNodeId || conn.target || conn.to,
        connectionType: conn.connectionType || 'default',
        connectionLabel: conn.connectionLabel || '',
      }));

      const createReq = {
        ...req,
        body: {
          campaignName: script.campaignName,
          description: script.description || '',
          campaignType: script.campaignType || 'mixed',
          nodes: normalizedNodes,
          connections: normalizedConnections,
        },
      };

      const createRes = await new Promise((resolve, reject) => {
        const mockRes = {
          status: (code) => ({
            json: (data) => resolve({ status: code, data }),
          }),
          json: (data) => resolve({ status: 200, data }),
        };
        campaignController.create(createReq, mockRes).catch(reject);
      });

      if (createRes.status >= 400) {
        return res.status(createRes.status).json(createRes.data);
      }

      return res.json({
        success: true,
        message: 'Đã tạo chiến dịch từ draft AI. Vào Campaign Builder để xem và chạy khi sẵn sàng.',
        campaignId: createRes.data.data?.id,
        campaignName: script.campaignName,
      });
    } catch (error) {
      console.error('AI create from draft error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi khi tạo chiến dịch từ draft AI',
      });
    }
  }

  /**
   * Push AI-generated script to an existing campaign.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async pushToCampaign(req, res) {
    try {
      const { id: campaignId } = req.params;
      const { script, autoRun = false } = req.body;

      if (!script || !script.nodes || !script.connections) {
        return res.status(400).json({
          success: false,
          message: 'Script không hợp lệ. Cần có nodes và connections.',
        });
      }

      // Normalize AI nodes trước khi đẩy vào campaign
      const normalizedNodes = aiCampaignDraftService.normalizeNodes(script.nodes);

      // Re-use campaignController.update logic to push nodes/connections
      const updateReq = {
        ...req,
        params: { id: campaignId },
        body: {
          campaignName: script.campaignName,
          description: script.description,
          campaignType: script.campaignType || 'mixed',
          nodes: normalizedNodes,
          connections: script.connections,
        },
      };

      const updateRes = await new Promise((resolve, reject) => {
        const mockRes = {
          status: (code) => ({
            json: (data) => resolve({ status: code, data }),
          }),
          json: (data) => resolve({ status: 200, data }),
        };
        campaignController.update(updateReq, mockRes).catch(reject);
      });

      if (updateRes.status >= 400) {
        return res.status(updateRes.status).json(updateRes.data);
      }

      // If user wants to run immediately
      if (autoRun) {
        const runReq = {
          ...req,
          params: { id: campaignId },
          body: {
            runName: `AI Auto Run - ${new Date().toLocaleString()}`,
            source: 'campaign_run',
          },
        };

        const runRes = await new Promise((resolve, reject) => {
          const mockRes = {
            status: (code) => ({
              json: (data) => resolve({ status: code, data }),
            }),
            json: (data) => resolve({ status: 200, data }),
          };
          campaignController.run(runReq, mockRes).catch(reject);
        });

        return res.json({
          success: true,
          message: 'Đã cập nhật và kích hoạt chiến dịch!',
          campaignId,
          run: runRes.data,
        });
      }

      return res.json({
        success: true,
        message: 'Đã đẩy kịch bản vào chiến dịch thành công!',
        campaignId,
      });
    } catch (error) {
      console.error('AI push to campaign error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Lỗi khi đẩy kịch bản vào chiến dịch',
      });
    }
  }

  /**
   * POST /ai/create-and-run-campaign — Tạo VÀ CHẠY campaign tự động.
   * Không cần xác nhận từ user.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async createAndRunCampaign(req, res) {
    try {
      const { script } = req.body;

      if (!script || !script.nodes || !script.connections) {
        return res.status(400).json({
          success: false,
          message: 'Script không hợp lệ. Cần có nodes và connections.',
        });
      }

      // Tự động tạo email templates từ inline content
      await aiCampaignDraftService.autoCreateEmailTemplates(script.nodes, req.user.id);

      // Normalize AI nodes trước khi tạo campaign
      const normalizedNodes = aiCampaignDraftService.normalizeNodes(script.nodes);

      // Auto-fill fromEmailId với SMTP channel đầu tiên của user
      await aiCampaignDraftService.autoFillEmailChannels(normalizedNodes, req.user.id);
      await aiCampaignDraftService.autoFillZaloAccounts(normalizedNodes, req.user.id);

      // Bước 1: Tạo campaign
      const createReq = {
        ...req,
        body: {
          campaignName: script.campaignName,
          description: script.description || '',
          campaignType: script.campaignType || 'mixed',
          nodes: normalizedNodes,
          connections: script.connections,
        },
      };

      const createRes = await new Promise((resolve, reject) => {
        const mockRes = {
          status: (code) => ({
            json: (data) => resolve({ status: code, data }),
          }),
          json: (data) => resolve({ status: 200, data }),
        };
        campaignController.create(createReq, mockRes).catch(reject);
      });

      if (createRes.status >= 400) {
        return res.status(createRes.status).json(createRes.data);
      }

      const campaignId = createRes.data.data?.id;
      if (!campaignId) {
        return res.status(500).json({
          success: false,
          message: 'Không lấy được ID chiến dịch sau khi tạo',
        });
      }

      // Bước 2: Kích hoạt campaign (set status = active)
      try {
        await campaignCrudService.publishCampaign({
          userId: req.user.id,
          roleCode: req.user.role,
          campaignId,
        });
      } catch (pubErr) {
        console.warn('[AI] Không publish được campaign:', pubErr.message);
      }

      // Bước 3: Tạo run và thực thi
      const runReq = {
        ...req,
        params: { id: campaignId },
        body: {
          runName: `AI Auto Run - ${new Date().toLocaleString('vi-VN')}`,
          source: 'campaign_run',
        },
      };

      const runRes = await new Promise((resolve, reject) => {
        const mockRes = {
          status: (code) => ({
            json: (data) => resolve({ status: code, data }),
          }),
          json: (data) => resolve({ status: 200, data }),
        };
        campaignController.run(runReq, mockRes).catch(reject);
      });

      return res.json({
        success: true,
        message: `Đã tạo và kích hoạt chiến dịch "${script.campaignName}" thành công!`,
        data: {
          campaignId,
          campaignName: script.campaignName,
          runId: runRes.data?.data?.runId || null,
          runName: runRes.data?.data?.runName || null,
          status: 'running',
        },
      });
    } catch (error) {
      console.error('AI create and run campaign error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Lỗi khi tạo và chạy chiến dịch AI',
      });
    }
  }

  /**
   * GET /ai/business-profile — Lấy hồ sơ doanh nghiệp của user hiện tại.
   */
  async getBusinessProfile(req, res) {
    try {
      const profile = await businessProfileService.getProfile(req.user.id);
      return res.json({ success: true, data: profile });
    } catch (error) {
      console.error('Get business profile error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /ai/generate-landing-html — Sinh HTML landing đầy đủ (Tailwind CDN), có context hồ sơ DN.
   */
  async generateLandingHtml(req, res) {
    try {
      const { prompt, title, sessionId, userSummary } = req.body;
      if (!String(prompt || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập mô tả trang landing cho AI',
        });
      }

      const data = await aiLandingPageService.generate({
        userId: req.user.id,
        prompt: String(prompt).trim(),
        titleHint: title != null ? String(title) : '',
      });

      // Lưu vào session nếu có sessionId
      const sid = sessionId ? Number(sessionId) : null;
      if (sid) {
        const userContent = String(userSummary || prompt).trim();
        const assistantMsg = {
          content: `Đã tạo landing page "${data.title}" cho bạn! Bạn có thể xem trước và lưu vào thư viện.`,
          type: 'landing_page',
          data: { title: data.title, html: data.html },
        };
        await aiSessionRepo.saveMessages(sid, userContent, assistantMsg).catch(() => {});
      }

      return res.json({ success: true, data });
    } catch (error) {
      console.error('AI generate landing HTML error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi khi sinh landing HTML',
      });
    }
  }

  /**
   * PUT /ai/business-profile — Lưu + re-embed hồ sơ doanh nghiệp.
   */
  async saveBusinessProfile(req, res) {
    try {
      const { company_name, industry, products, target_audience, tone, brand_color, logo_url, extra_context } = req.body;
      const profile = await businessProfileService.saveProfile(req.user.id, {
        company_name,
        industry,
        products,
        target_audience,
        tone,
        brand_color,
        logo_url,
        extra_context,
      });
      return res.json({ success: true, data: profile, message: 'Đã lưu và cập nhật hồ sơ doanh nghiệp' });
    } catch (error) {
      console.error('Save business profile error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
  }

  /**
   * Custom AI Chat - dùng cho widget, Zalo OA, Facebook, Studio chat
   * Uses system_instruction và settings từ chatbot để tùy chỉnh AI
   * Includes RAG context from uploaded documents
   */
  async customChat(req, res) {
    try {
      const { history, chatbot_id, system_instruction, temperature, max_tokens } = req.body;
      const data = await customChatService.chat({
        history,
        chatbotId: parseInt(chatbot_id, 10) || 0,
        userId: req.user?.id || 1,
        systemInstruction: system_instruction,
        temperature,
        maxTokens: max_tokens,
      });

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error('[CustomChat] Error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
  }

  /**
   * Upload document cho Custom AI Chat - extract text, chunk, embed
   */
  async customChatUpload(req, res) {
    try {
      const data = await customChatService.uploadDocument({
        chatbotId: parseInt(req.body.chatbot_id, 10) || 0,
        userId: req.user?.id || 1,
        file: req.file,
      });

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error('[CustomChatUpload] Error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
  }

  /**
   * Upload logo image for Custom AI Chatbot (2MB limit)
   */
  async customChatLogoUpload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Không có file ảnh' });
      }
      if (req.file.size > 2 * 1024 * 1024) {
        return res.status(400).json({ success: false, message: 'File ảnh vượt quá 2MB' });
      }
      const allowedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
      if (!allowedFormats.includes(req.file.mimetype)) {
        return res.status(400).json({ success: false, message: 'Định dạng ảnh không được hỗ trợ' });
      }

      const cloudinary = (await import('../config/cloudinary.js')).default;
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'chatbot_logos', resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'] },
          (err, data) => (err ? reject(err) : resolve(data))
        );
        stream.end(req.file.buffer);
      });

      return res.json({ success: true, data: { url: result.secure_url } });
    } catch (error) {
      console.error('[CustomChatLogoUpload] Error:', error);
      return res.status(500).json({ success: false, message: 'Upload logo thất bại' });
    }
  }

  /**
   * Get documents for Custom AI Chatbot
   */
  async getCustomChatbotDocuments(req, res) {
    try {
      const documents = await customChatService.getDocuments(parseInt(req.params.chatbotId, 10));

      return res.json({
        success: true,
        documents,
      });
    } catch (error) {
      console.error('[CustomChat] Get documents error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async deleteCustomChatbotDocument(req, res) {
    try {
      const docId = decodeURIComponent(req.params.docId);
      await customChatService.deleteDocument(parseInt(req.params.chatbotId, 10), docId);
      return res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
      console.error('[CustomChat] Delete document error:', error);
      return res.status(error.message.includes('not found') ? 404 : 500)
        .json({ success: false, message: error.message });
    }
  }

  /**
   * Add text document for Custom AI Chatbot
   */
  async addCustomChatTextDocument(req, res) {
    try {
      const chatbotId = parseInt(req.params.chatbotId, 10) || 0;
      const { title, content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, message: 'Content is required' });
      }

      const result = await customChatService.addTextDocument({
        chatbotId,
        userId: req.user?.id || 1,
        title: title || 'Text Document',
        content: content.trim(),
      });

      return res.json({
        success: true,
        message: `Đã thêm tài liệu với ${result.chunks} đoạn`,
        chunks: result.chunks,
      });
    } catch (error) {
      console.error('[CustomChat] Add text document error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
  }
}

export default new AiController();
