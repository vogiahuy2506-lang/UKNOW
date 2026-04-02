import db from '../config/database.js';
import { serverError } from '../helpers.js';
import customerHelperService from '../services/customer/customerHelper.service.js';
import campaignRunService from '../services/campaign/campaignRun.service.js';
import { isAdminRole } from '../utils/roleScope.util.js';

class CampaignRunController {
  /**
   * Detect whether customer_purchases has id_zalo_message for backward compatibility.
   *
   * @returns {Promise<boolean>}
   */
  async hasCustomerPurchaseZaloMessageColumn() {
    if (typeof this._hasCustomerPurchaseZaloMessageColumn === 'boolean') {
      return this._hasCustomerPurchaseZaloMessageColumn;
    }

    try {
      const columnResult = await db.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'customer_purchases'
           AND column_name = 'id_zalo_message'
         LIMIT 1`
      );
      this._hasCustomerPurchaseZaloMessageColumn = columnResult.rows.length > 0;
    } catch {
      this._hasCustomerPurchaseZaloMessageColumn = false;
    }

    return this._hasCustomerPurchaseZaloMessageColumn;
  }

  // Lấy lịch sử chạy chiến dịch
  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role_code);
      const { campaignId, scheduleId, limit = 50 } = req.query;

      // `timestamp without time zone` trong DB mang nghĩa giờ VN; ép sang timestamptz để node-pg/JSON không lệch khi máy chủ chạy UTC.
      let query = `
        SELECT
          cr.id,
          cr.id_campaign,
          cr.id_schedule,
          cr.run_type,
          cr.status,
          cr.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS started_at,
          cr.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS completed_at,
          cr.total_recipients,
          cr.successful_sends,
          cr.failed_sends,
          cr.error_message,
          cr.run_metadata,
          cr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at,
          cr.run_name,
          c.campaign_name,
          cs.schedule_name
        FROM campaign_runs cr
        JOIN campaigns c ON cr.id_campaign = c.id
        LEFT JOIN campaign_schedules cs ON cr.id_schedule = cs.id
        WHERE ($1::boolean = TRUE OR c.id_user = $2)
      `;
      const params = [isAdmin, userId];
      let paramIndex = 3;

      if (campaignId) {
        query += ` AND cr.id_campaign = $${paramIndex}`;
        params.push(campaignId);
        paramIndex++;
      }

      if (scheduleId) {
        query += ` AND cr.id_schedule = $${paramIndex}`;
        params.push(scheduleId);
        paramIndex++;
      }

      query += ` ORDER BY cr.started_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await db.query(query, params);

      const runs = result.rows.map(row => ({
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
        errorMessage: row.error_message,
        runMetadata: row.run_metadata,
        createdAt: row.created_at,
      }));

      return res.json({
        success: true,
        data: runs,
      });
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
      const isAdmin = isAdminRole(req.user.role_code);
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

      const result = await db.query(
        `SELECT
           cr.id,
           cr.id_campaign,
           cr.id_schedule,
           cr.run_type,
           cr.status,
           cr.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS started_at,
           cr.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS completed_at,
           cr.total_recipients,
           cr.successful_sends,
           cr.failed_sends,
           cr.error_message,
           cr.run_metadata,
           cr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at,
           cr.run_name,
           c.campaign_name,
           cs.schedule_name
         FROM campaign_runs cr
         JOIN campaigns c ON cr.id_campaign = c.id
         LEFT JOIN campaign_schedules cs ON cr.id_schedule = cs.id
         WHERE cr.id = $1
           AND ($2::boolean = TRUE OR c.id_user = $3)`,
        [id, isAdmin, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy lịch sử chạy',
        });
      }

      const row = result.rows[0];

      /**
       * Map một dòng `campaign_executions` sang payload API (camelCase).
       *
       * @param {object} log hàng DB
       * @returns {object}
       */
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
        const executionResult = await db.query(
          `SELECT
             ce.id,
             ce.id_campaign,
             ce.id_run,
             ce.id_customer,
             ce.status,
             ce.action_type,
             ce.path_taken,
             ce.execution_data,
             ce.error_message,
             ce.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at,
             ce.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS updated_at,
             ce.node_id,
             ce.node_name,
             ce.node_type,
             ce.node_subtype,
             ce.node_order,
             ce.progress_current,
             ce.progress_total,
             ce.node_result_json
           FROM campaign_executions ce
           WHERE ce.id_run = $1
           ORDER BY ce.node_order ASC NULLS LAST, ce.created_at ASC, ce.id ASC`,
          [id]
        );
        executionLogRows = executionResult.rows;
      } else {
        const fetchSize = pageLimit + 1;
        const executionResult = await db.query(
          `SELECT
             ce.id,
             ce.id_campaign,
             ce.id_run,
             ce.id_customer,
             ce.status,
             ce.action_type,
             ce.path_taken,
             ce.execution_data,
             ce.error_message,
             ce.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS created_at,
             ce.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS updated_at,
             ce.node_id,
             ce.node_name,
             ce.node_type,
             ce.node_subtype,
             ce.node_order,
             ce.progress_current,
             ce.progress_total,
             ce.node_result_json
           FROM campaign_executions ce
           WHERE ce.id_run = $1
             AND ($2::BIGINT IS NULL OR ce.id > $2)
             AND (
               $3::TIMESTAMPTZ IS NULL
               OR (ce.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh') > $3::TIMESTAMPTZ
             )
           ORDER BY ce.id ASC
           LIMIT $4`,
          [id, safeAfterId, updatedAfterIso, fetchSize]
        );
        const rawRows = executionResult.rows;
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
        const normalizedStatusExpr = `LOWER(TRIM(COALESCE(${purchaseOrderStatusExpr}, '')))`;
        const purchaseSummaryResult = await db.query(
          `SELECT
             COALESCE(COUNT(*) FILTER (
               WHERE ${normalizedStatusExpr} IN ('completed', 'processing')
             ), 0)::INTEGER AS purchase_count,
             COALESCE(COUNT(*) FILTER (
               WHERE ${normalizedStatusExpr} IN (
                 'on-hold', 'on-holder', 'onhold', 'pending', 'interested'
               )
             ), 0)::INTEGER AS pending_count,
             COALESCE(COUNT(DISTINCT cp.id_customer), 0)::INTEGER AS customer_with_order_count
           FROM customer_purchases cp
           WHERE cp.id_run = $1`,
          [id]
        );
        /** Tổng lượt click link: mỗi dòng customer_journey (email_clicked / zalo_clicked) là một lượt */
        const clickSummaryResult = await db.query(
          `SELECT
             COALESCE(COUNT(*), 0)::INTEGER AS link_click_count
           FROM customer_journey cj
           WHERE cj.id_run = $1
             AND cj.event_type IN ('email_clicked', 'zalo_clicked')`,
          [id]
        );
        trackingSummary = {
          ...(purchaseSummaryResult.rows[0] || trackingSummary),
          ...(clickSummaryResult.rows[0] || {}),
        };
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

      return res.json({
        success: true,
        data: run,
      });
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
      const roleCode = req.user.role_code;
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
        data: {
          runId,
          status: 'stopped',
        },
      });
    } catch (error) {
      return serverError(res, 'CampaignRunController.stopById', error);
    }
  }
}

export default new CampaignRunController();
