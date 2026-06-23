import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import { enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';
import campaignCrudRepository from '../../repositories/campaign/campaignCrud.repository.js';

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
