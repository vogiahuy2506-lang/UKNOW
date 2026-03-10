import cron from 'node-cron';
import db from '../config/database.js';
import coursesController from '../controllers/courses.controller.js';
import campaignController from '../controllers/campaign.controller.js';

const campaignScheduleTasks = new Map();
let isRefreshingCampaignSchedules = false;
const activeContinuousRunIds = new Set();

const stopAllCampaignScheduleTasks = () => {
  for (const task of campaignScheduleTasks.values()) {
    try {
      task.stop();
      task.destroy?.();
    } catch (error) {
      console.error('[Scheduler] Không thể dừng schedule task:', error.message);
    }
  }
  campaignScheduleTasks.clear();
};

const triggerCampaignSchedule = async (schedule) => {
  try {
    if (!schedule?.id_campaign || !schedule?.id_user) return;
    console.log(
      `[Scheduler] Trigger schedule #${schedule.id} cho campaign #${schedule.id_campaign}`
    );

    const runningCheck = await db.query(
      `SELECT id
       FROM campaign_runs
       WHERE id_campaign = $1 AND status = 'running'
       LIMIT 1`,
      [schedule.id_campaign]
    );
    if (runningCheck.rows.length > 0) {
      console.log(
        `[Scheduler] Bỏ qua schedule #${schedule.id} vì campaign #${schedule.id_campaign} đang chạy`
      );
      return;
    }

    const runName = `${schedule.schedule_name || 'Lich chay'} - ${new Date().toLocaleString('vi-VN')}`;
    const runRecord = await campaignController.createCampaignRunRecord({
      campaignId: schedule.id_campaign,
      userId: schedule.id_user,
      source: 'schedule',
      scheduleId: schedule.id,
      runName,
    });

    await db.query(
      `UPDATE campaign_schedules
       SET last_run_at = CURRENT_TIMESTAMP,
           run_count = COALESCE(run_count, 0) + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [schedule.id]
    );

    if (schedule.schedule_type === 'once') {
      await db.query(
        `UPDATE campaign_schedules
         SET enabled = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [schedule.id]
      );
    }

    campaignController.executeCampaign(schedule.id_campaign, runRecord.id, schedule.id_user).catch((error) => {
      console.error(`[Scheduler] Lỗi chạy campaign #${schedule.id_campaign}:`, error.message);
    });
  } catch (error) {
    if (error?.statusCode === 409) {
      console.log(
        `[Scheduler] Bỏ qua schedule #${schedule?.id} vì campaign #${schedule?.id_campaign} đang chạy`
      );
      return;
    }
    console.error(`[Scheduler] Không thể trigger schedule #${schedule?.id}:`, error.message);
  }
};

const refreshCampaignSchedules = async () => {
  if (isRefreshingCampaignSchedules) {
    return;
  }
  isRefreshingCampaignSchedules = true;

  try {
    const result = await db.query(
      `SELECT
        cs.id,
        cs.id_campaign,
        cs.schedule_name,
        cs.schedule_type,
        cs.cron_expression,
        c.id_user
       FROM campaign_schedules cs
       JOIN campaigns c ON c.id = cs.id_campaign
       WHERE cs.enabled = true`
    );

    stopAllCampaignScheduleTasks();
    for (const schedule of result.rows) {
      if (!cron.validate(schedule.cron_expression)) {
        console.warn(`[Scheduler] Cron không hợp lệ cho schedule #${schedule.id}: ${schedule.cron_expression}`);
        continue;
      }
      const task = cron.schedule(schedule.cron_expression, () => {
        triggerCampaignSchedule(schedule);
      }, {
        timezone: 'Asia/Ho_Chi_Minh',
      });
      campaignScheduleTasks.set(schedule.id, task);
    }
    console.log(`[Scheduler] Đã nạp ${campaignScheduleTasks.size} lịch chạy chiến dịch`);
  } finally {
    isRefreshingCampaignSchedules = false;
  }
};

