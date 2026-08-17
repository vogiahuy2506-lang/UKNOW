import aiCampaignService from '../services/ai/aiCampaign.service.js';
import aiLandingPageService from '../services/ai/aiLandingPage.service.js';
import aiCampaignDraftService from '../services/ai/aiCampaignDraft.service.js';
import campaignConfirmationService from '../services/ai/campaignConfirmation.service.js';
import businessProfileService from '../services/ai/businessProfile.service.js';
import customChatService from '../services/ai/customChat.service.js';
import chatbotStudioConversationService from '../services/chatbot/chatbotStudioConversation.service.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import chatAttachmentService from '../services/chatbot/chatAttachment.service.js';
import { getAllowedModelsForUser, savePreferredModelForUser } from '../services/ai/aiModelPolicy.service.js';
import { chargeAiCredit } from '../middleware/aiCredit.middleware.js';
import { tryHandleHelpChat } from '../services/help/helpAssistant.service.js';
import campaignController from './campaign.controller.js';
import campaignCrudService from '../services/campaign/campaignCrud.service.js';
import campaignNodeRegistryService from '../services/campaign/campaignNodeRegistry.service.js';
import * as aiSessionRepo from '../repositories/aiSession.repository.js';
import { applyWizardStateAction, normalizeWizardState, isWizardAnswerTurn } from '../services/ai/aiCampaignWizard.service.js';
import auditService, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { MAX_AI_MANUAL_RECIPIENTS, validateManualRecipients } from '../utils/manualRecipients.util.js';
import {
  resolveLandingBrief,
  buildLandingBriefContext,
  resolveOwnerUserId,
} from '../services/ai/landingBrief.service.js';
import { buildLeadFormDraftFromBrief } from '../utils/landingLeadFormConfig.util.js';
import {
  normalizeAssistantLocale,
  resolveAssistantLocaleContext,
} from '../utils/assistantLocale.util.js';
import { MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILE_MB } from '../utils/uploadLimits.util.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';

function buildAiErrorPayload(error, fallbackMessage = 'Lỗi khi xử lý yêu cầu AI') {
  return {
    success: false,
    message: error.message || fallbackMessage,
    ...(error.code ? { code: error.code } : {}),
    ...(error.resource ? { resource: error.resource } : {}),
    ...(error.used !== undefined ? { used: error.used } : {}),
    ...(error.limit !== undefined ? { limit: error.limit } : {}),
    ...(error.upgradeRequired ? { upgradeRequired: true } : {}),
  };
}

class AiController {
  async prepareCampaign(req, res) {
    try {
      const { script, directRecipients } = req.body || {};
      if (!script || !Array.isArray(script.nodes)) {
        return res.status(400).json({ success: false, message: 'Kịch bản chiến dịch không hợp lệ' });
      }

      const preparedScript = await aiCampaignDraftService.prepareScript(script, req.user.id);
      if (directRecipients) this.applyDirectRecipients(preparedScript, directRecipients);
      else if (preparedScript.wizardDataSource === 'manual') this.markManualRecipientsRequired(preparedScript);
      const confirmationView = await campaignConfirmationService.buildConfirmationView({
        script: preparedScript,
        userId: req.user.id,
      });
      return res.json({ success: true, data: { preparedScript, confirmationView, maxRecipients: MAX_AI_MANUAL_RECIPIENTS } });
    } catch (error) {
      console.error('AI prepare campaign error:', error);
      return res.status(500).json(buildAiErrorPayload(error, 'Không thể chuẩn bị bản xem trước chiến dịch'));
    }
  }

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

      await chargeAiCredit(req);

