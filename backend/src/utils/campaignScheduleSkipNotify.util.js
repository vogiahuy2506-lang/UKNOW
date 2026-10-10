import campaignRunRepository from '../repositories/campaign/campaignRun.repository.js';
import campaignCrudRepository from '../repositories/campaign/campaignCrud.repository.js';
import { buildCampaignScheduleSkippedEmail } from './systemEmail.util.js';
import { notifyUsers } from '../services/notification/notificationDispatch.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

/**
 * Báo chủ workspace: lịch nổ nhưng lượt chạy trước của chiến dịch còn chạy nên lượt theo lịch bị bỏ qua
 * (PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH 3.4). Best-effort: bên gọi KHÔNG await/ném — scheduler không được
 * vướng vì SMTP. Chống gửi trùng bằng `claimRunFailureNotification` (một UPDATE nguyên tử trên dòng `campaign_runs`
 * "bỏ qua" vừa ghi), nên mỗi lần bỏ qua đúng MỘT thông báo.
 *
 * Từ PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1: đi qua dispatcher (`notifyUsers`, sự kiện `campaign_schedule_skipped`) — chuông
 * trong app + email theo cấu hình hệ thống / tuỳ chọn người dùng. Nội dung email vẫn là buildCampaignScheduleSkippedEmail như cũ.
 *
 * @param {{ runId: number, campaignId: number, ownerId: number, scheduleName?: string, blockingRunId?: number|string,
 *   blockingStartedAt?: string, scheduleDisabled?: boolean }} input
 * @returns {Promise<{ sent?: boolean, skipped?: boolean, reason?: string }>}
 */
export async function notifyCampaignScheduleSkipped({
  runId, campaignId, ownerId, scheduleName = '', blockingRunId = null, blockingStartedAt = '', scheduleDisabled = false,
}) {
  const claimed = await campaignRunRepository.claimRunFailureNotification(runId);
  if (!claimed) return { skipped: true, reason: 'already_notified' };

  const campaign = await campaignCrudRepository.findCampaignById({ campaignId, isAdmin: true, userId: null });
  const campaignName = campaign?.campaign_name || `Chiến dịch #${campaignId}`;
  const appUrl = `${String(FRONTEND_URL).replace(/\/$/, '')}/app/campaigns`;
  const scheduleLabel = scheduleName || 'Lịch chạy';
  const blocking = blockingRunId ? `lượt chạy #${blockingRunId}` : 'lượt chạy trước';

  const delivery = await notifyUsers({
    eventType: 'campaign_schedule_skipped',
    userIds: [ownerId],
    title: `Lịch của chiến dịch «${campaignName}» bị bỏ qua vì lượt trước chưa xong`,
    titleEn: `The schedule of campaign "${campaignName}" was skipped because the previous run is not finished`,
    message: `Lịch «${scheduleLabel}» đã đến giờ chạy nhưng ${blocking} vẫn chưa xong nên lượt này bị bỏ qua để không chạy chồng. `
      + (scheduleDisabled
        ? 'Đây là lịch chạy một lần nên lịch đã được tắt.'
        : 'Lịch vẫn bật — lượt kế tiếp sẽ chạy bình thường nếu lúc đó chiến dịch đã xong.'),
    messageEn: `The schedule "${scheduleLabel}" was due but ${blockingRunId ? `run #${blockingRunId}` : 'the previous run'} is still going, `
      + 'so this run was skipped to avoid overlapping. '
      + (scheduleDisabled
        ? 'This was a one-time schedule, so it has been turned off.'
        : 'The schedule stays on; the next run starts normally once the campaign has finished.'),
    link: '/app/campaigns',
    severity: 'warning',
    metadata: {
      campaignId,
      runId,
      blockingRunId: blockingRunId ?? null,
      scheduleName: scheduleName || null,
      scheduleDisabled: Boolean(scheduleDisabled),
    },
    dedupeKey: `run:${runId}:schedule_skipped`,
    email: ({ fullName }) => buildCampaignScheduleSkippedEmail({
      fullName: fullName || null,
      campaignName,
      scheduleName,
      blockingRunId,
      blockingStartedAt,
      scheduleDisabled,
      appUrl,
    }),
  });

  console.log(
    `[ScheduleSkipNotify] đã báo campaign=${campaignId} run=${runId} owner=${ownerId} `
    + `inApp=${delivery.inApp} emailSent=${delivery.emailSent}`
  );
  if (delivery.inApp + delivery.emailSent === 0) {
    console.warn(`[ScheduleSkipNotify] không gửi được cho ai (chủ không hoạt động / đã tắt kênh) campaign=${campaignId} run=${runId} owner=${ownerId}`);
    return { skipped: true, reason: 'no_delivery' };
  }
  return { sent: true };
}

export default { notifyCampaignScheduleSkipped };
