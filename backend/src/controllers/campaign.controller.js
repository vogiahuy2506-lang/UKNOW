import uploadController from './upload.controller.js';
import { serverError, paginate } from '../helpers.js';
import campaignFlowService from '../services/campaign/campaignFlow.service.js';
import campaignCustomerRepository from '../repositories/campaign/campaignCustomer.repository.js';
import campaignRunService, {
  EMAIL_API_DELAY_MIN_MS,
  EMAIL_API_DELAY_MAX_MS,
} from '../services/campaign/campaignRun.service.js';
import campaignNodeDataService from '../services/campaign/campaignNodeData.service.js';
import campaignExecutionLogService from '../services/campaign/campaignExecutionLog.service.js';
import campaignEmailSenderService from '../services/campaign/campaignEmailSender.service.js';
import campaignCrudService from '../services/campaign/campaignCrud.service.js';
import { checkUserResourceLimit } from '../utils/userResourceLimit.util.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';
import { checkSendQuota } from '../utils/userSendLimit.util.js';
import campaignZaloSenderService from '../services/campaign/campaignZaloSender.service.js';
import zaloSettingsController from './zaloSettings.controller.js';
import emailSettingsController from './emailSettings.controller.js';
import emailSettingsSmtpService from '../services/email/emailSettingsSmtp.service.js';
import {
  isZaloOutboundResultSuccessful,
  describeZaloOutboundFailure,
} from '../utils/zaloDispatchDelivery.util.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';

class CampaignController {
  /**
   * Infer primitive type from a JS value for schema preview.
   *
   * @param {unknown} value
   * @returns {string}
   */
  inferValueType(value) {
    return campaignFlowService.inferValueType(value);
  }

  /**
   * Build schema array from first row in items.
   *
   * @param {Array<object>} rows
   * @returns {Array<{key: string, type: string}>}
   */
  buildSchemaFromRows(rows) {
    return campaignFlowService.buildSchemaFromRows(rows);
  }

  /**
   * Build success message for a node subtype.
   *
   * @param {string} nodeSubtype
   * @param {{ fetched?: number, total?: number, inserted?: number, updated?: number, skipped?: number }} stats
   * @returns {string}
   */
  buildNodeSuccessMessage(nodeSubtype, stats = {}) {
    return campaignFlowService.buildNodeSuccessMessage(nodeSubtype, stats);
  }

  /**
   * Normalize value for save_customer preview/log payload.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  normalizeSaveCustomerLogValue(value) {
    return campaignFlowService.normalizeSaveCustomerLogValue(value);
  }

  /**
   * Build fixed-schema items for save_customer execution log.
   *
   * @param {Array<object>} rows source rows with __nodeData
   * @param {object} fieldMap save_customer field mapping config
   * @param {Array<object>} customFields custom field mapping config
   * @returns {Array<object>}
   */
  buildSaveCustomerLogItems(rows = [], fieldMap = {}, customFields = []) {
    return campaignFlowService.buildSaveCustomerLogItems(
      rows,
      fieldMap,
      customFields,
      (row, config) => this.getFieldValue(row, config)
    );
  }

  /**
   * Parse email list from comma/newline/semicolon text.
   *
   * @param {string} text
   * @returns {string[]}
   */
  parseEmailList(text) {
    return campaignFlowService.parseEmailList(text);
  }

  /**
   * Build topological execution order map from graph connections.
   *
   * @param {Array<object>} nodes
   * @param {Array<object>} connections
   * @param {{ nodeIdKey: string, sourceKey: string, targetKey: string, fallbackKey?: string }} options
   * @returns {Map<string, number>}
   */
  buildExecutionOrderMap(nodes, connections, options) {
    return campaignFlowService.buildExecutionOrderMap(nodes, connections, options);
  }

  /**
   * Build a map from flow node id (frontend) to DB node id (campaign_nodes).
   *
   * @param {object|string|null} flowJson campaign.flow_json
   * @param {Array<object>} dbNodes rows from campaign_nodes
   * @returns {Map<string, string>}
   */
  buildFlowNodeIdMap(flowJson, dbNodes = []) {
    return campaignFlowService.buildFlowNodeIdMap(flowJson, dbNodes);
  }

