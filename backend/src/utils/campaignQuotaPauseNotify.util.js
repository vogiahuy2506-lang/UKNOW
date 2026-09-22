import db from '../config/database.js';
import campaignRunRepository from '../repositories/campaign/campaignRun.repository.js';
import campaignCrudRepository from '../repositories/campaign/campaignCrud.repository.js';
import {
  sendSystemEmail,
  buildCampaignPausedEmail,
  buildCampaignStoppedQuotaEmail,
} from './systemEmail.util.js';

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
  return 'gửi';
}

function frontendAppUrl(path) {
  const base = String(FRONTEND_URL || '').replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * @param {number} campaignId
 * @returns {Promise<{ email: string, fullName: string|null, campaignName: string }|null>}
 */
async function loadOwnerContact(campaignId) {
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
  if (!user?.email) return null;

  return {
    email: String(user.email).trim(),
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
