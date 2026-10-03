import campaignRunRepository from '../repositories/campaign/campaignRun.repository.js';
import campaignCrudRepository from '../repositories/campaign/campaignCrud.repository.js';
import aiUnavailableNoticeRepository from '../repositories/chatbot/aiUnavailableNotice.repository.js';
import { sendSystemEmail, buildCampaignScheduleSkippedEmail } from './systemEmail.util.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

/**
 * Báo chủ workspace: lịch nổ nhưng lượt chạy trước của chiến dịch còn chạy nên lượt theo lịch bị bỏ qua
 * (PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH 3.4). Best-effort: bên gọi KHÔNG await/ném — scheduler không được
 * vướng vì SMTP. Chống gửi trùng bằng `claimRunFailureNotification` (một UPDATE nguyên tử trên dòng `campaign_runs`
 * "bỏ qua" vừa ghi), nên mỗi lần bỏ qua đúng MỘT email.
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

  const owner = await aiUnavailableNoticeRepository.findOwnerContact(ownerId);
  if (!owner?.email) {
    console.warn(`[ScheduleSkipNotify] bỏ qua email — chủ không có email (campaign=${campaignId} run=${runId} owner=${ownerId})`);
    return { skipped: true, reason: 'no_owner_email' };
  }
  const campaign = await campaignCrudRepository.findCampaignById({ campaignId, isAdmin: true, userId: null });
  const { subject, html } = buildCampaignScheduleSkippedEmail({
    fullName: owner.full_name || null,
    campaignName: campaign?.campaign_name || `Chiến dịch #${campaignId}`,
    scheduleName,
    blockingRunId,
    blockingStartedAt,
    scheduleDisabled,
    appUrl: `${String(FRONTEND_URL).replace(/\/$/, '')}/app/campaigns`,
  });
  await sendSystemEmail({ to: owner.email, subject, html });
  console.log(`[ScheduleSkipNotify] đã gửi email campaign=${campaignId} run=${runId} to=${owner.email}`);
  return { sent: true };
}

export default { notifyCampaignScheduleSkipped };
