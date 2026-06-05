import { serverError } from '../helpers.js';
import customerHelperService from '../services/customer/customerHelper.service.js';
import campaignRunService from '../services/campaign/campaignRun.service.js';
import campaignRunRepository from '../repositories/campaign/campaignRun.repository.js';
import { isAdminRole } from '../utils/roleScope.util.js';

class CampaignRunController {
  // Lấy lịch sử chạy chiến dịch
  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { campaignId, scheduleId, limit = 50 } = req.query;

      const rows = await campaignRunRepository.findRuns({ userId, isAdmin, campaignId, scheduleId, limit });

      const runs = rows.map(row => ({
        id: row.id,
        campaignId: row.id_campaign,
        campaignName: row.campaign_name,
        scheduleId: row.id_schedule,
        scheduleName: row.schedule_name,
        runType: row.run_type,
        runName: row.run_name || row.run_metadata?.runName || null,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        totalRecipients: row.total_recipients,
        successfulSends: row.successful_sends,
        failedSends: row.failed_sends,
        skippedSends: row.skipped_sends,
        errorMessage: row.error_message,
        runMetadata: row.run_metadata,
        createdAt: row.created_at,
      }));

      return res.json({ success: true, data: runs });
    } catch (error) {
      return serverError(res, 'CampaignRunController.getAll', error);
    }
  }

  /**
   * Chi tiết một lần chạy.
   * - linkClickCount: tổng bản ghi customer_journey với event_type email_clicked hoặc zalo_clicked (mỗi lượt = 1 dòng).
   * - Đơn hàng: đếm từ customer_purchases theo nhóm trạng thái (đồng bộ bộ lọc với dashboard).
   *
   * Query tùy chọn cho `executionLogs` (data loader / cursor):
   * - Không truyền: trả toàn bộ log, sắp `node_order` → `created_at` → `id` (hành vi cũ).
   * - `executionLogsLimit` (+ `executionLogsAfterId`): phân trang theo `ce.id ASC`, kèm `executionLogsHasMore`, `executionLogsNextAfterId`.
   * - `executionLogsUpdatedAfter` (ISO): chỉ dòng `updated_at` mới hơn mốc (poll); nếu chỉ gửi mốc này thì limit mặc định 500.
   */
  async getById(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role);
      const { id } = req.params;
      const {
        executionLogsLimit: execLimitRaw,
        executionLogsAfterId: execAfterRaw,
        executionLogsUpdatedAfter: execUpdatedAfterRaw,
      } = req.query;

      const hasLimitQ =
        execLimitRaw !== undefined && execLimitRaw !== null && String(execLimitRaw).trim() !== '';
      const hasUpdatedAfterQ =
        execUpdatedAfterRaw !== undefined &&
        execUpdatedAfterRaw !== null &&
        String(execUpdatedAfterRaw).trim() !== '';
      const hasAfterIdQ =
        execAfterRaw !== undefined && execAfterRaw !== null && String(execAfterRaw).trim() !== '';

      const useIncrementalLogQuery = hasLimitQ || hasUpdatedAfterQ || hasAfterIdQ;

      let pageLimit = 100;
      if (hasLimitQ) {
        const parsed = parseInt(execLimitRaw, 10);
        pageLimit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 100;
      } else if (hasUpdatedAfterQ) {
        pageLimit = 500;
      } else if (hasAfterIdQ) {
        pageLimit = 100;
      }

      const safeAfterId = (() => {
        if (!hasAfterIdQ) return null;
        const parsed = parseInt(execAfterRaw, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      })();

      const updatedAfterIso =
        hasUpdatedAfterQ && String(execUpdatedAfterRaw).trim() !== ''
          ? String(execUpdatedAfterRaw).trim()
          : null;

      const row = await campaignRunRepository.findRunById({ runId: id, isAdmin, userId });

      if (!row) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch sử chạy',
        });
      }

      const mapExecutionLogRow = (log) => ({
        id: log.id,
        campaignId: log.id_campaign,
        runId: log.id_run,
        customerId: log.id_customer,
        status: log.status,
        actionType: log.action_type,
        nodeId: log.node_id ?? null,
        nodeName: log.node_name ?? null,
        nodeType: log.node_type ?? null,
        nodeSubtype: log.node_subtype ?? null,
        nodeOrder: log.node_order ?? null,
        progressCurrent: log.progress_current ?? null,
        progressTotal: log.progress_total ?? null,
        executionData: log.execution_data,
        nodeResultJson: log.node_result_json,
        errorMessage: log.error_message,
        createdAt: log.created_at,
        updatedAt: log.updated_at,
      });

      let executionLogRows;
      let executionLogsHasMore = false;
      let executionLogsNextAfterId = null;

      if (!useIncrementalLogQuery) {
        executionLogRows = await campaignRunRepository.findExecutionLogs(id);
      } else {
        const fetchSize = pageLimit + 1;
        const rawRows = await campaignRunRepository.findExecutionLogsIncremental({
          runId: id,
          afterId: safeAfterId,
          updatedAfterIso,
          fetchSize,
        });
        executionLogsHasMore = rawRows.length > pageLimit;
        executionLogRows = executionLogsHasMore ? rawRows.slice(0, pageLimit) : rawRows;
        if (executionLogRows.length > 0) {
          executionLogsNextAfterId = executionLogRows[executionLogRows.length - 1].id;
        }
      }

      const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
      let trackingSummary = {
        link_click_count: 0,
        purchase_count: 0,
        pending_count: 0,
        customer_with_order_count: 0,
      };

      try {
        trackingSummary = await campaignRunRepository.getTrackingSummary(id, purchaseOrderStatusExpr);
      } catch (summaryError) {
        console.warn(
          `[CampaignRunController.getById] Không thể tính tracking summary cho run=${id}:`,
          summaryError?.message || summaryError
        );
      }

      const run = {
        id: row.id,
        campaignId: row.id_campaign,
        campaignName: row.campaign_name,
        scheduleId: row.id_schedule,
        scheduleName: row.schedule_name,
        runType: row.run_type,
        runName: row.run_name || row.run_metadata?.runName || null,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        totalRecipients: row.total_recipients,
        successfulSends: row.successful_sends,
        failedSends: row.failed_sends,
        skippedSends: row.skipped_sends,
        linkClickCount: trackingSummary.link_click_count || 0,
        purchaseCount: trackingSummary.purchase_count || 0,
        pendingCount: trackingSummary.pending_count || 0,
        customerWithOrderCount: trackingSummary.customer_with_order_count || 0,
        // Backward compatibility for old UI keys.
        zaloPurchaseCount: trackingSummary.purchase_count || 0,
        zaloPendingCount: trackingSummary.pending_count || 0,
        zaloCustomerCount: trackingSummary.customer_with_order_count || 0,
        errorMessage: row.error_message,
        runMetadata: row.run_metadata,
        createdAt: row.created_at,
        executionLogs: executionLogRows.map(mapExecutionLogRow),
      };

      if (useIncrementalLogQuery) {
        run.executionLogsHasMore = executionLogsHasMore;
        run.executionLogsNextAfterId = executionLogsNextAfterId;
      }

      return res.json({ success: true, data: run });
    } catch (error) {
      return serverError(res, 'CampaignRunController.getById', error);
    }
  }

  /**
   * Dừng một campaign run đang chạy.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<import('express').Response>}
   */
  async stopById(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user.role;
      const runId = Number.parseInt(req.params.id, 10);

      if (!Number.isFinite(runId)) {
        return res.status(400).json({
          success: false,
          message: 'ID lượt chạy không hợp lệ',
        });
      }

      const stopResult = await campaignRunService.stopCampaignRun({
        runId,
        userId,
        roleCode,
      });

      if (!stopResult.found) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lượt chạy',
        });
      }

      if (!stopResult.stopped) {
        return res.status(409).json({
          success: false,
          message: 'Lượt chạy đã kết thúc, không thể dừng',
        });
      }

      return res.json({
        success: true,
        message: 'Đã dừng lượt chạy chiến dịch',
        data: { runId, status: 'stopped' },
      });
    } catch (error) {
      return serverError(res, 'CampaignRunController.stopById', error);
    }
  }
}

export default new CampaignRunController();
