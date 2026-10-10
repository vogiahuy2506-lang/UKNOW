import { notifyUsers } from '../services/notification/notificationDispatch.service.js';

/**
 * Sự kiện `campaign_run_completed` (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 PR-1): báo "chiến dịch chạy xong" cho chủ
 * workspace + người kích hoạt lượt chạy (nếu khác chủ). Mặc định chỉ chuông (email tắt), người dùng tự bật email được.
 *
 * Tách khỏi campaignQuotaPauseNotify.util.js: nhiều spec của engine mock nguyên module đó với danh sách export cố định, thêm export
 * mới vào đó sẽ làm chúng vỡ (SyntaxError "does not provide an export named"). Module riêng này không bị mock ở đâu.
 */

function toPositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Có nên phát "chạy xong" cho lượt này không.
 *
 * - `finalized.status` phải là `completed`: `finalizeRun` trả `running` khi lượt còn người nhận chờ thử lại (sẽ được resume và
 *   finalize lại sau), và trả `null` khi UPDATE không chạm dòng nào (lượt đã bị dừng/huỷ/đóng sổ bởi luồng khác).
 * - Chiến dịch chạy liên tục (continuous) không có điểm "xong": bị loại.
 * - Lượt không có người nhận nào và không gửi/lỗi/bỏ qua gì (vd lịch hằng ngày không có khách mới) không đáng làm phiền chuông.
 *
 * @param {{ finalized?: { status?: string }|null, isContinuousMode?: boolean, totalRecipients?: number,
 *   successfulSends?: number, failedSends?: number, skippedSends?: number }} input
 * @returns {boolean}
 */
export function shouldNotifyRunCompleted({
  finalized, isContinuousMode = false, totalRecipients = 0, successfulSends = 0, failedSends = 0, skippedSends = 0,
}) {
  if (finalized?.status !== 'completed') return false;
  if (isContinuousMode) return false;
  return Number(totalRecipients) + Number(successfulSends) + Number(failedSends) + Number(skippedSends) > 0;
}

/**
 * @param {{ runId: number, campaignId: number, campaignName?: string|null, ownerId?: number|string|null,
 *   triggeredBy?: number|string|null, totalRecipients?: number, successfulSends?: number, failedSends?: number,
 *   skippedSends?: number }} input
 * @returns {Promise<{ inApp: number, emailSent: number, emailSkipped: number, emailFailed: number }>}
 */
export async function notifyCampaignRunCompleted({
  runId, campaignId, campaignName = null, ownerId = null, triggeredBy = null,
  totalRecipients = 0, successfulSends = 0, failedSends = 0, skippedSends = 0,
}) {
  const userIds = [...new Set([toPositiveInt(ownerId), toPositiveInt(triggeredBy)].filter(Boolean))];
  const label = campaignName ? `«${campaignName}»` : `#${campaignId}`;
  const labelEn = campaignName ? `"${campaignName}"` : `#${campaignId}`;
  const ok = Number(successfulSends) || 0;
  const failed = Number(failedSends) || 0;
  const skipped = Number(skippedSends) || 0;

  return notifyUsers({
    eventType: 'campaign_run_completed',
    userIds,
    title: `Chiến dịch ${label} đã chạy xong`,
    titleEn: `Campaign ${labelEn} has finished running`,
    message: `Đã gửi thành công ${ok}, lỗi ${failed}${skipped > 0 ? `, bỏ qua ${skipped}` : ''}.`,
    messageEn: `${ok} sent successfully, ${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ''}.`,
    link: '/app/delivery-monitor',
    severity: failed > 0 ? 'warning' : 'success',
    metadata: {
      runId,
      campaignId,
      totalRecipients: Number(totalRecipients) || 0,
      successfulSends: ok,
      failedSends: failed,
      skippedSends: skipped,
    },
    dedupeKey: `run:${runId}:completed`,
  });
}
