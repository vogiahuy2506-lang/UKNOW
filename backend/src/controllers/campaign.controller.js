import db from '../config/database.js';
import uploadController from './upload.controller.js';
import { serverError, paginate } from '../helpers.js';
import campaignFlowService from '../services/campaign/campaignFlow.service.js';
import campaignCustomerRepository from '../repositories/campaign/campaignCustomer.repository.js';
import campaignRunService from '../services/campaign/campaignRun.service.js';
import campaignNodeDataService from '../services/campaign/campaignNodeData.service.js';
import campaignExecutionLogService from '../services/campaign/campaignExecutionLog.service.js';
import campaignEmailSenderService from '../services/campaign/campaignEmailSender.service.js';
import campaignCrudService from '../services/campaign/campaignCrud.service.js';
import { isAdminRole } from '../utils/roleScope.util.js';
import { checkUserResourceLimit } from '../utils/userResourceLimit.util.js';

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
   * Xác định request update có phải đang sửa nội dung campaign trong Builder hay không.
   *
   * Luồng hoạt động:
   * 1. Chỉ xét các field có thể làm thay đổi cấu trúc/nội dung chiến dịch.
   * 2. Nếu bất kỳ field nào xuất hiện trong payload thì xem là request sửa nội dung.
   * 3. Trường hợp chỉ cập nhật trạng thái (status-only) sẽ không bị chặn bởi quy tắc này.
   *
   * @param {object} payload body từ request cập nhật chiến dịch
   * @returns {boolean} true nếu là cập nhật nội dung campaign
   */
  isCampaignContentUpdateRequest(payload = {}) {
    const editableContentFields = [
      'campaignName',
      'description',
      'campaignType',
      'landingPageUrl',
      'startDate',
      'endDate',
      'timezone',
      'flowJson',
      'nodes',
      'connections',
    ];
    return editableContentFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field));
  }

  /**
   * Kiểm tra campaign hiện còn lượt chạy trạng thái `running` hay không.
   *
   * @param {object} client postgres client trong transaction hiện tại
   * @param {number|string} campaignId id chiến dịch cần kiểm tra
   * @returns {Promise<boolean>} true nếu tồn tại ít nhất 1 campaign run đang chạy
   */
  async hasRunningCampaignRun(client, campaignId) {
    const result = await client.query(
      `SELECT 1
       FROM campaign_runs
       WHERE id_campaign = $1 AND status = 'running'
       LIMIT 1`,
      [campaignId]
    );
    return result.rows.length > 0;
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
      const roleCode = req.user.role_code;
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
      const roleCode = req.user.role_code;
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
    const client = await db.getClient();

    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
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
        });
      }

      await client.query('BEGIN');

      // Create campaign
      const campaignResult = await client.query(
        `INSERT INTO campaigns (id_user, campaign_name, description, campaign_type, landing_page_url, start_date, end_date, timezone, flow_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [userId, campaignName, description, campaignType, landingPageUrl, startDate, endDate, timezone, flowJson ? JSON.stringify(flowJson) : null]
      );

      const campaign = campaignResult.rows[0];

      // Create nodes if provided
      const nodeIdMap = {};
      const orderMap = this.buildExecutionOrderMap(nodes || [], connections || [], {
        nodeIdKey: 'tempId',
        fallbackKey: 'id',
        sourceKey: 'sourceNodeId',
        targetKey: 'targetNodeId',
      });
      if (nodes && nodes.length > 0) {
        for (let idx = 0; idx < nodes.length; idx += 1) {
          const node = nodes[idx];
          const nodeKey = String(node.tempId ?? node.id ?? '');
          const executionOrder = orderMap.get(nodeKey) || idx + 1;
          const nodeResult = await client.query(
            `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, node_description, position_x, position_y, config, execution_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [campaign.id, node.nodeType, node.nodeSubtype, node.nodeName, node.nodeDescription, node.positionX || 0, node.positionY || 0, JSON.stringify(node.config || {}), executionOrder]
          );
          nodeIdMap[node.tempId || node.id] = nodeResult.rows[0].id;
        }
      }

      // Create connections (chỉ những connection có cả source và target nằm trong nodes)
      if (connections && connections.length > 0) {
        const sortedConnections = [...connections].sort((a, b) => {
          const sourceA = orderMap.get(String(a?.sourceNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
          const sourceB = orderMap.get(String(b?.sourceNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
          if (sourceA !== sourceB) return sourceA - sourceB;
          const targetA = orderMap.get(String(a?.targetNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
          const targetB = orderMap.get(String(b?.targetNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
          return targetA - targetB;
        });
        for (const conn of sortedConnections) {
          const sourceId = nodeIdMap[conn.sourceNodeId];
          const targetId = nodeIdMap[conn.targetNodeId];
          if (sourceId == null || targetId == null) continue;

          await client.query(
            `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id, connection_type, connection_label, condition_config)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [campaign.id, sourceId, targetId, conn.connectionType || 'default', conn.connectionLabel, conn.conditionConfig ? JSON.stringify(conn.conditionConfig) : null]
          );
        }
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Tạo chiến dịch thành công',
        data: {
          id: campaign.id,
          campaignName: campaign.campaign_name,
          campaignType: campaign.campaign_type,
          status: campaign.status
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Create campaign error:', error);
      if (this.isUnsupportedZaloGroupCampaignTypeError(error)) {
        return this.sendZaloGroupMigrationRequired(res);
      }
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    } finally {
      client.release();
    }
  }

  /**
   * Cập nhật campaign. Nếu có nodes/connections, xóa cũ và tạo lại trong transaction.
   * @param {import('express').Request} req - params: { id }, body: campaign fields
   * @param {import('express').Response} res
   */
  async update(req, res) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const userId = req.user.id;
      const roleCode = req.user.role_code;
      const isAdmin = isAdminRole(roleCode);
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
        connections
      } = req.body;
      const isContentUpdateRequest = this.isCampaignContentUpdateRequest(req.body);

      // Check ownership
      const existingParams = [id];
      let existingQuery = 'SELECT id FROM campaigns WHERE id = $1';
      if (!isAdmin) {
        existingParams.push(userId);
        existingQuery += ` AND id_user = $${existingParams.length}`;
      }
      const existing = await client.query(existingQuery, existingParams);

      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch'
        });
      }

      if (isContentUpdateRequest) {
        const hasRunningCampaignRun = await this.hasRunningCampaignRun(client, id);
        if (hasRunningCampaignRun) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message:
              'Chiến dịch đang chạy. Vui lòng dừng lượt chạy tại trang Chạy chiến dịch (CampaignRun) trước khi lưu thay đổi.',
          });
        }
      }

      // Update campaign
      const updateParams = [
        campaignName,
        description,
        campaignType,
        status,
        landingPageUrl,
        startDate,
        endDate,
        timezone,
        flowJson ? JSON.stringify(flowJson) : null,
        id,
      ];
      let updateQuery = `UPDATE campaigns SET
        campaign_name = COALESCE($1, campaign_name),
        description = COALESCE($2, description),
        campaign_type = COALESCE($3, campaign_type),
        status = COALESCE($4, status),
        landing_page_url = COALESCE($5, landing_page_url),
        start_date = COALESCE($6, start_date),
        end_date = COALESCE($7, end_date),
        timezone = COALESCE($8, timezone),
        flow_json = COALESCE($9, flow_json),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`;
      if (!isAdmin) {
        updateParams.push(userId);
        updateQuery += ` AND id_user = $${updateParams.length}`;
      }
      updateQuery += ' RETURNING *';
      const result = await client.query(updateQuery, updateParams);

      // Update nodes and connections if provided
      if (nodes !== undefined) {
        // Delete old nodes and connections
        await client.query('DELETE FROM campaign_connections WHERE id_campaign = $1', [id]);
        await client.query('DELETE FROM campaign_nodes WHERE id_campaign = $1', [id]);

        // Create new nodes
        const nodeIdMap = {};
        const orderMap = this.buildExecutionOrderMap(nodes || [], connections || [], {
          nodeIdKey: 'tempId',
          fallbackKey: 'id',
          sourceKey: 'sourceNodeId',
          targetKey: 'targetNodeId',
        });
        for (let idx = 0; idx < nodes.length; idx += 1) {
          const node = nodes[idx];
          const nodeKey = String(node.tempId ?? node.id ?? '');
          const executionOrder = orderMap.get(nodeKey) || idx + 1;
          const nodeResult = await client.query(
            `INSERT INTO campaign_nodes (id_campaign, node_type, node_subtype, node_name, node_description, position_x, position_y, config, execution_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [id, node.nodeType, node.nodeSubtype, node.nodeName, node.nodeDescription, node.positionX || 0, node.positionY || 0, JSON.stringify(node.config || {}), executionOrder]
          );
          nodeIdMap[node.tempId || node.id] = nodeResult.rows[0].id;
        }

        // Create new connections (chỉ những connection có cả source và target nằm trong nodes vừa tạo)
        if (connections) {
          const sortedConnections = [...connections].sort((a, b) => {
            const sourceA = orderMap.get(String(a?.sourceNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
            const sourceB = orderMap.get(String(b?.sourceNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
            if (sourceA !== sourceB) return sourceA - sourceB;
            const targetA = orderMap.get(String(a?.targetNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
            const targetB = orderMap.get(String(b?.targetNodeId ?? '')) || Number.MAX_SAFE_INTEGER;
            return targetA - targetB;
          });
          for (const conn of sortedConnections) {
            const sourceId = nodeIdMap[conn.sourceNodeId];
            const targetId = nodeIdMap[conn.targetNodeId];
            if (sourceId == null || targetId == null) continue;

            await client.query(
              `INSERT INTO campaign_connections (id_campaign, source_node_id, target_node_id, connection_type, connection_label, condition_config)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [id, sourceId, targetId, conn.connectionType || 'default', conn.connectionLabel, conn.conditionConfig ? JSON.stringify(conn.conditionConfig) : null]
            );
          }
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Cập nhật chiến dịch thành công',
        data: {
          id: result.rows[0].id,
          campaignName: result.rows[0].campaign_name,
          status: result.rows[0].status
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Update campaign error:', error);
      if (this.isUnsupportedZaloGroupCampaignTypeError(error)) {
        return this.sendZaloGroupMigrationRequired(res);
      }
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    } finally {
      client.release();
    }
  }

  /**
   * Xóa campaign và các tài nguyên liên quan (nodes, connections, file local nếu có).
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async delete(req, res) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const userId = req.user.id;
      const roleCode = req.user.role_code;
      const isAdmin = isAdminRole(roleCode);
      const { id } = req.params;

      // Kiểm tra campaign có tồn tại không
      const campaignParams = [id];
      let campaignQuery = 'SELECT id FROM campaigns WHERE id = $1';
      if (!isAdmin) {
        campaignParams.push(userId);
        campaignQuery += ` AND id_user = $${campaignParams.length}`;
      }
      const campaignResult = await client.query(campaignQuery, campaignParams);

      if (campaignResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch'
        });
      }

      // Lấy danh sách nodes của campaign để tìm email templates sử dụng attachments
      const nodesResult = await client.query(
        'SELECT id, config FROM campaign_nodes WHERE id_campaign = $1',
        [id]
      );

      const allFileKeysToDelete = [];

      // Duyệt qua các nodes để tìm email templates có attachments
      for (const node of nodesResult.rows) {
        try {
          const config = node.config;
          
          // Kiểm tra nếu node có sử dụng email template
          if (config && config.emailTemplateId) {
            const templateParams = [config.emailTemplateId];
            let templateQuery = 'SELECT attachments FROM email_templates WHERE id = $1';
            if (!isAdmin) {
              templateParams.push(userId);
              templateQuery += ` AND id_user = $${templateParams.length}`;
            }
            const templateResult = await client.query(templateQuery, templateParams);
            
            if (templateResult.rows.length > 0) {
              const attachments = templateResult.rows[0].attachments;
              if (attachments && attachments.length > 0) {
                const fileKeys = attachments
                  .map((att) => uploadController.normalizeStorageKey(att))
                  .filter(Boolean);
                allFileKeysToDelete.push(...fileKeys);
              }
            }
          }
          
          // Kiểm tra nếu config trực tiếp chứa attachments 
          if (config && config.attachments && Array.isArray(config.attachments)) {
            const fileKeys = config.attachments
              .map((att) => uploadController.normalizeStorageKey(att))
              .filter(Boolean);
            allFileKeysToDelete.push(...fileKeys);
          }
        } catch (nodeError) {
          console.warn('Error processing node attachments:', nodeError);
        }
      }

      // Xóa campaign và các bảng liên quan (CASCADE sẽ tự động xóa nodes và connections)
      const deleteParams = [id];
      let deleteQuery = 'DELETE FROM campaigns WHERE id = $1';
      if (!isAdmin) {
        deleteParams.push(userId);
        deleteQuery += ` AND id_user = $${deleteParams.length}`;
      }
      await client.query(deleteQuery, deleteParams);

      await client.query('COMMIT');

      // Xóa files local (nếu có)
      if (allFileKeysToDelete.length > 0) {
        try {
          await uploadController.deleteFromS3(allFileKeysToDelete);
          console.log(`🗑️ Deleted ${allFileKeysToDelete.length} local files for campaign ${id}`);
        } catch (s3Error) {
          // Log error nhưng không fail vì campaign đã được xóa thành công
          console.error('Error deleting local files for campaign:', id, s3Error);
        }
      }

      res.json({
        success: true,
        message: 'Xóa chiến dịch thành công'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Delete campaign error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ'
      });
    } finally {
      client.release();
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
      const roleCode = req.user.role_code;
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
      const roleCode = req.user.role_code;
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
      const roleCode = req.user.role_code;
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
   */
  async executeCampaign(campaignId, runId, userId, roleCode = null) {
    await campaignRunService.executeCampaign(campaignId, runId, userId, roleCode);
  }

  /**
   * Lấy danh sách customers từ data node
   * @param {object} node 
   * @param {number} userId 
   * @param {Array} allNodes - Tất cả nodes trong campaign (dùng cho save_customer)
   * @returns {Promise<Array>}
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
      const roleCode = req.user.role_code;
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
      });
    }
  }
}

export default new CampaignController();
