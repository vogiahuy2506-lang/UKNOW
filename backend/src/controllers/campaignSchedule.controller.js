import { serverError } from '../helpers.js';
import db from '../config/database.js';
import { requestCampaignScheduleRefresh } from '../utils/scheduler.js';
import campaignScheduleRepository from '../repositories/campaign/campaignSchedule.repository.js';
import campaignCrudService from '../services/campaign/campaignCrud.service.js';
import { assertOnceCronNotYearRolled } from '../utils/onceScheduleValidation.util.js';
// Cột `next_run_at` không có chỗ ghi (production 12/09/2026: 29/29 lịch bật đều NULL) → tính lúc
// đọc, cùng luật nổ với scheduler.
import { computeScheduleNextRunAt } from '../utils/campaignScheduleCron.util.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import {
  CAMPAIGN_NOT_ACTIVE_CODE,
  buildCampaignNotActiveMessage,
  isCampaignActiveForSchedule,
} from '../utils/campaignScheduleActivation.util.js';

function normalizeOptionalBoolean(value) {
  if (value === undefined) return undefined;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return value;
}

export const SCHEDULE_DUPLICATE_CODE = 'SCHEDULE_DUPLICATE';
const SCHEDULE_DUPLICATE_MESSAGE =
  'Chiến dịch đã có lịch chạy y hệt (cùng kiểu, cùng giờ) đang bật — không cần đặt thêm. Hãy sửa lịch đó nếu muốn đổi.';
// Tên index bán phần ở migration 231 — hai request cùng lúc lọt qua bước kiểm trùng thì DB chặn nốt.
const SCHEDULE_DUPLICATE_INDEX = 'uq_campaign_schedules_enabled_dup';

function isScheduleDuplicateViolation(error) {
  return error?.code === '23505' && String(error?.constraint || '').includes(SCHEDULE_DUPLICATE_INDEX);
}

function respondScheduleDuplicate(res) {
  return res.status(409).json({
    success: false,
    code: SCHEDULE_DUPLICATE_CODE,
    message: SCHEDULE_DUPLICATE_MESSAGE,
  });
}

/**
 * Ghi nhật ký thao tác lịch — lỗi ghi nhật ký KHÔNG được làm hỏng thao tác chính (cùng khuôn
 * campaign.controller: try/catch riêng, chỉ cảnh báo). entity_id = id_campaign để tra theo chiến dịch.
 */
async function auditScheduleAction(req, action, campaignId, details) {
  try {
    await logWorkspace(
      getWorkspaceAuditContext(req),
      action,
      AUDIT_ENTITY_TYPES.CAMPAIGN,
      campaignId,
      details
    );
  } catch (auditErr) {
    console.warn(`[CampaignSchedule] ${action} audit failed:`, auditErr?.message);
  }
}

function employeeCanRunCampaign(req) {
  const context = req.user?.activeContext;
  return context?.type !== 'employee' || context.permissions?.campaigns_run === true;
}

/**
 * Kích hoạt chiến dịch (draft/paused → active, dùng lại `campaignCrudService.publishCampaign`)
 * rồi ghi lịch chạy bằng `writeScheduleTx(client)`, TRONG CÙNG một transaction.
 *
 * PLAN_DAT_LICH_CHIEN_DICH_NHAP_2026-09-23 mục 3.3: kích hoạt và tạo/bật lịch phải cùng thành công
 * hoặc cùng không — chiến dịch active mà không có lịch nào chờ là mầm gửi nhầm.
 *
 * @param {import('express').Request} req
 * @param {number} campaignId
 * @param {(client: object) => Promise<object>} writeScheduleTx nhận client transaction, trả về row lịch
 * @returns {Promise<{row: object, activatedCampaign: object}|{conflict: true}|{thrown: Error}>}
 */
async function activateCampaignAndWriteScheduleTx(req, campaignId, writeScheduleTx) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const activatedCampaign = await campaignCrudService.publishCampaignTx(client, {
      authUser: req.user,
      campaignId,
    });
    if (!activatedCampaign) {
      // Trạng thái đổi giữa lúc kiểm ở đầu request và lúc vào transaction (đua request) — không
      // còn draft/paused nữa, hoặc chiến dịch không thuộc quyền user. Coi như chưa active để báo lại.
      await client.query('ROLLBACK');
      return { conflict: true };
    }
    const row = await writeScheduleTx(client);
    await client.query('COMMIT');
    return { row, activatedCampaign };
  } catch (error) {
    await client.query('ROLLBACK');
    return { thrown: error };
  } finally {
    client.release();
  }
}

/**
 * Map một lỗi từ `activateCampaignAndWriteScheduleTx` thành response — dùng chung cho create/update.
 * Trả về response đã gửi nếu xử lý được, hoặc `null` nếu lỗi lạ (gọi tiếp phải throw ra ngoài).
 */
