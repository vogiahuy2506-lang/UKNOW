/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P2 bước 4 — getRunFailures trộn lỗi 3 nguồn: zalo_messages, email_messages và
 * campaign_channel_messages (Telegram/WhatsApp) vào cùng một mảng, mỗi mục có `channel`. Repository giả ĐÚNG
 * hình dạng dòng SQL thật (cột snake_case như SELECT trong repository/service).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSafeQuery = jest.fn();
const mockListRunFailures = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/deliveryMonitor.repository.js', () => ({
  default: { safeQuery: mockSafeQuery },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessageStats.repository.js', () => ({
  default: {
    listRunFailures: mockListRunFailures,
    countByChannelStatus: jest.fn().mockResolvedValue([]),
    hourlySentByChannel: jest.fn().mockResolvedValue([]),
  },
}));

const { getRunFailures } = await import('../userDeliveryMonitor.service.js');

describe('getRunFailures — P2 lỗi kênh adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSafeQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM campaign_runs cr')) return [{ id: 406, run_metadata: {} }];
      if (sql.includes('FROM zalo_messages')) {
        return [{ recipient: '0388180856', error: 'Tham số không hợp lệ', count: 1, last_at: '2026-09-13T15:19:21.000Z', ledger_reason: null, ledger_step: 0 }];
      }
      if (sql.includes('FROM email_messages')) {
        return [{ recipient: 'a@test.com', count: 1, last_at: '2026-09-13T15:20:00.000Z', bounce_type: 'hard', bounce_code: '550', ledger_reason: null, ledger_step: 0 }];
      }
      return [];
    });
  });

  it('trộn 3 nguồn; lỗi WhatsApp/Telegram mang channel + lý do từ sổ người nhận, rơi về error_category', async () => {
    mockListRunFailures.mockResolvedValue([
      { channel: 'whatsapp', recipient: '84900000001', recipient_display: 'Chị Lan', error_category: 'hard', error_message: 'Số không dùng WhatsApp', count: 2, last_at: new Date('2026-09-13T15:30:00.000Z'), ledger_reason: 'hard', ledger_step: 1 },
      { channel: 'telegram', recipient: '4001', recipient_display: '4001', error_category: 'transient', error_message: '[lần 3/3] sendText timeout', count: 1, last_at: new Date('2026-09-13T15:31:00.000Z'), ledger_reason: null, ledger_step: null },
    ]);

    const result = await getRunFailures({ userId: 7, runId: 406 });

    expect(mockListRunFailures).toHaveBeenCalledWith({ runId: 406 });
    const channels = result.failures.map((f) => f.channel).sort();
    expect(channels).toEqual(['email', 'telegram', 'whatsapp', 'zalo']);

    const wa = result.failures.find((f) => f.channel === 'whatsapp');
    expect(wa).toEqual(expect.objectContaining({
      recipient: 'Chị Lan (84900000001)',
      reason: 'hard',
      error: 'Số không dùng WhatsApp',
      count: 2,
      ledgerStep: 1,
    }));
    const tg = result.failures.find((f) => f.channel === 'telegram');
    expect(tg).toEqual(expect.objectContaining({
      recipient: '4001', // display trùng key -> không lặp
      reason: 'transient', // không có ledger_reason -> dùng error_category
      ledgerStep: 0,
    }));
  });

  it('run không có lỗi adapter -> kết quả Zalo/Email nguyên như cũ', async () => {
    mockListRunFailures.mockResolvedValue([]);
    const result = await getRunFailures({ userId: 7, runId: 406 });
    expect(result.failures.map((f) => f.channel).sort()).toEqual(['email', 'zalo']);
  });

  it('sắp theo số lần giảm dần, cắt 200', async () => {
    mockListRunFailures.mockResolvedValue(
      Array.from({ length: 250 }, (_, i) => ({
        channel: 'whatsapp', recipient: `849${i}`, recipient_display: null, error_category: 'hard', error_message: 'x',
        count: i + 1, last_at: new Date(), ledger_reason: null, ledger_step: 0,
      }))
    );
    const result = await getRunFailures({ userId: 7, runId: 406 });
    expect(result.failures).toHaveLength(200);
    expect(result.failures[0].count).toBe(250);
  });

  it('run không thuộc user -> 404, KHÔNG truy vấn lỗi adapter', async () => {
    mockSafeQuery.mockImplementation(async () => []);
    await expect(getRunFailures({ userId: 7, runId: 999 })).rejects.toMatchObject({ status: 404 });
    expect(mockListRunFailures).not.toHaveBeenCalled();
  });
});
