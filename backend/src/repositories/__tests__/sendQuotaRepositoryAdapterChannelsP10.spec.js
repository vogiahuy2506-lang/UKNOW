/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — tầng repository của hệ đặt chỗ nhận kênh Telegram/WhatsApp:
 * (1) regex khoá đặt chỗ chấp nhận đoạn kênh mới (không thì mode enforce ném INVALID_RESERVATION_KEY);
 * (2) món ví hợp lệ gồm telegram_messages/whatsapp_messages; (3) bộ đếm kỳ của kênh adapter — đọc đúng bảng, loại xem thử,
 * cộng ledger; (4) bộ đếm Zalo KHÔNG còn cộng ccm; (5) getWorkspacePlanLimits trả 2 cột hạn mức mới.
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: jest.fn(), getClient: jest.fn() },
}));

const repo = await import('../sendQuota.repository.js');
const {
  buildCampaignReservationKey,
  buildPreviewReservationKey,
  buildDirectReservationKey,
} = await import('../../services/quota/sendQuotaKey.service.js');

describe('validateReservationKey — đoạn kênh mới (P10)', () => {
  it.each(['telegram', 'whatsapp', 'zalo', 'email'])('khoá chiến dịch kênh %s hợp lệ', (channel) => {
    const key = buildCampaignReservationKey({ runId: 12, nodeId: 'n1', channel, recipient: '123456', logicalStep: 1 });
    expect(repo.validateReservationKey(key)).toBe(key);
  });

  it.each(['telegram', 'whatsapp'])('khoá preview/direct kênh %s hợp lệ', (channel) => {
    const preview = buildPreviewReservationKey({ channel, billingUserId: 5, requestKey: 'req-1', recipient: `${channel}:123` });
    const direct = buildDirectReservationKey({ channel, billingUserId: 5, clientKey: 'c-1', recipient: `${channel}:123` });
    expect(repo.validateReservationKey(preview)).toBe(preview);
    expect(repo.validateReservationKey(direct)).toBe(direct);
  });

  it('kênh lạ vẫn bị từ chối', () => {
    const key = buildCampaignReservationKey({ runId: 12, nodeId: 'n1', channel: 'viber', recipient: '123456', logicalStep: 1 });
    expect(() => repo.validateReservationKey(key)).toThrow(expect.objectContaining({ code: 'INVALID_RESERVATION_KEY' }));
  });
});

describe('createReservation — món ví hợp lệ (P10)', () => {
  const base = {
    reservationKey: 'test_res_1',
    requestFingerprint: 'a'.repeat(64),
    billingUserId: 1,
    channel: 'telegram',
    quantity: 3,
    sourceType: 'campaign_zalo',
    vnDayStart: new Date(),
    vnDayEnd: new Date(),
  };

  it('wallet_item_key lạ bị chặn ở lớp ứng dụng; telegram_messages/whatsapp_messages qua được lớp kiểm này', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) };
    await expect(repo.createReservation(client, { ...base, walletQuantity: 1, walletItemKey: 'ai_credits' }))
      .rejects.toMatchObject({ code: 'INVALID_WALLET_ITEM_KEY' });
    await expect(repo.createReservation(client, { ...base, walletQuantity: 1, walletItemKey: 'telegram_messages' }))
      .resolves.toBeTruthy();
    await expect(repo.createReservation(client, { ...base, channel: 'whatsapp', walletQuantity: 2, walletItemKey: 'whatsapp_messages' }))
      .resolves.toBeTruthy();
  });
});

describe('countAdapterSentInCycleWithLedger (P10)', () => {
  it('đếm ccm sent loại xem thử + usage_logs <kênh>_direct_send + ledger đặt chỗ theo đúng kênh và kỳ', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [{ total: 7 }] }) };
    const start = new Date('2025-12-31T17:00:00.000Z');
    const end = new Date('2026-01-31T17:00:00.000Z');
    const total = await repo.countAdapterSentInCycleWithLedger(queryable, 10, 'whatsapp', start, end);
    expect(total).toBe(7);
    const [sql, params] = queryable.query.mock.calls[0];
    expect(params).toEqual([10, start, end, 'whatsapp', 'whatsapp_direct_send']);
    expect(sql).toMatch(/FROM campaign_channel_messages ccm/);
    expect(sql).toMatch(/NOT ccm\.is_preview/);
    expect(sql).toMatch(/ccm\.quota_reservation_id IS NULL/);
    expect(sql).toMatch(/resource_type = \$5/);
    expect(sql).toMatch(/FROM send_quota_reservations[\s\S]*channel = \$4[\s\S]*cycle_start = \$2 AND cycle_end = \$3/);
  });

  it('bộ đếm Zalo (kỳ + ngày + nhân viên) KHÔNG còn chạm campaign_channel_messages', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [{ total: 1 }] }) };
    const d = new Date();
    await repo.countZaloSentInCycleWithLedger(queryable, 10, d, d);
    await repo.countZaloSentTodayWithLedger(queryable, 10, d, d);
    await repo.countEmployeeSentTodayWithLedger(queryable, 10, 20, 'zalo', d, d);
    await repo.countEmployeeSentInCycleWithLedger(queryable, 10, 20, 'zalo', d, d);
    expect(queryable.query).toHaveBeenCalledTimes(4);
    for (const [sql] of queryable.query.mock.calls) {
      expect(sql).not.toMatch(/campaign_channel_messages/);
    }
  });

  it('tổng theo kỳ (messages_per_period) vẫn cộng cả Telegram + WhatsApp như trước P10', async () => {
    const queryable = { query: jest.fn().mockResolvedValue({ rows: [{ total: 2 }] }) };
    const d = new Date();
    const total = await repo.countCombinedSentInCycleWithLedger(queryable, 10, d, d);
    expect(total).toBe(2 * 4); // email + zalo + telegram + whatsapp
    const channels = queryable.query.mock.calls.map((c) => c[1][3]).filter(Boolean);
    expect(channels).toEqual(['telegram', 'whatsapp']);
  });
});

describe('getWorkspacePlanLimits (P10)', () => {
  it('trả monthly_telegram_limit / monthly_whatsapp_limit của gói', async () => {
    const queryable = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          plan_id: 3, plan_name: 'Basic', daily_email_limit: null, monthly_email_limit: 10,
          daily_zalo_limit: null, monthly_zalo_limit: 8000, monthly_telegram_limit: 1234, monthly_whatsapp_limit: null,
          messages_per_period: null, grace_period_days: 0, subscription_expires_at: null, effective_plan_id: 3,
        }],
      }),
    };
    const info = await repo.getWorkspacePlanLimits(queryable, 10);
    expect(info).toMatchObject({ has_plan: true, monthly_telegram_limit: 1234, monthly_whatsapp_limit: null });
    expect(String(queryable.query.mock.calls[0][0])).toMatch(/p\.monthly_telegram_limit,\s*p\.monthly_whatsapp_limit/);
  });
});
