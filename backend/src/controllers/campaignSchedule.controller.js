import { serverError } from '../helpers.js';
import { requestCampaignScheduleRefresh } from '../utils/scheduler.js';
import campaignScheduleRepository from '../repositories/campaign/campaignSchedule.repository.js';
import { assertOnceCronNotYearRolled } from '../utils/onceScheduleValidation.util.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';

function normalizeOptionalBoolean(value) {
  if (value === undefined) return undefined;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return value;
}

function employeeCanRunCampaign(req) {
  const context = req.user?.activeContext;
  return context?.type !== 'employee' || context.permissions?.campaigns_run === true;
}

class CampaignScheduleController {
  /**
   * Reject once-schedules whose next fire is a year-rollover (past day/month).
   * @returns {string|null} error message or null if ok
   */
  validateOnceScheduleTiming(scheduleType, cronExpression) {
    if (String(scheduleType || '') !== 'once') return null;
    const check = assertOnceCronNotYearRolled(cronExpression);
    return check.ok ? null : check.message;
  }

  // Lấy tất cả lịch chạy của user
  async getAll(req, res) {
    try {
      const context = getWorkspaceContext(req.user);

      const rows = await campaignScheduleRepository.findAll({
        userId: context.actorUserId,
        workspaceOwnerId: context.workspaceOwnerId,
        isAdmin: context.isSuperAdmin,
      });

      const schedules = rows.map(row => ({
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
      const context = getWorkspaceContext(req.user);
      const { id } = req.params;

      const row = await campaignScheduleRepository.findById({
        id,
        userId: context.actorUserId,
        workspaceOwnerId: context.workspaceOwnerId,
        isAdmin: context.isSuperAdmin,
      });

      if (!row) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
        });
      }

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
      const context = getWorkspaceContext(req.user);
      const { campaignId, scheduleName, scheduleType, cronExpression } = req.body;
      const enabled = normalizeOptionalBoolean(req.body.enabled);

      // Kiểm tra campaign có tồn tại và thuộc về user không
      const campaign = await campaignScheduleRepository.findCampaignForSchedule({
        campaignId,
        userId: context.actorUserId,
        workspaceOwnerId: context.workspaceOwnerId,
        isAdmin: context.isSuperAdmin,
      });
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy chiến dịch',
        });
      }

      const hasRunningRun = await campaignScheduleRepository.hasRunningCampaignRun(campaignId);
      if (hasRunningRun) {
        return res.status(409).json({
          success: false,
          message: 'Chiến dịch đang chạy, tạm thời chưa thể lên lịch',
        });
      }

      const onceTimingError = this.validateOnceScheduleTiming(scheduleType, cronExpression);
      if (onceTimingError) {
        return res.status(400).json({
          success: false,
          message: onceTimingError,
        });
      }

      // Bật lịch có khả năng gửi thật — yêu cầu campaigns_run trong employee context
      const isEnabling = enabled !== false;
      if (isEnabling && !employeeCanRunCampaign(req)) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền bật lịch chạy tự động cho chiến dịch (cần quyền campaigns_run)',
          code: 'PERMISSION_DENIED',
        });
      }

      const row = await campaignScheduleRepository.create({
        campaignId,
        scheduleName,
        scheduleType,
        cronExpression,
        enabled,
        workspaceOwnerId: campaign.workspace_owner_id,
        createdBy: context.actorUserId,
      });
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
      const context = getWorkspaceContext(req.user);
      const { id } = req.params;
      const { scheduleName, scheduleType, cronExpression } = req.body;
      const enabled = normalizeOptionalBoolean(req.body.enabled);

      // Kiểm tra schedule có tồn tại và thuộc về user không
      const scheduleData = await campaignScheduleRepository.findMutableById({
        id,
        userId: context.actorUserId,
        workspaceOwnerId: context.workspaceOwnerId,
        isAdmin: context.isSuperAdmin,
      });
      if (!scheduleData) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
        });
      }

      const changesExecution = scheduleType !== undefined || cronExpression !== undefined;
      const willBeEnabled = enabled === undefined ? scheduleData.enabled === true : enabled === true;
      if ((enabled === true || (changesExecution && willBeEnabled)) && !employeeCanRunCampaign(req)) {
        return res.status(403).json({
          success: false,
          message: 'Bạn không có quyền bật lịch chạy tự động cho chiến dịch (cần quyền campaigns_run)',
          code: 'PERMISSION_DENIED',
        });
      }

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
        const hasRunningRun = await campaignScheduleRepository.hasRunningCampaignRun(scheduleData.id_campaign);
        if (hasRunningRun) {
          return res.status(409).json({
            success: false,
            message: 'Chiến dịch đang chạy, chưa thể bật lịch',
          });
        }
      }

      if (scheduleType !== undefined || cronExpression !== undefined) {
        const effectiveType = scheduleType !== undefined ? scheduleType : scheduleData.schedule_type;
        const effectiveCron = cronExpression !== undefined ? cronExpression : scheduleData.cron_expression;
        const onceTimingError = this.validateOnceScheduleTiming(effectiveType, effectiveCron);
        if (onceTimingError) {
          return res.status(400).json({
            success: false,
            message: onceTimingError,
          });
        }
      }

      const row = await campaignScheduleRepository.update({
        id,
        scheduleName,
        scheduleType,
        cronExpression,
        enabled,
        workspaceOwnerId: context.workspaceOwnerId,
        isAdmin: context.isSuperAdmin,
      });
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
      const context = getWorkspaceContext(req.user);
      const { id } = req.params;

      // Kiểm tra schedule có tồn tại và thuộc về user không
      const schedule = await campaignScheduleRepository.findMutableById({
        id,
        userId: context.actorUserId,
        workspaceOwnerId: context.workspaceOwnerId,
        isAdmin: context.isSuperAdmin,
      });
      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
        });
      }

      await campaignScheduleRepository.delete({
        id,
        workspaceOwnerId: context.workspaceOwnerId,
        isAdmin: context.isSuperAdmin,
      });

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
