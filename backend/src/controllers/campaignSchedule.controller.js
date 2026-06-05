import { serverError } from '../helpers.js';
import { requestCampaignScheduleRefresh } from '../utils/scheduler.js';
import campaignScheduleRepository from '../repositories/campaign/campaignSchedule.repository.js';
import { isAdminRole } from '../utils/roleScope.util.js';

class CampaignScheduleController {
  // Lấy tất cả lịch chạy của user
  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);

      const rows = await campaignScheduleRepository.findAll({ userId, isAdmin });

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
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { id } = req.params;

      const row = await campaignScheduleRepository.findById({ id, userId, isAdmin });

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
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { campaignId, scheduleName, scheduleType, cronExpression, enabled } = req.body;

      // Kiểm tra campaign có tồn tại và thuộc về user không
      const campaignExists = await campaignScheduleRepository.checkCampaignExists({ campaignId, userId, isAdmin });
      if (!campaignExists) {
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

      const row = await campaignScheduleRepository.create({
        campaignId,
        scheduleName,
        scheduleType,
        cronExpression,
        enabled,
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
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { id } = req.params;
      const { scheduleName, scheduleType, cronExpression, enabled } = req.body;

      // Kiểm tra schedule có tồn tại và thuộc về user không
      const scheduleData = await campaignScheduleRepository.findMutableById({ id, userId, isAdmin });
      if (!scheduleData) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
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

      const row = await campaignScheduleRepository.update({
        id,
        scheduleName,
        scheduleType,
        cronExpression,
        enabled,
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
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { id } = req.params;

      // Kiểm tra schedule có tồn tại và thuộc về user không
      const schedule = await campaignScheduleRepository.findMutableById({ id, userId, isAdmin });
      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch chạy',
        });
      }

      await campaignScheduleRepository.delete(id);

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
