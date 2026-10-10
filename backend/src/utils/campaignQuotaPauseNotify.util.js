import db from '../config/database.js';
import campaignRunRepository from '../repositories/campaign/campaignRun.repository.js';
import campaignCrudRepository from '../repositories/campaign/campaignCrud.repository.js';
import {
  sendSystemEmail,
  buildCampaignPausedEmail,
  buildCampaignStoppedQuotaEmail,
  buildCampaignRunFailedEmail,
  buildCampaignApprovalRequiredEmail,
} from './systemEmail.util.js';
import { labelCampaignRunFailure } from './campaignRunFailureLabel.util.js';
import { notifyUsers } from '../services/notification/notificationDispatch.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

/** Keys xoá khỏi run_metadata khi resume / tiến triển lại sau đợt quota-defer. */
export const QUOTA_DEFER_CLEAR_KEYS = [
  'quotaDeferredUntil',
  'quotaDeferredReason',
  'quotaDeferredAt',
  'quotaPauseNotifiedAt',
];

/**
 * @param {unknown} reason
 * @returns {boolean}
 */
export function isPlanQuotaReason(reason) {
  return String(reason || '').startsWith('plan_quota');
}

/**
 * `reason` do hoãn vì giới hạn/ngày NGƯỜI DÙNG TỰ ĐẶT cho tài khoản gửi (`plan_quota_account_daily`
 * — vẫn mang tiền tố `plan_quota` để đi qua cổng `isPlanQuotaReason` và không bị `notifyCampaignQuotaPaused`
 * bỏ qua âm thầm), khác với hạn mức GÓI (`plan_quota_daily`/`_monthly`/`_period`...).
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22 Việc 3/4: mail tạm dừng phải nói đúng cái gì bị chạm, nếu
 * không khách sẽ đi mua thêm gói một cách vô ích cho một giới hạn họ tự đặt.
 *
 * @param {unknown} reason
 * @returns {boolean}
 */
export function isAccountDailyQuotaReason(reason) {
  return String(reason || '').includes('account_daily');
}

/**
 * Map reason `plan_quota_*` → nhãn kênh cho email.
 *
 * @param {unknown} reason
 * @returns {string}
 */
export function channelLabelFromQuotaReason(reason) {
  const r = String(reason || '').toLowerCase();
  if (r.includes('email')) return 'email';
  if (r.includes('zalo')) return 'Zalo';
  if (r.includes('telegram')) return 'Telegram';
  if (r.includes('whatsapp')) return 'WhatsApp';
  return 'gửi';
}

