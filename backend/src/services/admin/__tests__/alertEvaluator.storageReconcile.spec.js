import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const mockMetric = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricLatestStorageReconcile: mockMetric,
  listRules: jest.fn(),
  lastEventForRule: jest.fn(),
  insertEvent: jest.fn(),
  listAdminAlertEmails: jest.fn(),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');

const clean = {
  found: true, failedRun: false, orphanBrakeTripped: false, orphanCandidates: 0, inspectErrors: 0, result: {},
};

describe('alertEvaluator — storage_reconcile_anomaly', () => {
  const rule = { code: 'storage_reconcile_anomaly', thresholdValue: 1, config: {} };

  beforeEach(() => mockMetric.mockReset());

  it('im lặng khi chưa có lượt chạy nào', async () => {
    mockMetric.mockResolvedValueOnce({ ...clean, found: false });
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('im lặng khi kết quả sạch', async () => {
    mockMetric.mockResolvedValueOnce(clean);
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('bắn khi phanh hàng loạt đã chặn, nêu số ứng viên và gợi ý kiểm IAM', async () => {
    mockMetric.mockResolvedValueOnce({ ...clean, orphanBrakeTripped: true, orphanCandidates: 25 });
    const hit = await evaluateRuleForTests(rule);
    expect(hit).not.toBeNull();
    expect(hit.measuredValue).toBe(25);
    expect(hit.message).toContain('25 tệp có vẻ mất');
    expect(hit.message).toContain('role IAM');
  });

  it('bắn khi có tệp không kiểm được', async () => {
    mockMetric.mockResolvedValueOnce({ ...clean, inspectErrors: 30 });
    const hit = await evaluateRuleForTests(rule);
    expect(hit.measuredValue).toBe(30);
    expect(hit.message).toContain('30 tệp không kiểm được');
  });

  it('bắn khi lượt chạy hỏng hẳn', async () => {
    mockMetric.mockResolvedValueOnce({ ...clean, failedRun: true });
    const hit = await evaluateRuleForTests(rule);
    expect(hit.measuredValue).toBe(1);
    expect(hit.message).toContain('hỏng hẳn');
  });

  it('truyền đúng jobCode / mã luật / cửa sổ giờ vào repo (mặc định và theo config)', async () => {
    mockMetric.mockResolvedValue(clean);
    await evaluateRuleForTests(rule);
    expect(mockMetric).toHaveBeenLastCalledWith('storage_objects_reconcile', 'storage_reconcile_anomaly', 26);
    await evaluateRuleForTests({ ...rule, config: { jobCode: 'x', withinHours: 48 } });
    expect(mockMetric).toHaveBeenLastCalledWith('x', 'storage_reconcile_anomaly', 48);
  });
});