function respondActivateFailure(res, result, campaignStatus) {
  if (result.conflict) {
    return res.status(409).json({
      success: false,
      code: CAMPAIGN_NOT_ACTIVE_CODE,
      campaignStatus: campaignStatus ?? null,
      message: buildCampaignNotActiveMessage(campaignStatus),
    });
  }
  const error = result.thrown;
  if (error?.code === 'CANNOT_ACTIVATE_EMPTY_CAMPAIGN') {
    return res.status(error.statusCode || 409).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }
  if (isScheduleDuplicateViolation(error)) return respondScheduleDuplicate(res);
  return null;
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
        campaignStatus: row.campaign_status,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: row.last_run_status || null,
        nextRunAt: computeScheduleNextRunAt(row),
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
        campaignStatus: row.campaign_status,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: row.last_run_status || null,
        nextRunAt: computeScheduleNextRunAt(row),
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
      const activateCampaign = normalizeOptionalBoolean(req.body.activateCampaign) === true;

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

      // Lịch bật cho chiến dịch chưa `active` sẽ nổ rồi chết im lặng (createCampaignRunRecord ném 400,
      // lịch không được tự kích hoạt chiến dịch). Chặn ngay lúc đặt; lịch TẮT vẫn cho soạn sẵn.
      // `activateCampaign: true` mở lối thoát: kích hoạt chiến dịch ngay trong lúc tạo lịch, KHÔNG
      // gửi gì bây giờ (PLAN_DAT_LICH_CHIEN_DICH_NHAP_2026-09-23) — thay vì buộc người dùng bấm
      // "Chạy ngay" (gửi thật) chỉ để mở khoá đặt lịch.
      const campaignNotActiveYet = isEnabling && !isCampaignActiveForSchedule(campaign.status);
      if (campaignNotActiveYet && !activateCampaign) {
        return res.status(409).json({
          success: false,
          code: CAMPAIGN_NOT_ACTIVE_CODE,
          campaignStatus: campaign.status ?? null,
          message: buildCampaignNotActiveMessage(campaign.status),
        });
      }
      const needsActivation = campaignNotActiveYet && activateCampaign;

      // Lịch bật y hệt lịch đang bật (vụ #177/#178 cách nhau đúng một phút) → nổ cùng lúc, gửi hai lần.
      if (isEnabling) {
        const duplicate = await campaignScheduleRepository.findEnabledDuplicate({
          campaignId,
          scheduleType,
          cronExpression,
        });
        if (duplicate) return respondScheduleDuplicate(res);
      }

      let row;
      if (needsActivation) {
        const result = await activateCampaignAndWriteScheduleTx(req, campaignId, (client) =>
          campaignScheduleRepository.createTx(client, {
            campaignId,
            scheduleName,
            scheduleType,
            cronExpression,
            enabled,
            workspaceOwnerId: campaign.workspace_owner_id,
            createdBy: context.actorUserId,
          })
        );
        const failureResponse = (result.conflict || result.thrown)
          && respondActivateFailure(res, result, campaign.status);
        if (failureResponse) return failureResponse;
        if (result.thrown) throw result.thrown;
        row = result.row;
      } else {
        row = await campaignScheduleRepository.create({
          campaignId,
          scheduleName,
          scheduleType,
          cronExpression,
          enabled,
          workspaceOwnerId: campaign.workspace_owner_id,
          createdBy: context.actorUserId,
        });
      }
      const schedule = {
        id: row.id,
        campaignId: row.id_campaign,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: null,
        nextRunAt: computeScheduleNextRunAt(row),
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        campaignActivated: needsActivation,
        campaignStatus: needsActivation ? 'active' : campaign.status,
      };

      await auditScheduleAction(req, AUDIT_ACTIONS.CAMPAIGN_SCHEDULE_CREATED, row.id_campaign, {
        scheduleId: row.id,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
      });
      if (needsActivation) {
        await auditScheduleAction(req, AUDIT_ACTIONS.CAMPAIGN_ACTIVATED, row.id_campaign, {
          viaSchedule: true,
          scheduleId: row.id,
          previousStatus: campaign.status,
        });
      }

      return res.status(201).json({
        success: true,
        message: needsActivation
          ? 'Đã kích hoạt chiến dịch và tạo lịch chạy thành công'
          : 'Tạo lịch chạy thành công',
        data: schedule,
      });
    } catch (error) {
      if (isScheduleDuplicateViolation(error)) return respondScheduleDuplicate(res);
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
      const activateCampaign = normalizeOptionalBoolean(req.body.activateCampaign) === true;

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

      // Chỉ chặn lúc BẬT một lịch đang tắt — lịch đã bật từ trước mà sửa tên/giờ thì không bị chặn
      // (đã hỏng từ trước, giao diện có cảnh báo riêng; chặn ở đây làm người dùng không sửa được gì).
      // `activateCampaign: true` mở lối thoát giống lúc tạo lịch mới — xem PLAN_DAT_LICH_CHIEN_DICH_NHAP.
      const willEnableFromOff = enabled === true && scheduleData.enabled !== true;
      const campaignNotActiveYet = willEnableFromOff && !isCampaignActiveForSchedule(scheduleData.campaign_status);
      if (campaignNotActiveYet && !activateCampaign) {
        return res.status(409).json({
          success: false,
          code: CAMPAIGN_NOT_ACTIVE_CODE,
          campaignStatus: scheduleData.campaign_status ?? null,
          message: buildCampaignNotActiveMessage(scheduleData.campaign_status),
        });
      }
      const needsActivation = campaignNotActiveYet && activateCampaign;

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

      // Sau khi sửa lịch sẽ ĐANG BẬT: bật lại một lịch tắt, hoặc đổi kiểu/giờ của lịch bật, mà trùng
      // lịch bật khác của cùng chiến dịch → chặn bằng câu tiếng người thay vì để DB ném 23505.
      if (willBeEnabled && (enabled === true || changesExecution)) {
        const duplicate = await campaignScheduleRepository.findEnabledDuplicate({
          campaignId: scheduleData.id_campaign,
          scheduleType: scheduleType !== undefined ? scheduleType : scheduleData.schedule_type,
          cronExpression: cronExpression !== undefined ? cronExpression : scheduleData.cron_expression,
          excludeId: scheduleData.id,
        });
        if (duplicate) return respondScheduleDuplicate(res);
      }

      let row;
      if (needsActivation) {
        const result = await activateCampaignAndWriteScheduleTx(req, scheduleData.id_campaign, (client) =>
          campaignScheduleRepository.updateTx(client, {
            id,
            scheduleName,
            scheduleType,
            cronExpression,
            enabled,
            workspaceOwnerId: context.workspaceOwnerId,
            isAdmin: context.isSuperAdmin,
          })
        );
        const failureResponse = (result.conflict || result.thrown)
          && respondActivateFailure(res, result, scheduleData.campaign_status);
        if (failureResponse) return failureResponse;
        if (result.thrown) throw result.thrown;
        row = result.row;
      } else {
        row = await campaignScheduleRepository.update({
          id,
          scheduleName,
          scheduleType,
          cronExpression,
          enabled,
          workspaceOwnerId: context.workspaceOwnerId,
          isAdmin: context.isSuperAdmin,
        });
      }
      const schedule = {
        id: row.id,
        campaignId: row.id_campaign,
        scheduleName: row.schedule_name,
        scheduleType: row.schedule_type,
        cronExpression: row.cron_expression,
        enabled: row.enabled,
        lastRunAt: row.last_run_at,
        lastRunStatus: null,
        nextRunAt: computeScheduleNextRunAt(row),
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        campaignActivated: needsActivation,
        campaignStatus: needsActivation ? 'active' : scheduleData.campaign_status,
      };

      // Bật/tắt là thao tác quyết định chiến dịch có gửi hay không → action riêng; sửa tên/kiểu/giờ → UPDATED.
      const enabledChanged = enabled !== undefined && row.enabled !== scheduleData.enabled;
      if (enabledChanged) {
        await auditScheduleAction(req, AUDIT_ACTIONS.CAMPAIGN_SCHEDULE_TOGGLED, scheduleData.id_campaign, {
          scheduleId: scheduleData.id,
          enabled: row.enabled,
          previousEnabled: scheduleData.enabled === true,
        });
      }
      const changedFields = ['scheduleName', 'scheduleType', 'cronExpression'].filter(
        (key) => req.body[key] !== undefined
      );
      if (changedFields.length > 0) {
        await auditScheduleAction(req, AUDIT_ACTIONS.CAMPAIGN_SCHEDULE_UPDATED, scheduleData.id_campaign, {
          scheduleId: scheduleData.id,
          changedFields,
          enabled: row.enabled,
        });
      }
      if (needsActivation) {
        await auditScheduleAction(req, AUDIT_ACTIONS.CAMPAIGN_ACTIVATED, scheduleData.id_campaign, {
          viaSchedule: true,
          scheduleId: scheduleData.id,
          previousStatus: scheduleData.campaign_status,
        });
      }

      return res.json({
        success: true,
        message: needsActivation
          ? 'Đã kích hoạt chiến dịch và cập nhật lịch chạy thành công'
          : 'Cập nhật lịch chạy thành công',
        data: schedule,
      });
    } catch (error) {
      if (isScheduleDuplicateViolation(error)) return respondScheduleDuplicate(res);
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

      await auditScheduleAction(req, AUDIT_ACTIONS.CAMPAIGN_SCHEDULE_DELETED, schedule.id_campaign, {
        scheduleId: schedule.id,
        scheduleType: schedule.schedule_type,
        cronExpression: schedule.cron_expression,
        enabled: schedule.enabled === true,
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