  /**
   * Normalize config node reference ids to DB node ids.
   *
   * @param {object} config node config
   * @param {(id: unknown) => string} resolveNodeId resolver
   * @returns {object}
   */
  normalizeNodeReferenceConfig(config, resolveNodeId) {
    return campaignFlowService.normalizeNodeReferenceConfig(config, resolveNodeId);
  }

  /**
   * Kiểm tra lỗi enum khi DB chưa có giá trị `zalo_group`.
   *
   * @param {any} error lỗi phát sinh từ PostgreSQL
   * @returns {boolean}
   */
  isUnsupportedZaloGroupCampaignTypeError(error) {
    const code = String(error?.code || '').trim();
    const message = String(error?.message || '').toLowerCase();
    return code === '22P02' && message.includes('campaign_type') && message.includes('zalo_group');
  }

  /**
   * Trả lỗi rõ nghĩa để người dùng biết cần cập nhật enum campaign_type.
   *
   * @param {import('express').Response} res
   * @returns {import('express').Response}
   */
  sendZaloGroupMigrationRequired(res) {
    return res.status(400).json({
      success: false,
      message:
        'Database chưa hỗ trợ loại chiến dịch Zalo nhóm. Vui lòng chạy file SQL backend/sql/20260301_add_campaign_type_zalo_group.sql rồi thử lại.',
    });
  }