function frontendAppUrl(path) {
  const base = String(FRONTEND_URL || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * @param {number} campaignId
 * @param {{ requireEmail?: boolean }} [options] `requireEmail:false` — sự kiện đã đi qua chuông (notifyUsers) nên chủ không có
 *   email vẫn nhận được thông báo trong app; mặc định true giữ nguyên hành vi email-only của các hàm quota.
 * @returns {Promise<{ userId: number, email: string|null, fullName: string|null, campaignName: string }|null>}
 */
async function loadOwnerContact(campaignId, { requireEmail = true } = {}) {
  const campaign = await campaignCrudRepository.findCampaignById({
    campaignId,
    isAdmin: true,
    userId: null,
  });
  if (!campaign?.id_user) return null;

  const { rows } = await db.query(
    `SELECT email, full_name FROM users WHERE id = $1 LIMIT 1`,
    [campaign.id_user]
  );
  const user = rows[0];
  if (!user) return null;
  if (requireEmail && !user.email) return null;

  return {
    // `id_user` = người tạo chiến dịch (có thể là nhân viên — cùng hiện trạng với email trước đây).
    userId: Number(campaign.id_user),
    email: user.email ? String(user.email).trim() : null,
    fullName: user.full_name || null,
    campaignName: campaign.campaign_name || `Chiến dịch #${campaignId}`,
  };
}

/**
 * Gửi email "tạm dừng vì hết quota" tối đa 1 lần/đợt (cờ `quotaPauseNotifiedAt`).
 *
 * @param {{ runId: number, campaignId: number, reason: string, resetAt: Date|string }} input
 * @returns {Promise<{ sent?: boolean, skipped?: boolean, reason?: string }>}
 */
export async function notifyCampaignQuotaPaused({ runId, campaignId, reason, resetAt }) {
  if (!isPlanQuotaReason(reason)) {
    return { skipped: true, reason: 'not_plan_quota' };
  }

  const meta = (await campaignRunRepository.getRunMetadata(runId)) || {};
  if (meta.quotaPauseNotifiedAt) {
    return { skipped: true, reason: 'already_notified' };
  }

  // Claim cờ trước khi SMTP — tránh double-send khi defer song song.
  const notifiedAt = new Date().toISOString();
  await campaignRunRepository.patchRunMetadata(runId, { quotaPauseNotifiedAt: notifiedAt });

  const owner = await loadOwnerContact(campaignId);
  if (!owner?.email) {
    console.warn(
      `[CampaignQuotaNotify] skip paused email — no owner email campaign=${campaignId} run=${runId}`
    );
    return { skipped: true, reason: 'no_owner_email' };
  }

  const isAccountLimit = isAccountDailyQuotaReason(reason);
  const { subject, html } = buildCampaignPausedEmail({
    fullName: owner.fullName,
    campaignName: owner.campaignName,
    channelLabel: channelLabelFromQuotaReason(reason),
    resetAt,
    topupUrl: frontendAppUrl('/app/topup'),
    // Giới hạn tự đặt cho tài khoản gửi: mua thêm hạn mức GÓI không giúp gửi tiếp — trỏ sang
    // đúng chỗ sửa (Cài đặt kênh → tài khoản gửi), không phải trang mua thêm.
    isAccountLimit,
    settingsUrl: frontendAppUrl('/app/settings/channels'),
  });

  await sendSystemEmail({ to: owner.email, subject, html });
  console.log(
    `[CampaignQuotaNotify] paused email sent campaign=${campaignId} run=${runId} to=${owner.email}`
  );
  return { sent: true };
}

/**
 * Gửi email khi campaign hard-fail vì hết hạn mức / gói hết hạn (không có resetAt).
 *
 * @param {{ campaignId: number, reason?: string }} input
 * @returns {Promise<{ sent?: boolean, skipped?: boolean, reason?: string }>}
 */
export async function notifyCampaignQuotaStopped({ campaignId, reason }) {
  const owner = await loadOwnerContact(campaignId);
  if (!owner?.email) {
    console.warn(
      `[CampaignQuotaNotify] skip stopped email — no owner email campaign=${campaignId}`
    );
    return { skipped: true, reason: 'no_owner_email' };
  }

  const { subject, html } = buildCampaignStoppedQuotaEmail({
    fullName: owner.fullName,
    campaignName: owner.campaignName,
    reason: reason || 'Gói hết hạn hoặc hết hạn mức kỳ.',
    billingUrl: frontendAppUrl('/app/billing'),
  });

  await sendSystemEmail({ to: owner.email, subject, html });
  console.log(
    `[CampaignQuotaNotify] stopped email sent campaign=${campaignId} to=${owner.email}`
  );
  return { sent: true };
}

/**
 * Gửi email cho chủ chiến dịch khi một lượt chạy hỏng hoặc bị hệ thống tự dừng (lỗi cấu
 * hình/kỹ thuật — KHÔNG dùng cho hết hạn mức gói, đã có notifyCampaignQuotaPaused/Stopped riêng).
 * Chống gửi trùng bằng claimRunFailureNotification() — một câu UPDATE giành cờ nguyên tử, không
 * đọc-rồi-ghi, và không lọc theo status nên vẫn giành được cờ dù run đã 'failed'.
 *
 * Từ PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1: đi qua dispatcher (`notifyUsers`, sự kiện `campaign_run_failed`) — chuông trong app
 * + email theo cấu hình hệ thống / tuỳ chọn người dùng. Nội dung email vẫn là buildCampaignRunFailedEmail như cũ.
 *
 * @param {{ runId: number, campaignId: number, reason: string, source?: string }} input
 * @returns {Promise<{ sent?: boolean, skipped?: boolean, reason?: string }>}
 */
export async function notifyCampaignRunFailed({ runId, campaignId, reason, source }) {
  const claimed = await campaignRunRepository.claimRunFailureNotification(runId);
  if (!claimed) {
    return { skipped: true, reason: 'already_notified' };
  }

  const owner = await loadOwnerContact(campaignId, { requireEmail: false });
  if (!owner) {
    console.warn(
      `[CampaignRunFailedNotify] skip — no owner campaign=${campaignId} run=${runId}`
    );
    return { skipped: true, reason: 'no_owner' };
  }

  const { message: reasonLabel, actionHint } = labelCampaignRunFailure(reason);
  const delivery = await notifyUsers({
    eventType: 'campaign_run_failed',
    userIds: [owner.userId],
    title: `Chiến dịch «${owner.campaignName}» gặp lỗi, lượt chạy đã dừng`,
    titleEn: `Campaign "${owner.campaignName}" failed and the run was stopped`,
    message: actionHint ? `${reasonLabel} ${actionHint}` : reasonLabel,
    link: '/app/campaigns',
    severity: 'error',
    metadata: { runId, campaignId, source: source || null },
    dedupeKey: `run:${runId}:failed`,
    email: ({ fullName }) => buildCampaignRunFailedEmail({
      fullName: fullName ?? owner.fullName,
      campaignName: owner.campaignName,
      reason: reasonLabel,
      actionHint,
      appUrl: frontendAppUrl('/app/campaigns'),
    }),
  });

  console.log(
    `[CampaignRunFailedNotify] notified campaign=${campaignId} run=${runId} `
    + `source=${source || 'unknown'} owner=${owner.userId} inApp=${delivery.inApp} emailSent=${delivery.emailSent}`
  );
  return delivery.inApp + delivery.emailSent > 0
    ? { sent: true }
    : { skipped: true, reason: 'no_delivery' };
}

/**
 * Lịch hẹn của nhân viên vượt ngưỡng duyệt (campaignApproval.service.js#evaluateApprovalThreshold)
 * — không ai đang xem màn hình để nhận phản hồi API như đường chạy ngay, nên phải email chủ
 * (PLAN_VA_NHAN_VIEN_PHAN_QUYEN_2026-09-28 PR-3). Không dùng claimRunFailureNotification (đòi một
 * dòng campaign_runs thật) vì nhánh này KHÔNG tạo run; không cần chống gửi trùng vì lịch bị tắt
 * (enabled=false) ngay sau đó — cron không bắn lại schedule này cho tới khi chủ tự bật lại.
 * Lấy contact theo `ownerId` truyền thẳng vào (KHÔNG qua campaign.id_user như loadOwnerContact — sai
 * nếu chiến dịch do nhân viên tạo, id_user khi đó là nhân viên chứ không phải chủ).
 *
 * Từ PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1: đi qua dispatcher (sự kiện `campaign_approval_required`, người dùng KHÔNG tắt được
 * email loại này) — chuông trong app + email (mẫu buildCampaignApprovalRequiredEmail như cũ).
 *
 * @param {{ campaignId: number, ownerId: number, threshold: number, totalCustomers: number }} input
 * @returns {Promise<{ sent?: boolean, skipped?: boolean, reason?: string }>}
 */
export async function notifyCampaignApprovalRequired({ campaignId, ownerId, threshold, totalCustomers }) {
  const campaign = await campaignCrudRepository.findCampaignById({ campaignId, isAdmin: true, userId: null });
  const campaignName = campaign?.campaign_name || `Chiến dịch #${campaignId}`;

  const delivery = await notifyUsers({
    eventType: 'campaign_approval_required',
    userIds: [ownerId],
    title: `Chiến dịch «${campaignName}» đang chờ bạn duyệt`,
    titleEn: `Campaign "${campaignName}" is waiting for your approval`,
    message: `Lịch hẹn đến giờ chạy nhưng có ${totalCustomers} người nhận, vượt ngưỡng yêu cầu phê duyệt (${threshold}) bạn đã đặt cho nhân viên. `
      + 'Duyệt sẽ chạy ngay một lần cho lượt này; lịch hẹn định kỳ đã bị tắt, muốn tiếp tục lịch tự động thì bật lại sau khi duyệt.',
    messageEn: `The schedule is due but has ${totalCustomers} recipients, above the approval threshold (${threshold}) you set for employees. `
      + 'Approving runs it once now; the recurring schedule was turned off, turn it back on after approving to keep it automatic.',
    link: '/app/campaigns',
    severity: 'warning',
    metadata: { campaignId, threshold, totalCustomers },
    email: ({ fullName }) => buildCampaignApprovalRequiredEmail({
      fullName,
      campaignName,
      totalCustomers,
      threshold,
      appUrl: frontendAppUrl('/app/campaigns'),
    }),
  });

  console.log(
    `[CampaignApprovalNotify] notified campaign=${campaignId} owner=${ownerId} `
    + `threshold=${threshold} totalCustomers=${totalCustomers} inApp=${delivery.inApp} emailSent=${delivery.emailSent}`
  );
  return delivery.inApp + delivery.emailSent > 0
    ? { sent: true }
    : { skipped: true, reason: 'no_delivery' };
}
