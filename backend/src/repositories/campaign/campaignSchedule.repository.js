import db from '../../config/database.js';

class CampaignScheduleRepository {
  async findAll({ userId, workspaceOwnerId = userId, isAdmin }) {
    const result = await db.query(
      `SELECT
         cs.id,
         cs.id_campaign,
         cs.schedule_name,
         cs.schedule_type,
         cs.cron_expression,
         cs.enabled,
         cs.last_run_at::timestamptz AS last_run_at,
         cs.next_run_at::timestamptz AS next_run_at,
         cs.run_count,
         COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) AS workspace_owner_id,
         cs.created_by,
         cs.created_at::timestamptz AS created_at,
         cs.updated_at::timestamptz AS updated_at,
         c.campaign_name AS campaign_name,
         lr.status AS last_run_status
       FROM campaign_schedules cs
       JOIN campaigns c ON cs.id_campaign = c.id
       LEFT JOIN LATERAL (
         SELECT cr.status
         FROM campaign_runs cr
         WHERE cr.id_schedule = cs.id
         ORDER BY cr.started_at DESC NULLS LAST, cr.id DESC
         LIMIT 1
       ) lr ON TRUE
       WHERE (
         $1::boolean = TRUE
         OR COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) = $2
       )
       ORDER BY cs.created_at DESC`,
      [isAdmin, workspaceOwnerId]
    );
    return result.rows;
  }

  async findById({ id, userId, workspaceOwnerId = userId, isAdmin }) {
    const result = await db.query(
      `SELECT
         cs.id,
         cs.id_campaign,
         cs.schedule_name,
         cs.schedule_type,
         cs.cron_expression,
         cs.enabled,
         cs.last_run_at::timestamptz AS last_run_at,
         cs.next_run_at::timestamptz AS next_run_at,
         cs.run_count,
         COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) AS workspace_owner_id,
         cs.created_by,
         cs.created_at::timestamptz AS created_at,
         cs.updated_at::timestamptz AS updated_at,
         c.campaign_name AS campaign_name,
         lr.status AS last_run_status
       FROM campaign_schedules cs
       JOIN campaigns c ON cs.id_campaign = c.id
       LEFT JOIN LATERAL (
         SELECT cr.status
         FROM campaign_runs cr
         WHERE cr.id_schedule = cs.id
         ORDER BY cr.started_at DESC NULLS LAST, cr.id DESC
         LIMIT 1
       ) lr ON TRUE
       WHERE cs.id = $1
         AND (
           $2::boolean = TRUE
           OR COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) = $3
         )`,
      [id, isAdmin, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  async findMutableById({ id, userId, workspaceOwnerId = userId, isAdmin }) {
    const result = await db.query(
      `SELECT cs.id, cs.id_campaign, cs.schedule_type, cs.cron_expression,
              cs.enabled, cs.run_count, cs.last_run_at::timestamptz AS last_run_at,
              COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) AS workspace_owner_id,
              cs.created_by
       FROM campaign_schedules cs
       JOIN campaigns c ON cs.id_campaign = c.id
       WHERE cs.id = $1
         AND (
           $2::boolean = TRUE
           OR COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) = $3
         )`,
      [id, isAdmin, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  async findCampaignForSchedule({ campaignId, userId, workspaceOwnerId = userId, isAdmin }) {
    const result = await db.query(
      `SELECT id, COALESCE(workspace_owner_id, id_user) AS workspace_owner_id
       FROM campaigns
       WHERE id = $1
         AND (
           $2::boolean = TRUE
           OR COALESCE(workspace_owner_id, id_user) = $3
         )`,
      [campaignId, isAdmin, workspaceOwnerId]
    );
    return result.rows[0] || null;
  }

  async checkCampaignExists(input) {
    return Boolean(await this.findCampaignForSchedule(input));
  }

  async hasRunningCampaignRun(campaignId) {
    const result = await db.query(
      `SELECT id
       FROM campaign_runs
       WHERE id_campaign = $1 AND status = 'running'
       LIMIT 1`,
      [campaignId]
    );
    return result.rows.length > 0;
  }

  async create({
    campaignId,
    scheduleName,
    scheduleType,
    cronExpression,
    enabled,
    workspaceOwnerId,
    createdBy,
  }) {
    const result = await db.query(
      `INSERT INTO campaign_schedules
       (id_campaign, schedule_name, schedule_type, cron_expression, enabled,
        workspace_owner_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, id_campaign, schedule_name, schedule_type, cron_expression, enabled,
         last_run_at::timestamptz AS last_run_at,
         next_run_at::timestamptz AS next_run_at,
         run_count,
         created_at::timestamptz AS created_at,
         updated_at::timestamptz AS updated_at`,
      [
        campaignId,
        scheduleName,
        scheduleType,
        cronExpression,
        enabled !== false,
        workspaceOwnerId,
        createdBy,
      ]
    );
    return result.rows[0];
  }

  async update({
    id,
    scheduleName,
    scheduleType,
    cronExpression,
    enabled,
    workspaceOwnerId,
    isAdmin,
  }) {
    const result = await db.query(
      `UPDATE campaign_schedules SET
       schedule_name = COALESCE($1, schedule_name),
       schedule_type = COALESCE($2, schedule_type),
       cron_expression = COALESCE($3, cron_expression),
       enabled = COALESCE($4, enabled),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
         AND (
           $6::boolean = TRUE
           OR COALESCE(workspace_owner_id, (
             SELECT COALESCE(c.workspace_owner_id, c.id_user)
             FROM campaigns c
             WHERE c.id = campaign_schedules.id_campaign
           )) = $7
         )
       RETURNING id, id_campaign, schedule_name, schedule_type, cron_expression, enabled,
         last_run_at::timestamptz AS last_run_at,
         next_run_at::timestamptz AS next_run_at,
         run_count,
         created_at::timestamptz AS created_at,
         updated_at::timestamptz AS updated_at`,
      [scheduleName, scheduleType, cronExpression, enabled, id, isAdmin, workspaceOwnerId]
    );
    return result.rows[0];
  }

  async delete({ id, workspaceOwnerId, isAdmin }) {
    await db.query(
      `DELETE FROM campaign_schedules cs
       USING campaigns c
       WHERE cs.id = $1
         AND c.id = cs.id_campaign
         AND (
           $2::boolean = TRUE
           OR COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) = $3
         )`,
      [id, isAdmin, workspaceOwnerId]
    );
  }
}

export default new CampaignScheduleRepository();
