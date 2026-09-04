import cron from 'node-cron';
import db from '../config/database.js';
import coursesController from '../controllers/courses.controller.js';
import campaignController from '../controllers/campaign.controller.js';
import { findExpiringUsers, findExpiredUsers, expireUserPlan, incrementReminderCount } from '../repositories/subscription/subscription.repository.js';
import { sendSystemEmail, buildRenewalReminderEmail } from './systemEmail.util.js';
import zaloPersonalInboxService from '../services/chatbot/zaloInbox.service.js';
import { startKeepAliveScheduler } from '../services/zaloSessionKeepAlive.service.js';
import notificationService from '../services/admin/notification.service.js';
import { safeMetadataTimestampSql } from './metadataTimestampSql.util.js';

const campaignScheduleTasks = new Map();
let isRefreshingCampaignSchedules = false;
const activeContinuousRunIds = new Set();
const activeNonContinuousResumeRunIds = new Set();
const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const SAFE_QUOTA_DEFER_UNTIL_SQL = safeMetadataTimestampSql("cr.run_metadata->>'quotaDeferredUntil'");
const SAFE_ZALO_DEFER_UNTIL_SQL = safeMetadataTimestampSql("cr.run_metadata->>'zaloOutboundDeferredUntil'");
const SAFE_NON_CONTINUOUS_DEFER_UNTIL_SQL = safeMetadataTimestampSql("cr.run_metadata->>'nonContinuousDeferredUntil'");

/**
 * Chuyển thời điểm bất kỳ về khóa ngày `YYYY-MM-DD` theo múi giờ Hà Nội.
 *
 * @param {Date|string|null|undefined} rawDate thời điểm đầu vào
 * @returns {string|null} khóa ngày hoặc null nếu input không hợp lệ
 */
const toHanoiDateKey = (rawDate) => {
  if (!rawDate) return null;
  const parsed = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HANOI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
};

/**
 * Tính số ngày chênh lệch giữa 2 mốc ngày dạng `YYYY-MM-DD`.
 *
 * @param {string} startKey mốc bắt đầu
 * @param {string} endKey mốc kết thúc
 * @returns {number|null} số ngày chênh lệch hoặc null nếu parse lỗi
 */
const getDaysDiffFromDateKeys = (startKey, endKey) => {
  if (!startKey || !endKey) return null;
  const [startYear, startMonth, startDay] = String(startKey).split('-').map((v) => Number.parseInt(v, 10));
  const [endYear, endMonth, endDay] = String(endKey).split('-').map((v) => Number.parseInt(v, 10));
  if (
    !Number.isFinite(startYear)
    || !Number.isFinite(startMonth)
    || !Number.isFinite(startDay)
    || !Number.isFinite(endYear)
    || !Number.isFinite(endMonth)
    || !Number.isFinite(endDay)
  ) {
    return null;
  }
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000));
};

/**
 * Parse số ngày lặp lại từ cron custom dạng N ngày ở trường ngày-tháng.
 *
 * @param {string} cronExpression biểu thức cron lưu trong DB
 * @returns {number|null} số ngày lặp hoặc null nếu không parse được
 */
const parseCustomIntervalDaysFromCron = (cronExpression = '') => {
  const parts = String(cronExpression).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const match = String(parts[2]).match(/^\*\/(\d+)$/);
  if (!match) return null;
  const intervalDays = Number.parseInt(match[1], 10);
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  return intervalDays;
};

/**
 * Với lịch custom, runtime cron luôn chạy hàng ngày tại cùng giờ/phút để tránh lệch mốc N ngày.
 *
 * @param {object} schedule bản ghi lịch chạy
 * @returns {string} cron runtime dùng để đăng ký node-cron
 */
const resolveRuntimeCronExpression = (schedule) => {
  const rawCron = String(schedule?.cron_expression || '').trim();
  if (String(schedule?.schedule_type || '').toLowerCase() !== 'custom') {
    return rawCron;
  }
  const parts = rawCron.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return rawCron;
  return `${parts[0]} ${parts[1]} * * *`;
};

/**
 * Quyết định lịch custom có đến hạn chạy ở ngày hiện tại hay chưa.
 *
 * Luồng hoạt động:
 * 1. Parse `intervalDays` từ cron custom hiện tại.
 * 2. Lấy mốc neo theo `last_run_at` (nếu có), nếu chưa từng chạy thì dùng `created_at`.
 * 3. So sánh chênh lệch ngày (múi giờ Hà Nội) và chỉ cho chạy khi chia hết theo chu kỳ.
 *
 * @param {object} schedule bản ghi lịch custom
 * @returns {boolean}
 */
const shouldTriggerCustomScheduleToday = (schedule) => {
  const intervalDays = parseCustomIntervalDaysFromCron(schedule?.cron_expression);
  if (!intervalDays) return true;
  const anchorDateKey = toHanoiDateKey(schedule?.last_run_at || schedule?.created_at);
  const todayDateKey = toHanoiDateKey(new Date());
  const dayDiff = getDaysDiffFromDateKeys(anchorDateKey, todayDateKey);
  if (dayDiff == null) return true;
  if (dayDiff < 0) return false;
  return dayDiff % intervalDays === 0;
};

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

/** @internal test helper */
export const _triggerCampaignScheduleForTests = (schedule) => triggerCampaignSchedule(schedule);