  /**
   * Lấy danh sách campaigns của user (có phân trang và lọc).
   * Query: page, limit, status, type, search.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getAll(req, res) {
    try {
      const { page = 1, limit = 10, status, type, search, origin } = req.query;
      const data = await campaignCrudService.getAllCampaigns({
        authUser: req.user,
        page,
        limit,
        status,
        type,
        search,
        origin,
      });

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get campaigns error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Lấy chi tiết campaign kèm nodes và connections.
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const campaign = await campaignCrudService.getCampaignById({
        authUser: req.user,
        campaignId: id,
      });
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch'
        });
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      console.error('Get campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Tạo mới campaign cùng nodes và connections (trong một transaction).
   * @param {import('express').Request} req - body: { campaignName, description, campaignType, nodes?, connections?, flowJson? }
   * @param {import('express').Response} res
   */
  async create(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const {
        campaignName,
        description,
        campaignType,
        landingPageUrl,
        startDate,
        endDate,
        timezone = 'Asia/Ho_Chi_Minh',
        flowJson,
        nodes,
        connections
      } = req.body;

      const campaignLimitCheck = await checkUserResourceLimit({
        userId: workspaceContext.workspaceOwnerId,
        roleCode: workspaceContext.roleCode,
        resourceKey: 'campaigns',
      });
      if (!campaignLimitCheck.allowed) {
        return res.status(400).json({
          success: false,
          message: campaignLimitCheck.message,
          limitReached: true,
        });
      }

      const typeResourceKey = campaignType === 'email'
        ? 'emailCampaigns'
        : campaignType === 'zalo_group'
          ? 'zaloGroupCampaigns'
          : campaignType === 'zalo'
            ? 'zaloCampaigns'
            : null;
      if (typeResourceKey) {
        const typeLimitCheck = await checkUserResourceLimit({
          userId: workspaceContext.workspaceOwnerId,
          roleCode: workspaceContext.roleCode,
          resourceKey: typeResourceKey,
        });
        if (!typeLimitCheck.allowed) {
          return res.status(400).json({ success: false, message: typeLimitCheck.message, limitReached: true });
        }
      }

      const campaign = await campaignCrudService.createCampaign({
        authUser: req.user,
        campaignName,
        description,
        campaignType,
        landingPageUrl,
        startDate,
        endDate,
        timezone,
        flowJson,
        nodes,
        connections,
      });

      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.CAMPAIGN_CREATED, AUDIT_ENTITY_TYPES.CAMPAIGN, campaign.id, { name: campaign.campaignName, type: campaign.campaignType });
      res.status(201).json({
        success: true,
        message: 'Tạo chiến dịch thành công',
        data: campaign,
      });
    } catch (error) {
      console.error('Create campaign error:', error);
      if (error?.code === 'RESOURCE_LIMIT_EXCEEDED' || error?.limitReached) {
        return res.status(error.statusCode || 403).json({
          success: false,
          message: error.message,
          limitReached: true,
        });
      }
      if (this.isUnsupportedZaloGroupCampaignTypeError(error)) {
        return this.sendZaloGroupMigrationRequired(res);
      }
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Cập nhật campaign. Nếu có nodes/connections, xóa cũ và tạo lại trong transaction.
   * @param {import('express').Request} req - params: { id }, body: campaign fields
   * @param {import('express').Response} res
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        campaignName,
        description,
        campaignType,
        status,
        landingPageUrl,
        startDate,
        endDate,
        timezone,
        flowJson,
        nodes,
        connections,
      } = req.body;

      const data = await campaignCrudService.updateCampaign({
        campaignId: id,
        authUser: req.user,
        isContentUpdate: campaignFlowService.isCampaignContentUpdateRequest(req.body),
        campaignName,
        description,
        campaignType,
        status,
        landingPageUrl,
        startDate,
        endDate,
        timezone,
        flowJson,
        nodes,
        connections,
      });

      res.json({
        success: true,
        message: 'Cập nhật chiến dịch thành công',
        data,
      });
    } catch (error) {
      console.error('Update campaign error:', error);
      if (error?.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message || 'Không tìm thấy chiến dịch',
        });
      }
      if (error?.statusCode === 409) {
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }
      if (this.isUnsupportedZaloGroupCampaignTypeError(error)) {
        return this.sendZaloGroupMigrationRequired(res);
      }
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Xóa campaign và các tài nguyên liên quan (nodes, connections, file local nếu có).
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async delete(req, res) {
    try {
      const { id } = req.params;

      const { fileKeysToDelete } = await campaignCrudService.deleteCampaign({
        campaignId: id,
        authUser: req.user,
      });

      if (fileKeysToDelete.length > 0) {
        try {
          await uploadController.deleteFromS3(fileKeysToDelete);
          console.log(`🗑️ Deleted ${fileKeysToDelete.length} local files for campaign ${id}`);
        } catch (s3Error) {
          console.error('Error deleting local files for campaign:', id, s3Error);
        }
      }

      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.CAMPAIGN_DELETED, AUDIT_ENTITY_TYPES.CAMPAIGN, Number(id), {});
      res.json({
        success: true,
        message: 'Xóa chiến dịch thành công',
      });
    } catch (error) {
      console.error('Delete campaign error:', error);
      if (error?.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message || 'Không tìm thấy chiến dịch',
        });
      }
      res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ',
      });
    }
  }

  /**
   * Đặt trạng thái campaign thành 'active' (publish).
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async publish(req, res) {
    try {
      const { id } = req.params;

      const campaign = await campaignCrudService.publishCampaign({
        authUser: req.user,
        campaignId: id,
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch hoặc chiến dịch đã được kích hoạt'
        });
      }

      res.json({
        success: true,
        message: 'Kích hoạt chiến dịch thành công',
        data: {
          id: campaign.id,
          status: campaign.status
        }
      });
    } catch (error) {
      console.error('Publish campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Tạm dừng campaign đang active (đặt status = 'paused').
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async pause(req, res) {
    try {
      const { id } = req.params;

      const campaign = await campaignCrudService.pauseCampaign({
        authUser: req.user,
        campaignId: id,
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch hoặc chiến dịch không đang hoạt động'
        });
      }

      res.json({
        success: true,
        message: 'Tạm dừng chiến dịch thành công',
        data: {
          id: campaign.id,
          status: campaign.status
        }
      });
    } catch (error) {
      console.error('Pause campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Chạy campaign ngay lập tức.
   *
   * Input body:
   * - source: 'campaign_run' | 'schedule'
   * - runName: tên lượt chạy hiển thị
   * - scheduleId: id lịch (khi source=schedule)
   * - adjacentZaloNodeDelayMs: delay giữa 2 node Zalo liền kề (ms)
   * - continuousMode: bật/tắt chế độ 1 run quét liên tục khách mới
   * - pollIntervalMs: (legacy) chu kỳ quét khách mới (ms) khi continuousMode=true
   * - resumeFromRunId: id lượt continuous cũ cần chạy tiếp để không gửi lại khách đã xử lý
   * - continueRunId: id run continuous cũ cần chạy tiếp bằng chính run_id đó (không tạo run mới)
   *
   * Response:
   * - runId, campaignId, runName, status
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async run(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const campaignId = parseInt(req.params.id, 10);
      const source = String(req.body?.source || '').trim().toLowerCase();
      const scheduleId = Number.isFinite(parseInt(req.body?.scheduleId, 10))
        ? parseInt(req.body.scheduleId, 10)
        : null;
      const runName = String(req.body?.runName || '').trim();
      const adjacentZaloNodeDelayMsRaw = Number.parseInt(req.body?.adjacentZaloNodeDelayMs, 10);
      const adjacentZaloNodeDelayMs = Number.isFinite(adjacentZaloNodeDelayMsRaw) && adjacentZaloNodeDelayMsRaw >= 0
        ? adjacentZaloNodeDelayMsRaw
        : null;
      const continuousModeRaw = String(req.body?.continuousMode ?? '').trim().toLowerCase();
      const continuousMode = continuousModeRaw === 'true' || req.body?.continuousMode === true;
      const pollIntervalMsRaw = Number.parseInt(req.body?.pollIntervalMs, 10);
      const pollIntervalMinutesRaw = Number.parseInt(
        req.body?.pollIntervalMinutes
          ?? req.body?.continuousCycleMinutes
          ?? req.body?.continuous_cycle_minutes,
        10
      );
      let pollIntervalMs = null;
      // Tương thích ngược:
      // - payload mới gửi `pollIntervalMs` (milliseconds)
      // - payload cũ có thể gửi nhầm phút vào `pollIntervalMs` hoặc dùng key phút riêng.
      if (Number.isFinite(pollIntervalMsRaw) && pollIntervalMsRaw > 0) {
        pollIntervalMs = pollIntervalMsRaw >= 1000
          ? pollIntervalMsRaw
          : pollIntervalMsRaw * 60 * 1000;
      } else if (Number.isFinite(pollIntervalMinutesRaw) && pollIntervalMinutesRaw > 0) {
        pollIntervalMs = pollIntervalMinutesRaw * 60 * 1000;
      }
      const resumeFromRunIdRaw = Number.parseInt(req.body?.resumeFromRunId, 10);
      const resumeFromRunId = Number.isFinite(resumeFromRunIdRaw) && resumeFromRunIdRaw > 0
        ? resumeFromRunIdRaw
        : null;
      const continueRunIdRaw = Number.parseInt(req.body?.continueRunId, 10);
      const continueRunId = Number.isFinite(continueRunIdRaw) && continueRunIdRaw > 0
        ? continueRunIdRaw
        : null;

      if (!['campaign_run', 'schedule'].includes(source)) {
        return res.status(400).json({
          success: false,
          message: 'Chỉ được chạy chiến dịch từ trang Chạy chiến dịch',
        });
      }
      if (continueRunId !== null && source !== 'campaign_run') {
        return res.status(400).json({
          success: false,
          message: 'Chỉ hỗ trợ chạy tiếp run continuous từ trang Chạy chiến dịch',
        });
      }
      if (continueRunId !== null && !continuousMode) {
        return res.status(400).json({
          success: false,
          message: 'Chạy tiếp run cũ chỉ áp dụng cho chế độ continuous',
        });
      }

      let runRecord;
      if (continueRunId !== null) {
        runRecord = await campaignRunService.resumeContinuousRunRecord({
          campaignId,
          workspaceOwnerId: workspaceContext.workspaceOwnerId,
          actorUserId: workspaceContext.actorUserId,
          roleCode: workspaceContext.roleCode,
          isAdmin: workspaceContext.isSuperAdmin,
          runId: continueRunId,
          runOptions: {
            adjacentZaloNodeDelayMs,
            pollIntervalMs,
          },
        });
      } else {
        runRecord = await this.createCampaignRunRecord({
          campaignId,
          workspaceOwnerId: workspaceContext.workspaceOwnerId,
          actorUserId: workspaceContext.actorUserId,
          roleCode: workspaceContext.roleCode,
          isAdmin: workspaceContext.isSuperAdmin,
          source,
          scheduleId,
          runName,
          runOptions: {
            adjacentZaloNodeDelayMs,
            continuousMode,
            pollIntervalMs,
            resumeFromRunId,
          },
        });
      }

      res.json({
        success: true,
        message: 'Đã bắt đầu chạy chiến dịch',
        data: {
          runId: runRecord.id,
          campaignId,
          runName: runRecord.run_name || runName || null,
          status: 'running'
        }
      });

      // Khởi động chiến dịch TRƯỚC khi ghi nhật ký.
      // Trước đây `await logWorkspace(...)` nằm ở giữa: nó chen một vòng đi-về DB vào
      // giữa lúc đã trả 200 "Đã bắt đầu chạy" và lúc thật sự chạy. Hệ quả là chiến dịch
      // khởi động muộn hơn thời điểm người dùng được báo, và nếu câu ghi nhật ký treo
      // (pool cạn — đúng lúc chạy chiến dịch là lúc pool căng nhất) thì chiến dịch KHÔNG
      // BAO GIỜ chạy dù API đã báo thành công; try/catch bắt được lỗi ném ra nhưng không
      // bắt được treo.
      const executionUserId = Number.parseInt(runRecord?.campaign_owner_id, 10)
        || workspaceContext.workspaceOwnerId;
      this.executeCampaign(campaignId, runRecord.id, executionUserId, workspaceContext.roleCode).catch(error => {
        console.error('Execute campaign error:', error);
      });

      try {
        await logWorkspace(
          getWorkspaceAuditContext(req),
          AUDIT_ACTIONS.CAMPAIGN_RUN_STARTED,
          AUDIT_ENTITY_TYPES.CAMPAIGN,
          campaignId,
          { runId: runRecord.id, source, continuousMode: Boolean(continuousMode) }
        );
      } catch (auditErr) {
        console.warn('[Campaign] CAMPAIGN_RUN_STARTED audit failed:', auditErr?.message);
      }
    } catch (error) {
      console.error('Run campaign error:', error);
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Lỗi server khi chạy chiến dịch'
      });
    }
  }

  async createCampaignRunRecord({
    campaignId,
    userId = null,
    workspaceOwnerId = userId,
    actorUserId = userId,
    roleCode,
    isAdmin,
    source,
    scheduleId = null,
    runName = '',
    runOptions = {},
  }) {
    return campaignRunService.createCampaignRunRecord({
      campaignId,
      workspaceOwnerId,
      actorUserId,
      roleCode,
      isAdmin,
      source,
      scheduleId,
      runName,
      runOptions,
    });
  }

  /**
   * Thực thi chiến dịch trong background
   * @param {number} campaignId 
   * @param {number} runId
   * @param {number} userId
   * @param {string|null} roleCode
   * @param {{resumedBy?: string}} executionOptions
   */
  async executeCampaign(campaignId, runId, userId, roleCode = null, executionOptions = {}) {
    await campaignRunService.executeCampaign(campaignId, runId, userId, roleCode, executionOptions);
  }

  /**
   * Lấy danh sách customers từ data node (sau lọc cột `dataSelectedColumns` nếu có).
   *
   * @param {object} node
   * @param {number} userId
   * @param {Array} allNodes - Tất cả nodes trong campaign (dùng cho save_customer)
   * @returns {Promise<{ items: Array<object>, dataLoadMeta: object }>}
   */
  async getCustomersFromDataNode(node, userId, allNodes = []) {
    return campaignNodeDataService.getCustomersFromDataNode(node, userId, allNodes);
  }

  /**
   * Lưu customers từ campaign vào database
   * @param {Array} customers - Danh sách customers
   * @param {number} campaignId - Campaign ID
   * @param {number} userId - User ID
   * @param {object} saveNode - Save customer node config
   */
  async saveCustomersFromCampaign(customers, campaignId, userId, saveNode, runId = null) {
    return campaignNodeDataService.saveCustomersFromCampaign(customers, campaignId, userId, saveNode, runId);
  }

  /**
   * Lấy giá trị field từ customer data theo config
   */
  getFieldValue(customerData, fieldConfig) {
    return campaignFlowService.getFieldValue(customerData, fieldConfig);
  }

  /**
   * Ensure campaign participation (tương tự customer.controller.js)
   */
  async ensureCampaignParticipation(client, campaignId, customerId, runId = null) {
    await campaignCustomerRepository.ensureCampaignParticipation(client, campaignId, customerId, runId);
  }

  async logExecutionNode({
    campaignId,
    runId,
    node,
    customerId = null,
    status = 'success',
    executionData = null,
    errorMessage = null,
    progressCurrent = null,
    progressTotal = null,
  }) {
    await campaignExecutionLogService.logExecutionNode({
      campaignId,
      runId,
      node,
      customerId,
      status,
      executionData,
      errorMessage,
      progressCurrent,
      progressTotal,
    });
  }

  /**
   * Gửi email cho một customer
   * @param {object} actionNode 
   * @param {object} customer 
   * @param {object} campaign 
   * @param {number} runId - Campaign run ID để lưu log
   */
  async sendEmailToCustomer(actionNode, customer, campaign, runId) {
    return campaignEmailSenderService.sendEmailToCustomer(actionNode, customer, campaign, runId);
  }

  /**
   * Nhân bản campaign cùng với nodes và connections.
   * @param {import('express').Request} req - params: { id }, body: { campaignName }
   * @param {import('express').Response} res
   */
  async duplicate(req, res) {
    try {
      const { id } = req.params;
      const { campaignName } = req.body;
      const duplicated = await campaignCrudService.duplicateCampaign({
        authUser: req.user,
        campaignId: id,
        campaignName,
      });
      if (!duplicated) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch'
        });
      }

      res.status(201).json({
        success: true,
        message: 'Nhân bản chiến dịch thành công',
        data: duplicated,
      });
    } catch (error) {
      console.error('Duplicate campaign error:', error);
      const statusCode = error?.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? 'Lỗi server' : (error?.message || 'Không thể nhân bản chiến dịch'),
        ...(error?.limitReached && { limitReached: true }),
      });
    }
  }

    /**
   * Lấy cấu hình delay từ environment variables & shared rate limiter để đồng bộ với Campaign Builder preview.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
    async getDelayConfig(req, res) {
      try {
        const limiter = campaignRunService.zaloRateLimiter;
        const zaloPersonalPolicy = limiter.resolveOutboundPolicy('zalo_personal');
        const zaloGroupPolicy = limiter.resolveOutboundPolicy('zalo_group');
        const zaloFriendPolicy = limiter.resolveOutboundPolicy('zalo_friend_request');

        res.json({
          success: true,
          data: {
            zalo_personal: {
              minMs: zaloPersonalPolicy.minDelayMs || zaloPersonalPolicy.interMessageMinMs || 20000,
              maxMs: zaloPersonalPolicy.maxDelayMs || zaloPersonalPolicy.interMessageMaxMs || 50000,
            },
            zalo_group: {
              minMs: zaloGroupPolicy.minDelayMs || zaloGroupPolicy.interMessageMinMs || 20000,
              maxMs: zaloGroupPolicy.maxDelayMs || zaloGroupPolicy.interMessageMaxMs || 50000,
            },
            zalo_friend: {
              minMs: zaloFriendPolicy.minDelayMs || zaloFriendPolicy.interMessageMinMs || 20000,
              maxMs: zaloFriendPolicy.maxDelayMs || zaloFriendPolicy.interMessageMaxMs || 50000,
            },
            email: {
              minMs: EMAIL_API_DELAY_MIN_MS,
              maxMs: EMAIL_API_DELAY_MAX_MS,
            },
          },
        });
      } catch (error) {
        console.error('Get delay config error:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy cấu hình delay',
        });
      }
    }

  /**
   * GET /api/campaigns/quick-send/estimate?channel=zalo|email&recipients=N
   * Ước tính thời gian gửi và thông số khung giờ nghỉ đêm từ policy runtime thực tế.
   */
  async getQuickSendEstimate(req, res) {
    try {
      const channel = String(req.query.channel || 'email').trim().toLowerCase();
      const recipients = Math.max(1, parseInt(req.query.recipients, 10) || 1);

      if (channel.startsWith('zalo')) {
        const limiter = campaignRunService.zaloRateLimiter;
        const policy = limiter.resolveOutboundPolicy(channel === 'zalo_group' ? 'zalo_group' : 'zalo_personal');
        const minDelayMs = policy.minDelayMs || policy.interMessageMinMs || 20_000;
        const maxDelayMs = policy.maxDelayMs || policy.interMessageMaxMs || 50_000;
        const avgDelayMs = (minDelayMs + maxDelayMs) / 2;

        const quietHoursStart = limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE;
        const quietHoursEnd = limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE;
        const qsFormatted = `${String(quietHoursStart).padStart(2, '0')}:00`;
        const qeFormatted = `${String(quietHoursEnd).padStart(2, '0')}:00`;

        if (recipients <= 1) {
          return res.json({
            success: true,
            data: {
              estimatedMs: 0,
              unit: 'immediate',
              value: 0,
              quietHours: {
                enabled: false,
                start: quietHoursStart,
                end: quietHoursEnd,
                startFormatted: qsFormatted,
                endFormatted: qeFormatted,
              },
            },
          });
        }

        const quietSpanHours = ((quietHoursEnd - quietHoursStart + 24) % 24) || 7;
        const activeSpanHours = 24 - quietSpanHours; // ví dụ 17h/ngày
        const activeDailyMs = activeSpanHours * 3600 * 1000;

        const totalActiveMs = (recipients - 1) * avgDelayMs;
        const fullDays = Math.floor(totalActiveMs / activeDailyMs);
        const remainderActiveMs = totalActiveMs % activeDailyMs;
        const totalWallClockMs = (fullDays * 24 * 3600 * 1000) + remainderActiveMs;

        let unit = 'seconds';
        let value = 0;
        if (totalWallClockMs < 60_000) {
          unit = 'seconds';
          value = Math.ceil(totalWallClockMs / 1000);
        } else if (totalWallClockMs < 3_600_000) {
          unit = 'minutes';
          value = Math.ceil(totalWallClockMs / 60_000);
        } else if (totalWallClockMs < 86_400_000) {
          unit = 'hours';
          value = Math.round((totalWallClockMs / 3_600_000) * 10) / 10;
        } else {
          unit = 'days';
          value = Math.round((totalWallClockMs / 86_400_000) * 10) / 10;
        }

        const quietHoursEnabled = totalActiveMs >= 2 * 3600 * 1000;

        return res.json({
          success: true,
          data: {
            estimatedMs: totalWallClockMs,
            unit,
            value,
            quietHours: {
              enabled: quietHoursEnabled,
              start: quietHoursStart,
              end: quietHoursEnd,
              startFormatted: qsFormatted,
              endFormatted: qeFormatted,
            },
          },
        });
      }

      // Email estimate — dùng cùng hằng số với campaign runner và getDelayConfig (mặc định 50-250ms, avg 150ms)
      const emailAvgDelayMs = (EMAIL_API_DELAY_MIN_MS + EMAIL_API_DELAY_MAX_MS) / 2;
      const totalMs = recipients <= 1 ? 0 : (recipients - 1) * emailAvgDelayMs;

      let unit = 'immediate';
      let value = 0;
      if (recipients <= 1 || totalMs <= 0) {
        unit = 'immediate';
        value = 0;
      } else if (totalMs < 60_000) {
        unit = 'seconds';
        value = Math.ceil(totalMs / 1000);
      } else if (totalMs < 3_600_000) {
        unit = 'minutes';
        value = Math.ceil(totalMs / 60_000);
      } else {
        unit = 'hours';
        value = Math.round((totalMs / 3_600_000) * 10) / 10;
      }

      return res.json({
        success: true,
        data: {
          estimatedMs: totalMs,
          unit,
          value,
          quietHours: {
            enabled: false,
            start: null,
            end: null,
            startFormatted: null,
            endFormatted: null,
          },
        },
      });
    } catch (error) {
      console.error('Quick send estimate error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi ước tính thời gian gửi' });
    }
  }

  /**
   * POST /api/campaigns/quick-send/test-send
   * Gửi thử nghiệm 1 tin nhắn/email cho người dùng kiểm tra trước khi gửi chiến dịch lớn.
   * Có rate limit chống lách hạn mức, kiểm tra quiet hours và account mutex Zalo dùng chung với campaign runner.
   */
  async testSendQuickCampaign(req, res) {
    try {
      const channel = String(req.body.channel || 'email').trim().toLowerCase();
      const recipient = String(req.body.recipient || '').trim();
      const message = String(req.body.message || '').trim();
      const subject = String(req.body.subject || '').trim();
      const accountId = req.body.accountId;
      const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

      if (!recipient) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập địa chỉ / số điện thoại người nhận thử nghiệm',
        });
      }

      // Kiểm tra quota tài khoản hiện tại
      const quota = await checkSendQuota({
        userId: req.user.id,
        channel: channel.startsWith('zalo') ? 'zalo' : 'email',
        roleCode: req.user.role,
        ownerContextId: req.user.activeContext?.ownerId,
      });

      if (!quota.allowed) {
        return res.status(403).json({
          success: false,
          code: 'SEND_QUOTA_EXCEEDED',
          message: quota.message || 'Bạn đã hết hạn mức gửi tin.',
        });
      }

      if (channel.startsWith('zalo')) {
        const limiter = campaignRunService.zaloRateLimiter;

        // 1. Kiểm tra khung giờ yên lặng trước khi gửi Zalo
        const nextAllowedSendAt = limiter.computeNextAllowedSendAtByQuietHours(Date.now());
        if (nextAllowedSendAt) {
          const qs = String(limiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE).padStart(2, '0');
          const qe = String(limiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE).padStart(2, '0');
          return res.status(400).json({
            success: false,
            code: 'QUIET_HOURS_ACTIVE',
            message: `Đang trong khung giờ yên lặng (${qs}:00 – ${qe}:00). Hệ thống tạm dừng gửi tin Zalo để bảo vệ tài khoản.`,
          });
        }

        const { account, api } = await zaloSettingsController.resolvePreviewAccountAndApi({
          userId: req.user.id,
          roleCode: req.user.role,
          accountId,
        });

        const preparedAttachments = await campaignZaloSenderService.prepareZaloAttachmentSources(attachments);

        // 2. Chạy qua Account Mutex chung của CampaignRunService để đồng bộ tuyệt đối với campaign worker
        const sent = await campaignRunService.runWithZaloAccountMutex(account.id, async () => {
          return campaignZaloSenderService.sendPersonalMessage({
            api,
            recipient,
            recipientType: 'phone',
            message,
            attachments: preparedAttachments,
          });
        });

        if (!isZaloOutboundResultSuccessful(sent)) {
          const failure = describeZaloOutboundFailure(sent);
          return res.status(400).json({
            success: false,
            message: `Gửi tin Zalo thất bại: ${failure.userReason || failure.errorMessage || 'Lỗi không xác định'}`,
            data: failure,
          });
        }

        return res.json({
          success: true,
          message: `Đã gửi tin Zalo thử nghiệm thành công tới ${recipient}`,
          data: sent,
        });
      } else {
        const emailResult = await emailSettingsSmtpService.sendCustomEmail({
          userId: req.user.id,
          roleCode: req.user.role,
          payload: {
            fromEmailId: accountId,
            to: recipient,
            subject: subject || 'Thử nghiệm gửi nhanh UKNOW Campaign',
            content: message,
            attachments,
          },
          trackingConfig: emailSettingsController.resolveTrackingBaseUrl(req),
        }, {
          normalizeEmailList: (v) => emailSettingsController.normalizeEmailList(v),
          buildTrackedHtml: (...args) => emailSettingsController.buildTrackedHtml(...args),
          buildMailAttachments: (items) => emailSettingsController.buildMailAttachments(items),
          createSmtpTransporter: (input) => emailSettingsController.createSmtpTransporter(input),
          formatUtc7: () => emailSettingsController.formatUtc7(),
        });

        return res.json({
          success: true,
          message: `Đã gửi email thử nghiệm thành công tới ${recipient}`,
          data: emailResult,
        });
      }
    } catch (error) {
      console.error('[QuickSend] testSendQuickCampaign error:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Lỗi server khi gửi thử nghiệm',
      });
    }
  }
}

export default new CampaignController();
