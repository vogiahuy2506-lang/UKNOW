import { jest } from '@jest/globals';

/**
 * Lịch "chạy 1 lần" bị bỏ qua (vì campaign đang chạy) phải được TẮT luôn.
 *
 * Bối cảnh 2026-08-05: #33 và #31 trỏ cùng campaign 37 với cron giống hệt
 * "30 19 9 4 *" (lịch bị tạo trùng). #31 chạy trước và tạo lượt chạy `running`;
 * #33 bắn sau, thấy có run đang chạy nên `return` — giữ nguyên enabled=true,
 * run_count=0. Vì cron của `once` mã hoá ngày+tháng, #33 sẽ TỰ BẮN LẠI vào
 * 9/4/2027 và gửi lại một chiến dịch từ năm trước.
 */

const queryMock = jest.fn();
const createCampaignRunRecordMock = jest.fn();
const executeCampaignMock = jest.fn(() => Promise.resolve());

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: queryMock },
  isConnectionError: () => false,
}));

jest.unstable_mockModule('../../controllers/campaign.controller.js', () => ({
  default: {
    createCampaignRunRecord: createCampaignRunRecordMock,
    executeCampaign: executeCampaignMock,
  },
}));

const { _triggerCampaignScheduleForTests: trigger } = await import('../scheduler.js');

/** Câu UPDATE tắt lịch — nhận diện qua tên bảng + cột enabled. */
function disableCalls() {
  return queryMock.mock.calls.filter(
    ([sql]) => /UPDATE campaign_schedules/i.test(sql) && /enabled\s*=\s*false/i.test(sql)
  );
}

const RUNNING = { rows: [{ id: 999 }] };
const NOT_RUNNING = { rows: [] };

describe('triggerCampaignSchedule — bỏ qua vì campaign đang chạy', () => {
  beforeEach(() => {
    queryMock.mockReset();
    createCampaignRunRecordMock.mockReset();
    executeCampaignMock.mockClear();
  });

  it('lịch once bị bỏ qua → TẮT luôn, không để bắn lại năm sau', async () => {
    queryMock.mockResolvedValueOnce(RUNNING).mockResolvedValue({ rows: [] });

    await trigger({ id: 33, id_campaign: 37, id_user: 1, schedule_type: 'once' });

    const calls = disableCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual([33]);
    // Không tạo lượt chạy mới — lượt đang chạy đã làm đúng việc của lịch này
    expect(createCampaignRunRecordMock).not.toHaveBeenCalled();
  });

  it('lịch lặp lại (weekly) bị bỏ qua → KHÔNG tắt, tuần sau vẫn chạy', async () => {
    queryMock.mockResolvedValueOnce(RUNNING).mockResolvedValue({ rows: [] });

    await trigger({ id: 21, id_campaign: 37, id_user: 1, schedule_type: 'weekly' });

    expect(disableCalls()).toHaveLength(0);
    expect(createCampaignRunRecordMock).not.toHaveBeenCalled();
  });

  it('campaign không chạy → không tắt gì, tạo lượt chạy bình thường', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [] });
    createCampaignRunRecordMock.mockResolvedValue({ id: 500, run_name: 'x' });

    await trigger({
      id: 119,
      id_campaign: 42,
      id_user: 1,
      workspace_owner_id: 9,
      created_by: 10,
      schedule_type: 'once',
    });

    expect(createCampaignRunRecordMock).toHaveBeenCalledTimes(1);
    expect(createCampaignRunRecordMock).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 42,
      workspaceOwnerId: 9,
      actorUserId: 10,
      source: 'schedule',
    }));
    expect(executeCampaignMock).toHaveBeenCalledWith(42, 500, 9);
    // Vẫn có UPDATE tắt lịch, nhưng đó là đường chạy-xong-thì-tắt của `once`,
    // không phải đường bỏ-qua — phân biệt bằng việc đã tạo lượt chạy.
  });

  it('lỗi khi tắt lịch không làm vỡ luồng', async () => {
    queryMock
      .mockResolvedValueOnce(RUNNING)
      .mockRejectedValueOnce(new Error('deadlock detected'));

    await expect(
      trigger({ id: 33, id_campaign: 37, id_user: 1, schedule_type: 'once' })
    ).resolves.toBeUndefined();
  });
});
