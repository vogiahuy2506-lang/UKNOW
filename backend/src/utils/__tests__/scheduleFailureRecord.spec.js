import { jest } from '@jest/globals';

/**
 * Lệnh giao 21/09/2026, PR-1 Việc 1.2 — lịch nổ mà hỏng phải để lại một lượt chạy `failed`.
 *
 * 21/09 07:30 lịch #177/#178 của chiến dịch 395 (draft) nổ, createCampaignRunRecord ném 400
 * "Chỉ có thể chạy chiến dịch đang hoạt động", scheduler chỉ console.error; log container bị xoá mỗi
 * lần deploy nên không còn dấu vết nào.
 */
const queryMock = jest.fn();
const createCampaignRunRecordMock = jest.fn();
const executeCampaignMock = jest.fn(() => Promise.resolve());

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: queryMock },
  isConnectionError: () => false,
}));
jest.unstable_mockModule('../../controllers/campaign.controller.js', () => ({
  default: { createCampaignRunRecord: createCampaignRunRecordMock, executeCampaign: executeCampaignMock },
}));

const { _triggerCampaignScheduleForTests: trigger } = await import('../scheduler.js');

const NOT_RUNNING = { rows: [] };
const failedRunInserts = () => queryMock.mock.calls.filter(([sql]) => /INSERT INTO campaign_runs/i.test(sql));
const disableCalls = () => queryMock.mock.calls.filter(
  ([sql]) => /UPDATE campaign_schedules/i.test(sql) && /enabled\s*=\s*false/i.test(sql),
);
const runCountCalls = () => queryMock.mock.calls.filter(([sql]) => /run_count/i.test(sql));

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const NOT_ACTIVE = 'Chỉ có thể chạy chiến dịch đang hoạt động';
const schedule = (over = {}) => ({
  id: 177, id_campaign: 395, id_user: 39, workspace_owner_id: 39, created_by: 39,
  schedule_name: 'Nhắc lịch hội thảo', schedule_type: 'weekly', cron_expression: '30 07 * * 1', ...over,
});

