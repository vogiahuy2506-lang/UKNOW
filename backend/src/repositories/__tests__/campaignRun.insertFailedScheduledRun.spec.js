import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
  isConnectionError: () => false,
}));

const { default: repo } = await import('../campaign/campaignRun.repository.js');
const { default: scheduleRepo } = await import('../campaign/campaignSchedule.repository.js');

describe('campaignRunRepository.insertFailedScheduledRun', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [{ id: 901 }] });
  });

  it('INSERT đúng cột theo lệnh giao: scheduled + failed + started_at/completed_at = CURRENT_TIMESTAMP', async () => {
    const row = await repo.insertFailedScheduledRun({
      campaignId: 395, workspaceOwnerId: 39, scheduleId: 177, runName: 'Nhắc lịch - 21/9', errorMessage: 'Chỉ có thể chạy chiến dịch đang hoạt động',
    });
    expect(row).toEqual({ id: 901 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO campaign_runs/);
    expect(sql).toMatch(/id_campaign, workspace_owner_id, id_schedule, run_name, run_type, status/);
    expect(sql).toMatch(/'scheduled', 'failed'/);
    expect(sql).toMatch(/CURRENT_TIMESTAMP,\s*CURRENT_TIMESTAMP/);
    expect(sql).not.toMatch(/run_count/); // không đụng bộ đếm của lịch
    expect(params.slice(0, 5)).toEqual([395, 39, 177, 'Nhắc lịch - 21/9', 'Chỉ có thể chạy chiến dịch đang hoạt động']);
  });

  it('cắt error_message ở 1000 ký tự và run_name ở 255; thiếu lời lỗi thì có câu mặc định', async () => {
    await repo.insertFailedScheduledRun({ campaignId: 1, scheduleId: 2, runName: 'n'.repeat(400), errorMessage: 'x'.repeat(5000) });
    const params = mockQuery.mock.calls[0][1];
    expect(params[3]).toHaveLength(255);
    expect(params[4]).toHaveLength(1000);
    await repo.insertFailedScheduledRun({ campaignId: 1, scheduleId: 2 });
    expect(mockQuery.mock.calls[1][1][4]).toBe('Lượt chạy theo lịch không khởi động được');
    expect(mockQuery.mock.calls[1][1][1]).toBeNull();
    expect(mockQuery.mock.calls[1][1][3]).toBeNull();
  });
});

describe('campaignScheduleRepository — trả thêm trạng thái chiến dịch', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('findCampaignForSchedule SELECT status', async () => {
    await scheduleRepo.findCampaignForSchedule({ campaignId: 1, userId: 2, isAdmin: false });
    expect(mockQuery.mock.calls[0][0]).toMatch(/SELECT id, status, COALESCE\(workspace_owner_id, id_user\)/);
  });

  it('findMutableById SELECT c.status AS campaign_status', async () => {
    await scheduleRepo.findMutableById({ id: 1, userId: 2, isAdmin: false });
    expect(mockQuery.mock.calls[0][0]).toMatch(/c\.status AS campaign_status/);
  });
});