const triggerCampaignSchedule = async (schedule) => {
  try {
    // Hai nhánh dưới đây trước kia return im lặng — khi lịch không chạy, log không để lại
    // dấu vết nào và không thể phân biệt "cron không bắn" với "cron bắn rồi bị bỏ qua".
    const workspaceOwnerId = Number.parseInt(
      schedule?.workspace_owner_id ?? schedule?.id_user,
      10
    );
    const actorUserId = Number.parseInt(
      schedule?.created_by ?? workspaceOwnerId,
      10
    );
    if (!schedule?.id_campaign || !Number.isFinite(workspaceOwnerId)) {
      console.warn(
        `[Scheduler] Bỏ qua schedule #${schedule?.id ?? '?'}: thiếu id_campaign hoặc workspace owner ` +
          `(id_campaign=${schedule?.id_campaign ?? 'null'}, workspace_owner_id=${schedule?.workspace_owner_id ?? 'null'})`
      );
      return;
    }
    const isCustomSchedule = String(schedule?.schedule_type || '').toLowerCase() === 'custom';
    if (isCustomSchedule && !shouldTriggerCustomScheduleToday(schedule)) {
      console.log(
        `[Scheduler] Bỏ qua schedule #${schedule.id} (custom chưa tới chu kỳ): ` +
          `cron="${schedule.cron_expression}", ` +
          `mốc neo=${schedule.last_run_at ? 'last_run_at' : 'created_at'} ` +
          `${schedule.last_run_at || schedule.created_at}`
      );
      return;
    }
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
      const isOnce = String(schedule?.schedule_type || '').toLowerCase() === 'once';
      console.log(
        `[Scheduler] Bỏ qua schedule #${schedule.id} vì campaign #${schedule.id_campaign} đang chạy` +
          (isOnce ? ' — vô hiệu hoá luôn vì đây là lịch chạy 1 lần' : '')
      );

      // Lịch "chạy 1 lần" bị bỏ qua thì phải tắt luôn, đừng để nằm chờ.
      //
      // Trước đây nhánh này chỉ `return`: lịch giữ nguyên enabled=true, run_count=0,
      // mà cron của `once` mã hoá ngày+tháng nên nó sẽ TỰ BẮN LẠI ĐÚNG NGÀY ĐÓ NĂM SAU.
      // Thực tế 2026-08-05: #33 và #31 cùng campaign 37, cron giống hệt "30 19 9 4 *"
      // (lịch bị tạo trùng) — #31 chạy, #33 bị bỏ qua và nằm chờ tới 9/4/2027.
      //
      // Không chạy bù: lượt chạy đang diễn ra đã làm đúng việc của lịch này rồi,
      // chạy bù nghĩa là gửi hai lần cho cùng một danh sách.
      if (isOnce) {
        try {
          await db.query(
            `UPDATE campaign_schedules
             SET enabled = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [schedule.id]
          );
        } catch (disableErr) {
          console.error(
            `[Scheduler] Không thể vô hiệu hoá schedule #${schedule.id}:`,
            disableErr.message
          );
        }
      }
      return;
    }

    // Luôn gắn nhãn thời điểm theo Asia/Ho_Chi_Minh (không phụ thuộc TZ của process/ máy chủ).
    const runName = `${schedule.schedule_name || 'Lich chay'} - ${new Date().toLocaleString('vi-VN', {
      timeZone: HANOI_TIME_ZONE,
      hourCycle: 'h23', // h23 = 0–23; hour12:false render nửa đêm thành "24"
    })}`;
    const runRecord = await campaignController.createCampaignRunRecord({
      campaignId: schedule.id_campaign,
      workspaceOwnerId,
      actorUserId: Number.isFinite(actorUserId) ? actorUserId : workspaceOwnerId,
      isAdmin: false,
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

    campaignController.executeCampaign(schedule.id_campaign, runRecord.id, workspaceOwnerId).catch((error) => {
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
    return { schedules: campaignScheduleTasks.size, skipped: true };
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
        cs.last_run_at,
        cs.created_at,
        COALESCE(cs.workspace_owner_id, c.workspace_owner_id, c.id_user) AS workspace_owner_id,
        COALESCE(cs.created_by, c.created_by, c.id_user) AS created_by
       FROM campaign_schedules cs
       JOIN campaigns c ON c.id = cs.id_campaign
       WHERE cs.enabled = true`
    );

    stopAllCampaignScheduleTasks();
    for (const schedule of result.rows) {
      const runtimeCronExpression = resolveRuntimeCronExpression(schedule);
      if (!cron.validate(runtimeCronExpression)) {
        console.warn(`[Scheduler] Cron không hợp lệ cho schedule #${schedule.id}: ${runtimeCronExpression}`);
        continue;
      }
      const task = cron.schedule(runtimeCronExpression, () => {
        triggerCampaignSchedule(schedule);
      }, {
        timezone: HANOI_TIME_ZONE,
      });
      campaignScheduleTasks.set(schedule.id, task);
    }
    console.log(`[Scheduler] Đã nạp ${campaignScheduleTasks.size} lịch chạy chiến dịch`);
    return { schedules: campaignScheduleTasks.size };
  } finally {
    isRefreshingCampaignSchedules = false;
  }
};

/**
 * Chỉ wake run khi mọi mốc defer cấp run đã tới hạn. Không suy diễn từ ledger:
 * một recipient có nextDueAt tương lai không có nghĩa các recipient khác đã xong.
 * `nonContinuousDeferredUntil` chỉ được ghi ở cuối một lượt đã duyệt sạch ledger.
 */
const RUN_DEFER_READY_SQL = `AND (
  ${SAFE_QUOTA_DEFER_UNTIL_SQL} IS NULL
  OR ${SAFE_QUOTA_DEFER_UNTIL_SQL} <= NOW()
)
AND (
  ${SAFE_ZALO_DEFER_UNTIL_SQL} IS NULL
  OR ${SAFE_ZALO_DEFER_UNTIL_SQL} <= NOW()
)
AND (
  ${SAFE_NON_CONTINUOUS_DEFER_UNTIL_SQL} IS NULL
  OR ${SAFE_NON_CONTINUOUS_DEFER_UNTIL_SQL} <= NOW()
)`;

const recoverContinuousCampaignRuns = async () => {
  const result = await db.query(
    `SELECT cr.id, cr.id_campaign,
            COALESCE(cr.workspace_owner_id, c.workspace_owner_id, c.id_user) AS workspace_owner_id
     FROM campaign_runs cr
     JOIN campaigns c ON c.id = cr.id_campaign
     WHERE cr.status = 'running'
       AND LOWER(COALESCE(cr.run_metadata->>'continuousMode', 'false')) = 'true'
       ${RUN_DEFER_READY_SQL}`
  );
  if (result.rows.length === 0) return { recovered: 0 };

  let recovered = 0;
  for (const row of result.rows) {
    const runId = Number.parseInt(row.id, 10);
    const campaignId = Number.parseInt(row.id_campaign, 10);
    const userId = Number.parseInt(row.workspace_owner_id, 10);
    if (!Number.isFinite(runId) || !Number.isFinite(campaignId) || !Number.isFinite(userId)) {
      continue;
    }
    const runKey = String(runId);
    if (activeContinuousRunIds.has(runKey)) {
      continue;
    }

    activeContinuousRunIds.add(runKey);
    recovered += 1;
    console.log(`[Scheduler] Phục hồi campaign run continuous #${runId} (campaign #${campaignId})`);
    campaignController.executeCampaign(campaignId, runId, userId)
      .catch((error) => {
        console.error(`[Scheduler] Lỗi phục hồi run #${runId}:`, error.message);
      })
      .finally(() => {
        activeContinuousRunIds.delete(runKey);
      });
  }
  return { recovered };
};

const triggerNonContinuousResume = ({ runId, campaignId, userId, resumedBy }) => {
  const runKey = String(runId);
  if (activeNonContinuousResumeRunIds.has(runKey)) {
    return false;
  }

  activeNonContinuousResumeRunIds.add(runKey);
  campaignController.executeCampaign(campaignId, runId, userId, null, { resumedBy })
    .catch((error) => {
      console.error(`[Scheduler] Lỗi phục hồi non-continuous run #${runId}:`, error.message);
    })
    .finally(() => {
      activeNonContinuousResumeRunIds.delete(runKey);
    });
  return true;
};

/**
 * Khởi chạy lại các campaign run không continuous đang ở trạng thái running.
 *
 * Luồng hoạt động:
 * 1. Quét DB lấy các run `status = running` nhưng `continuousMode != true`.
 * 2. Bỏ qua các run đã được tiến trình hiện tại phục hồi để tránh chạy trùng.
 * 3. Kích hoạt lại executeCampaign để tiếp tục luồng còn dang dở của run (schedule/chạy ngay).
 *
 * @returns {Promise<void>}
 */
const recoverNonContinuousCampaignRuns = async () => {
  const result = await db.query(
    `SELECT cr.id, cr.id_campaign,
            COALESCE(cr.workspace_owner_id, c.workspace_owner_id, c.id_user) AS workspace_owner_id
     FROM campaign_runs cr
     JOIN campaigns c ON c.id = cr.id_campaign
     WHERE cr.status = 'running'
       AND LOWER(COALESCE(cr.run_metadata->>'continuousMode', 'false')) <> 'true'
       ${RUN_DEFER_READY_SQL}`
  );
  if (result.rows.length === 0) return { recovered: 0 };

  let recovered = 0;
  for (const row of result.rows) {
    const runId = Number.parseInt(row.id, 10);
    const campaignId = Number.parseInt(row.id_campaign, 10);
    const userId = Number.parseInt(row.workspace_owner_id, 10);
    if (!Number.isFinite(runId) || !Number.isFinite(campaignId) || !Number.isFinite(userId)) {
      continue;
    }
    if (triggerNonContinuousResume({ runId, campaignId, userId, resumedBy: 'per_minute' })) {
      recovered += 1;
      console.log(`[Scheduler] Phục hồi campaign run non-continuous #${runId} (campaign #${campaignId})`);
    }
  }
  return { recovered };
};

export const requestCampaignScheduleRefresh = async () => {
  // Test env: KHÔNG đăng ký cron thật. Controller gọi hàm này fire-and-forget khi
  // tạo/sửa lịch → trong test nó chạy async sau khi test xong (log "Đã nạp N lịch"
  // → flaky "Cannot log after tests are done") VÀ cron node-cron chạy nền có thể
  // trigger campaign, làm nhiễu state các suite khác. Prod/dev refresh bình thường.
  if (process.env.NODE_ENV === 'test') return;
  try {
    await refreshCampaignSchedules();
  } catch (error) {
    console.error('[Scheduler] Lỗi khi request refresh campaign schedules:', error.message);
  }
};

/**
 * Khởi tạo các scheduled jobs
 *
 * Đặt `SCHEDULER_ENABLED=false` để bỏ qua toàn bộ — chỉ dùng ở máy, khi chạy
 * backend trên DB mẫu. Worker nền thấy chiến dịch mẫu ở trạng thái `active` thì
 * cố thực thi rồi đánh hỏng chúng; thông báo lỗi sinh ra từ đó hiện thẳng trong
 * trang Giám sát gửi tin và lọt vào ảnh minh hoạ bài hướng dẫn — người đọc thấy
 * một lỗi chỉ tồn tại ở dữ liệu mẫu. Mặc định vẫn BẬT: production không đặt biến
 * này, hành vi không đổi.
 */
export const initScheduler = () => {
  if (String(process.env.SCHEDULER_ENABLED).toLowerCase() === 'false') {
    console.log('[Scheduler] SCHEDULER_ENABLED=false — bỏ qua toàn bộ scheduled job.');
    return;
  }

  // Đồng bộ khóa học từ Founder AI mỗi ngày lúc 00:30 (12:30 AM)
  // Cron format: phút giờ ngày tháng thứ
  // '30 0 * * *' = 00:30 mỗi ngày
  cron.schedule('30 0 * * *', async () => {
    console.log('[Scheduler] Bắt đầu đồng bộ khóa học hàng ngày lúc 00:30...');
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('courses_daily_sync', async () => {
        // Sync với userId mặc định = 1
        // Lưu ý: Query lấy TẤT CẢ courses để so sánh, không phân biệt user
        const result = await coursesController.syncCoursesFromFounderAI();
        if (result.success) {
          console.log('[Scheduler] Đồng bộ khóa học thành công:', {
            totalChecked: result.totalChecked,
            totalInserted: result.totalInserted,
            totalUpdated: result.totalUpdated,
            duration: result.duration,
          });
        } else {
          console.error('[Scheduler] Đồng bộ khóa học thất bại:', result.error);
          throw new Error(result.error || 'Đồng bộ khóa học thất bại');
        }

        let archived = 0;
        try {
          const { archiveExpiredVouchers } = await import('../repositories/voucher.repository.js');
          archived = await archiveExpiredVouchers();
          if (archived > 0) {
            console.log(`[Scheduler] Đã lưu trữ ${archived} voucher hết hạn`);
          }
        } catch (error) {
          console.error('[Scheduler] Lỗi khi lưu trữ voucher hết hạn:', error.message);
          throw error;
        }

        return {
          totalChecked: result.totalChecked,
          totalInserted: result.totalInserted,
          totalUpdated: result.totalUpdated,
          archived,
          synced: Number(result.totalInserted || 0) + Number(result.totalUpdated || 0) + Number(archived || 0),
        };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi đồng bộ khóa học:', error.message);
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh'
  });

  console.log('[Scheduler] Đã khởi tạo scheduled job: Đồng bộ khóa học + lưu trữ voucher hết hạn lúc 00:30');

  // Refresh danh sách lịch chạy chiến dịch lệch giây để tránh trùng đúng thời điểm cron trigger.
  // Dùng cron có giây: "20 * * * * *" = giây thứ 20 của mỗi phút.
  cron.schedule('20 * * * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('campaign_scheduler_tick', async () => {
        const schedules = await refreshCampaignSchedules();
        const continuous = await recoverContinuousCampaignRuns();
        const nonContinuous = await recoverNonContinuousCampaignRuns();
        return {
          schedules: schedules?.schedules ?? 0,
          continuous: continuous?.recovered ?? 0,
          nonContinuous: nonContinuous?.recovered ?? 0,
          synced:
            Number(continuous?.recovered || 0)
            + Number(nonContinuous?.recovered || 0),
        };
      });
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
  recoverNonContinuousCampaignRuns().catch((error) => {
    console.error('[Scheduler] Không thể phục hồi campaign run non-continuous ban đầu:', error.message);
  });
  // ── Reset daily_sent_count — chạy lúc 00:00 mỗi ngày ─────────────────────
  cron.schedule('0 0 * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('email_daily_count_reset', async () => {
        const { rowCount } = await db.query('UPDATE email_settings SET daily_sent_count = 0');
        console.log(`[Scheduler] Reset daily_sent_count: ${rowCount} email accounts`);
        let pruned = 0;
        try {
          pruned = await cronJobRunRepository.deleteOlderThan({ olderThanDays: 14 });
          if (pruned > 0) {
            console.log(`[Scheduler] Đã xoá ${pruned} dòng cron_job_runs cũ hơn 14 ngày`);
          }
        } catch (pruneErr) {
          console.error('[Scheduler] Lỗi dọn cron_job_runs:', pruneErr.message);
        }
        return { resetAccounts: rowCount || 0, pruned, synced: rowCount || 0 };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi reset daily_sent_count:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  // ── Dọn tệp đính kèm chat rác — 00:20 mỗi ngày ───────────────────────────
  cron.schedule('20 0 * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('chat_attachment_cleanup', async () => {
        const { cleanupOrphanChatAttachments } = await import('../services/chatbot/chatAttachmentCleanup.service.js');
        const result = await cleanupOrphanChatAttachments();
        console.log(
          `[Scheduler] chat_attachment_cleanup: scanned=${result.scanned} deleted=${result.deleted} `
          + `rowsDeleted=${result.rowsDeleted ?? 0} skipped=${result.skipped} `
          + `untrackedDeleteEnabled=${result.untrackedDeleteEnabled} `
          + `untrackedDeleteCandidates=${result.untrackedDeleteCandidates}`
        );
        return result;
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi dọn chat attachments:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  // ── Dọn refresh token hết hạn quá 30 ngày — 00:50 mỗi ngày ───────────────
  cron.schedule('50 0 * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('refresh_token_cleanup', async () => {
        const { deleteExpiredRefreshTokens } = await import('../repositories/user/user.repository.js');
        const retentionDays = Number.parseInt(process.env.REFRESH_TOKEN_RETENTION_DAYS, 10) || 30;
        const deleted = await deleteExpiredRefreshTokens(retentionDays);
        console.log(`[Scheduler] refresh_token_cleanup: deleted=${deleted} retentionDays=${retentionDays}`);
        return { deleted, retentionDays };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi dọn refresh_tokens:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  // ── Subscription reminder & expiry — chạy lúc 08:00 mỗi ngày ──────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[Subscription] Bắt đầu kiểm tra gói hết hạn...');
    const renewalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5174'}/renewal`;
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('subscription_reminder', async () => {
        // 0. Kích hoạt lệnh hẹn đổi gói đã đến hạn (chạy trước findExpiredUsers để tránh hụt quyền lợi)
        try {
          const { processDueScheduledPlanChanges } = await import('../services/payment/scheduledPlanChange.service.js');
          const { processed } = await processDueScheduledPlanChanges();
          if (processed > 0) {
            console.log(`[Subscription] Đã kích hoạt ${processed} lệnh hẹn đổi gói đến hạn`);
          }
        } catch (err) {
          console.error('[Subscription] Lỗi khi kích hoạt lệnh hẹn đổi gói:', err.message);
        }

        // 1. Hết hạn: revoke active_plan_id
        const expired = await findExpiredUsers();
        for (const user of expired) {
          await expireUserPlan(user.id);
          console.log(`[Subscription] Đã thu hồi gói của ${user.email} (${user.plan_name})`);
        }

        // 2. Nhắc lần 1 — còn 7 ngày (reminder_count = 0)
        const week = await findExpiringUsers(6, 7, 1);
        for (const user of week) {
          const daysLeft = Math.ceil((new Date(user.subscription_expires_at) - Date.now()) / 86400000);
          const { subject, html } = buildRenewalReminderEmail({
            fullName: user.full_name, planName: user.plan_name,
            expiresAt: user.subscription_expires_at, daysLeft, renewalUrl,
          });
          await sendSystemEmail({ to: user.email, subject, html });
          await incrementReminderCount(user.id);
          console.log(`[Subscription] Nhắc lần 1 → ${user.email} (còn ${daysLeft} ngày)`);
        }

        // 3. Nhắc lần 2 — còn 3 ngày (reminder_count = 1)
        const threeDay = await findExpiringUsers(2, 3, 2);
        for (const user of threeDay) {
          const daysLeft = Math.ceil((new Date(user.subscription_expires_at) - Date.now()) / 86400000);
          const { subject, html } = buildRenewalReminderEmail({
            fullName: user.full_name, planName: user.plan_name,
            expiresAt: user.subscription_expires_at, daysLeft, renewalUrl,
          });
          await sendSystemEmail({ to: user.email, subject, html });
          await incrementReminderCount(user.id);
          console.log(`[Subscription] Nhắc lần 2 → ${user.email} (còn ${daysLeft} ngày)`);
        }

        let lockedUsers = 0;
        let reminderWeek = 0;
        let reminderThree = 0;
        // 4. Khoá / mở khoá tài nguyên mua thêm hết hạn (còn gói hoặc hết gói)
        try {
          const {
            reconcileAllDueUsers,
            sendStructuralGrantReminders,
            structuralItemLabelVi,
          } = await import('../services/payment/topupLock.service.js');
          const lockResults = await reconcileAllDueUsers();
          for (const r of lockResults) {
            if (r.locked?.length) {
              lockedUsers += 1;
              console.log(
                `[TopupLock] user=${r.userId} locked=${r.locked.length} unlocked=${r.unlocked?.length || 0}`
              );
              // Email báo khoá (nếu có)
              try {
                const { rows } = await (await import('../config/database.js')).default.query(
                  `SELECT email, full_name FROM users WHERE id = $1`,
                  [r.userId]
                );
                const u = rows[0];
                if (u?.email) {
                  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
                  const counts = r.locked.reduce((acc, x) => {
                    acc[x.resourceKey] = (acc[x.resourceKey] || 0) + 1;
                    return acc;
                  }, {});
                  const detail = Object.entries(counts)
                    .map(([key, n]) => `${n} ${structuralItemLabelVi(key)}`)
                    .join(', ');
                  await sendSystemEmail({
                    to: u.email,
                    subject: '[Founder AI] Một số tài nguyên mua thêm đã bị khoá',
                    html: `<p>Xin chào ${u.full_name || 'bạn'},</p>
                    <p>Các tài nguyên sau đã bị khoá vì slot mua thêm hết hạn: <strong>${detail}</strong>.</p>
                    <p><a href="${frontendUrl}/app/billing?tab=locks">Chọn tài nguyên giữ lại / gia hạn</a></p>`,
                  });
                }
              } catch (mailErr) {
                console.error('[TopupLock] lock notify email failed:', mailErr.message);
              }
            }
          }
          const rem = await sendStructuralGrantReminders();
          reminderWeek = rem.week || 0;
          reminderThree = rem.three || 0;
          console.log(`[TopupLock] reminders week=${rem.week} three=${rem.three}`);
        } catch (lockErr) {
          console.error('[TopupLock] reconcile/reminders failed:', lockErr.message);
        }

        const processed = expired.length + week.length + threeDay.length + lockedUsers
          + reminderWeek + reminderThree;
        return {
          expired: expired.length,
          remindedWeek: week.length,
          remindedThreeDay: threeDay.length,
          lockedUsers,
          reminderWeek,
          reminderThree,
          synced: processed,
        };
      });
    } catch (error) {
      console.error('[Subscription] Lỗi khi kiểm tra gói:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo subscription reminder cron: 08:00 hàng ngày');

  // ── Zalo Personal Inbox - Register listeners cho các connected accounts ────
  // Cache accounts 5 phút nên chỉ cần check mỗi 5 phút
  // Dùng refreshListeners() thay vì start() để tận dụng cache
  const registerZaloPersonalListeners = async () => {
    const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
    try {
      await cronJobRunRepository.recordRun('zalo_personal_listeners', async () => {
        await zaloPersonalInboxService.refreshListeners();
        const accounts = await zaloPersonalInboxService.getActiveZaloPersonalAccounts(false);
        return { accounts: accounts?.length || 0, synced: accounts?.length || 0 };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi đăng ký Zalo Personal Inbox listeners:', error.message);
    }
  };

  // Chạy mỗi 5 phút thay vì 30 giây (accounts hiếm khi thay đổi)
  cron.schedule('*/5 * * * *', async () => {
    await registerZaloPersonalListeners();
  }, { timezone: HANOI_TIME_ZONE });

  // Đăng ký ngay khi khởi động
  registerZaloPersonalListeners();

  console.log('[Scheduler] Đã khởi tạo Zalo Personal Inbox: đăng ký listeners mỗi 5 phút');

  // ── Zalo Personal — background group history sync (option a: known groups only) ──
  const zaloBgSyncEnabled = String(process.env.ZALO_BG_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (zaloBgSyncEnabled) {
    const syncZaloPersonalGroupHistory = async () => {
      const cronJobRunRepository = (await import('../repositories/admin/cronJobRun.repository.js'));
      try {
        await cronJobRunRepository.recordRun('zalo_personal_bg_group_sync', async () => {
          const zaloPersonalSyncService = (await import('../services/chatbot/zaloPersonalSync.service.js')).default;
          const zaloAccountSessionService = (await import('../services/zalo/zaloAccountSession.service.js')).default;
          const accounts = await zaloPersonalInboxService.getActiveZaloPersonalAccounts(true);
          let synced = 0;
          let totalGroups = 0;
          let errors = 0;
          let skipped = 0;
          for (const acc of accounts) {
            const accountId = acc.account_id;
            const userId = acc.id_user;
            try {
              if (!zaloAccountSessionService.getAccountApi(accountId)) {
                skipped += 1;
                continue;
              }
              const result = await zaloPersonalSyncService.syncKnownGroupHistory(accountId, userId, { limit: 50 });
              synced += Number(result.synced || 0);
              totalGroups += Number(result.totalGroups || 0);
              errors += result.errors?.length || 0;
              if (result.synced > 0 || result.errors?.length) {
                console.log(
                  `[Scheduler] Zalo bg sync account=${accountId}: synced=${result.synced} groups=${result.totalGroups} errors=${result.errors?.length || 0}`
                );
              }
            } catch (err) {
              errors += 1;
              console.error(`[Scheduler] Zalo bg sync account ${accountId} failed:`, err.message);
            }
          }

          // Phân loại status:
          //  - 'success' khi không có lỗi (kể cả synced=0 — không có tin nhắn mới là bình thường)
          //  - 'failure' khi có lỗi thật
          //  - 'noop' khi không có account nào để sync
          // Trước đây synced=0 luôn = noop → alert `cron_zalo_bg_sync_noop` bắn sai mỗi 10 phút.
          let status = 'success';
          if (errors > 0) status = 'failure';
          else if (accounts.length === 0) status = 'noop';

          return { synced, totalGroups, errors, skipped, accounts: accounts.length, status };
        });
      } catch (error) {
        console.error('[Scheduler] Lỗi Zalo background group sync:', error.message);
      }
    };

    // Offset from */5 listener cron (min 0,5,10,...) — run at 5,15,25,... so they never pile
    cron.schedule('5-59/10 * * * *', async () => {
      await syncZaloPersonalGroupHistory();
    }, { timezone: HANOI_TIME_ZONE });

    console.log('[Scheduler] Đã khởi tạo Zalo Personal background group sync: phút 5/15/25/... (ZALO_BG_SYNC_ENABLED)');
  } else {
    console.log('[Scheduler] Zalo Personal background group sync TẮT (ZALO_BG_SYNC_ENABLED=false)');
  }

  // ── Zalo Account Session Restoration - Khôi phục các tài khoản bị ngắt kết nối ────
  // Chạy mỗi 15 phút để thử khôi phục các tài khoản Zalo bị out (do server restart hoặc cookie hết hạn)
  const restoreZaloSessions = async () => {
    const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
    try {
      await cronJobRunRepository.recordRun('zalo_session_restore', async () => {
        const campaignZaloSenderService = (await import('../services/campaign/campaignZaloSender.service.js')).default;
        const result = await campaignZaloSenderService.restoreDisconnectedZaloAccounts();
        if (result.restored > 0) {
          console.log(`[Scheduler] Đã khôi phục ${result.restored}/${result.total} tài khoản Zalo`);
        }
        return {
          restored: result.restored || 0,
          total: result.total || 0,
          synced: result.restored || 0,
        };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi khôi phục Zalo sessions:', error.message);
    }
  };

  // Chạy mỗi 15 phút
  cron.schedule('*/15 * * * *', async () => {
    await restoreZaloSessions();
  }, { timezone: HANOI_TIME_ZONE });

  // Chạy ngay khi khởi động để phục hồi các session bị mất
  restoreZaloSessions();

  console.log('[Scheduler] Đã khởi tạo Zalo Session Restoration: kiểm tra và khôi phục mỗi 15 phút');

  // ── Zalo Session Keep-Alive - LUÔN giữ đăng nhập ──────────────────────────────────
  // Chạy mỗi 5 phút để kiểm tra và restore session nếu cần
  // Đảm bảo tài khoản Zalo không bị out dù có làm gì
  startKeepAliveScheduler();
  console.log('[Scheduler] Đã khởi tạo Zalo Session Keep-Alive: giữ đăng nhập liên tục');

  // ── Custom Domain Auto-Verify - Tự động verify pending domains ─────────────────
  // Chạy mỗi 5 phút để tự động kích hoạt domain khi DNS đã propagate
  const autoVerifyDomains = async () => {
    const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
    try {
      await cronJobRunRepository.recordRun('custom_domain_verify', async () => {
        const landingPageDomainService = (await import('../services/landingPage/landingPageDomain.service.js')).default;
        const result = await landingPageDomainService.autoVerifyPendingDomains();
        if (result.verified > 0) {
          console.log(`[Scheduler] Auto-verify domains: ${result.verified}/${result.total} activated`);
        }
        return {
          verified: result.verified || 0,
          total: result.total || 0,
          synced: result.verified || 0,
        };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi auto-verify domains:', error.message);
    }
  };

  // Chạy mỗi 5 phút
  cron.schedule('*/5 * * * *', async () => {
    await autoVerifyDomains();
  }, { timezone: HANOI_TIME_ZONE });

  // Chạy ngay khi khởi động để verify các domain có thể đã sẵn sàng
  autoVerifyDomains();

  console.log('[Scheduler] Đã khởi tạo Custom Domain Auto-Verify: kiểm tra pending domains mỗi 5 phút');

  // ── Custom domain SSL auto-renewal — chạy 02:00 hàng ngày ───────────────
  // Gọi ssl-auto-provision.sh cho mọi active domain không qua Cloudflare.
  // Script tự check expiry (`openssl x509 -checkend`) và chỉ renew khi cert
  // còn < 30 ngày (mặc định Let's Encrypt) hoặc chưa tồn tại — an toàn chạy mỗi ngày.
  const renewCustomDomainSsl = async () => {
    const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
    try {
      await cronJobRunRepository.recordRun('custom_domain_ssl_renew', async () => {
        const landingPageDomainService = (await import('../services/landingPage/landingPageDomain.service.js')).default;
        const result = await landingPageDomainService.provisionSslForAllActiveDomains();
        if (result.attempted > 0) {
          console.log(
            `[Scheduler] SSL auto-renew: total=${result.total} attempted=${result.attempted} `
            + `skipped=${result.skipped} failed=${result.failed}`
          );
        }
        return {
          total: result.total || 0,
          attempted: result.attempted || 0,
          skipped: result.skipped || 0,
          failed: result.failed || 0,
          synced: result.attempted || 0,
        };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi auto-renew SSL cho custom domain:', error.message);
    }
  };

  // 02:00 mỗi ngày — lệch giờ với các job khác để tránh dồn tải certbot.
  cron.schedule('0 2 * * *', async () => {
    await renewCustomDomainSsl();
  }, { timezone: HANOI_TIME_ZONE });

  // Cũng chạy ngay khi backend khởi động để bù nếu backend down trong ngày.
  renewCustomDomainSsl();

  console.log('[Scheduler] Đã khởi tạo Custom Domain SSL Auto-Renewal: kiểm tra mỗi ngày lúc 02:00');

  // ── AI Model Catalog Sync - Đồng bộ danh sách model Gemini ─────────────────────
  const aiModelSyncCron = String(process.env.AI_MODEL_SYNC_CRON || '15 2 * * *').trim();
  const syncAiModels = async () => {
    const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
    try {
      await cronJobRunRepository.recordRun('ai_model_catalog_sync', async () => {
        const { syncModelsFromGoogle } = await import('../services/ai/aiModelCatalog.service.js');
        const result = await syncModelsFromGoogle();
        console.log('[Scheduler] AI model catalog synced:', result);
        return {
          ...result,
          synced: Number(result?.fetched ?? result?.seen ?? 0),
        };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi đồng bộ AI models:', error.message);
    }
  };

  if (cron.validate(aiModelSyncCron)) {
    cron.schedule(aiModelSyncCron, syncAiModels, { timezone: HANOI_TIME_ZONE });
    console.log(`[Scheduler] Đã khởi tạo AI Model Catalog Sync: ${aiModelSyncCron}`);
  } else {
    console.warn(`[Scheduler] AI_MODEL_SYNC_CRON không hợp lệ, bỏ qua sync AI models: ${aiModelSyncCron}`);
  }

  // ── Scheduled Notifications - Xử lý notification đã hẹn giờ ─────────────────
  // Chạy mỗi phút để kiểm tra và gửi các notification đã đến giờ
  const processScheduledNotifications = async () => {
    const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
    try {
      await cronJobRunRepository.recordRun('scheduled_notifications', async () => {
        const results = await notificationService.processScheduledNotifications();
        let sent = 0;
        let failed = 0;
        for (const result of results) {
          if (result.success) {
            sent += 1;
            console.log(`[Scheduler] Đã gửi notification #${result.id}: ${result.result.sent}/${result.result.total} email`);
          } else {
            failed += 1;
            console.error(`[Scheduler] Lỗi gửi notification #${result.id}: ${result.error}`);
          }
        }
        return { processed: results.length, sent, failed, synced: sent };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi xử lý scheduled notifications:', error.message);
    }
  };

  // Chạy mỗi phút
  cron.schedule('* * * * *', async () => {
    await processScheduledNotifications();
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Scheduled Notifications: xử lý mỗi phút');

  // ── Cleanup orphan self-serve custom plans (unpaid / abandoned) ───────────
  cron.schedule('15 * * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('custom_plan_orphan_cleanup', async () => {
        const { getPayosPendingWindowMinutes } = await import('../repositories/voucher.repository.js');
        const { cleanupOrphanCustomPlans } = await import('../services/payment/customPlan.service.js');
        const deleted = await cleanupOrphanCustomPlans(getPayosPendingWindowMinutes());
        if (deleted.length) {
          console.log(`[Scheduler] Đã xoá ${deleted.length} gói custom mồ côi: ${deleted.map((p) => p.id).join(', ')}`);
        }
        return { deleted: deleted.length, synced: deleted.length };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi khi dọn gói custom mồ côi:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Custom Plan orphan cleanup: mỗi giờ phút 15');

  // ── PayOS order reconcile (webhook backup) — every 10 minutes at :05/:15/... ──
  cron.schedule('5-59/10 * * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      const {
        reconcileRecentPendingOrders,
        PAYOS_RECONCILE_JOB_CODE,
      } = await import('../services/payment/payosReconcile.service.js');
      await cronJobRunRepository.recordRun(PAYOS_RECONCILE_JOB_CODE, async () => {
        const summary = await reconcileRecentPendingOrders();
        if (summary.rescued > 0) {
          console.warn(
            `[Scheduler][OPS] PayOS reconcile rescued ${summary.rescued} order(s): `
            + `${summary.rescuedOrderCodes.join(', ')}`
          );
        }
        return summary;
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi đối soát PayOS:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo PayOS order reconcile: mỗi 10 phút (phút 5/15/25/…)');

  // ── PayOS expire stale pending — hourly at minute 25 (after reconcile ticks) ──
  cron.schedule('25 * * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      const {
        expireStalePendingOrders,
        PAYOS_EXPIRE_JOB_CODE,
      } = await import('../services/payment/payosReconcile.service.js');
      await cronJobRunRepository.recordRun(PAYOS_EXPIRE_JOB_CODE, async () => {
        const summary = await expireStalePendingOrders();
        if (summary.rescued > 0 || summary.cancelled > 0) {
          console.log(
            `[Scheduler] PayOS expire: rescued=${summary.rescued} cancelled=${summary.cancelled}`
          );
        }
        return summary;
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi huỷ đơn PayOS quá hạn:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo PayOS stale pending expire: mỗi giờ phút 25');

  // ── Ops alerts evaluator (PLAN_DO_LUONG_KPI Phần A) ─────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('alerts_evaluator', async () => {
        const { evaluateAllAlerts } = await import('../services/admin/alertEvaluator.service.js');
        const results = await evaluateAllAlerts();
        const fired = results.filter((r) => r.fired).length;
        const errors = results.filter((r) => r.error).length;
        return {
          processed: results.length,
          fired,
          errors,
          synced: fired,
        };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi đánh giá cảnh báo:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Alert evaluator: mỗi 5 phút');

  // ── Help: backfill embedding NULL / 0-chunk (PLAN_HELP_INDEX_CRASHSAFE) ─────
  cron.schedule('*/30 * * * *', async () => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      await cronJobRunRepository.recordRun('help_reembed_pending', async () => {
        const { reindexPendingArticles } = await import('../services/help/helpCenter.service.js');
        const summary = await reindexPendingArticles({ limit: 20 });
        console.log(
          `[Scheduler] Help reembed pending: scanned=${summary.scanned} `
          + `reembedded=${summary.reembedded} stillPending=${summary.stillPending}`
        );
        return summary;
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi backfill help embedding:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Help reembed pending: mỗi 30 phút');

  // ── Mat Bao e-invoice retry (pending/failed/lease-expired) ─────────────────
  cron.schedule('7-59/15 * * * *', async () => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      const {
        retryFailedEinvoices,
        retryEinvoiceEmails,
        repairMissingEinvoiceIntents,
        EINVOICE_RECONCILE_JOB_CODE,
        EINVOICE_EMAIL_JOB_CODE,
        EINVOICE_REPAIR_JOB_CODE,
      } = await import('../services/payment/matbaoInvoice.service.js');
      await cronJobRunRepository.recordRun(EINVOICE_RECONCILE_JOB_CODE, async () => {
        const summary = await retryFailedEinvoices({ limit: 20 });
        if (summary.issued > 0) {
          console.log(
            `[Scheduler] Mat Bao invoice retry: issued=${summary.issued} retried=${summary.retried}`,
          );
        }
        return summary;
      });
      await cronJobRunRepository.recordRun(EINVOICE_EMAIL_JOB_CODE, async () => {
        const summary = await retryEinvoiceEmails({ limit: 20 });
        if (summary.sent > 0) {
          console.log(`[Scheduler] Invoice email retry: sent=${summary.sent}`);
        }
        return summary;
      });
      await cronJobRunRepository.recordRun(EINVOICE_REPAIR_JOB_CODE, async () => {
        return repairMissingEinvoiceIntents({ limit: 20 });
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi retry hoá đơn Mắt Bão:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Mat Bao invoice retry: mỗi 15 phút');

  // ── Storage ledger/filesystem reconciliation — nightly, off-peak ──────────
  cron.schedule('40 2 * * *', async () => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      const {
        reconcileStorageObjects,
        STORAGE_RECONCILE_JOB_CODE,
      } = await import('../services/storage/storageReconcile.service.js');
      await cronJobRunRepository.recordRun(STORAGE_RECONCILE_JOB_CODE, async () => {
        const summary = await reconcileStorageObjects();
        console.log(
          `[Scheduler] Storage reconcile: processed=${summary.processed} `
          + `orphaned=${summary.orphanedCount} drift=${summary.driftCount} `
          + `cleanup=${summary.cleanupRetryDeleted} untrackedDurableBytes=${summary.untrackedDurableBytes} `
          + `durableDeleteEnabled=${summary.untrackedDurableDeleteEnabled} `
          + `durableDeleteCandidates=${summary.untrackedDurableDeleteCandidateCount}`
        );
        return {
          ...summary,
          synced: summary.orphanedCount
            + summary.driftCount
            + summary.cleanupRetryDeleted
            + summary.expiredTempDeleted
            + summary.untrackedDeletedCount,
        };
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi đối soát storage ledger:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Storage reconcile: 02:40 hàng ngày');

  // ── Mat Bao E-Invoice series & year check — nightly 03:13 ─────────────────
  // Phút 13 (không phải 10) để lệch khỏi lưới 5 phút của alert evaluator: chạy
  // trùng phút thì evaluator đọc phải dòng cron 'running' còn rỗng và bắn cảnh
  // báo giả. Lọc ở repository là chốt chính, đây là lớp phòng thủ thứ hai.
  cron.schedule('13 3 * * *', async () => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      const {
        checkEinvoiceSeries,
        EINVOICE_SERIES_CHECK_JOB_CODE,
      } = await import('../services/payment/matbaoInvoice.service.js');
      await cronJobRunRepository.recordRun(EINVOICE_SERIES_CHECK_JOB_CODE, async () => {
        const summary = await checkEinvoiceSeries();
        console.log(
          `[Scheduler] Einvoice series check: status=${summary.status} cLai=${summary.cLai} `
          + `yearMismatch=${summary.yearMismatch} notFound=${summary.notFound}`
        );
        return summary;
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi kiểm tra dải số hoá đơn Mắt Bão:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Mat Bao series check: 03:13 hàng ngày');

  // ── Async Bounce Mailbox Sync (VERP DSN via IMAP) — every 10 minutes ───────
  cron.schedule('8-59/10 * * * *', async () => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      const bounceMailboxService = (await import('../services/email/bounceMailbox.service.js')).default;
      await cronJobRunRepository.recordRun('bounce_mailbox_sync', async () => {
        const stats = await bounceMailboxService.syncBounceMailbox();
        if (stats.bouncedCount > 0) {
          console.log(
            `[Scheduler][BounceMailbox] Đã xử lý ${stats.processedCount} thư: ${stats.hardBouncedCount} hard bounce, `
            + `${stats.softBouncedCount} soft bounce, ${stats.skippedCount} skipped`
          );
        }
        return stats;
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi đồng bộ hộp thư bounce IMAP:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Async Bounce Mailbox sync: mỗi 10 phút');

  // ── Affiliate Revenue Sweep — hourly ───────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const cronJobRunRepository = await import('../repositories/admin/cronJobRun.repository.js');
      const {
        sweepAffiliateRevenue,
        AFFILIATE_REVENUE_SWEEP_JOB_CODE,
      } = await import('../services/affiliate/affiliateRevenueSweep.service.js');
      await cronJobRunRepository.recordRun(AFFILIATE_REVENUE_SWEEP_JOB_CODE, async () => {
        const summary = await sweepAffiliateRevenue();
        if (summary.inserted > 0) {
          console.log(`[Scheduler] Affiliate revenue sweep: inserted=${summary.inserted}`);
        }
        return summary;
      });
    } catch (error) {
      console.error('[Scheduler] Lỗi quét doanh thu affiliate:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo Affiliate revenue sweep: mỗi giờ');
};
