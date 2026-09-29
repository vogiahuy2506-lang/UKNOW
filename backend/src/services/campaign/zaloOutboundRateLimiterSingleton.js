import { buildZaloRateLimiterFromEnv } from './buildZaloRateLimiterFromEnv.js';

/**
 * PLAN_GUI_NHANH_ZALO_GIAN_CACH_2026-09-28 PR-2 Việc 5 — một instance `ZaloRateLimiter` DUY NHẤT
 * dùng chung giữa `campaignRun.service.js` (gửi qua chiến dịch) và `zaloSettings.controller.js`
 * (gửi nhanh/preview) trong CÙNG một tiến trình backend (production chỉ chạy 1 replica cho campaign
 * — xem CLAUDE.md "Campaign runtime — single process only"; nhiều instance nghĩa là 2 Map trạng thái
 * riêng, gửi nhanh không bao giờ thấy đúng nhịp chiến dịch đang chạy).
 *
 * Tách ra module riêng thay vì import thẳng `campaignRun.service.js` (đã kiểm tĩnh: KHÔNG có vòng
 * import giữa 2 file — nhưng `campaignRun.service.js` nặng ~9000 dòng và
 * `campaignQuickSend.service.js` đã import ngược `zaloSettings.controller.js`, nên tách cho an toàn
 * lâu dài, tránh vòng import nếu `campaignRun.service.js` sau này kéo thêm phụ thuộc).
 *
 * Chỉ 2 nơi này dùng singleton này. `diagnostic.controller.js`/`diagnostic/runner.service.js` vẫn
 * tự gọi `buildZaloRateLimiterFromEnv()` để lấy instance RIÊNG, dùng tạm cho việc đọc
 * `resolveOutboundPolicy()` mô phỏng — cố tình KHÔNG dùng chung, để công cụ chẩn đoán không vô tình
 * đụng vào trạng thái nhịp gửi thật.
 */
let sharedInstance = null;

/**
 * @returns {import('./zaloRateLimiter.js').default}
 */
export function getSharedZaloRateLimiter() {
  if (!sharedInstance) {
    sharedInstance = buildZaloRateLimiterFromEnv();
  }
  return sharedInstance;
}

/**
 * CHỈ dùng trong test. `truncateAll()` của integration test chạy `RESTART IDENTITY` — accountId
 * lặp lại số cũ (1, 2, 3...) giữa các test/file (jest `--runInBand` dùng chung một tiến trình).
 * Không reset thì trạng thái nhịp gửi (`lastAttemptAtMs`, cooldown tra số...) của test TRƯỚC rò
 * sang test SAU cùng trùng accountId, y hệt lý do `_clearQuotaCache()` đã có sẵn trong
 * `truncateAll()` cho cache hạn mức.
 *
 * Xoá trạng thái NGAY TRÊN instance hiện có — KHÔNG gán `sharedInstance = null`: `campaignRunService`
 * giữ tham chiếu từ lúc khởi tạo (`this.zaloRateLimiter = getSharedZaloRateLimiter()`), tạo instance
 * mới thì controller gửi nhanh và chiến dịch tách thành HAI instance trong test (review 28/09).
 */
export function _resetSharedZaloRateLimiterForTests() {
  if (!sharedInstance) return;
  sharedInstance.zaloOutboundRateLimitState.clear();
  sharedInstance.zaloPersonalPhoneLookupCooldownUntil.clear();
  sharedInstance.zaloOutboundAccountMutex.clear();
}
