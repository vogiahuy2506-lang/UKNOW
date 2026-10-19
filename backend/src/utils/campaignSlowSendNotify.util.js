import db from '../config/database.js';
import campaignRunRepository from '../repositories/campaign/campaignRun.repository.js';
import campaignCrudRepository from '../repositories/campaign/campaignCrud.repository.js';
import { notifyUsers } from '../services/notification/notificationDispatch.service.js';
import { vnDayKey } from './vnTimeFormat.util.js';

/**
 * Báo chủ chiến dịch khi run Zalo cá nhân "bò chậm" vì Zalo giới hạn tài khoản gửi
 * (PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19 PR-3).
 *
 * Hai nguyên nhân (`cause`):
 *  - `phone_lookup`: Zalo báo tra số điện thoại quá nhiều → khoá tra số tới 00:00 giờ VN. Nối kích hoạt ở
 *    `campaignRun.service.js#persistZaloDeferYieldSlot` (≥ 2 ngày VN liền kề đều bị khoá).
 *  - `stranger_ban`: tài khoản bị Zalo cấm nhắn người lạ. CHƯA nối kích hoạt (PR-4); hàm đã nhận sẵn giá trị này.
 */

/** Không báo lại cùng một lượt chạy trong khoảng này (cờ `sendingSlowNotifiedAt`). */
export const SENDING_SLOW_RENOTIFY_MS = 7 * 24 * 60 * 60 * 1000;
/** Số ngày VN gần nhất giữ trong `run_metadata.phoneLookupDeferVnDays`. */
export const PHONE_LOOKUP_DEFER_DAYS_KEEP = 7;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const VN_DAY_KEY_RE = /^\d{8}$/;

/**
 * `reason` do hàm `persistZaloDeferYieldSlot` nhận khi Zalo khoá tra số: `phone_lookup_cooldown` (cổng rate limiter),
 * `phone_lookup_cooldown_api_error` (Zalo vừa báo lỗi), `all_accounts_phone_lookup_cooldown` (cả pool đang khoá).
 *
 * @param {unknown} reason
 * @returns {boolean}
 */
export function isPhoneLookupCooldownReason(reason) {
  return String(reason || '').includes('phone_lookup_cooldown');
}

/**
 * Thêm ngày VN của `now` vào danh sách ngày bị khoá tra số và cho biết có nên báo khách không.
 * Thuần (không I/O) để test được. Khoá ngày là `vnDayKey` (`yyyymmdd`); VN không có giờ mùa hè nên "hôm qua" = trừ đúng 24h.
 *
 * @param {unknown} existingDays giá trị `run_metadata.phoneLookupDeferVnDays` (có thể thiếu / sai kiểu)
 * @param {Date} [now]
 * @returns {{ days: string[], shouldNotify: boolean }} `days` đã thêm hôm nay, không trùng, tối đa 7 ngày gần nhất
 */
export function recordPhoneLookupDeferDay(existingDays, now = new Date()) {
  const today = vnDayKey(now);
  const yesterday = vnDayKey(new Date(now.getTime() - ONE_DAY_MS));
  const clean = (Array.isArray(existingDays) ? existingDays : [])
    .map((d) => String(d))
    .filter((d) => VN_DAY_KEY_RE.test(d));
  const days = [...new Set([...clean, today])]
    .sort()
    .slice(-PHONE_LOOKUP_DEFER_DAYS_KEEP);
  return { days, shouldNotify: days.includes(today) && days.includes(yesterday) };
}

/**
 * @param {number} campaignId
 * @returns {Promise<{ userId: number, campaignName: string }|null>}
 */
async function loadOwnerContact(campaignId) {
  const campaign = await campaignCrudRepository.findCampaignById({
    campaignId,
    isAdmin: true,
    userId: null,
  });
  if (!campaign?.id_user) return null;

  const { rows } = await db.query(
    `SELECT id FROM users WHERE id = $1 LIMIT 1`,
    [campaign.id_user]
  );
  if (!rows[0]) return null;

  return {
    // `id_user` = người tạo chiến dịch (có thể là nhân viên) — cùng hiện trạng với các thông báo quota.
    userId: Number(campaign.id_user),
    campaignName: campaign.campaign_name || `Chiến dịch #${campaignId}`,
  };
}

/**
 * Soạn câu chuông theo nguyên nhân.
 *
 * @param {'phone_lookup'|'stranger_ban'} cause
 * @param {string} campaignName
 * @param {string|null} accountName
 * @returns {{ title: string, titleEn: string, message: string, messageEn: string }}
 */
