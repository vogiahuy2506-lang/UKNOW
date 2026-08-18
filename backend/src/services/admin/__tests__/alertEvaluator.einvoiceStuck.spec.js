import { describe, expect, it, jest } from '@jest/globals';

const mockMetricStuckEinvoices = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricStuckEinvoices: mockMetricStuckEinvoices,
  metricLatestEinvoiceSeries: jest.fn(),
  metricCampaignFailRate: jest.fn(),
  metricZaloInboundCount: jest.fn(),
  metricConsecutiveCronNoops: jest.fn(),
  metricLatestCronRescued: jest.fn(),
  metricAiTokenSpike: jest.fn(),
  metricZaloDisconnected: jest.fn(),
  metricStalePendingOrders: jest.fn(),
  metricLoginFailFlood: jest.fn(),
  listRules: jest.fn(),
  listEvents: jest.fn(),
  lastEventForRule: jest.fn(),
  insertEvent: jest.fn(),
  updateRule: jest.fn(),
  resolveEvent: jest.fn(),
  listAdminAlertEmails: jest.fn(),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');

describe('alertEvaluator — quy tắc einvoice_stuck', () => {
  const rule = {
    code: 'einvoice_stuck',
    thresholdValue: 1,
    config: { staleHours: 6 },
  };

  it('im lặng khi không có hoá đơn nào kẹt', async () => {
    mockMetricStuckEinvoices.mockResolvedValueOnce({
      deadCount: 0,
      stalledCount: 0,
      total: 0,
      samples: [],
    });

    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('bắn khi có hoá đơn hỏng hẳn, kèm mã đơn để tra', async () => {
    mockMetricStuckEinvoices.mockResolvedValueOnce({
      deadCount: 2,
      stalledCount: 0,
      total: 2,
      samples: [
        { orderCode: '1787014052983', status: 'failed', errorCode: '327', kind: 'dead' },
        { orderCode: '1787014052984', status: 'cqt_rejected', errorCode: null, kind: 'dead' },
      ],
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.measuredValue).toBe(2);
    expect(res.message).toContain('2 hoá đơn hỏng hẳn');
    expect(res.message).toContain('#1787014052983');
    expect(res.message).toContain('khách đã trả tiền nhưng chưa có hoá đơn');
    // Không có dòng "đọng" thì đừng nhắc tới nó
    expect(res.message).not.toContain('đọng');
  });

  it('bắn khi chỉ có hoá đơn đọng quá lâu', async () => {
    mockMetricStuckEinvoices.mockResolvedValueOnce({
      deadCount: 0,
      stalledCount: 3,
      total: 3,
      samples: [{ orderCode: '1787014052985', status: 'pending', errorCode: null, kind: 'stalled' }],
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.message).toContain('3 hoá đơn đọng > 6 giờ');
    expect(res.message).not.toContain('hỏng hẳn');
  });

  it('gộp cả hai nhóm vào một thông báo', async () => {
    mockMetricStuckEinvoices.mockResolvedValueOnce({
      deadCount: 1,
      stalledCount: 2,
      total: 3,
      samples: [],
    });

    const res = await evaluateRuleForTests(rule);
    expect(res.measuredValue).toBe(3);
    expect(res.message).toContain('1 hoá đơn hỏng hẳn');
    expect(res.message).toContain('2 hoá đơn đọng');
  });

  it('dùng staleHours mặc định 6 giờ khi config bỏ trống', async () => {
    mockMetricStuckEinvoices.mockResolvedValueOnce({
      deadCount: 0, stalledCount: 1, total: 1, samples: [],
    });

    await evaluateRuleForTests({ code: 'einvoice_stuck', thresholdValue: 1, config: {} });
    expect(mockMetricStuckEinvoices).toHaveBeenLastCalledWith(6);
  });

  it('tôn trọng ngưỡng lớn hơn 1 khi admin chỉnh lại', async () => {
    mockMetricStuckEinvoices.mockResolvedValueOnce({
      deadCount: 1, stalledCount: 1, total: 2, samples: [],
    });

    const res = await evaluateRuleForTests({ ...rule, thresholdValue: 5 });
    expect(res).toBeNull();
  });
});
