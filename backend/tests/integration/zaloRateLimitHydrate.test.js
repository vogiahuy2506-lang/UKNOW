import { describe, it, expect, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import db from '../../src/config/database.js';
import * as dbHelpers from './helpers/db.js';
import campaignRunService from '../../src/services/campaign/campaignRun.service.js';

/**
 * PR-S2 — bộ đếm giới hạn gửi Zalo nạp lại từ `zalo_messages` lúc khởi động (DB thật).
 * Map `zaloOutboundRateLimitState` mất trắng mỗi lần deploy; hydrate phải đưa lại attemptCount +
 * lastAttemptAtMs trong cửa sổ giờ, để cổng gửi nhanh/chiến dịch thấy nhịp gửi trước deploy.
 */
describe('hydrateOutboundRateLimitState — DB thật', () => {
  const ACCOUNT_A = 910001;
  const ACCOUNT_B = 910002;
  const MIN = 60 * 1000;
  let seq = 0;
  let limiter;
  let quietSpy;

  async function insertMsg({ accountId, channel = 'zalo_personal', status = 'sent', agoMs }) {
    seq += 1;
    await db.query(
      `INSERT INTO zalo_messages (channel, account_id, status, tracking_token, sent_at)
       VALUES ($1, $2, $3, $4, LOCALTIMESTAMP - ($5::bigint * INTERVAL '1 millisecond'))`,
      [channel, accountId, status, `hyd_${Date.now()}_${seq}`, agoMs]
    );
  }

  beforeEach(async () => {
    await dbHelpers.truncateAll();
    limiter = campaignRunService.zaloRateLimiter;
    limiter.zaloOutboundRateLimitState.clear();
    // Tránh quiet hours (23:00–06:00 VN) làm ca đỏ giả khi chạy ban đêm.
    quietSpy = jest.spyOn(limiter, 'computeNextAllowedSendAtByQuietHours').mockReturnValue(null);
  });

  afterEach(() => {
    quietSpy.mockRestore();
    limiter.zaloOutboundRateLimitState.clear();
  });

  afterAll(async () => {
    await db.pool.end();
  });

  it('3 tin trong 10 phút qua + 1 tin 2 giờ trước → attemptCount 3, lastAttempt đúng mốc; tryAcquire ngay sau → inter_message_delay', async () => {
    await insertMsg({ accountId: ACCOUNT_A, agoMs: 10 * MIN, status: 'sent' });
    await insertMsg({ accountId: ACCOUNT_A, agoMs: 5 * MIN, status: 'failed' });
    await insertMsg({ accountId: ACCOUNT_A, agoMs: 1000, status: 'aborted' });
    await insertMsg({ accountId: ACCOUNT_A, agoMs: 120 * MIN, status: 'sent' });
    const { rows } = await db.query(
      `SELECT (EXTRACT(EPOCH FROM (MAX(sent_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')) * 1000)::bigint AS last_ms
         FROM zalo_messages WHERE account_id = $1 AND sent_at > LOCALTIMESTAMP - INTERVAL '1 hour'`,
      [ACCOUNT_A]
    );
    const expectedLastMs = Number(rows[0].last_ms);

    const loaded = await campaignRunService.hydrateOutboundRateLimitState();

    expect(loaded).toBe(1);
    const status = limiter.getOutboundQuotaStatus(ACCOUNT_A, 'zalo_personal');
    expect(status.attemptCount).toBe(3);
    expect(Math.abs(status.lastAttemptAtMs - expectedLastMs)).toBeLessThanOrEqual(1);

    const gate = limiter.tryAcquireOutboundSlot({ accountId: ACCOUNT_A, channel: 'zalo_personal' });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('inter_message_delay');
  });

  it('tài khoản không có tin trong cửa sổ (chỉ tin cũ) hoặc không có tin → không tạo trạng thái', async () => {
    await insertMsg({ accountId: ACCOUNT_B, agoMs: 3 * 60 * MIN });

    const loaded = await campaignRunService.hydrateOutboundRateLimitState();

    expect(loaded).toBe(0);
    expect(limiter.zaloOutboundRateLimitState.size).toBe(0);
    expect(limiter.getOutboundQuotaStatus(ACCOUNT_B, 'zalo_personal').attemptCount).toBe(0);
    expect(limiter.getOutboundQuotaStatus(ACCOUNT_A, 'zalo_personal').attemptCount).toBe(0);
  });

  it('khoá theo (tài khoản, kênh): tin nhóm/kết bạn không làm tăng bộ đếm cá nhân', async () => {
    await insertMsg({ accountId: ACCOUNT_A, channel: 'zalo_group', agoMs: 2 * MIN });
    await insertMsg({ accountId: ACCOUNT_A, channel: 'zalo_friend_request', agoMs: 3 * MIN });

    await campaignRunService.hydrateOutboundRateLimitState();

    expect(limiter.getOutboundQuotaStatus(ACCOUNT_A, 'zalo_group').attemptCount).toBe(1);
    expect(limiter.getOutboundQuotaStatus(ACCOUNT_A, 'zalo_friend_request').attemptCount).toBe(1);
    expect(limiter.getOutboundQuotaStatus(ACCOUNT_A, 'zalo_personal').attemptCount).toBe(0);
  });
});
