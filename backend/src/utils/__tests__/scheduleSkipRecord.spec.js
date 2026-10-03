import { jest } from '@jest/globals';

/**
 * PLAN_UOC_TINH_THOI_GIAN_CHIEN_DICH 3.4 — lịch nổ khi lượt chạy trước của chính chiến dịch còn `running`
 * không còn bị bỏ qua IM LẶNG: ghi một dòng `campaign_runs` + email chủ đúng một lần; lịch `once` vẫn tắt;
 * lịch lặp vẫn bật; dòng "bỏ qua" bị loại khỏi bộ đếm tự tắt.
 *
 * Bối cảnh production 03/10: lịch #180/#139/#127 nổ khi lượt trước (#425/#337/#269) còn chạy → chỉ console.log.
 */
const queryMock = jest.fn();
const createCampaignRunRecordMock = jest.fn();
const executeCampaignMock = jest.fn(() => Promise.resolve());
const insertFailedScheduledRunMock = jest.fn();
const notifySkippedMock = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: queryMock },
  isConnectionError: () => false,
}));
jest.unstable_mockModule('../../controllers/campaign.controller.js', () => ({
  default: { createCampaignRunRecord: createCampaignRunRecordMock, executeCampaign: executeCampaignMock },
}));
// Ranh giới repository: `insertFailedScheduledRun` trả `{ id }` (campaignRun.repository.js:755).
jest.unstable_mockModule('../../repositories/campaign/campaignRun.repository.js', () => ({
  default: { insertFailedScheduledRun: insertFailedScheduledRunMock },
}));
jest.unstable_mockModule('../campaignScheduleSkipNotify.util.js', () => ({
  notifyCampaignScheduleSkipped: notifySkippedMock,
}));
jest.unstable_mockModule('../campaignQuotaPauseNotify.util.js', () => ({
  QUOTA_DEFER_CLEAR_KEYS: ['quotaDeferredUntil', 'quotaDeferredReason', 'quotaDeferredAt', 'quotaPauseNotifiedAt'],
  notifyCampaignQuotaPaused: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignRunFailed: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignApprovalRequired: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: { log: jest.fn().mockResolvedValue({}) },
  logWorkspace: jest.fn().mockResolvedValue({}),
  logSystem: jest.fn().mockResolvedValue({}),
  AUDIT_ACTIONS: new Proxy({}, { get: (_t, prop) => String(prop) }),
  AUDIT_ENTITY_TYPES: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

const { _triggerCampaignScheduleForTests: trigger } = await import('../scheduler.js');

// Dòng running thật: `SELECT id, started_at` — started_at là Date (pg trả TIMESTAMPTZ). 22:00Z = 05:00 giờ VN 04/10.
const RUNNING = { rows: [{ id: 425, started_at: new Date('2026-10-03T22:00:00Z') }] };
const disableCalls = () => queryMock.mock.calls.filter(
  ([sql]) => /UPDATE campaign_schedules/i.test(sql) && /enabled\s*=\s*false/i.test(sql),
);
const schedule = (over = {}) => ({
  id: 180, id_campaign: 437, id_user: 246, workspace_owner_id: 246, created_by: 246,
  schedule_name: 'Gửi sáng hằng ngày', schedule_type: 'daily', cron_expression: '0 9 * * *', ...over,
});

describe('triggerCampaignSchedule — lịch bị bỏ qua vì lượt trước còn chạy', () => {
  let errorSpy;
  beforeEach(() => {
    queryMock.mockReset();
    insertFailedScheduledRunMock.mockReset();
    notifySkippedMock.mockReset();
    createCampaignRunRecordMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    insertFailedScheduledRunMock.mockResolvedValue({ id: 700 });
    notifySkippedMock.mockResolvedValue({ sent: true });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('lịch lặp: ghi ĐÚNG MỘT dòng "bỏ qua" (message tiếng Việt, metadata) + email chủ ĐÚNG MỘT lần; lịch KHÔNG bị tắt', async () => {
    queryMock.mockResolvedValueOnce(RUNNING);

    await trigger(schedule());

    expect(insertFailedScheduledRunMock).toHaveBeenCalledTimes(1);
    expect(insertFailedScheduledRunMock).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 437,
      workspaceOwnerId: 246,
      scheduleId: 180,
      errorMessage: 'Bỏ qua lượt theo lịch vì lượt chạy trước (#425, bắt đầu 05:00 04/10) chưa xong',
      extraMetadata: { skippedBecauseRunning: true, blockingRunId: 425 },
    }));
    expect(notifySkippedMock).toHaveBeenCalledTimes(1);
    expect(notifySkippedMock).toHaveBeenCalledWith({
      runId: 700, campaignId: 437, ownerId: 246, scheduleName: 'Gửi sáng hằng ngày',
      blockingRunId: 425, blockingStartedAt: '05:00 04/10', scheduleDisabled: false,
    });
    expect(disableCalls()).toHaveLength(0);
    expect(createCampaignRunRecordMock).not.toHaveBeenCalled(); // vẫn KHÔNG chạy chồng, không chạy bù
  });

  it('lịch once: vẫn TẮT (như cũ) VÀ để lại dòng "bỏ qua" + email nói rõ lịch đã tắt', async () => {
    queryMock.mockResolvedValueOnce(RUNNING).mockResolvedValue({ rows: [] });

    await trigger(schedule({ id: 139, schedule_type: 'once' }));

    expect(disableCalls()).toHaveLength(1);
    expect(disableCalls()[0][1]).toEqual([139]);
    expect(insertFailedScheduledRunMock).toHaveBeenCalledTimes(1);
    expect(notifySkippedMock).toHaveBeenCalledWith(expect.objectContaining({ scheduleDisabled: true }));
  });

  it('ghi dòng "bỏ qua" hỏng → nuốt lỗi, không email, scheduler không vỡ', async () => {
    queryMock.mockResolvedValueOnce(RUNNING);
    insertFailedScheduledRunMock.mockRejectedValueOnce(new Error('deadlock detected'));

    await expect(trigger(schedule())).resolves.toBeUndefined();
    expect(notifySkippedMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('không lấy được id dòng vừa ghi → không gửi email', async () => {
    queryMock.mockResolvedValueOnce(RUNNING);
    insertFailedScheduledRunMock.mockResolvedValueOnce(null);

    await trigger(schedule());
    expect(notifySkippedMock).not.toHaveBeenCalled();
  });

  it('email báo chủ ném lỗi → nuốt lỗi (fire-and-forget), scheduler không vỡ', async () => {
    queryMock.mockResolvedValueOnce(RUNNING);
    notifySkippedMock.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(trigger(schedule())).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Không báo được chủ chiến dịch việc bỏ qua schedule #180'), 'SMTP down');
  });

  it('bộ đếm "tự tắt sau N lần hỏng liên tiếp" LOẠI dòng skippedBecauseRunning khỏi truy vấn', async () => {
    // Chiến dịch không còn chạy; truy vấn lượt gần nhất của lịch phải lọc dòng "bỏ qua" — nếu không 3 lần bị bỏ
    // qua liên tiếp (lịch hằng ngày, chiến dịch chạy 3 ngày) sẽ tự tắt lịch.
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] });
    createCampaignRunRecordMock.mockResolvedValue({ id: 800, run_name: 'x' });

    await trigger(schedule());

    const recentRunsCalls = queryMock.mock.calls.filter(
      ([sql]) => /FROM campaign_runs/i.test(sql) && /id_schedule\s*=\s*\$1/i.test(sql) && /ORDER BY started_at DESC/i.test(sql),
    );
    expect(recentRunsCalls).toHaveLength(1);
    expect(recentRunsCalls[0][0]).toMatch(/run_metadata->>'skippedBecauseRunning'/);
    expect(recentRunsCalls[0][0]).toMatch(/<>\s*'true'/);
  });
});
