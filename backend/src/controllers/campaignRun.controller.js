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

      let query = `
        SELECT cr.*, c.campaign_name, cs.schedule_name
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

  // Lấy chi tiết một lần chạy
  async getById(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user.role_code);
      const { id } = req.params;

      const result = await db.query(
        `SELECT cr.*, c.campaign_name, cs.schedule_name
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
      const executionResult = await db.query(
        `SELECT ce.*
         FROM campaign_executions ce
         WHERE ce.id_run = $1
         ORDER BY ce.node_order ASC NULLS LAST, ce.created_at ASC, ce.id ASC`,
        [id]
      );
      const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
      let trackingSummary = {
        link_click_count: 0,
        purchase_count: 0,
        pending_count: 0,
        customer_with_order_count: 0,
      };

      try {
        const purchaseSummaryResult = await db.query(
          `SELECT
             COALESCE(COUNT(*) FILTER (
               WHERE ${purchaseOrderStatusExpr} IN ('completed', 'processing')
             ), 0)::INTEGER AS purchase_count,
             COALESCE(COUNT(*) FILTER (
               WHERE ${purchaseOrderStatusExpr} IN ('on-hold', 'pending')
             ), 0)::INTEGER AS pending_count,
             COALESCE(COUNT(DISTINCT cp.id_customer), 0)::INTEGER AS customer_with_order_count
           FROM customer_purchases cp
           WHERE cp.id_run = $1`,
          [id]
        );
        const clickSummaryResult = await db.query(
          `SELECT
             (
               COALESCE((
                 SELECT SUM(COALESCE(em.click_count, 0))
                 FROM email_messages em
                 WHERE em.id_run = $1
               ), 0)
               +
               COALESCE((
                 SELECT SUM(COALESCE(zm.click_count, 0))
                 FROM zalo_messages zm
                 WHERE zm.id_run = $1
               ), 0)
             )::INTEGER AS link_click_count`,
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
        executionLogs: executionResult.rows.map((log) => ({
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
        })),
      };

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
