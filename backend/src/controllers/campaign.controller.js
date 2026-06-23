import uploadController from './upload.controller.js';
import { serverError, paginate } from '../helpers.js';
import campaignFlowService from '../services/campaign/campaignFlow.service.js';
import campaignCustomerRepository from '../repositories/campaign/campaignCustomer.repository.js';
import campaignRunService from '../services/campaign/campaignRun.service.js';
import campaignNodeDataService from '../services/campaign/campaignNodeData.service.js';
import campaignExecutionLogService from '../services/campaign/campaignExecutionLog.service.js';
import campaignEmailSenderService from '../services/campaign/campaignEmailSender.service.js';
import campaignCrudService from '../services/campaign/campaignCrud.service.js';
import { checkUserResourceLimit } from '../utils/userResourceLimit.util.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';

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
      const userId = req.user.id;
      const roleCode = req.user.role;
      const { page = 1, limit = 10, status, type, search } = req.query;
      const data = await campaignCrudService.getAllCampaigns({
        userId,
        roleCode,
        page,
        limit,
        status,
        type,
        search,
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
      const userId = req.user.id;
      const roleCode = req.user.role;
      const { id } = req.params;
      const campaign = await campaignCrudService.getCampaignById({
        userId,
        roleCode,
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
      const userId = req.user.id;
      const roleCode = req.user?.role;
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
        userId,
        roleCode,
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
        const typeLimitCheck = await checkUserResourceLimit({ userId, roleCode, resourceKey: typeResourceKey });
        if (!typeLimitCheck.allowed) {
          return res.status(400).json({ success: false, message: typeLimitCheck.message, limitReached: true });
        }
      }

      const campaign = await campaignCrudService.createCampaign({
        userId,
        roleCode,
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

      logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.CAMPAIGN_CREATED, AUDIT_ENTITY_TYPES.CAMPAIGN, campaign.id, { name: campaign.campaignName, type: campaign.campaignType });
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
      const userId = req.user.id;
      const roleCode = req.user.role;
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
        userId,
        roleCode,
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
      const userId = req.user.id;
      const roleCode = req.user.role;
      const { id } = req.params;

      const { fileKeysToDelete } = await campaignCrudService.deleteCampaign({
        campaignId: id,
        userId,
        roleCode,
      });

      if (fileKeysToDelete.length > 0) {
        try {
          await uploadController.deleteFromS3(fileKeysToDelete);
          console.log(`🗑️ Deleted ${fileKeysToDelete.length} local files for campaign ${id}`);
        } catch (s3Error) {
          console.error('Error deleting local files for campaign:', id, s3Error);
        }
      }

      logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.CAMPAIGN_DELETED, AUDIT_ENTITY_TYPES.CAMPAIGN, Number(id), {});
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
      const userId = req.user.id;
      const roleCode = req.user.role;
      const { id } = req.params;

      const campaign = await campaignCrudService.publishCampaign({
        userId,
        roleCode,
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
      const userId = req.user.id;
      const roleCode = req.user.role;
      const { id } = req.params;

      const campaign = await campaignCrudService.pauseCampaign({
        userId,
        roleCode,
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
      const userId = req.user.id;
      const roleCode = req.user.role;
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
          userId,
          roleCode,
          runId: continueRunId,
          runOptions: {
            adjacentZaloNodeDelayMs,
            pollIntervalMs,
          },
        });
      } else {
        runRecord = await this.createCampaignRunRecord({
          campaignId,
          userId,
          roleCode,
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

      const executionUserId = Number.parseInt(runRecord?.campaign_owner_id, 10) || userId;
      this.executeCampaign(campaignId, runRecord.id, executionUserId, roleCode).catch(error => {
        console.error('Execute campaign error:', error);
      });
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
    userId,
    roleCode,
    source,
    scheduleId = null,
    runName = '',
    runOptions = {},
  }) {
    return campaignRunService.createCampaignRunRecord({
      campaignId,
      userId,
      roleCode,
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
      const userId = req.user.id;
      const roleCode = req.user.role;
      const { id } = req.params;
      const { campaignName } = req.body;
      const duplicated = await campaignCrudService.duplicateCampaign({
        userId,
        roleCode,
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
   * Lấy cấu hình delay từ environment variables để đồng bộ với Campaign Builder preview.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
    async getDelayConfig(req, res) {
      try {
        const parsePositiveInt = (value, defaultValue) => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
          return parsed;
        };
  
        const zaloPersonalMin = parsePositiveInt(process.env.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS, 0)
          || parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT, 1000);
        const zaloPersonalMax = parsePositiveInt(process.env.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS, 0)
          || parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT, 1000);
  
        const zaloGroupMin = parsePositiveInt(process.env.ZALO_GROUP_INTER_MESSAGE_MIN_MS, 0)
          || parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT, 1000);
        const zaloGroupMax = parsePositiveInt(process.env.ZALO_GROUP_INTER_MESSAGE_MAX_MS, 0)
          || parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT, 1000);
  
        const zaloFriendMin = parsePositiveInt(process.env.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MIN_MS, 0)
          || parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT, 1000);
        const zaloFriendMax = parsePositiveInt(process.env.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MAX_MS, 0)
          || parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT, 1000);
  
        const emailMin = parsePositiveInt(process.env.EMAIL_INTER_MESSAGE_MIN_MS, 1000);
        const emailMax = parsePositiveInt(process.env.EMAIL_INTER_MESSAGE_MAX_MS, 1000);
  
        res.json({
          success: true,
          data: {
            zalo_personal: { minMs: zaloPersonalMin, maxMs: zaloPersonalMax },
            zalo_group: { minMs: zaloGroupMin, maxMs: zaloGroupMax },
            zalo_friend: { minMs: zaloFriendMin, maxMs: zaloFriendMax },
            email: { minMs: emailMin, maxMs: emailMax }
          }
        });
      } catch (error) {
        console.error('Get delay config error:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy cấu hình delay'
        });
      }
    }

}

export default new CampaignController();