describe('triggerCampaignSchedule — lịch nổ mà hỏng phải để lại dấu vết', () => {
  let errorSpy;
  beforeEach(() => {
    queryMock.mockReset();
    createCampaignRunRecordMock.mockReset();
    executeCampaignMock.mockClear();
    queryMock.mockResolvedValue({ rows: [] });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('chiến dịch draft → ghi ĐÚNG MỘT lượt chạy failed: id_schedule, run_type scheduled, error_message nguyên văn', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [{ id: 900 }] });
    createCampaignRunRecordMock.mockRejectedValue(httpError(400, NOT_ACTIVE));

    await trigger(schedule());

    const inserts = failedRunInserts();
    expect(inserts).toHaveLength(1);
    const [sql, params] = inserts[0];
    expect(sql).toMatch(/'scheduled'/);
    expect(sql).toMatch(/'failed'/);
    expect(sql).toMatch(/error_message/);
    expect(sql).toMatch(/started_at, completed_at/);
    // [campaignId, workspaceOwnerId, scheduleId, runName, errorMessage, metadata]
    expect(params[0]).toBe(395);
    expect(params[1]).toBe(39);
    expect(params[2]).toBe(177);
    expect(params[3]).toMatch(/^Nhắc lịch hội thảo - /);
    expect(params[4]).toBe(NOT_ACTIVE);
    expect(JSON.parse(params[5])).toMatchObject({ source: 'schedule', failedAtTrigger: true });
    expect(executeCampaignMock).not.toHaveBeenCalled();
  });

  it('KHÔNG tăng run_count và KHÔNG cập nhật last_run_at (lịch chưa từng gửi được gì)', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [{ id: 900 }] });
    createCampaignRunRecordMock.mockRejectedValue(httpError(400, NOT_ACTIVE));

    await trigger(schedule());

    expect(runCountCalls()).toHaveLength(0);
    expect(queryMock.mock.calls.some(([sql]) => /last_run_at/i.test(sql))).toBe(false);
  });

  it('lịch `once` hỏng → TẮT luôn (không để cron ngày+tháng tự bắn lại năm sau)', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [{ id: 900 }] });
    createCampaignRunRecordMock.mockRejectedValue(httpError(400, NOT_ACTIVE));

    await trigger(schedule({ schedule_type: 'once', cron_expression: '30 07 21 9 *' }));

    expect(failedRunInserts()).toHaveLength(1);
    expect(disableCalls()).toHaveLength(1);
    expect(disableCalls()[0][1]).toEqual([177]);
  });

  it('lịch lặp lại (weekly) hỏng → KHÔNG tắt, tuần sau vẫn thử', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [{ id: 900 }] });
    createCampaignRunRecordMock.mockRejectedValue(httpError(400, NOT_ACTIVE));
    await trigger(schedule({ schedule_type: 'weekly' }));
    expect(failedRunInserts()).toHaveLength(1);
    expect(disableCalls()).toHaveLength(0);
  });

  it('lỗi khác 400 (preflight, 404, lỗi không có statusCode) cũng được ghi lại', async () => {
    for (const error of [httpError(404, 'Không tìm thấy chiến dịch'), httpError(400, 'Node gửi thiếu tài khoản'), new Error('boom')]) {
      queryMock.mockReset();
      queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [{ id: 1 }] });
      createCampaignRunRecordMock.mockRejectedValueOnce(error);
      await trigger(schedule());
      const inserts = failedRunInserts();
      expect(inserts).toHaveLength(1);
      expect(inserts[0][1][4]).toBe(error.message);
    }
  });

  it('409 "đang có lượt chạy" là nhánh bỏ qua đã có → KHÔNG ghi lượt failed', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING);
    createCampaignRunRecordMock.mockRejectedValue(httpError(409, 'Chiến dịch này đã có lượt chạy đang hoạt động'));
    await trigger(schedule());
    expect(failedRunInserts()).toHaveLength(0);
  });

  it('đã tạo được lượt chạy thật rồi mới lỗi ở bước sau → KHÔNG ghi thêm dòng failed (tránh nhân đôi)', async () => {
    createCampaignRunRecordMock.mockResolvedValue({ id: 500 });
    queryMock
      .mockResolvedValueOnce(NOT_RUNNING)
      .mockRejectedValueOnce(new Error('deadlock detected')); // UPDATE run_count
    await trigger(schedule());
    expect(failedRunInserts()).toHaveLength(0);
  });

  it('chạy bình thường → không ghi lượt failed nào', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [] });
    createCampaignRunRecordMock.mockResolvedValue({ id: 500 });
    await trigger(schedule());
    expect(failedRunInserts()).toHaveLength(0);
    expect(executeCampaignMock).toHaveBeenCalledWith(395, 500, 39);
  });

  it('ghi vết lỗi cũng không làm vỡ luồng, và lịch once vẫn được tắt; lỗi gốc vẫn được log', async () => {
    queryMock
      .mockResolvedValueOnce(NOT_RUNNING)
      .mockRejectedValueOnce(new Error('insert failed')) // INSERT campaign_runs
      .mockResolvedValue({ rows: [] });
    createCampaignRunRecordMock.mockRejectedValue(httpError(400, NOT_ACTIVE));

    await expect(trigger(schedule({ schedule_type: 'once' }))).resolves.toBeUndefined();

    expect(disableCalls()).toHaveLength(1);
    const logged = errorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(logged).toContain(NOT_ACTIVE);
    expect(logged).toContain('Không ghi được lượt chạy hỏng');
  });

  it('thiếu id_campaign → không có gì để ghi (đã có nhánh cảnh báo riêng)', async () => {
    await trigger({ id: 5, workspace_owner_id: 1 });
    expect(failedRunInserts()).toHaveLength(0);
  });
});
