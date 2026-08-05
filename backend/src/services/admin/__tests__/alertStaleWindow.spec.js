import { jest } from '@jest/globals';

/**
 * Cảnh báo phải báo "vừa có thứ hỏng", không phải "vẫn còn thứ chưa ai sửa".
 *
 * Bối cảnh 2026-08-05: 26 đơn pending và 12 tài khoản Zalo mất kết nối đều là
 * cặn từ nhiều tháng trước. Hai quy tắc chỉ có cận dưới ("quá 2 giờ", "quá 30
 * phút") nên khớp vĩnh viễn → bắn mỗi lần đánh giá → người dùng tắt hết cảnh báo.
 * Bộ test này khoá lại cận trên.
 */
const mockMetrics = {
  metricZaloDisconnected: jest.fn(),
  metricStalePendingOrders: jest.fn(),
};

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  ...mockMetrics,
  listRules: jest.fn(async () => []),
  lastEventForRule: jest.fn(async () => null),
  insertEvent: jest.fn(async () => ({ id: 1 })),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');

describe('cận trên tuổi sự cố', () => {
  beforeEach(() => {
    mockMetrics.metricZaloDisconnected.mockReset().mockResolvedValue(0);
    mockMetrics.metricStalePendingOrders.mockReset().mockResolvedValue(0);
  });

  it('order_pending_stale mặc định giới hạn 48 giờ', async () => {
    await evaluateRuleForTests({
      code: 'order_pending_stale',
      thresholdValue: 2,
      config: {},
    });
    expect(mockMetrics.metricStalePendingOrders).toHaveBeenCalledWith(2, 48);
  });

  it('order_pending_stale đọc maxAgeHours từ config', async () => {
    await evaluateRuleForTests({
      code: 'order_pending_stale',
      thresholdValue: 2,
      config: { maxAgeHours: 6 },
    });
    expect(mockMetrics.metricStalePendingOrders).toHaveBeenCalledWith(2, 6);
  });

  it('zalo_disconnected mặc định giới hạn 7 ngày', async () => {
    await evaluateRuleForTests({
      code: 'zalo_disconnected',
      windowMinutes: 30,
      config: {},
    });
    expect(mockMetrics.metricZaloDisconnected).toHaveBeenCalledWith(30, 7 * 24 * 60);
  });

  it('zalo_disconnected đọc maxAgeMinutes từ config', async () => {
    await evaluateRuleForTests({
      code: 'zalo_disconnected',
      windowMinutes: 30,
      config: { maxAgeMinutes: 120 },
    });
    expect(mockMetrics.metricZaloDisconnected).toHaveBeenCalledWith(30, 120);
  });

  it('không có gì trong cửa sổ → không bắn', async () => {
    mockMetrics.metricStalePendingOrders.mockResolvedValue(0);
    const hit = await evaluateRuleForTests({
      code: 'order_pending_stale',
      thresholdValue: 2,
      config: {},
    });
    expect(hit).toBeNull();
  });

  it('có đơn vừa treo trong cửa sổ → bắn, kèm cửa sổ trong thông điệp', async () => {
    mockMetrics.metricStalePendingOrders.mockResolvedValue(3);
    const hit = await evaluateRuleForTests({
      code: 'order_pending_stale',
      thresholdValue: 2,
      config: { maxAgeHours: 48 },
    });
    expect(hit.measuredValue).toBe(3);
    expect(hit.message).toContain('48 giờ qua');
  });
});