export function buildSendingSlowCopy(cause, campaignName, accountName) {
  const account = accountName ? `«${accountName}»` : '';
  const accountEn = accountName ? `"${accountName}"` : '';
  if (cause === 'stranger_ban') {
    return {
      title: `Chiến dịch «${campaignName}» đang tạm dừng gửi`,
      titleEn: `Campaign "${campaignName}" is temporarily not sending`,
      message: `Tài khoản Zalo ${account ? `${account} ` : ''}đang bị Zalo tạm cấm nhắn tin cho người chưa kết bạn. `
        + 'Chiến dịch tạm dừng và sẽ thử lại vào sáng mai. Trong lúc này bạn có thể gửi bằng tài khoản Zalo khác.',
      messageEn: `The Zalo account ${accountEn ? `${accountEn} ` : ''}is temporarily banned by Zalo from messaging people who are not friends. `
        + 'The campaign is paused and will retry tomorrow morning. Meanwhile you can send with another Zalo account.',
    };
  }
  return {
    title: `Chiến dịch «${campaignName}» đang gửi rất chậm`,
    titleEn: `Campaign "${campaignName}" is sending very slowly`,
    message: `Tài khoản Zalo ${account ? `${account} ` : ''}bị Zalo giới hạn số lần tra số điện thoại mỗi ngày, nên mỗi ngày chiến dịch chỉ gửi được ít tin. `
      + 'Hệ thống vẫn tự gửi tiếp mỗi sáng. Muốn nhanh hơn: gửi cho khách đã kết bạn Zalo, chia danh sách cho nhiều tài khoản Zalo, '
      + 'hoặc bỏ bớt số không dùng Zalo.',
    messageEn: `The Zalo account ${accountEn ? `${accountEn} ` : ''}is limited by Zalo on how many phone numbers it can look up per day, so the campaign only sends a few messages each day. `
      + 'The system keeps sending automatically every morning. To go faster: message customers who are already Zalo friends, '
      + 'split the list across several Zalo accounts, or remove numbers that do not use Zalo.',
  };
}

/**
 * Báo chủ "chiến dịch gửi chậm bất thường", tối đa 1 lần / 7 ngày / lượt chạy (cờ `sendingSlowNotifiedAt`).
 * Khuôn `notifyCampaignQuotaPaused`: đọc meta → claim cờ TRƯỚC khi gửi → nạp chủ → `notifyUsers` (chuông; email mặc định tắt,
 * người dùng/super admin bật thì `notifyUsers` tự dựng email chung từ tiêu đề + nội dung — không cần mẫu riêng).
 *
 * @param {{ runId: number, campaignId: number, cause: 'phone_lookup'|'stranger_ban', accountName?: string|null, now?: Date }} input
 * @returns {Promise<{ sent?: boolean, skipped?: boolean, reason?: string }>}
 */
export async function notifyCampaignSendingSlow({
  runId,
  campaignId,
  cause,
  accountName = null,
  now = new Date(),
}) {
  if (cause !== 'phone_lookup' && cause !== 'stranger_ban') {
    return { skipped: true, reason: 'unknown_cause' };
  }

  const meta = (await campaignRunRepository.getRunMetadata(runId)) || {};
  const lastMs = Date.parse(String(meta.sendingSlowNotifiedAt || ''));
  if (Number.isFinite(lastMs) && now.getTime() - lastMs < SENDING_SLOW_RENOTIFY_MS) {
    return { skipped: true, reason: 'already_notified' };
  }

  // Claim cờ trước khi gửi — tránh double-send khi hai lần hoãn chạy song song.
  const notifiedAt = now.toISOString();
  await campaignRunRepository.patchRunMetadata(runId, { sendingSlowNotifiedAt: notifiedAt });

  const owner = await loadOwnerContact(campaignId);
  if (!owner) {
    console.warn(
      `[CampaignSlowSendNotify] skip — no owner campaign=${campaignId} run=${runId}`
    );
    return { skipped: true, reason: 'no_owner' };
  }

  const copy = buildSendingSlowCopy(cause, owner.campaignName, accountName);
  const delivery = await notifyUsers({
    eventType: 'campaign_sending_slow',
    userIds: [owner.userId],
    title: copy.title,
    titleEn: copy.titleEn,
    message: copy.message,
    messageEn: copy.messageEn,
    link: `/app/campaigns/${campaignId}`,
    severity: 'warning',
    metadata: { runId, campaignId, cause },
    dedupeKey: `run:${runId}:sending_slow:${notifiedAt}`,
  });

  console.log(
    `[CampaignSlowSendNotify] notified campaign=${campaignId} run=${runId} cause=${cause} `
    + `owner=${owner.userId} inApp=${delivery.inApp} emailSent=${delivery.emailSent}`
  );
  return delivery.inApp + delivery.emailSent > 0
    ? { sent: true }
    : { skipped: true, reason: 'no_delivery' };
}