      return res.json({
        success: true,
        data: script,
        warnings: validation.warnings,
      });
    } catch (error) {
      console.error('AI generate campaign V2 error:', error);
      return res.status(error.status || 500).json(buildAiErrorPayload(error, 'Lỗi khi xử lý yêu cầu AI'));
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

      await chargeAiCredit(req);

      return res.json({
        success: true,
        data: script,
      });
    } catch (error) {
      console.error('AI generate campaign error:', error);
      return res.status(error.status || 500).json(buildAiErrorPayload(error, 'Lỗi khi xử lý yêu cầu AI'));
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
      const { history, files, sessionId, locale, model } = req.body;

      if (!history || !history.length) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu lịch sử trò chuyện',
        });
      }

      const uiLocale = normalizeAssistantLocale(locale, 'vi');

      // Load wizard state once before help routing (conversation locale + campaign reuse).
      let persistedWizardState = null;
      if (sessionId) {
        try {
          const row = await aiSessionRepo.getSessionWizardState(Number(sessionId), req.user.id);
          persistedWizardState = row?.wizard_state || null;
        } catch (stateErr) {
          console.warn('[AI] Không đọc được wizard state:', stateErr.message);
        }
      }
      const normalizedPersisted = normalizeWizardState(persistedWizardState);
      const persistedMeta = normalizedPersisted.meta || {};
      const localeContext = resolveAssistantLocaleContext({
        history,
        uiLocale,
        persistedConversationLocale: persistedMeta.conversationLocale || null,
        // CampaignBrief contentLocale is artifact-scoped — apply inside processSmartChat only.
        briefContentLocale: null,
      });

      // Định tuyến mỏng: hỏi_đáp / ngoài_phạm_vi → help center;
      // làm_giúp / không_rõ → aiCampaign. Không nhét tài liệu vào prompt aiCampaign.
      // Có tệp đính kèm hoặc đang trả lời gate wizard → BỎ QUA help-router:
      // đính tệp / giữa flow là dấu hiệu muốn AI xử lý, không phải hỏi trợ giúp.
      const hasFiles = Array.isArray(files) && files.length > 0;
      const inWizard = isWizardAnswerTurn(history);
      const resourceOwnerUserId = resolveOwnerUserId(req.user);
      const helpResponse = (hasFiles || inWizard)
        ? null
        : await tryHandleHelpChat({
          history,
          userId: req.user.id,
          planOwnerUserId: resourceOwnerUserId,
          locale: localeContext.conversationLocale,
        });

      let response;
      let wizardShortCircuit;
      let _wizard;
      let publicResponse;

      if (helpResponse) {
        publicResponse = helpResponse;
        wizardShortCircuit = false;
        _wizard = null;
      } else {
        response = await aiCampaignService.processSmartChat({
          history,
          files: files || [],
          userId: req.user.id,
          resourceOwnerUserId,
          userRole: req.user.role,
          locale: uiLocale,
          localeContext,
          model,
          persistedWizardState,
        });
        ({ wizardShortCircuit, _wizard, ...publicResponse } = response || {});
      }

      // Persist session + messages + wizard state (bỏ qua lỗi DB để không block chat)
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

        const rawFiles = Array.isArray(files)
          ? files
            .map((f) => ({
              tempId: f?.tempId,
              originalName: f?.originalName,
              contentType: f?.contentType,
              size: f?.size,
            }))
            .filter((f) => f.tempId)
          : [];

        // Phase 2: promote temp → uploads/<user>/chat/ + catalog row (source=ai_assistant)
        const safeFiles = [];
        for (const f of rawFiles) {
          try {
            const promoted = await chatAttachmentService.promoteAssistantTempFile({
              tempId: f.tempId,
              originalName: f.originalName,
              contentType: f.contentType,
              size: f.size,
              ownerUserId: resolveWorkspaceOwnerId(req.user),
              actorUserId: req.user.id,
            });
            safeFiles.push({
              storage_key: promoted.storage_key,
              originalName: promoted.originalName || f.originalName,
              contentType: promoted.contentType || f.contentType,
              size: promoted.size ?? f.size,
              url: promoted.url,
              type: promoted.type,
              displayName: promoted.displayName || f.originalName,
            });
          } catch (promoteErr) {
            console.warn('[AI] promote attachment failed:', promoteErr.message);
            // Keep temp metadata so chip still shows name after F5 (file may expire ~24h)
            safeFiles.push(f);
          }
        }

        await aiSessionRepo.saveMessages(
          finalSessionId,
          req.user.id,
          userContent,
          publicResponse,
          safeFiles
        );

        if (safeFiles.length > 0) {
          await chatAttachmentService.promoteChatAttachments(safeFiles).catch((promoteErr) => {
            console.warn('[AI] promoteChatAttachments failed:', promoteErr.message);
          });
        }

        const localeMetaPatch = {
          conversationLocale: localeContext.conversationLocale,
          conversationLocaleSource: localeContext.conversationLocaleSource,
        };

        if (_wizard) {
          // Dead-end: cùng 1 gate bị hỏi lần thứ 3 liên tiếp → log 1 lần cho mỗi streak
          if (_wizard.gateAsked && _wizard.meta.lastGateCount >= 2 && !_wizard.meta.deadEndLoggedAt) {
            _wizard.meta.deadEndLoggedAt = new Date().toISOString();
            auditService.log({
              userId: req.user.id,
              category: 'system',
              action: AUDIT_ACTIONS.WIZARD_DEAD_END,
              entityType: AUDIT_ENTITY_TYPES.AI_SESSION,
              entityId: finalSessionId,
              details: {
                sessionId: finalSessionId,
                gate: _wizard.gateAsked,
                count: _wizard.meta.lastGateCount,
                channel: _wizard.gates?.channel || null,
              },
            });
          }

          await aiSessionRepo.updateWizardStateSections(finalSessionId, req.user.id, {
            gates: _wizard.gates,
            meta: {
              ...(_wizard.meta || {}),
              ...localeMetaPatch,
            },
            ...(_wizard.brief ? { brief: _wizard.brief } : {}),
            ...(_wizard.planChanged
              ? {
                planSnapshot: _wizard.planSnapshot ?? null,
                planSourcePrompt: _wizard.planSourcePrompt ?? '',
                planRequiresApproval: _wizard.planRequiresApproval !== false,
                planReset: Boolean(_wizard.planReset),
              }
              : {}),
          });
        } else {
          // Help path: meta-only — never touch gates/brief/plan.
          await aiSessionRepo.updateWizardStateSections(finalSessionId, req.user.id, {
            meta: {
              ...persistedMeta,
              ...localeMetaPatch,
            },
          });
        }
      } catch (dbErr) {
        console.warn('[AI] Không lưu được session:', dbErr.message);
      }

      if (!wizardShortCircuit) {
        await chargeAiCredit(req);
      }

      return res.json({
        success: true,
        data: { ...publicResponse, sessionId: finalSessionId, sessionTitle },
      });
    } catch (error) {
      console.error('AI chat error:', error);
      return res.status(error.status || 500).json(buildAiErrorPayload(error, 'Lỗi khi xử lý trò chuyện AI'));
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
      const { history, files, locale, model } = req.body;

      if (!history || !history.length) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu lịch sử trò chuyện',
        });
      }

      // Stateless: no wizard session memory — resolve from this request only.
      const uiLocale = normalizeAssistantLocale(locale, 'vi');
      const localeContext = resolveAssistantLocaleContext({
        history,
        uiLocale,
        persistedConversationLocale: null,
        briefContentLocale: null,
      });

      const response = await aiCampaignService.processSmartChatV2({
        history,
        files: files || [],
        userId: req.user.id,
        resourceOwnerUserId: resolveOwnerUserId(req.user),
        userRole: req.user.role,
        locale: uiLocale,
        localeContext,
        model,
      });

      await chargeAiCredit(req);

      return res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error('AI chat V2 error:', error);
      return res.status(error.status || 500).json(buildAiErrorPayload(error, 'Lỗi khi xử lý trò chuyện AI V2'));
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
      const result = await aiSessionRepo.getSessionMessages(Number(req.params.id), req.user.id);
      if (result === null) {
        return res.status(404).json({ success: false, message: 'Session không tồn tại' });
      }
      // data giữ nguyên là mảng messages (không breaking); wizardState là field mới bên cạnh
      return res.json({ success: true, data: result.messages, wizardState: result.wizardState });
    } catch (error) {
      console.error('Get session messages error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi khi lấy tin nhắn' });
    }
  }

  /**
   * PATCH /ai/sessions/:id/wizard-state — nút bấm frontend ghi state trực tiếp
   * (approve_plan, record_template_saved, reset_plan, mark_campaign_created, set_sheet_url).
   * Không tính AI credit vì không gọi model.
   */
  async patchWizardState(req, res) {
    try {
      const sessionId = Number(req.params.id);
      if (!Number.isFinite(sessionId)) {
        return res.status(400).json({ success: false, message: 'Session id không hợp lệ' });
      }
      const { action, payload } = req.body || {};

      const row = await aiSessionRepo.getSessionWizardState(sessionId, req.user.id);
      if (!row) {
        return res.status(404).json({ success: false, message: 'Session không tồn tại' });
      }

      const current = normalizeWizardState(row.wizard_state);
      let result;
      try {
        result = applyWizardStateAction(current, action, payload || {});
      } catch (actionErr) {
        return res.status(actionErr.status || 400).json({ success: false, message: actionErr.message });
      }

      if (!result.changed) {
        // "Nút bấm không có tác dụng" — tín hiệu dead-end phía client
        auditService.log({
          userId: req.user.id,
          category: 'system',
          action: AUDIT_ACTIONS.WIZARD_STATE_NOOP,
          entityType: AUDIT_ENTITY_TYPES.AI_SESSION,
          entityId: sessionId,
          details: { sessionId, action, payloadKeys: Object.keys(payload || {}) },
        });
        return res.json({ success: true, data: { wizardState: current, changed: false } });
      }

      result.state.meta.updatedAt = new Date().toISOString();
      const saved = await aiSessionRepo.writeWizardState(sessionId, req.user.id, result.state);
      return res.json({ success: true, data: { wizardState: saved, changed: true } });
    } catch (error) {
      console.error('Patch wizard state error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi khi cập nhật wizard state' });
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
      const { script, resourceVersions = [], directRecipients } = req.body;

      if (!script || !script.nodes || !script.connections) {
        return res.status(400).json({
          success: false,
          message: 'Script không hợp lệ. Cần có nodes và connections.',
        });
      }

      const preparedScript = await aiCampaignDraftService.prepareScript(script, req.user.id);
      if (directRecipients) this.applyDirectRecipients(preparedScript, directRecipients);
      else if (preparedScript.wizardDataSource === 'manual') {
        const error = new Error('Danh sách người nhận trực tiếp đã hết phiên. Vui lòng nhập lại.');
        error.code = 'MANUAL_RECIPIENTS_REQUIRED';
        error.statusCode = 400;
        throw error;
      }
      await campaignConfirmationService.assertResourceVersionsCurrent({ resourceVersions, userId: req.user.id });
      const normalizedNodes = preparedScript.nodes;
      const normalizedConnections = preparedScript.connections;
      // Runtime only executes email/zalo steps with templateId. Materialize inline steps before validation.
      // A later create failure can leave an orphan template; transaction coupling is intentionally deferred.
      await aiCampaignDraftService.autoCreateEmailTemplates(normalizedNodes, req.user.id);
      await aiCampaignDraftService.autoCreateZaloTemplates(normalizedNodes, req.user.id);
      const ownershipPreview = await campaignConfirmationService.buildConfirmationView({
        script: preparedScript,
        userId: req.user.id,
      });
      if (!ownershipPreview.readyToCreate) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DRAFT_RESOURCES',
          message: 'Kịch bản có tài khoản gửi, mẫu tin hoặc nội dung chưa hợp lệ.',
        });
      }
      for (const node of normalizedNodes) {
        const subtype = node.node_subtype || node.nodeSubtype;
        const validation = campaignNodeRegistryService.validateNodeConfig(subtype, node.config || {});
        if (!validation.valid) {
          return res.status(400).json({ success: false, code: 'INVALID_NODE_CONFIG', message: validation.errors.join(', ') });
        }
      }

      const createReq = {
        ...req,
        body: {
          campaignName: preparedScript.campaignName,
          description: preparedScript.description || '',
          campaignType: preparedScript.campaignType || 'mixed',
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
        campaignName: preparedScript.campaignName,
      });
    } catch (error) {
      console.error('AI create from draft error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        ...(error.code ? { code: error.code } : {}),
        message: error.message || 'Lỗi khi tạo chiến dịch từ draft AI',
      });
    }
  }

  applyDirectRecipients(script, directRecipients) {
    const recipients = validateManualRecipients(directRecipients);
    const hasEmailAction = (script.nodes || []).some((node) => (node.node_subtype || node.nodeSubtype) === 'send_email');
    const hasZaloPersonalAction = (script.nodes || []).some((node) => (node.node_subtype || node.nodeSubtype) === 'send_zalo_personal');
    if ((recipients.emails.length && !hasEmailAction) || (recipients.phones.length && !hasZaloPersonalAction)) {
      const error = new Error('Email chỉ dùng cho chiến dịch Email; số điện thoại chỉ dùng cho Zalo cá nhân.');
      error.code = 'MANUAL_RECIPIENT_CHANNEL_MISMATCH';
      error.statusCode = 400;
      throw error;
    }
    let matched = false;
    for (const node of script.nodes || []) {
      const subtype = node.node_subtype || node.nodeSubtype;
      const config = node.config || (node.config = {});
      if (subtype === 'send_email' && recipients.emails.length) {
        config.recipientSource = 'manual';
        config.recipientEmails = recipients.emails;
        matched = true;
      } else if (subtype === 'send_zalo_personal' && recipients.phones.length) {
        config.zaloRecipientSource = 'manual';
        config.zaloRecipientPhones = recipients.phones;
        matched = true;
      }
    }
    if (!matched) {
      const error = new Error('Danh sách nhập trực tiếp chỉ hỗ trợ Email hoặc Zalo cá nhân đúng với kênh gửi.');
      error.code = 'MANUAL_RECIPIENT_CHANNEL_MISMATCH';
      error.statusCode = 400;
      throw error;
    }
  }

  markManualRecipientsRequired(script) {
    for (const node of script.nodes || []) {
      const subtype = node.node_subtype || node.nodeSubtype;
      const config = node.config || (node.config = {});
      if (subtype === 'send_email') {
        config.recipientSource = 'manual';
        config.recipientEmails = [];
      } else if (subtype === 'send_zalo_personal') {
        config.zaloRecipientSource = 'manual';
        config.zaloRecipientPhones = [];
      }
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
      const { script, directRecipients } = req.body;

      if (!script || !script.nodes || !script.connections) {
        return res.status(400).json({
          success: false,
          message: 'Script không hợp lệ. Cần có nodes và connections.',
        });
      }

      // M2 defense: manual recipients require private overlay — never silent auto-run with model-copied PII.
      const looksManual = script.wizardDataSource === 'manual'
        || (script.nodes || []).some((node) => {
          const config = node?.config || {};
          return config.recipientSource === 'manual' || config.zaloRecipientSource === 'manual';
        });
      if (looksManual) {
        if (!directRecipients) {
          return res.status(400).json({
            success: false,
            code: 'MANUAL_RECIPIENTS_REQUIRED',
            message: 'Chiến dịch nhập người nhận trực tiếp cần xác nhận và danh sách người nhận. Vui lòng dùng bước xem trước.',
          });
        }
        this.applyDirectRecipients(script, directRecipients);
      }

      // Tự động tạo email/zalo templates từ inline content
      await aiCampaignDraftService.autoCreateEmailTemplates(script.nodes, req.user.id);
      await aiCampaignDraftService.autoCreateZaloTemplates(script.nodes, req.user.id);

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
   * GET /ai/allowed-models — model Gemini user được chọn theo gói.
   */
  async getAllowedModels(req, res) {
    try {
      const data = await getAllowedModelsForUser(req.user.id);
      return res.json({ success: true, data });
    } catch (error) {
      console.error('Get allowed AI models error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message || 'Lỗi server' });
    }
  }

  /**
   * PUT /ai/preferred-model — lưu model AI Assistant user chọn.
   */
  async savePreferredModel(req, res) {
    try {
      const data = await savePreferredModelForUser(req.user.id, req.body?.model);
      return res.json({ success: true, data, message: 'Đã lưu model AI mặc định' });
    } catch (error) {
      console.error('Save preferred AI model error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message || 'Lỗi server' });
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
      const {
        prompt,
        title,
        sessionId,
        userSummary,
        homepagePage,
        locale,
        landingBrief,
      } = req.body;
      if (!String(prompt || '').trim()) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập mô tả trang landing cho AI',
        });
      }

      const resolvedBrief = await resolveLandingBrief({ landingBrief, user: req.user });
      const ownerUserId = resolvedBrief?.ownerUserId
        ?? (req.user?.activeContext?.type === 'employee'
          ? req.user.activeContext.ownerId
          : req.user.id);
      const landingBriefContext = resolvedBrief
        ? buildLandingBriefContext(resolvedBrief)
        : null;
      const contentLocale = normalizeAssistantLocale(
        resolvedBrief?.normalizedBrief?.contentLocale || locale,
        'vi',
      );

      const enrichedPrompt = this._buildHomepageHtmlPrompt({
        prompt: String(prompt).trim(),
        homepagePage,
        locale: contentLocale,
      });

      const data = await aiLandingPageService.generate({
        userId: ownerUserId,
        actorUserId: req.user.id,
        prompt: enrichedPrompt,
        titleHint: title != null ? String(title) : '',
        landingBriefContext,
        contentLocale,
      });

      const leadFormDraft = resolvedBrief
        ? buildLeadFormDraftFromBrief(resolvedBrief.normalizedBrief)
        : null;
      if (leadFormDraft) {
        data.leadFormDraft = leadFormDraft;
      }

      // Lưu vào session nếu có sessionId (actor, not owner)
      const sid = sessionId ? Number(sessionId) : null;
      if (sid) {
        const userContent = String(userSummary || prompt).trim();
        const assistantMsg = {
          content: `Đã tạo landing page "${data.title}" cho bạn! Bạn có thể xem trước và lưu vào thư viện.`,
          type: 'landing_page',
          data: {
            title: data.title,
            html: data.html,
            ...(leadFormDraft ? { leadFormDraft } : {}),
          },
        };
        await aiSessionRepo.saveMessages(sid, req.user.id, userContent, assistantMsg).catch(() => {});
      }

      await chargeAiCredit(req);

      return res.json({ success: true, data });
    } catch (error) {
      console.error('AI generate landing HTML error:', error);
      return res.status(error.status || 500).json(buildAiErrorPayload(error, 'Lỗi khi sinh landing HTML'));
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
      const { history, chatbot_id, system_instruction, temperature, max_tokens, attachments } = req.body;
      const chatbotId = parseInt(chatbot_id, 10) || 0;
      const userId = resolveWorkspaceOwnerId(req.user);
      const data = await customChatService.chat({
        history,
        chatbotId,
        userId,
        systemInstruction: system_instruction,
        temperature,
        maxTokens: max_tokens,
        attachments: Array.isArray(attachments) ? attachments : [],
        attachmentBind: { chatbotId, uid: userId },
      });

      await chargeAiCredit(req);

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error('[CustomChat] Error:', error);
      return res.status(error.status || 500).json(buildAiErrorPayload(error, 'Lỗi khi xử lý chatbot AI'));
    }
  }

  /**
   * Upload document cho Custom AI Chat - extract text, chunk, embed
   */
  async customChatUpload(req, res) {
    try {
      const chatbotId = parseInt(req.body.chatbot_id, 10) || 0;
      const ownerUserId = resolveWorkspaceOwnerId(req.user);
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot || Number(chatbot.id_user) !== ownerUserId) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }
      const data = await customChatService.uploadDocument({
        chatbotId,
        userId: ownerUserId,
        file: req.file,
      });

      return res.json({
        success: true,
        ...data,
      });
    } catch (error) {
      console.error('[CustomChatUpload] Error:', error);
      return res.status(error.status || 500).json(buildAiErrorPayload(error));
    }
  }

  /**
   * Upload logo image for Custom AI Chatbot.
   */
  async customChatLogoUpload(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Không có file ảnh' });
      }
      if (req.file.size > MAX_UPLOAD_FILE_BYTES) {
        return res.status(400).json({
          success: false,
          message: `File ảnh vượt quá ${MAX_UPLOAD_FILE_MB}MB`,
        });
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
      const chatbotId = parseInt(req.params.chatbotId, 10);
      if (Number.isNaN(chatbotId)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      // pg trả BIGINT dưới dạng chuỗi → so sánh qua Number, nếu không chủ sở hữu
      // hợp lệ cũng bị 404 ("3" !== 3).
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      const ownerUserId = resolveWorkspaceOwnerId(req.user);
      if (!chatbot || Number(chatbot.id_user) !== ownerUserId) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      const documents = await customChatService.getDocuments(chatbotId, ownerUserId);

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
      const chatbotId = parseInt(req.params.chatbotId, 10);
      if (Number.isNaN(chatbotId)) {
        return res.status(400).json({ success: false, message: 'Invalid chatbot ID' });
      }

      // pg trả BIGINT dưới dạng chuỗi → so sánh qua Number, nếu không chủ sở hữu
      // hợp lệ cũng bị 404 ("3" !== 3).
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      const ownerUserId = resolveWorkspaceOwnerId(req.user);
      if (!chatbot || Number(chatbot.id_user) !== ownerUserId) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      const docId = decodeURIComponent(req.params.docId);
      await customChatService.deleteDocument(chatbotId, ownerUserId, docId);
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

      const ownerUserId = resolveWorkspaceOwnerId(req.user);
      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot || Number(chatbot.id_user) !== ownerUserId) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      const result = await customChatService.addTextDocument({
        chatbotId,
        userId: ownerUserId,
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
      return res.status(error.status || 500).json(buildAiErrorPayload(error));
    }
  }

  // ── Chatbot Studio Conversations ─────────────────────────────────

  /**
   * Get all conversations for a user
   */
  async getChatbotStudioConversations(req, res) {
    try {
      const { limit = 20, offset = 0, status = 'active', chatbot_id } = req.query;
      const result = await chatbotStudioConversationService.getConversations({
        userId: req.user.id,
        chatbotId: chatbot_id ? parseInt(chatbot_id, 10) : null,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        status,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('[ChatbotStudio] Get conversations error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get single conversation
   */
  async getChatbotStudioConversation(req, res) {
    try {
      const conversation = await chatbotStudioConversationService.getConversation({
        userId: req.user.id,
        conversationId: req.params.id,
      });
      return res.json({ success: true, data: conversation });
    } catch (error) {
      console.error('[ChatbotStudio] Get conversation error:', error);
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Upload a chat attachment for Studio (not Knowledge Base).
   * POST /api/ai/chat-attachment
   */
  async uploadChatAttachment(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Không có file được tải lên' });
      }
      const chatbotId = parseInt(req.body?.chatbot_id || req.body?.chatbotId, 10);
      if (!chatbotId) {
        return res.status(400).json({ success: false, message: 'chatbot_id is required' });
      }

      const chatbot = await chatbotRepository.findChatbotById(chatbotId);
      if (!chatbot || Number(chatbot.id_user) !== Number(req.user.id)) {
        return res.status(404).json({ success: false, message: 'Chatbot not found' });
      }

      const stored = await chatAttachmentService.storeChatFile({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        ownerUserId: req.user.id,
        chatbotId,
        bind: { uid: req.user.id },
        source: chatAttachmentService.CHAT_ATTACHMENT_SOURCES.STUDIO,
      });

      const { _key, ...clientPayload } = stored;
      return res.status(201).json({ success: true, data: clientPayload });
    } catch (error) {
      console.error('[ChatAttachment] upload error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Không thể tải file lên',
      });
    }
  }

  /**
   * Delete chat attachment (when user clicks 'X' before sending)
   * DELETE /api/ai/chat-attachment
   */
  async deleteChatAttachment(req, res) {
    try {
      const ref = req.body?.ref || req.query?.ref || req.params?.ref;
      const chatbotId = parseInt(req.body?.chatbot_id || req.body?.chatbotId || req.query?.chatbot_id || req.query?.chatbotId, 10);
      if (!ref) {
        return res.status(400).json({ success: false, message: 'ref is required' });
      }

      await chatAttachmentService.deleteChatAttachment({
        ref,
        chatbotId,
        bind: { uid: req.user.id },
        ownerUserId: req.user.id,
      });

      return res.json({ success: true, message: 'Đã xóa tệp đính kèm' });
    } catch (error) {
      console.error('[ChatAttachment] delete error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Không thể xóa tệp đính kèm',
      });
    }
  }

  /**
   * Get messages for a conversation
   */
  async getChatbotStudioMessages(req, res) {
    try {
      const { limit = 30, beforeId = null } = req.query;
      const page = await chatbotStudioConversationService.getMessages({
        userId: req.user.id,
        conversationId: req.params.id,
        limit: parseInt(limit, 10),
        beforeId,
      });
      return res.json({
        success: true,
        data: page.items,
        pagination: {
          hasMore: page.hasMore,
          nextBeforeId: page.nextBeforeId,
        },
      });
    } catch (error) {
      console.error('[ChatbotStudio] Get messages error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create new conversation
   */
  async createChatbotStudioConversation(req, res) {
    try {
      const { chatbot_id } = req.body;
      if (!chatbot_id) {
        return res.status(400).json({ success: false, message: 'chatbot_id is required' });
      }
      const conversation = await chatbotStudioConversationService.createOrGetConversation({
        userId: req.user.id,
        chatbotId: chatbot_id,
      });
      return res.status(201).json({ success: true, data: conversation });
    } catch (error) {
      console.error('[ChatbotStudio] Create conversation error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Add message to conversation
   */
  async addChatbotStudioMessage(req, res) {
    try {
      const { role, content, message_type, ai_model, ai_tokens_used, ai_latency_ms, attachments, metadata } = req.body;
      const message = await chatbotStudioConversationService.addMessage({
        userId: req.user.id,
        conversationId: req.params.id,
        role,
        content,
        messageType: message_type,
        aiModel: ai_model,
        aiTokensUsed: ai_tokens_used,
        aiLatencyMs: ai_latency_ms,
        attachments,
        metadata,
      });
      return res.status(201).json({ success: true, data: message });
    } catch (error) {
      console.error('[ChatbotStudio] Add message error:', error);
      return res.status(error.status || 500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete conversation
   */
  async deleteChatbotStudioConversation(req, res) {
    try {
      await chatbotStudioConversationService.deleteConversation({
        userId: req.user.id,
        conversationId: req.params.id,
      });
      return res.json({ success: true, message: 'Đã xóa cuộc hội thoại' });
    } catch (error) {
      console.error('[ChatbotStudio] Delete conversation error:', error);
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  /**
   * Clear all messages in conversation
   */
  async clearChatbotStudioConversation(req, res) {
    try {
      await chatbotStudioConversationService.clearConversation({
        userId: req.user.id,
        conversationId: req.params.id,
      });
      return res.json({ success: true, message: 'Đã xóa tin nhắn' });
    } catch (error) {
      console.error('[ChatbotStudio] Clear conversation error:', error);
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  _buildHomepageHtmlPrompt({ prompt, homepagePage, locale }) {
    const page = String(homepagePage || '').trim().toLowerCase();
    const lang = String(locale || 'vi').trim().toLowerCase() === 'en' ? 'en' : 'vi';

    const pageContext = {
      hero: 'Trang chủ Founder AI (nền tảng marketing automation + AI chatbot cho doanh nghiệp Việt Nam). Cần hero nổi bật, USP, social proof, CTA đăng ký/dùng thử.',
      contact: 'Trang liên hệ Founder AI với form liên hệ, thông tin công ty, kênh hỗ trợ.',
      pricing: 'Trang bảng giá Founder AI với các gói dịch vụ, so sánh tính năng, CTA chọn gói.',
    }[page];

    const parts = [prompt];
    if (pageContext) {
      parts.unshift(`Bối cảnh: ${pageContext}`);
    }
    parts.push(
      lang === 'en'
        ? 'Generate all visible user-facing text in English. Return a complete HTML page (Tailwind CDN) suitable for full-page display.'
        : 'Tạo toàn bộ nội dung hiển thị bằng tiếng Việt. Trả về HTML đầy đủ (Tailwind CDN) để hiển thị full page.',
    );
    return parts.join('\n\n');
  }
}

export default new AiController();
