/**
 * tiktokTokenRefresh.service.js
 *
 * Cron refresh access_token cho TikTok Business accounts sắp hết hạn.
 * Pattern copy từ `backend/src/services/chatbot/facebookTokenRefresh.service.js`:
 * - Gọi `tiktokBusinessAccountRepository.findExpiringForRefresh(bufferHours)`
 * - Với mỗi account: decrypt refresh_token bằng `decryptSmtpSecret`, gọi
 *   `tiktokOAuth.refreshAccessToken`, mã hoá token mới rồi `updateTokens`.
 * - Nếu refresh throw (refresh_token 365d đã hết hạn) → `deactivate` + log.
 *
 * Mount vào cron ở `backend/src/utils/scheduler.js` ngay sau Facebook
 * token refresh (dòng 1698), chạy 02:00 hàng ngày — lệch giờ với Facebook
 * 03:00 để tránh dồn tải.
 *
 * Việc 2.3 của plan tiktok-business-messaging-integration.md.
 */

import {
  encryptSmtpSecret,
  decryptSmtpSecret,
} from '../../utils/smtpSecretCrypto.js';
import tiktokOAuthService from './tiktokOAuth.service.js';
import tiktokBusinessAccountRepository from '../../repositories/ai/tiktokBusinessAccount.repository.js';

/**
 * Refresh access_token cho tất cả account sắp hết hạn.
 *
 * @param {object} [options]
 * @param {number} [options.bufferHours=2] - refresh nếu access_token_expires_at < now() + buffer
 * @param {object} [options.logger] - optional logger (mặc định console)
 * @returns {Promise<{ total: number, refreshed: number, failed: number, deactivated: number, synced: number }>}
 */
export async function refreshExpiringTikTokTokens({ bufferHours = 2, logger = console } = {}) {
  const accounts = await tiktokBusinessAccountRepository.findExpiringForRefresh(bufferHours);
  const total = accounts.length;
  if (total === 0) {
    logger.log?.('[TikTokTokenRefresh] Không có account nào sắp hết hạn (no-op)');
    return { total: 0, refreshed: 0, failed: 0, deactivated: 0, synced: 0 };
  }

  let refreshed = 0;
  let failed = 0;
  let deactivated = 0;

  // Refresh song song (Promise.all) — match pattern từ plan.
  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      let plainRefreshToken;
      try {
        plainRefreshToken = decryptSmtpSecret(account.refresh_token);
      } catch (decryptErr) {
        // Sai SMTP_SECRET_KEY hoặc row hỏng → deactivate luôn
        logger.error?.(
          `[TikTokTokenRefresh] Không giải mã được refresh_token của account #${account.id}:`,
          decryptErr.message
        );
        await tiktokBusinessAccountRepository.deactivate(account.id, account.id_user);
        deactivated += 1;
        return { id: account.id, status: 'deactivated_crypto_error' };
      }
      try {
        const newTokens = await tiktokOAuthService.refreshAccessToken(plainRefreshToken);
        const now = new Date();
        const newAccessExpiresAt = new Date(now.getTime() + newTokens.expiresIn * 1000);
        const newRefreshExpiresAt = new Date(now.getTime() + newTokens.refreshExpiresIn * 1000);
        await tiktokBusinessAccountRepository.updateTokens(account.id, {
          accessToken: encryptSmtpSecret(newTokens.accessToken),
          refreshToken: encryptSmtpSecret(newTokens.refreshToken),
          accessExpiresAt: newAccessExpiresAt,
          refreshExpiresAt: newRefreshExpiresAt,
        });
        refreshed += 1;
        return { id: account.id, status: 'refreshed' };
      } catch (refreshErr) {
        // Refresh_token 365d hết hạn hoặc bị TikTok revoke → deactivate
        const isPermanent = refreshErr.httpStatus === 400
          || refreshErr.code === 'invalid_refresh_token'
          || refreshErr.code === 'refresh_token_expired';
        if (isPermanent) {
          await tiktokBusinessAccountRepository.deactivate(account.id, account.id_user);
          deactivated += 1;
          logger.warn?.(
            `[TikTokTokenRefresh] Account #${account.id} refresh_token hết hạn, đã deactivate:`,
            refreshErr.message
          );
          return { id: account.id, status: 'deactivated_expired' };
        }
        failed += 1;
        logger.error?.(
          `[TikTokTokenRefresh] Refresh account #${account.id} lỗi (sẽ thử lại lần sau):`,
          refreshErr.message
        );
        return { id: account.id, status: 'failed_retry' };
      }
    })
  );

  // Log kết quả tổng
  logger.log?.(
    `[TikTokTokenRefresh] Done: total=${total} refreshed=${refreshed} `
      + `failed=${failed} deactivated=${deactivated}`
  );

  return { total, refreshed, failed, deactivated, synced: refreshed };
}

export default { refreshExpiringTikTokTokens };
