import campaignController from './campaign.controller.js';
import campaignSimpleService, { SimpleCampaignError } from '../services/campaign/campaignSimple.service.js';
import campaignSimpleEditService from '../services/campaign/campaignSimpleEdit.service.js';
import { CAMPAIGN_VIA } from '../utils/campaignVia.util.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';

/**
 * HTTP cho trình "Tạo chiến dịch từng bước" (PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14, PR-1).
 * Nghiệp vụ nằm ở `services/campaign/campaignSimple.service.js`; controller chỉ đọc request, gọi service, trả JSON.
 */
class CampaignSimpleController {
  /**
   * Lỗi nghiệp vụ (có `statusCode`) trả nguyên thông điệp tiếng Việt; lỗi lạ trả 500 chung, không lộ chi tiết nội bộ.
   * @param {import('express').Response} res
   * @param {Error & { statusCode?: number, code?: string, extra?: object }} error
   * @param {string} label
   */
  sendError(res, error, label) {
    if (error instanceof SimpleCampaignError || Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({
        success: false,
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
        ...(error.extra || {}),
      });
    }
    console.error(`[CampaignSimple] ${label} error:`, error);
    return res.status(500).json({ success: false, message: 'Không thể xử lý yêu cầu tạo chiến dịch. Vui lòng thử lại.' });
  }

  /**
   * POST /campaigns/simple/preview — xem trước, KHÔNG ghi DB.
   * @param {import('express').Request} req - body: xem `campaignSimple.service.js` (hợp đồng chung với trang tạo từng bước)
   * @param {import('express').Response} res
   */
  async preview(req, res) {
    try {
      const data = await campaignSimpleService.previewSimpleCampaign({ body: req.body, authUser: req.user });
      return res.json({ success: true, data });
    } catch (error) {
      return this.sendError(res, error, 'preview');
    }
  }

  /**
   * POST /campaigns/simple — tạo chiến dịch NHÁP. Dùng lại `campaignController.create` (hạn mức tài nguyên + audit) như đường AI.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async create(req, res) {
    const createdTemplates = { emailTemplateIds: [], zaloTemplateIds: [] };
    let ownerId = null;
    let campaignCreated = false;
    try {
      // Lấy chủ workspace TRƯỚC khi tạo mẫu: lỗi giữa chừng (đã tạo mẫu email, hỏng ở mẫu Zalo) vẫn dọn được đúng người.
      ownerId = getWorkspaceContext(req.user).workspaceOwnerId;
      const draft = await campaignSimpleService.buildSimpleCreateDraft({ body: req.body, authUser: req.user, createdTemplates });

      const createReq = {
        ...req,
        // Nhãn nguồn cho audit CAMPAIGN_CREATED (phân biệt với builder / trợ lý AI).
        campaignVia: CAMPAIGN_VIA.SIMPLE,
        body: {
          campaignName: draft.campaignName,
          description: '',
          campaignType: draft.channel,
          nodes: draft.nodes,
          connections: draft.connections,
        },
      };

      // Nợ có sẵn: gọi controller bằng mockRes — giữ y hệt tiền lệ của ai.controller.js createCampaignFromDraft.
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
        await campaignSimpleService.cleanupCreatedTemplates(createdTemplates, ownerId);
        return res.status(createRes.status).json(createRes.data);
      }
      campaignCreated = true;

      return res.status(201).json({
        success: true,
        data: {
          campaignId: createRes.data?.data?.id,
          campaignName: draft.campaignName,
          channel: draft.channel,
          recipientCountHint: draft.recipientCountHint,
        },
      });
    } catch (error) {
      if (!campaignCreated) {
        // Dọn theo đúng id chủ workspace đã dùng để tạo mẫu (repository xoá có lọc id_user). Chưa tạo mẫu nào thì ownerId null → bỏ qua.
        await campaignSimpleService.cleanupCreatedTemplates(createdTemplates, ownerId).catch(() => {});
      }
      return this.sendError(res, error, 'create');
    }
  }

  /**
   * GET /campaigns/:id/simple — đọc ngược chiến dịch đã lưu ra form của trình từng bước (PLAN_HAI_TAB_TUNG_BUOC §3.1).
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async getSimple(req, res) {
    try {
      const campaignId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(campaignId) || campaignId <= 0) {
        return res.status(400).json({ success: false, message: 'ID chiến dịch không hợp lệ' });
      }
      const { diffs, ...data } = await campaignSimpleEditService.getSimpleEditState({ authUser: req.user, campaignId });
      // `diffs` (khác biệt kỹ thuật khi so khớp khứ hồi) chỉ để điều tra: ghi log, không đưa cho trình duyệt.
      if (diffs?.length) console.info(`[CampaignSimple] campaign ${campaignId} chỉ-xem do lệch khứ hồi:`, diffs.slice(0, 10).join(' | '));
      return res.json({ success: true, data });
    } catch (error) {
      return this.sendError(res, error, 'getSimple');
    }
  }

  /**
   * PUT /campaigns/:id/simple — ghi đè nodes + connections của chiến dịch đã lưu bằng form của trình từng bước.
   * @param {import('express').Request} req - params: { id }; body như `POST /campaigns/simple`
   * @param {import('express').Response} res
   */
  async updateSimple(req, res) {
    const createdTemplates = { emailTemplateIds: [], zaloTemplateIds: [] };
    let ownerId = null;
    let updated = false;
    try {
      const campaignId = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(campaignId) || campaignId <= 0) {
        return res.status(400).json({ success: false, message: 'ID chiến dịch không hợp lệ' });
      }
      ownerId = getWorkspaceContext(req.user).workspaceOwnerId;
      const result = await campaignSimpleEditService.updateSimpleCampaign({
        authUser: req.user,
        campaignId,
        body: req.body,
        createdTemplates,
      });
      updated = true;

      try {
        await logWorkspace(
          getWorkspaceAuditContext(req),
          AUDIT_ACTIONS.CAMPAIGN_UPDATED,
          AUDIT_ENTITY_TYPES.CAMPAIGN,
          campaignId,
          { nodesTruoc: result.nodesBefore, nodesSau: result.nodesAfter, via: CAMPAIGN_VIA.SIMPLE },
        );
      } catch (auditError) {
        console.warn('[CampaignSimple] CAMPAIGN_UPDATED audit failed:', auditError?.message);
      }

      return res.json({
        success: true,
        data: {
          campaignId: result.campaignId,
          campaignName: result.campaignName,
          channel: result.channel,
          recipientCountHint: result.recipientCountHint,
        },
      });
    } catch (error) {
      if (!updated) await campaignSimpleService.cleanupCreatedTemplates(createdTemplates, ownerId).catch(() => {});
      return this.sendError(res, error, 'updateSimple');
    }
  }
}

export default new CampaignSimpleController();
