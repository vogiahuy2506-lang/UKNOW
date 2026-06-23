import db from '../../config/database.js';

class CampaignCrudRepository {
  /**
   * Fetch paginated campaigns list with optional filters.
   *
   * @param {object} params
   * @param {number} params.userId
   * @param {boolean} params.isAdmin
   * @param {string|undefined} params.status
   * @param {string|undefined} params.type
   * @param {string|undefined} params.search
   * @param {number} params.limit
   * @param {number} params.offset
   * @returns {Promise<object[]>}
   */
  async findCampaigns({ userId, isAdmin, status, type, search, limit, offset }) {
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
    return result.rows;
  }

  /**
   * Count campaigns matching optional filters.
   *
   * @param {object} params
   * @param {number} params.userId
   * @param {boolean} params.isAdmin
   * @param {string|undefined} params.status
   * @param {string|undefined} params.type
   * @param {string|undefined} params.search
   * @returns {Promise<number>}
   */
  async countCampaigns({ userId, isAdmin, status, type, search }) {
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
    return parseInt(countResult.rows[0].count, 10);
  }

  /**
   * Find a single campaign by id, optionally scoped to a user.
   *
   * @param {object} params
   * @param {number} params.campaignId
   * @param {boolean} params.isAdmin
   * @param {number} params.userId
   * @returns {Promise<object|null>}
   */
  async findCampaignById({ campaignId, isAdmin, userId }) {
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
    return result.rows[0] || null;
  }

  /**
   * Fetch all nodes for a campaign ordered by execution_order.
   *
   * @param {number} campaignId
   * @returns {Promise<object[]>}
   */
  async findNodesByCampaignId(campaignId) {
    const result = await db.query(
      'SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY execution_order',
      [campaignId]
    );
    return result.rows;
  }

  /**
   * Fetch all connections for a campaign.
   *
   * @param {number} campaignId
   * @returns {Promise<object[]>}
   */
  async findConnectionsByCampaignId(campaignId) {
    const result = await db.query(
      'SELECT * FROM campaign_connections WHERE id_campaign = $1',
      [campaignId]
    );
    return result.rows;
  }

  /**
   * Find a single campaign within a transaction, optionally scoped to a user.
   *
   * @param {object} client pg transaction client
   * @param {object} params
   * @param {number} params.campaignId
   * @param {boolean} params.isAdmin
   * @param {number} params.userId
   * @returns {Promise<object|null>}
   */
  async findCampaignByIdTx(client, { campaignId, isAdmin, userId }) {
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
    return campaignResult.rows[0] || null;
  }

  /**
   * Insert a new campaign (duplicate) within a transaction.
   *
   * @param {object} client pg transaction client
   * @param {object} params
   * @returns {Promise<object>} inserted row
   */
  async insertCampaignTx(client, { userId, campaignName, description, campaignType, landingPageUrl, startDate, endDate, timezone, flowJson }) {
    const newCampaignResult = await client.query(
      `INSERT INTO campaigns (
          id_user, campaign_name, description, campaign_type, landing_page_url,
          start_date, end_date, timezone, flow_json, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
        RETURNING *`,
      [userId, campaignName, description, campaignType, landingPageUrl, startDate, endDate, timezone, flowJson]
    );
    return newCampaignResult.rows[0];
  }

  /**
   * Fetch all nodes for a campaign within a transaction, ordered by id.
   *
   * @param {object} client pg transaction client
   * @param {number} campaignId
   * @returns {Promise<object[]>}
   */
  async findNodesByCampaignIdTx(client, campaignId) {
    const nodesResult = await client.query(
      'SELECT * FROM campaign_nodes WHERE id_campaign = $1 ORDER BY id',
      [campaignId]
    );
    return nodesResult.rows;
  }

