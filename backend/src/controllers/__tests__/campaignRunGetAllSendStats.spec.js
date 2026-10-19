import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19, PR-2 Việc 2.2 — GET /campaign-runs trả thêm `sendStats`
 * { sent, failed } của từng lượt, đọc từ module đếm tin (sendStats.getRunTotals), cộng mọi kênh của lượt.
 * Bộ đếm campaign_runs có thể thiếu khi lượt nhả slot giữa khối nên màn lịch sử không được tin vào nó.
 */
const mockFindRuns = jest.fn();
const mockGetRunTotals = jest.fn();
const mockServerError = jest.fn((res) => res.status(500).json({ success: false }));

jest.unstable_mockModule('../../helpers.js', () => ({ serverError: mockServerError }));
jest.unstable_mockModule('../../services/customer/customerHelper.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/campaign/campaignRun.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/campaign/campaignRun.repository.js', () => ({
  default: { findRuns: mockFindRuns },
}));
jest.unstable_mockModule('../../services/stats/sendStats.service.js', () => ({
  default: { getRunTotals: mockGetRunTotals },
}));

const { default: campaignRunController } = await import('../campaignRun.controller.js');

function createRes() {
  const res = {};
  res.status = jest.fn().mockImplementation(() => res);
  res.json = jest.fn().mockImplementation((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

const baseRow = (id, extra = {}) => ({
  id,
  id_campaign: 352,
  campaign_name: 'Chiến dịch',
  id_schedule: null,
  schedule_name: null,
  run_type: 'scheduled',
  status: 'running',
  started_at: '2026-10-19T00:00:00.000Z',
  completed_at: null,
  total_recipients: 0,
  successful_sends: 0,
  failed_sends: 0,
  skipped_sends: 0,
  error_message: null,
  run_metadata: {},
  created_at: '2026-10-19T00:00:00.000Z',
  ...extra,
});

describe('campaignRun.controller getAll — sendStats (PR-2 Việc 2.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mỗi lượt có sendStats = tổng getRunTotals; nhiều kênh của cùng lượt được CỘNG; lượt không có dòng tin → 0/0', async () => {
    mockFindRuns.mockResolvedValue([baseRow(476), baseRow(477), baseRow(478)]);
    // Hình thật của getRunTotals: [{ runId, channel, sent, failed }], một dòng cho mỗi (lượt, kênh).
    mockGetRunTotals.mockResolvedValue([
      { runId: 476, channel: 'zalo_personal', sent: 315, failed: 4 },
      { runId: 476, channel: 'email', sent: 10, failed: 1 },
      { runId: 477, channel: 'email', sent: 2, failed: 0 },
    ]);
    const res = createRes();

    await campaignRunController.getAll({ user: { id: 7, role: 'user' }, query: {} }, res);

    expect(mockGetRunTotals).toHaveBeenCalledWith({ ownerId: 7 }, [476, 477, 478]);
    const byId = Object.fromEntries(res.body.data.map((run) => [run.id, run]));
    expect(byId[476].sendStats).toEqual({ sent: 325, failed: 5 });
    expect(byId[477].sendStats).toEqual({ sent: 2, failed: 0 });
    expect(byId[478].sendStats).toEqual({ sent: 0, failed: 0 });
    // Bộ đếm cũ của campaign_runs vẫn được giữ nguyên (frontend lui về khi cần).
    expect(byId[476].successfulSends).toBe(0);
  });

  it('nhân viên (activeContext) → scope theo CHỦ workspace, không phải id nhân viên', async () => {
    mockFindRuns.mockResolvedValue([baseRow(1)]);
    mockGetRunTotals.mockResolvedValue([]);
    const res = createRes();

    await campaignRunController.getAll({
      user: { id: 55, role: 'user', activeContext: { type: 'employee', ownerId: 7, membershipId: 3 } },
      query: {},
    }, res);

    expect(mockGetRunTotals).toHaveBeenCalledWith({ ownerId: 7 }, [1]);
  });

  it('super admin → scope toàn hệ thống (ownerId: null)', async () => {
    mockFindRuns.mockResolvedValue([baseRow(1)]);
    mockGetRunTotals.mockResolvedValue([]);
    const res = createRes();

    await campaignRunController.getAll({ user: { id: 6, role: 'admin' }, query: {} }, res);

    expect(mockGetRunTotals).toHaveBeenCalledWith({ ownerId: null }, [1]);
  });

  it('getRunTotals ném lỗi → lịch sử vẫn trả bình thường, KHÔNG có trường sendStats (frontend lui về bộ đếm cũ)', async () => {
    mockFindRuns.mockResolvedValue([baseRow(1, { successful_sends: 9 })]);
    mockGetRunTotals.mockRejectedValue(new Error('db down'));
    const res = createRes();

    await campaignRunController.getAll({ user: { id: 7, role: 'user' }, query: {} }, res);

    expect(mockServerError).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.data[0]).not.toHaveProperty('sendStats');
    expect(res.body.data[0].successfulSends).toBe(9);
  });
});
