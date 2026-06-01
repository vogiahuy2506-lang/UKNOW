import aiCampaignService from '../services/ai/aiCampaign.service.js';
import aiLandingPageService from '../services/ai/aiLandingPage.service.js';
import businessProfileService from '../services/ai/businessProfile.service.js';
import knowledgeBaseService from '../services/chatbot/knowledgeBase.service.js';
import ragEngineService from '../services/chatbot/ragEngine.service.js';
import campaignController from './campaign.controller.js';
import campaignCrudService from '../services/campaign/campaignCrud.service.js';
import db from '../config/database.js';
import * as aiSessionRepo from '../repositories/aiSession.repository.js';
import multer from 'multer';
import { extractTextFromBuffer } from '../utils/fileExtractor.util.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
      await this._autoCreateEmailTemplates(script.nodes, req.user.id);

      // Normalize AI nodes to match database schema (uses snake_case: node_type, node_subtype)
      // AI returns: { nodeType: "action", nodeSubtype: "send_email" } but DB needs: { node_type: "send_email", node_subtype: "send_email" }
      console.log('[AI Controller] Raw script nodes:', JSON.stringify(script.nodes, null, 2));
      const normalizedNodes = this._normalizeNodes(script.nodes);

      // Auto-fill fromEmailId và zaloAccountId với channel đầu tiên của user
      await this._autoFillEmailChannels(normalizedNodes, req.user.id);
      await this._autoFillZaloAccounts(normalizedNodes, req.user.id);

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
      const normalizedNodes = this._normalizeNodes(script.nodes);

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
      await this._autoCreateEmailTemplates(script.nodes, req.user.id);

      // Normalize AI nodes trước khi tạo campaign
      const normalizedNodes = this._normalizeNodes(script.nodes);

      // Auto-fill fromEmailId với SMTP channel đầu tiên của user
      await this._autoFillEmailChannels(normalizedNodes, req.user.id);
      await this._autoFillZaloAccounts(normalizedNodes, req.user.id);

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
   * Normalize AI nodes to match database schema.
   * AI returns: { nodeType: "action", nodeSubtype: "send_email" } 
   * DB needs: { node_type: "send_email", node_subtype: "send_email" }
   * 
   * @param {Array} nodes - Array of AI-generated nodes
   * @returns {Array} Normalized nodes for database
   */

  /**
   * Với mỗi send_email node có emailBody inline (emailTemplateId=null),
   * tự động tạo template trong DB và gán emailTemplateId.
   */
  async _autoCreateEmailTemplates(nodes, userId) {
    for (const node of nodes) {
      const cfg = node.config || node.nodeConfig || {};
      const nodeType = node.nodeType || node.type || node.node_type || '';
      const isSendEmail = ['send_email', 'email', 'email_send'].includes(nodeType) ||
        ['send_email', 'email', 'email_send'].includes(node.nodeSubtype || node.subtype || '');
      if (!isSendEmail) continue;
      if (cfg.emailTemplateId || !cfg.emailBody) continue;

      try {
        const name = node.nodeName || node.name || 'Email từ AI';
        const { rows } = await db.query(
          `INSERT INTO email_templates (id_user, template_name, template_code, subject, body_html, body_text, attachments, variables, category)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            userId,
            name,
            `ai_${Date.now()}`,
            cfg.emailSubject || name,
            cfg.emailBody,
            '',
            JSON.stringify([]),
            JSON.stringify([]),
            'marketing',
          ]
        );
        cfg.emailTemplateId = rows[0].id;
        cfg.emailBody = '';
        cfg.emailSubject = '';
        node.config = cfg;
        console.log(`[AI] Auto-created email template id=${rows[0].id} for node "${name}"`);
      } catch (e) {
        console.warn('[AI] Không tạo được email template tự động:', e.message);
      }
    }
  }

  async _autoFillEmailChannels(nodes, userId) {
    try {
      const { rows } = await db.query(
        `SELECT id FROM email_settings WHERE id_user = $1 AND status = 'active' ORDER BY id ASC LIMIT 1`,
        [userId]
      );
      if (!rows.length) return;
      const defaultChannelId = rows[0].id;
      for (const node of nodes) {
        const cfg = node.config || {};
        const nodeType = node.node_type || node.nodeType || node.type || '';
        const isSendEmail = ['send_email', 'email', 'email_send'].includes(nodeType) ||
          ['send_email', 'email', 'email_send'].includes(node.nodeSubtype || node.subtype || '');
        if (!isSendEmail) continue;
        if (!cfg.fromEmailId) {
          cfg.fromEmailId = defaultChannelId;
          node.config = cfg;
        }
      }
    } catch (e) {
      console.warn('[AI] Không lấy được email settings:', e.message);
    }
  }

  async _autoFillZaloAccounts(nodes, userId) {
    try {
      const { rows } = await db.query(
        `SELECT id FROM zalo_settings WHERE id_user = $1 AND is_active = true ORDER BY id ASC LIMIT 1`,
        [userId]
      );
      if (!rows.length) return;
      const defaultAccountId = rows[0].id;
      const zaloNodeTypes = ['send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request', 'select_zalo_account'];
      for (const node of nodes) {
        const cfg = node.config || {};
        const nodeType = node.node_type || node.nodeType || node.type || '';
        if (!zaloNodeTypes.includes(nodeType)) continue;
        if (!cfg.zaloAccountId) {
          cfg.zaloAccountId = defaultAccountId;
          node.config = cfg;
        }
      }
    } catch (e) {
      console.warn('[AI] Không lấy được zalo settings:', e.message);
    }
  }

  _normalizeNodes(nodes) {
    if (!Array.isArray(nodes)) return [];
    
    return nodes.map(node => {
      // Support multiple formats: { nodeType, nodeSubtype } OR { type, subtype } OR AI format { type, id }
      const nodeSubtype = node.nodeSubtype || node.subtype || node.node_subtype || '';
      let nodeType = node.nodeType || node.type || node.node_type || '';

      // Map based on nodeSubtype first (higher priority)
      if (['send_email', 'email', 'email_send', 'email_action'].includes(nodeType) || 
          ['send_email', 'email', 'email_send', 'email_action'].includes(nodeSubtype)) {
        nodeType = 'send_email';
      } else if (['send_zalo_personal', 'zalo_personal', 'zalo'].includes(nodeType) || 
                 ['send_zalo_personal', 'zalo_personal', 'zalo'].includes(nodeSubtype)) {
        nodeType = 'send_zalo_personal';
      } else if (['send_zalo_group', 'zalo_group'].includes(nodeType) || 
                 ['send_zalo_group', 'zalo_group'].includes(nodeSubtype)) {
        nodeType = 'send_zalo_group';
      } else if (['send_zalo_friend_request', 'zalo_friend'].includes(nodeType) || 
                 ['send_zalo_friend_request', 'zalo_friend'].includes(nodeSubtype)) {
        nodeType = 'send_zalo_friend_request';
      } else if (['wait_time', 'wait', 'delay', 'schedule'].includes(nodeType) || 
                 ['wait_time', 'wait', 'delay', 'schedule'].includes(nodeSubtype)) {
        nodeType = 'delay';
      } else if (['start', 'trigger', 'manual'].includes(nodeType) || 
                 ['start', 'trigger', 'manual'].includes(nodeSubtype)) {
        nodeType = 'trigger'; // DB enum uses 'trigger' not 'start'
      } else if (nodeType === 'end') {
        nodeType = 'end';
      } else if (['condition', 'filter', 'branch', 'split'].includes(nodeType) ||
                 ['condition', 'filter', 'branch', 'split'].includes(nodeSubtype)) {
        nodeType = 'condition';
      } else if (['interested_customers', 'read_interested_customers', 'read_sheet', 'google_sheet',
                  'read_landing_leads', 'read_courses_db'].includes(nodeSubtype)) {
        // Source data node: giữ nguyên subtype làm node_type để campaign runner xử lý đúng
        nodeType = nodeSubtype;
      } else if (nodeType === 'data') {
        // DATA node: dùng nodeSubtype làm node_type thực sự
        if (['interested_customers', 'read_interested_customers'].includes(nodeSubtype)) {
          nodeType = 'interested_customers';
        } else if (['tag_contact', 'tag'].includes(nodeSubtype)) {
          nodeType = 'tag_contact';
        } else if (['update_attribute', 'update_field'].includes(nodeSubtype)) {
          nodeType = 'update_attribute';
        } else if (['condition', 'filter', 'branch', 'split'].includes(nodeSubtype)) {
          nodeType = 'condition';
        } else if (['wait', 'wait_time', 'delay'].includes(nodeSubtype)) {
          nodeType = 'delay';
        }
        // nodeSubtype không xác định → giữ nguyên 'data'
      } else if (['zns', 'zalo_message'].includes(nodeType) ||
                 ['zns', 'zalo_message'].includes(nodeSubtype)) {
        nodeType = 'zns';
      } else if (nodeType === 'sms' || nodeSubtype === 'sms') {
        nodeType = 'sms';
      } else if (!nodeType) {
        nodeType = 'trigger';
      }

      // Support multiple ID formats: tempId, id, or AI format
      const nodeId = node.tempId || node.id || `node_${Math.random().toString(36).substring(2, 11)}`;
      
      // Build config from AI format or standard format
      let config = node.config || node.settings || {};
      
      // Handle AI format where email data is in top-level fields
      if (node.type === 'email' || node.subtype === 'email') {
        config = {
          emailSubject: node.subject || '',
          emailBody: node.bodyHtml || node.body || '',
          bodyText: node.bodyText || '',
          templateName: node.templateName || '',
          templateMappings: [],
          enableLinkTracking: true,
          saveMessageLog: true,
        };
      }
      
      // Handle AI format where wait data is in { duration: { value, unit } }
      if (node.type === 'wait' && node.duration) {
        config = {
          amount: node.duration.value || 1,
          unit: node.duration.unit || 'days',
        };
      }

      return {
        id: nodeId,
        tempId: nodeId,
        node_type: nodeType,
        node_subtype: nodeSubtype,
        node_name: node.name || node.nodeName || node.templateName || 'Node',
        node_description: node.description || node.nodeDescription || '',
        position_x: node.position?.x || node.positionX || node.position_x || 0,
        position_y: node.position?.y || node.positionY || node.position_y || 0,
        config,
      };
    });
  }

  /**
   * Custom AI Chat - dùng cho widget, Zalo OA, Facebook, Studio chat
   * Uses system_instruction và settings từ chatbot để tùy chỉnh AI
   * Includes RAG context from uploaded documents
   */
  async customChat(req, res) {
    try {
      const { history, chatbot_id, system_instruction, temperature, max_tokens } = req.body;

      if (!history || !Array.isArray(history) || history.length === 0) {
        return res.status(400).json({ success: false, message: 'history is required' });
      }

      const chatbotId = parseInt(chatbot_id) || 0;
      const userId = req.user?.id || 1;

      // Get RAG context from custom chatbot chunks
      let ragContext = '';
      try {
        const lastUserMessage = [...history].reverse().find(m => m.role === 'user')?.content || '';
        if (lastUserMessage) {
          const chunks = await this._searchChunks(chatbotId, userId, lastUserMessage);
          if (chunks.length > 0) {
            ragContext = `\n\nTài liệu tham khảo từ Knowledge Base:\n${chunks.map(c => `- ${c}`).join('\n')}`;
          }
        }
      } catch (e) {
        console.warn('[CustomChat] RAG search failed:', e.message);
      }

      // Build system prompt
      const defaultSystem = 'Bạn là một trợ lý AI hữu ích, thân thiện và chính xác. Trả lời bằng tiếng Việt.';
      const systemPrompt = system_instruction || defaultSystem;

      // Build prompt với history + RAG context
      const prompt = `Hệ thống: ${systemPrompt}${ragContext}\n\n${history.map(m => `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content}`).join('\n')}\n\nTrợ lý:`;

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
            temperature: temperature || 0.7,
            maxOutputTokens: Math.min(max_tokens || 2048, 65536),
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
        content: content,
        type: 'text',
      });
    } catch (error) {
      console.error('[CustomChat] Error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Search chunks for RAG context (simple keyword matching)
   */
  async _searchChunks(chatbotId, userId, query) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) return [];

    // Get all chunks for this chatbot
    const result = await db.query(`
      SELECT chunk_text FROM custom_chatbot_chunks
      WHERE chatbot_id = $1 AND user_id = $2
      ORDER BY chunk_index
    `, [chatbotId, userId]);

    if (!result.rows.length) return [];

    // Simple relevance scoring based on keyword matches
    const scored = result.rows.map(row => {
      const text = row.chunk_text.toLowerCase();
      const score = words.filter(w => text.includes(w)).length;
      return { text: row.chunk_text, score };
    });

    // Return top 5 most relevant chunks
    return scored
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => c.text);
  }

  /**
   * Upload document cho Custom AI Chat - extract text, chunk, embed
   */
  async customChatUpload(req, res) {
    try {
      const { chatbot_id } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Extract text from file
      const text = await extractTextFromBuffer(file.buffer, file.originalname);

      if (!text || text.trim().length < 10) {
        return res.status(400).json({ success: false, message: 'Could not extract text from file' });
      }

      // Create a temporary KB for this chatbot if needed
      // For now, store chunks in memory with chatbot_id
      const chunks = this._chunkText(text, 500);
      const apiKey = process.env.GEMINI_API_KEY;

      // Generate embeddings
      let embeddings = [];
      if (apiKey) {
        try {
          const { embedTexts } = await import('../utils/embeddingClient.util.js');
          embeddings = await embedTexts(chunks.map((c, i) => `[${i}] ${c}`));
        } catch (e) {
          console.warn('[CustomChat] Embedding failed, using text only:', e.message);
        }
      }

      // Store chunks in database
      const chatbotId = parseInt(chatbot_id) || 0;
      const userId = req.user?.id || 1;

      // Store in custom_chatbot_chunks table
      await db.query(`
        DELETE FROM custom_chatbot_chunks WHERE chatbot_id = $1
      `, [chatbotId]);

      for (let i = 0; i < chunks.length; i++) {
        await db.query(`
          INSERT INTO custom_chatbot_chunks (chatbot_id, user_id, chunk_text, embedding, chunk_index, source)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [chatbotId, userId, chunks[i], embeddings[i] || null, i, file.originalname]);
      }

      return res.json({
        success: true,
        message: `Đã xử lý ${chunks.length} đoạn từ file`,
        chunks: chunks.length,
        preview: chunks.slice(0, 3).join('\n\n').substring(0, 500),
      });
    } catch (error) {
      console.error('[CustomChatUpload] Error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get documents for Custom AI Chatbot
   */
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
    } catch (error) {
      console.error('[CustomChat] Get documents error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  _chunkText(text, chunkSize = 500) {
    const paragraphs = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
    const chunks = [];
    let buffer = '';

    for (const para of paragraphs) {
      if (buffer.length + para.length + 1 <= chunkSize) {
        buffer += (buffer ? '\n\n' : '') + para;
      } else {
        if (buffer) chunks.push(buffer);
        buffer = para;
      }
    }
    if (buffer) chunks.push(buffer);

    return chunks;
  }
}

export default new AiController();