/**
 * Khởi chạy lại các campaign run liên tục đang ở trạng thái running.
 *
 * Luồng hoạt động:
 * 1. Quét DB lấy các run có `run_metadata.continuousMode = true` và `status = running`.
 * 2. Bỏ qua run đã được tiến trình hiện tại phục hồi trước đó.
 * 3. Kích hoạt lại executeCampaign để tiếp tục quét khách/gửi tin nền ngay cả khi không ai đăng nhập UI.
 *
 * @returns {Promise<void>}
 */
const recoverContinuousCampaignRuns = async () => {
  const result = await db.query(
    `SELECT cr.id, cr.id_campaign, c.id_user
     FROM campaign_runs cr
     JOIN campaigns c ON c.id = cr.id_campaign
     WHERE cr.status = 'running'
       AND LOWER(COALESCE(cr.run_metadata->>'continuousMode', 'false')) = 'true'`
  );
  if (result.rows.length === 0) return;

  for (const row of result.rows) {
    const runId = Number.parseInt(row.id, 10);
    const campaignId = Number.parseInt(row.id_campaign, 10);
    const userId = Number.parseInt(row.id_user, 10);
    if (!Number.isFinite(runId) || !Number.isFinite(campaignId) || !Number.isFinite(userId)) {
      continue;
    }
    const runKey = String(runId);
    if (activeContinuousRunIds.has(runKey)) {
      continue;
    }

    activeContinuousRunIds.add(runKey);
    console.log(`[Scheduler] Phục hồi campaign run continuous #${runId} (campaign #${campaignId})`);
    campaignController.executeCampaign(campaignId, runId, userId)
      .catch((error) => {
        console.error(`[Scheduler] Lỗi phục hồi run #${runId}:`, error.message);
      })
      .finally(() => {
        activeContinuousRunIds.delete(runKey);
      });
  }
};

export const requestCampaignScheduleRefresh = async () => {
  try {
    await refreshCampaignSchedules();
  } catch (error) {
    console.error('[Scheduler] Lỗi khi request refresh campaign schedules:', error.message);
  }
};

/**
 * Khởi tạo các scheduled jobs
 */
export const initScheduler = () => {
  // Đồng bộ khóa học từ UKNOW mỗi ngày lúc 00:30 (12:30 AM)
  // Cron format: phút giờ ngày tháng thứ
  // '30 0 * * *' = 00:30 mỗi ngày
  cron.schedule('30 0 * * *', async () => {
    console.log('[Scheduler] Bắt đầu đồng bộ khóa học hàng ngày lúc 00:30...');
    try {
      // Sync với userId mặc định = 1
      // Lưu ý: Query lấy TẤT CẢ courses để so sánh, không phân biệt user
      const result = await coursesController.syncCoursesFromUknow();
      if (result.success) {
        console.log('[Scheduler] Đồng bộ khóa học thành công:', {
          totalChecked: result.totalChecked,
          totalInserted: result.totalInserted,
          totalUpdated: result.totalUpdated,
          duration: result.duration,
        });
      } else {
        console.error('[Scheduler] Đồng bộ khóa học thất bại:', result.error);
      }
    } catch (error) {
      console.error('[Scheduler] Lỗi khi đồng bộ khóa học:', error.message);
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh'
  });

  console.log('[Scheduler] Đã khởi tạo scheduled job: Đồng bộ khóa học hàng ngày lúc 00:30');

  // Refresh danh sách lịch chạy chiến dịch lệch giây để tránh trùng đúng thời điểm cron trigger.
  // Dùng cron có giây: "20 * * * * *" = giây thứ 20 của mỗi phút.
  cron.schedule('20 * * * * *', async () => {
    try {
      await refreshCampaignSchedules();
      await recoverContinuousCampaignRuns();
    } catch (error) {
      console.error('[Scheduler] Lỗi khi refresh campaign schedules:', error.message);
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh'
  });

  refreshCampaignSchedules().catch((error) => {
    console.error('[Scheduler] Không thể nạp campaign schedules ban đầu:', error.message);
  });
  recoverContinuousCampaignRuns().catch((error) => {
    console.error('[Scheduler] Không thể phục hồi campaign run continuous ban đầu:', error.message);
  });
};