  /**
   * Insert a single node within a transaction.
   *
   * @param {object} client pg transaction client
   * @param {object} params
   * @returns {Promise<number>} new node id
   */
  async insertNodeTx(client, { campaignId, nodeType, nodeSubtype, nodeName, nodeDescription, positionX, positionY, config, executionOrder }) {
    const newNodeResult = await client.query(
      `INSERT INTO campaign_nodes (
            id_campaign, node_type, node_subtype, node_name, node_description,
            position_x, position_y, config, execution_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
      [campaignId, nodeType, nodeSubtype, nodeName, nodeDescription, positionX, positionY, config, executionOrder]
    );
    return newNodeResult.rows[0].id;
  }

  /**
   * Fetch all connections for a campaign within a transaction.
   *
   * @param {object} client pg transaction client
   * @param {number} campaignId
   * @returns {Promise<object[]>}
   */
  async findConnectionsByCampaignIdTx(client, campaignId) {
    const connectionsResult = await client.query(
      'SELECT * FROM campaign_connections WHERE id_campaign = $1',
      [campaignId]
    );
    return connectionsResult.rows;
  }

  /**
   * Insert a single connection within a transaction.
   *
   * @param {object} client pg transaction client
   * @param {object} params
   * @returns {Promise<void>}
   */
  async insertConnectionTx(client, { campaignId, sourceNodeId, targetNodeId, connectionType, connectionLabel, conditionConfig }) {
    await client.query(
      `INSERT INTO campaign_connections (
              id_campaign, source_node_id, target_node_id,
              connection_type, connection_label, condition_config
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaignId, sourceNodeId, targetNodeId, connectionType, connectionLabel, conditionConfig]
    );
  }

  /**
   * @param {object} client
   * @param {number} nodeId
   * @param {object} config
   */
  async updateNodeConfigTx(client, nodeId, config) {
    await client.query(
      'UPDATE campaign_nodes SET config = $1 WHERE id = $2',
      [JSON.stringify(config || {}), nodeId]
    );
  }

  /**
   * @param {object} client
   * @param {number|string} campaignId
   * @returns {Promise<boolean>}
   */
  async hasRunningRunTx(client, campaignId) {
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
   * @param {object} client
   * @param {object} params
   * @returns {Promise<object>}
   */
  async updateCampaignFieldsTx(client, {
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
  }) {
    const updateParams = [
      campaignName,
      description,
      campaignType,
      status,
      landingPageUrl,
      startDate,
      endDate,
      timezone,
      flowJson != null ? JSON.stringify(flowJson) : null,
      campaignId,
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
    return result.rows[0];
  }

  /**
   * @param {object} client
   * @param {number|string} campaignId
   */
  async deleteConnectionsByCampaignTx(client, campaignId) {
    await client.query('DELETE FROM campaign_connections WHERE id_campaign = $1', [campaignId]);
  }

  /**
   * @param {object} client
   * @param {number|string} campaignId
   */
  async deleteNodesByCampaignTx(client, campaignId) {
    await client.query('DELETE FROM campaign_nodes WHERE id_campaign = $1', [campaignId]);
  }

  /**
   * @param {object} client
   * @param {object} params
   * @returns {Promise<object[]|null>}
   */
  async findEmailTemplateAttachmentsTx(client, { templateId, isAdmin, userId }) {
    const params = [templateId];
    let query = 'SELECT attachments FROM email_templates WHERE id = $1';
    if (!isAdmin) {
      params.push(userId);
      query += ` AND id_user = $${params.length}`;
    }
    const result = await client.query(query, params);
    return result.rows[0]?.attachments ?? null;
  }

  /**
   * @param {object} client
   * @param {object} params
   */
  async deleteCampaignTx(client, { campaignId, isAdmin, userId }) {
    const params = [campaignId];
    let query = 'DELETE FROM campaigns WHERE id = $1';
    if (!isAdmin) {
      params.push(userId);
      query += ` AND id_user = $${params.length}`;
    }
    await client.query(query, params);
  }

  /**
   * Set campaign status to active (publish).
   *
   * @param {object} params
   * @param {number} params.campaignId
   * @param {boolean} params.isAdmin
   * @param {number} params.userId
   * @returns {Promise<object|null>}
   */
  async publishCampaign({ campaignId, isAdmin, userId }) {
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
   * Set campaign status to paused.
   *
   * @param {object} params
   * @param {number} params.campaignId
   * @param {boolean} params.isAdmin
   * @param {number} params.userId
   * @returns {Promise<object|null>}
   */
  async pauseCampaign({ campaignId, isAdmin, userId }) {
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

export default new CampaignCrudRepository();
