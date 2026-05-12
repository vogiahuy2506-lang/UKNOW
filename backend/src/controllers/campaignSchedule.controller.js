import db from '../config/database.js';
import { serverError } from '../helpers.js';
import { requestCampaignScheduleRefresh } from '../utils/scheduler.js';
import { isAdminRole } from '../utils/roleScope.util.js';

class CampaignScheduleController {
  // Lấy tất cả lịch chạy của user
  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);

      // Ép timestamptz để node-pg không parse naive timestamp theo TZ tiến trình (UTC).
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
         WHERE ($1::boolean = TRUE OR c.id_user = $2)
         ORDER BY cs.created_at DESC`,
        [isAdmin, userId]
      );

      const schedules = result.rows.map(row => ({
        id: row.id,
        campaignId: row.id_campaign,
        campaignName: row.campaign_name,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: row.last_run_status || null,
        nextRunAt: row.next_run_at,
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return res.json({
        success: true,
        data: schedules,
      });
    } catch (error) {
      return serverError(res, 'CampaignScheduleController.getAll', error);
    }
  }

  // Lấy một lịch chạy theo ID
  async getById(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { id } = req.params;

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
           AND ($2::boolean = TRUE OR c.id_user = $3)`,
        [id, isAdmin, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
        });
      }

      const row = result.rows[0];
      const schedule = {
        id: row.id,
        campaignId: row.id_campaign,
        campaignName: row.campaign_name,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: row.last_run_status || null,
        nextRunAt: row.next_run_at,
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return res.json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      return serverError(res, 'CampaignScheduleController.getById', error);
    }
  }

  // Tạo lịch chạy mới
  async create(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { campaignId, scheduleName, scheduleType, cronExpression, enabled } = req.body;

      // Kiểm tra campaign có tồn tại và thuộc về user không
      const campaignCheck = await db.query(
        `SELECT id
         FROM campaigns
         WHERE id = $1
           AND ($2::boolean = TRUE OR id_user = $3)`,
        [campaignId, isAdmin, userId]
      );

      if (campaignCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch',
        });
      }

      const runningCheck = await db.query(
        `SELECT id
         FROM campaign_runs
         WHERE id_campaign = $1 AND status = 'running'
         LIMIT 1`,
        [campaignId]
      );
      if (runningCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Chiến dịch đang chạy, tạm thời chưa thể lên lịch',
        });
      }

      // Tạo lịch chạy mới
      const result = await db.query(
        `INSERT INTO campaign_schedules 
         (id_campaign, schedule_name, schedule_type, cron_expression, enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, id_campaign, schedule_name, schedule_type, cron_expression, enabled,
           last_run_at::timestamptz AS last_run_at,
           next_run_at::timestamptz AS next_run_at,
           run_count,
           created_at::timestamptz AS created_at,
           updated_at::timestamptz AS updated_at`,
        [campaignId, scheduleName, scheduleType, cronExpression, enabled !== false]
      );

      const row = result.rows[0];
      const schedule = {
        id: row.id,
        campaignId: row.id_campaign,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: null,
        nextRunAt: row.next_run_at,
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return res.status(201).json({
        success: true,
        message: 'Tạo lịch chạy thành công',
        data: schedule,
      });
    } catch (error) {
      return serverError(res, 'CampaignScheduleController.create', error);
    } finally {
      requestCampaignScheduleRefresh();
    }
  }

  // Cập nhật lịch chạy
  async update(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { id } = req.params;
      const { scheduleName, scheduleType, cronExpression, enabled } = req.body;

      // Kiểm tra schedule có tồn tại và thuộc về user không
      const scheduleCheck = await db.query(
        `SELECT cs.id, cs.id_campaign, cs.schedule_type, cs.run_count, cs.last_run_at::timestamptz AS last_run_at FROM campaign_schedules cs
         JOIN campaigns c ON cs.id_campaign = c.id
         WHERE cs.id = $1
           AND ($2::boolean = TRUE OR c.id_user = $3)`,
        [id, isAdmin, userId]
      );

      if (scheduleCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
        });
      }

      const scheduleData = scheduleCheck.rows[0];
      const isOnceCompleted = (
        scheduleData.schedule_type === 'once'
        && (Number(scheduleData.run_count || 0) > 0 || scheduleData.last_run_at)
      );

      if (enabled === true && isOnceCompleted) {
        return res.status(409).json({
          success: false,
          message: 'Lịch chạy 1 lần đã hoàn thành, không thể bật lại',
        });
      }

      if (enabled === true) {
        const runningCheck = await db.query(
          `SELECT id
           FROM campaign_runs
           WHERE id_campaign = $1 AND status = 'running'
           LIMIT 1`,
          [scheduleData.id_campaign]
        );
        if (runningCheck.rows.length > 0) {
          return res.status(409).json({
            success: false,
            message: 'Chiến dịch đang chạy, chưa thể bật lịch',
          });
        }
      }

      // Cập nhật
      const result = await db.query(
        `UPDATE campaign_schedules SET
         schedule_name = COALESCE($1, schedule_name),
         schedule_type = COALESCE($2, schedule_type),
         cron_expression = COALESCE($3, cron_expression),
         enabled = COALESCE($4, enabled),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING id, id_campaign, schedule_name, schedule_type, cron_expression, enabled,
           last_run_at::timestamptz AS last_run_at,
           next_run_at::timestamptz AS next_run_at,
           run_count,
           created_at::timestamptz AS created_at,
           updated_at::timestamptz AS updated_at`,
        [scheduleName, scheduleType, cronExpression, enabled, id]
      );

      const row = result.rows[0];
      const schedule = {
        id: row.id,
        campaignId: row.id_campaign,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: null,
        nextRunAt: row.next_run_at,
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      return res.json({
        success: true,
        message: 'Cập nhật lịch chạy thành công',
        data: schedule,
      });
    } catch (error) {
      return serverError(res, 'CampaignScheduleController.update', error);
    } finally {
      requestCampaignScheduleRefresh();
    }
  }

  // Xóa lịch chạy
  async delete(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { id } = req.params;

      // Kiểm tra schedule có tồn tại và thuộc về user không
      const scheduleCheck = await db.query(
        `SELECT cs.id FROM campaign_schedules cs
         JOIN campaigns c ON cs.id_campaign = c.id
         WHERE cs.id = $1
           AND ($2::boolean = TRUE OR c.id_user = $3)`,
        [id, isAdmin, userId]
      );

      if (scheduleCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
        });
      }

      // Xóa
      await db.query('DELETE FROM campaign_schedules WHERE id = $1', [id]);

      return res.json({
        success: true,
        message: 'Xóa lịch chạy thành công',
      });
    } catch (error) {
      return serverError(res, 'CampaignScheduleController.delete', error);
    } finally {
      requestCampaignScheduleRefresh();
    }
  }
}

export default CampaignScheduleController;
