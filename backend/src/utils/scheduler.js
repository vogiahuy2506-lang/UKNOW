import cron from 'node-cron';
import db from '../config/database.js';
import coursesController from '../controllers/courses.controller.js';
import campaignController from '../controllers/campaign.controller.js';
import { findExpiringUsers, findExpiredUsers, expireUserPlan, incrementReminderCount } from '../repositories/subscription/subscription.repository.js';
import { sendSystemEmail, buildRenewalReminderEmail } from './systemEmail.util.js';

const campaignScheduleTasks = new Map();
let isRefreshingCampaignSchedules = false;
const activeContinuousRunIds = new Set();
const activeNonContinuousRunIds = new Set();
const activeOverdueNonContinuousRunIds = new Set();
const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

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

const triggerCampaignSchedule = async (schedule) => {
  try {
    if (!schedule?.id_campaign || !schedule?.id_user) return;
    const isCustomSchedule = String(schedule?.schedule_type || '').toLowerCase() === 'custom';
    if (isCustomSchedule && !shouldTriggerCustomScheduleToday(schedule)) {
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
      console.log(
        `[Scheduler] Bỏ qua schedule #${schedule.id} vì campaign #${schedule.id_campaign} đang chạy`
      );
      return;
    }

    // Luôn gắn nhãn thời điểm theo Asia/Ho_Chi_Minh (không phụ thuộc TZ của process/ máy chủ).
    const runName = `${schedule.schedule_name || 'Lich chay'} - ${new Date().toLocaleString('vi-VN', {
      timeZone: HANOI_TIME_ZONE,
      hour12: false,
    })}`;
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
        cs.last_run_at,
        cs.created_at,
        c.id_user
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
    `SELECT cr.id, cr.id_campaign, c.id_user
     FROM campaign_runs cr
     JOIN campaigns c ON c.id = cr.id_campaign
     WHERE cr.status = 'running'
       AND LOWER(COALESCE(cr.run_metadata->>'continuousMode', 'false')) <> 'true'`
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
    if (activeNonContinuousRunIds.has(runKey)) {
      continue;
    }

    activeNonContinuousRunIds.add(runKey);
    console.log(`[Scheduler] Phục hồi campaign run non-continuous #${runId} (campaign #${campaignId})`);
    campaignController.executeCampaign(campaignId, runId, userId)
      .catch((error) => {
        console.error(`[Scheduler] Lỗi phục hồi non-continuous run #${runId}:`, error.message);
      })
      .finally(() => {
        activeNonContinuousRunIds.delete(runKey);
      });
  }
};

/**
 * Quét các run non-continuous đang chạy nhưng đã quá hạn `nextDueAt` để gửi tiếp step kế tiếp.
 *
 * Luồng hoạt động:
 * 1. Lấy danh sách run có `status = running`, `continuousMode != true` và còn recipient chưa hoàn tất.
 * 2. Chỉ chọn bản ghi có `meta.nextDueAt` đã tới hạn (`<= NOW()`).
 * 3. Trigger lại executeCampaign theo từng run để resume gửi step còn treo.
 *
 * @returns {Promise<void>}
 */
const recoverOverdueNonContinuousCampaignRuns = async () => {
  const result = await db.query(
    `SELECT DISTINCT cr.id, cr.id_campaign, c.id_user
     FROM campaign_runs cr
     JOIN campaigns c ON c.id = cr.id_campaign
     JOIN campaign_run_recipient_steps crs ON crs.id_run = cr.id
     WHERE cr.status = 'running'
       AND LOWER(COALESCE(cr.run_metadata->>'continuousMode', 'false')) <> 'true'
       AND COALESCE(crs.is_fully_completed, FALSE) = FALSE
       AND NULLIF(TRIM(COALESCE(crs.meta->>'nextDueAt', '')), '') IS NOT NULL
       AND (crs.meta->>'nextDueAt')::timestamptz <= NOW()`
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
    if (activeOverdueNonContinuousRunIds.has(runKey)) {
      continue;
    }

    activeOverdueNonContinuousRunIds.add(runKey);
    console.log(
      `[Scheduler] Quét retry non-continuous quá hạn cho run #${runId} (campaign #${campaignId})`
    );
    campaignController.executeCampaign(campaignId, runId, userId)
      .catch((error) => {
        console.error(`[Scheduler] Lỗi retry non-continuous run #${runId}:`, error.message);
      })
      .finally(() => {
        activeOverdueNonContinuousRunIds.delete(runKey);
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
  // Đồng bộ khóa học từ Founder AI mỗi ngày lúc 00:30 (12:30 AM)
  // Cron format: phút giờ ngày tháng thứ
  // '30 0 * * *' = 00:30 mỗi ngày
  cron.schedule('30 0 * * *', async () => {
    console.log('[Scheduler] Bắt đầu đồng bộ khóa học hàng ngày lúc 00:30...');
    try {
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
      await recoverNonContinuousCampaignRuns();
    } catch (error) {
      console.error('[Scheduler] Lỗi khi refresh campaign schedules:', error.message);
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh'
  });

  // Cứ 2 tiếng quét các run non-continuous còn treo step quá hạn để gửi tiếp.
  // Dùng cron có giây: "0 0 */2 * * *" = phút 0, giây 0, mỗi 2 giờ.
  cron.schedule('0 0 */2 * * *', async () => {
    try {
      await recoverOverdueNonContinuousCampaignRuns();
    } catch (error) {
      console.error('[Scheduler] Lỗi khi quét retry non-continuous quá hạn:', error.message);
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
  recoverOverdueNonContinuousCampaignRuns().catch((error) => {
    console.error('[Scheduler] Không thể quét retry non-continuous quá hạn ban đầu:', error.message);
  });

  // ── Subscription reminder & expiry — chạy lúc 08:00 mỗi ngày ──────────────
  cron.schedule('0 8 * * *', async () => {
    console.log('[Subscription] Bắt đầu kiểm tra gói hết hạn...');
    const renewalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5174'}/renewal`;
    try {
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
    } catch (error) {
      console.error('[Subscription] Lỗi khi kiểm tra gói:', error.message);
    }
  }, { timezone: HANOI_TIME_ZONE });

  console.log('[Scheduler] Đã khởi tạo subscription reminder cron: 08:00 hàng ngày');
};
