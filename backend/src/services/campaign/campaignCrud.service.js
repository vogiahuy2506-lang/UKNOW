import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import { enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';
import campaignCrudRepository from '../../repositories/campaign/campaignCrud.repository.js';
import campaignFlowService from './campaignFlow.service.js';
import uploadController from '../../controllers/upload.controller.js';

function createNotFoundError(message = 'Không tìm thấy chiến dịch') {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function createConflictError(message) {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
}

class CampaignCrudService {
  /**
   * Get campaigns list with filters and pagination.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async getAllCampaigns({ userId, roleCode, page = 1, limit = 10, status, type, search }) {
    const offset = (page - 1) * limit;
    const isAdmin = isAdminRole(roleCode);

    const rows = await campaignCrudRepository.findCampaigns({ userId, isAdmin, status, type, search, limit, offset });
    const total = await campaignCrudRepository.countCampaigns({ userId, isAdmin, status, type, search });

    return {
      items: rows.map((item) => ({
        id: item.id,
        campaignName: item.campaign_name,
        description: item.description,
        campaignType: item.campaign_type,
        status: item.status,
        startDate: item.start_date,
        endDate: item.end_date,
        totalCustomers: item.total_customers,
        totalSent: item.total_sent,
        totalDelivered: item.total_delivered,
        totalOpened: item.total_opened,
        totalClicked: item.total_clicked,
        totalConverted: item.total_converted,
        totalRevenue: item.total_revenue,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        publishedAt: item.published_at,
        lastRunAt: item.last_run_at,
        runningCount: item.running_count,
        completedCount: item.completed_count,
        createdBy: item.creator_name ? { name: item.creator_name } : null,
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get one campaign detail with nodes and connections.
   *
   * @param {object} input
   * @returns {Promise<object|null>}
   */
  async getCampaignById({ userId, roleCode, campaignId }) {
    const isAdmin = isAdminRole(roleCode);

    const campaign = await campaignCrudRepository.findCampaignById({ campaignId, isAdmin, userId });
    if (!campaign) return null;

    const nodesRows = await campaignCrudRepository.findNodesByCampaignId(campaignId);
    const connectionsRows = await campaignCrudRepository.findConnectionsByCampaignId(campaignId);

    return {
      id: campaign.id,
      campaignName: campaign.campaign_name,
      description: campaign.description,
      campaignType: campaign.campaign_type,
      status: campaign.status,
      flowJson: campaign.flow_json,
      landingPageUrl: campaign.landing_page_url,
      startDate: campaign.start_date,
      endDate: campaign.end_date,
      timezone: campaign.timezone,
      totalCustomers: campaign.total_customers,
      totalSent: campaign.total_sent,
      totalDelivered: campaign.total_delivered,
      totalOpened: campaign.total_opened,
      totalClicked: campaign.total_clicked,
      totalConverted: campaign.total_converted,
      totalRevenue: campaign.total_revenue,
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at,
      publishedAt: campaign.published_at,
      lastRunAt: campaign.last_run_at,
      nodes: nodesRows.map((node) => ({
        id: node.id,
        nodeType: node.node_type,
        nodeSubtype: node.node_subtype,
        nodeName: node.node_name,
        nodeDescription: node.node_description,
        positionX: node.position_x,
        positionY: node.position_y,
        config: node.config,
        isActive: node.is_active,
      })),
      connections: connectionsRows.map((conn) => ({
        id: conn.id,
        sourceNodeId: conn.source_node_id,
        targetNodeId: conn.target_node_id,
        connectionType: conn.connection_type,
        connectionLabel: conn.connection_label,
        conditionConfig: conn.condition_config,
      })),
    };
  }

  /**
   * Tạo campaign mới kèm nodes/connections trong một transaction.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async createCampaign({
    userId,
    roleCode,
    campaignName,
    description,
    campaignType,
    landingPageUrl,
    startDate,
    endDate,
    timezone = 'Asia/Ho_Chi_Minh',
    flowJson,
    nodes,
    connections,
  }) {
    const typeResourceKey = campaignType === 'email'
      ? 'emailCampaigns'
      : campaignType === 'zalo_group'
        ? 'zaloGroupCampaigns'
        : campaignType === 'zalo'
          ? 'zaloCampaigns'
          : null;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await enforceResourceLimitTx(client, { userId, roleCode, resourceKey: 'campaigns' });
      if (typeResourceKey) {
        await enforceResourceLimitTx(client, { userId, roleCode, resourceKey: typeResourceKey });
      }

      const campaign = await campaignCrudRepository.insertCampaignTx(client, {
        userId,
        campaignName,
        description,
        campaignType,
        landingPageUrl,
        startDate,
        endDate,
        timezone,
        flowJson: flowJson ? JSON.stringify(flowJson) : null,
      });

      const nodeIdMap = {};
      const orderMap = campaignFlowService.buildExecutionOrderMap(nodes || [], connections || [], {
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
          const nodeType = node.nodeType ?? node.node_type ?? 'unknown';
          const nodeSubtype = node.nodeSubtype ?? node.node_subtype ?? '';
          const nodeName = node.nodeName ?? node.node_name ?? 'Node';
          const nodeDescription = node.nodeDescription ?? node.node_description ?? '';
          const positionX = node.positionX ?? node.position_x ?? 0;
          const positionY = node.positionY ?? node.position_y ?? 0;
          const newNodeId = await campaignCrudRepository.insertNodeTx(client, {
            campaignId: campaign.id,
            nodeType,
            nodeSubtype,
            nodeName,
            nodeDescription,
            positionX,
            positionY,
            config: JSON.stringify(node.config || {}),
            executionOrder,
          });
          nodeIdMap[node.tempId || node.id] = newNodeId;
        }

        const resolveId = (id) => {
          if (id == null || String(id).trim() === '') return id;
          const mapped = nodeIdMap[String(id)];
          return mapped != null ? String(mapped) : String(id);
        };
        for (const node of nodes) {
          const tempKey = String(node.tempId ?? node.id ?? '');
          const dbId = nodeIdMap[tempKey];
          if (dbId == null) continue;
          const updatedConfig = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveId);
          if (JSON.stringify(node.config || {}) !== JSON.stringify(updatedConfig)) {
            await campaignCrudRepository.updateNodeConfigTx(client, dbId, updatedConfig);
          }
        }
      }

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
          await campaignCrudRepository.insertConnectionTx(client, {
            campaignId: campaign.id,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            connectionType: conn.connectionType || 'default',
            connectionLabel: conn.connectionLabel,
            conditionConfig: conn.conditionConfig ? JSON.stringify(conn.conditionConfig) : null,
          });
        }
      }

      await client.query('COMMIT');
      return {
        id: campaign.id,
        campaignName: campaign.campaign_name,
        campaignType: campaign.campaign_type,
        status: campaign.status,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cập nhật campaign; thay nodes/connections nếu `nodes` được gửi trong body.
   *
   * @param {object} input
   * @returns {Promise<{ id: number, campaignName: string, status: string }>}
   */
  async updateCampaign({
    campaignId,
    userId,
    roleCode,
    isContentUpdate,
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
  }) {
    const isAdmin = isAdminRole(roleCode);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const existing = await campaignCrudRepository.findCampaignByIdTx(client, {
        campaignId,
        isAdmin,
        userId,
      });
      if (!existing) {
        throw createNotFoundError();
      }

      if (isContentUpdate) {
        const hasRunning = await campaignCrudRepository.hasRunningRunTx(client, campaignId);
        if (hasRunning) {
          throw createConflictError(
            'Chiến dịch đang chạy. Vui lòng dừng lượt chạy tại trang Chạy chiến dịch (CampaignRun) trước khi lưu thay đổi.'
          );
        }
      }

      const updated = await campaignCrudRepository.updateCampaignFieldsTx(client, {
        campaignId,
        isAdmin,
        userId,
        campaignName,
        description,
        campaignType,
        status,
        landingPageUrl,
        startDate,
        endDate,
        timezone,
        flowJson,
      });

      if (nodes !== undefined) {
        await campaignCrudRepository.deleteConnectionsByCampaignTx(client, campaignId);
        await campaignCrudRepository.deleteNodesByCampaignTx(client, campaignId);

        const nodeIdMap = {};
        const orderMap = campaignFlowService.buildExecutionOrderMap(nodes || [], connections || [], {
          nodeIdKey: 'tempId',
          fallbackKey: 'id',
          sourceKey: 'sourceNodeId',
          targetKey: 'targetNodeId',
        });
        for (let idx = 0; idx < nodes.length; idx += 1) {
          const node = nodes[idx];
          const nodeKey = String(node.tempId ?? node.id ?? '');
          const executionOrder = orderMap.get(nodeKey) || idx + 1;
          const newNodeId = await campaignCrudRepository.insertNodeTx(client, {
            campaignId,
            nodeType: node.nodeType,
            nodeSubtype: node.nodeSubtype,
            nodeName: node.nodeName,
            nodeDescription: node.nodeDescription,
            positionX: node.positionX || 0,
            positionY: node.positionY || 0,
            config: JSON.stringify(node.config || {}),
            executionOrder,
          });
          nodeIdMap[node.tempId || node.id] = newNodeId;
        }

        const resolveIdUpd = (nodeRefId) => {
          if (nodeRefId == null || String(nodeRefId).trim() === '') return nodeRefId;
          const mapped = nodeIdMap[String(nodeRefId)];
          return mapped != null ? String(mapped) : String(nodeRefId);
        };
        for (const node of nodes) {
          const tempKey = String(node.tempId ?? node.id ?? '');
          const dbId = nodeIdMap[tempKey];
          if (dbId == null) continue;
          const updatedConfig = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveIdUpd);
          if (JSON.stringify(node.config || {}) !== JSON.stringify(updatedConfig)) {
            await campaignCrudRepository.updateNodeConfigTx(client, dbId, updatedConfig);
          }
        }

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
            await campaignCrudRepository.insertConnectionTx(client, {
              campaignId,
              sourceNodeId: sourceId,
              targetNodeId: targetId,
              connectionType: conn.connectionType || 'default',
              connectionLabel: conn.connectionLabel,
              conditionConfig: conn.conditionConfig ? JSON.stringify(conn.conditionConfig) : null,
            });
          }
        }
      }

      await client.query('COMMIT');
      return {
        id: updated.id,
        campaignName: updated.campaign_name,
        status: updated.status,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Xóa campaign (CASCADE nodes/connections) và thu thập file keys cần dọn S3.
   *
   * @param {object} input
   * @returns {Promise<{ fileKeysToDelete: string[] }>}
   */
  async deleteCampaign({ campaignId, userId, roleCode }) {
    const isAdmin = isAdminRole(roleCode);
    const client = await db.getClient();
    const allFileKeysToDelete = [];

    try {
      await client.query('BEGIN');

      const existing = await campaignCrudRepository.findCampaignByIdTx(client, {
        campaignId,
        isAdmin,
        userId,
      });
      if (!existing) {
        throw createNotFoundError();
      }

      const nodesRows = await campaignCrudRepository.findNodesByCampaignIdTx(client, campaignId);
      for (const node of nodesRows) {
        try {
          const config = node.config;
          if (config && config.emailTemplateId) {
            const attachments = await campaignCrudRepository.findEmailTemplateAttachmentsTx(client, {
              templateId: config.emailTemplateId,
              isAdmin,
              userId,
            });
            if (attachments && attachments.length > 0) {
              const fileKeys = attachments
                .map((att) => uploadController.normalizeStorageKey(att))
                .filter(Boolean);
              allFileKeysToDelete.push(...fileKeys);
            }
          }
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

      await campaignCrudRepository.deleteCampaignTx(client, { campaignId, isAdmin, userId });
      await client.query('COMMIT');

      return { fileKeysToDelete: allFileKeysToDelete };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Duplicate campaign with all nodes and connections in one transaction.
   *
   * @param {object} input
   * @returns {Promise<object|null>}
   */
  async duplicateCampaign({ userId, roleCode, campaignId, campaignName }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const isAdmin = isAdminRole(roleCode);

      const originalCampaign = await campaignCrudRepository.findCampaignByIdTx(client, { campaignId, isAdmin, userId });
      if (!originalCampaign) {
        await client.query('ROLLBACK');
        return null;
      }

      await enforceResourceLimitTx(client, {
        userId,
        roleCode,
        resourceKey: 'campaigns',
      });

      const newCampaign = await campaignCrudRepository.insertCampaignTx(client, {
        userId,
        campaignName,
        description: originalCampaign.description,
        campaignType: originalCampaign.campaign_type,
        landingPageUrl: originalCampaign.landing_page_url,
        startDate: originalCampaign.start_date,
        endDate: originalCampaign.end_date,
        timezone: originalCampaign.timezone,
        flowJson: originalCampaign.flow_json,
      });

      const nodesRows = await campaignCrudRepository.findNodesByCampaignIdTx(client, campaignId);
      const nodeIdMap = {};
      for (const node of nodesRows) {
        const newNodeId = await campaignCrudRepository.insertNodeTx(client, {
          campaignId: newCampaign.id,
          nodeType: node.node_type,
          nodeSubtype: node.node_subtype,
          nodeName: node.node_name,
          nodeDescription: node.node_description,
          positionX: node.position_x,
          positionY: node.position_y,
          config: node.config,
          executionOrder: node.execution_order,
        });
        nodeIdMap[node.id] = newNodeId;
      }

      const connectionsRows = await campaignCrudRepository.findConnectionsByCampaignIdTx(client, campaignId);
      for (const conn of connectionsRows) {
        const newSourceId = nodeIdMap[conn.source_node_id];
        const newTargetId = nodeIdMap[conn.target_node_id];
        if (newSourceId && newTargetId) {
          await campaignCrudRepository.insertConnectionTx(client, {
            campaignId: newCampaign.id,
            sourceNodeId: newSourceId,
            targetNodeId: newTargetId,
            connectionType: conn.connection_type,
            connectionLabel: conn.connection_label,
            conditionConfig: conn.condition_config,
          });
        }
      }

      await client.query('COMMIT');
      return {
        id: newCampaign.id,
        campaignName: newCampaign.campaign_name,
        campaignType: newCampaign.campaign_type,
        status: newCampaign.status,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Publish one campaign if current status is draft/paused.
   *
   * @param {object} input
   * @returns {Promise<object|null>}
   */
  async publishCampaign({ userId, roleCode, campaignId }) {
    const isAdmin = isAdminRole(roleCode);
    return campaignCrudRepository.publishCampaign({ campaignId, isAdmin, userId });
  }

  /**
   * Pause one campaign if current status is active.
   *
   * @param {object} input
   * @returns {Promise<object|null>}
   */
  async pauseCampaign({ userId, roleCode, campaignId }) {
    const isAdmin = isAdminRole(roleCode);
    return campaignCrudRepository.pauseCampaign({ campaignId, isAdmin, userId });
  }
}

export default new CampaignCrudService();
