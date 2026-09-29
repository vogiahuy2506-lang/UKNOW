import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * P3 bước 3 — luật cảnh báo admin telegram_disconnected / whatsapp_disconnected.
 * Cận trên 7 ngày mặc định: tài khoản bỏ dùng từ lâu không được bắn mãi (cùng bài học zalo_disconnected).
 */
const mockMetrics = {
  metricChannelDisconnected: jest.fn(),
};

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  ...mockMetrics,
  listRules: jest.fn(async () => []),
  lastEventForRule: jest.fn(async () => null),
  insertEvent: jest.fn(async () => ({ id: 1 })),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');

describe('alertEvaluator — telegram/whatsapp disconnected', () => {
  beforeEach(() => {
    mockMetrics.metricChannelDisconnected.mockReset().mockResolvedValue(0);
  });

  it('telegram_disconnected: đúng kênh, cửa sổ 30 phút, mặc định giới hạn 7 ngày', async () => {
    await evaluateRuleForTests({ code: 'telegram_disconnected', windowMinutes: 30, config: {} });
    expect(mockMetrics.metricChannelDisconnected).toHaveBeenCalledWith('telegram', 30, 7 * 24 * 60);
  });

  it('whatsapp_disconnected: đúng kênh, mặc định giới hạn 7 ngày', async () => {
    await evaluateRuleForTests({ code: 'whatsapp_disconnected', windowMinutes: 30, config: {} });
    expect(mockMetrics.metricChannelDisconnected).toHaveBeenCalledWith('whatsapp', 30, 7 * 24 * 60);
  });

  it('đọc maxAgeMinutes từ config', async () => {
    await evaluateRuleForTests({ code: 'telegram_disconnected', windowMinutes: 30, config: { maxAgeMinutes: 120 } });
    expect(mockMetrics.metricChannelDisconnected).toHaveBeenCalledWith('telegram', 30, 120);
  });

  it('có tài khoản mất kết nối thì bắn, không có thì im', async () => {
    mockMetrics.metricChannelDisconnected.mockResolvedValueOnce(2);
    const fired = await evaluateRuleForTests({ code: 'whatsapp_disconnected', windowMinutes: 30, config: {} });
    expect(fired).toMatchObject({ measuredValue: 2 });
    expect(fired.message).toContain('WhatsApp');
    const none = await evaluateRuleForTests({ code: 'whatsapp_disconnected', windowMinutes: 30, config: {} });
    expect(none).toBeNull();
  });
});
