import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import { checkUserResourceLimit } from '../../utils/userResourceLimit.util.js';

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

    // Ép `timestamp without time zone` → `timestamptz` theo session TIME ZONE (Asia/Ho_Chi_Minh trong pool)
    // để node-pg nhận đúng instant UTC; tránh parse theo TZ tiến trình Node (thường UTC) gây +7h trên UI.
    let query = `
      SELECT c.id, c.campaign_name, c.description, c.campaign_type, c.status,
             c.start_date::timestamptz AS start_date, c.end_date::timestamptz AS end_date,
             c.total_customers, c.total_sent, c.total_delivered,
             c.total_opened, c.total_clicked, c.total_converted, c.total_revenue,
             c.created_at::timestamptz AS created_at, c.updated_at::timestamptz AS updated_at,
             c.published_at::timestamptz AS published_at, c.last_run_at::timestamptz AS last_run_at,
             c.id_user,
             COALESCE(u.full_name, u.username) AS creator_name,
             COALESCE(run_stats.running_count, 0)::INTEGER AS running_count,
             COALESCE(run_stats.completed_count, 0)::INTEGER AS completed_count
      FROM campaigns c
      LEFT JOIN users u ON c.id_user = u.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE cr.status = 'running') AS running_count,
          COUNT(*) FILTER (WHERE cr.status = 'completed') AS completed_count
        FROM campaign_runs cr
        WHERE cr.id_campaign = c.id
      ) run_stats ON TRUE
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      params.push(userId);
      query += ` AND c.id_user = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND c.status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      query += ` AND c.campaign_type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND c.campaign_name ILIKE $${params.length}`;
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM campaigns WHERE 1=1';
    const countParams = [];
    if (!isAdmin) {
      countParams.push(userId);
      countQuery += ` AND id_user = $${countParams.length}`;
    }
    if (status) {
      countParams.push(status);
      countQuery += ` AND status = $${countParams.length}`;
    }
    if (type) {
      countParams.push(type);
      countQuery += ` AND campaign_type = $${countParams.length}`;
    }
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND campaign_name ILIKE $${countParams.length}`;
    }
    const countResult = await db.query(countQuery, countParams);

    return {
      items: result.rows.map((item) => ({
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
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(countResult.rows[0].count / limit),
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
    const params = [campaignId];
    let query = `
      SELECT c.id, c.id_user, c.campaign_name, c.description, c.campaign_type, c.status,
             c.id_data_source, c.flow_json, c.landing_page_url, c.landing_page_form_id,
             c.start_date::timestamptz AS start_date, c.end_date::timestamptz AS end_date,
             c.timezone,
             c.total_customers, c.total_sent, c.total_delivered, c.total_opened, c.total_clicked,
             c.total_converted, c.total_revenue,
             c.created_at::timestamptz AS created_at, c.updated_at::timestamptz AS updated_at,
             c.published_at::timestamptz AS published_at, c.last_run_at::timestamptz AS last_run_at
      FROM campaigns c WHERE c.id = $1`;
    if (!isAdmin) {
      params.push(userId);
      query += ` AND id_user = $${params.length}`;
    }
    const result = await db.query(query, params);
    if (result.rows.length === 0) return null;

    const campaign = result.rows[0];
    const nodesResult = await db.query(
      'SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order',
      [campaignId]
    );
    const connectionsResult = await db.query(
      'SELECT * FROM campaign_connections WHERE id_campaign = $1',
      [campaignId]
    );

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
      nodes: nodesResult.rows.map((node) => ({
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
      connections: connectionsResult.rows.map((conn) => ({
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

      const campaignParams = [campaignId];
      let campaignQuery = `
        SELECT c.id, c.id_user, c.campaign_name, c.description, c.campaign_type, c.status,
               c.id_data_source, c.flow_json, c.landing_page_url, c.landing_page_form_id,
               c.start_date::timestamptz AS start_date, c.end_date::timestamptz AS end_date,
               c.timezone,
               c.total_customers, c.total_sent, c.total_delivered, c.total_opened, c.total_clicked,
               c.total_converted, c.total_revenue,
               c.created_at::timestamptz AS created_at, c.updated_at::timestamptz AS updated_at,
               c.published_at::timestamptz AS published_at, c.last_run_at::timestamptz AS last_run_at
        FROM campaigns c WHERE c.id = $1`;
      if (!isAdmin) {
        campaignParams.push(userId);
        campaignQuery += ` AND id_user = $${campaignParams.length}`;
      }
      const campaignResult = await client.query(campaignQuery, campaignParams);
      if (campaignResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const originalCampaign = campaignResult.rows[0];
      const campaignLimitCheck = await checkUserResourceLimit({
        userId,
        roleCode,
        resourceKey: 'campaigns',
      });
      if (!campaignLimitCheck.allowed) {
        await client.query('ROLLBACK');
        const limitError = new Error(campaignLimitCheck.message);
        limitError.statusCode = 400;
        throw limitError;
      }

      const newCampaignResult = await client.query(
        `INSERT INTO campaigns (
          id_user, campaign_name, description, campaign_type, landing_page_url,
          start_date, end_date, timezone, flow_json, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
        RETURNING *`,
        [
          userId,
          campaignName,
          originalCampaign.description,
          originalCampaign.campaign_type,
          originalCampaign.landing_page_url,
          originalCampaign.start_date,
          originalCampaign.end_date,
          originalCampaign.timezone,
          originalCampaign.flow_json,
        ]
      );
      const newCampaign = newCampaignResult.rows[0];

      const nodesResult = await client.query(
        'SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id',
        [campaignId]
      );
      const nodeIdMap = {};
      for (const node of nodesResult.rows) {
        const newNodeResult = await client.query(
          `INSERT INTO campaign_nodes (
            id_campaign, node_type, node_subtype, node_name, node_description,
            position_x, position_y, config, execution_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            newCampaign.id,
            node.node_type,
            node.node_subtype,
            node.node_name,
            node.node_description,
            node.position_x,
            node.position_y,
            node.config,
            node.execution_order,
          ]
        );
        nodeIdMap[node.id] = newNodeResult.rows[0].id;
      }

      const connectionsResult = await client.query(
        'SELECT * FROM campaign_connections WHERE id_campaign = $1',
        [campaignId]
      );
      for (const conn of connectionsResult.rows) {
        const newSourceId = nodeIdMap[conn.source_node_id];
        const newTargetId = nodeIdMap[conn.target_node_id];
        if (newSourceId && newTargetId) {
          await client.query(
            `INSERT INTO campaign_connections (
              id_campaign, source_node_id, target_node_id,
              connection_type, connection_label, condition_config
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              newCampaign.id,
              newSourceId,
              newTargetId,
              conn.connection_type,
              conn.connection_label,
              conn.condition_config,
            ]
          );
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
    const params = [campaignId];
    let query = `UPDATE campaigns SET
      status = 'active',
      published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND status IN ('draft', 'paused')`;
    if (!isAdmin) {
      params.push(userId);
      query += ` AND id_user = $${params.length}`;
    }
    query += ' RETURNING *';

    const result = await db.query(query, params);

    return result.rows[0] || null;
  }

  /**
   * Pause one campaign if current status is active.
   *
   * @param {object} input
   * @returns {Promise<object|null>}
   */
  async pauseCampaign({ userId, roleCode, campaignId }) {
    const isAdmin = isAdminRole(roleCode);
    const params = [campaignId];
    let query = `UPDATE campaigns SET
      status = 'paused',
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'active'`;
    if (!isAdmin) {
      params.push(userId);
      query += ` AND id_user = $${params.length}`;
    }
    query += ' RETURNING *';

    const result = await db.query(query, params);

    return result.rows[0] || null;
  }
}

export default new CampaignCrudService();
