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
// PR-3 — recordFailedScheduleTrigger() giờ còn gọi notifyCampaignRunFailed() (loadOwnerContact bên
// trong nó chạy thêm SELECT campaigns THẬT, đi qua queryMock chung ở trên). Mock hẳn module này để
// giữ nguyên phạm vi test gốc: chỉ soi SQL scheduler tự phát ra, không lẫn SQL của luồng báo lỗi.
// campaignRunService (nạp thật qua scheduler.js) cũng import cùng module này nên phải trả đủ 4 export.
const notifyCampaignRunFailedMock = jest.fn().mockResolvedValue({ sent: true });
jest.unstable_mockModule('../campaignQuotaPauseNotify.util.js', () => ({
  QUOTA_DEFER_CLEAR_KEYS: ['quotaDeferredUntil', 'quotaDeferredReason', 'quotaDeferredAt', 'quotaPauseNotifiedAt'],
  notifyCampaignQuotaPaused: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignRunFailed: notifyCampaignRunFailedMock,
}));
// PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 1 — lịch tự tắt gọi thẳng logWorkspace (không
// qua req). Mock để test tự tắt không đụng DB thật qua audit.repository.js, và để có thể assert
// đúng action/entity/details đã gửi.
const logWorkspaceMock = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: { log: jest.fn().mockResolvedValue({}) },
  logWorkspace: logWorkspaceMock,
  logSystem: jest.fn().mockResolvedValue({}),
  AUDIT_ACTIONS: new Proxy({}, { get: (_t, prop) => String(prop) }),
  AUDIT_ENTITY_TYPES: new Proxy({}, { get: (_t, prop) => String(prop) }),
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
    notifyCampaignRunFailedMock.mockClear();
    logWorkspaceMock.mockClear();
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
      .mockResolvedValueOnce({ rows: [] }) // Việc 1 (PR-4): SELECT lượt gần nhất đếm lỗi liên tiếp — 0 lượt, không tự tắt
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
      .mockResolvedValueOnce({ rows: [] }) // Việc 1 (PR-4): SELECT lượt gần nhất đếm lỗi liên tiếp — 0 lượt, không tự tắt
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

// PR-4 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 1 — lịch tự tắt sau N lần lỗi liên tiếp.
describe('triggerCampaignSchedule — Việc 1 (PR-4): lịch tự tắt sau N lần lỗi liên tiếp', () => {
  let errorSpy;
  beforeEach(() => {
    queryMock.mockReset();
    createCampaignRunRecordMock.mockReset();
    executeCampaignMock.mockClear();
    notifyCampaignRunFailedMock.mockClear();
    logWorkspaceMock.mockClear();
    delete process.env.CAMPAIGN_SCHEDULE_MAX_CONSECUTIVE_FAILURES;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    console.warn.mockRestore();
  });

  const failedRow = (message, metadata = {}) => ({ status: 'failed', error_message: message, run_metadata: metadata });
  const disableUpdateCalls = () => queryMock.mock.calls.filter(
    ([sql]) => /UPDATE campaign_schedules/i.test(sql) && /enabled\s*=\s*false/i.test(sql),
  );

  it('3 lượt gần nhất đều failed → tắt lịch, ghi audit, ghi dòng failed có scheduleAutoDisabled, báo chủ, KHÔNG tạo lượt chạy', async () => {
    queryMock
      .mockResolvedValueOnce(NOT_RUNNING)
      .mockResolvedValueOnce({
        rows: [
          failedRow('lỗi 3 (mới nhất)'),
          failedRow('lỗi 2'),
          failedRow('lỗi 1 (cũ nhất)'),
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE campaign_schedules enabled=false
      .mockResolvedValueOnce({ rows: [{ id: 900 }] }); // INSERT campaign_runs

    await trigger(schedule());

    expect(createCampaignRunRecordMock).not.toHaveBeenCalled();
    expect(executeCampaignMock).not.toHaveBeenCalled();

    expect(disableUpdateCalls()).toHaveLength(1);
    expect(disableUpdateCalls()[0][1]).toEqual([177]);

    expect(logWorkspaceMock).toHaveBeenCalledTimes(1);
    const [context, action, entityType, entityId, details] = logWorkspaceMock.mock.calls[0];
    expect(context).toEqual({ userId: null, ownerId: 39 });
    expect(action).toBe('CAMPAIGN_SCHEDULE_TOGGLED');
    expect(entityType).toBe('CAMPAIGN');
    expect(entityId).toBe(395);
    expect(details).toEqual({ scheduleId: 177, enabled: false, automatic: true, reason: 'lỗi 3 (mới nhất)' });

    const inserts = failedRunInserts();
    expect(inserts).toHaveLength(1);
    const [sql, params] = inserts[0];
    expect(sql).toMatch(/'failed'/);
    expect(params[2]).toBe(177);
    expect(params[4]).toBe('Lịch tự tắt sau 3 lần lỗi liên tiếp: lỗi 3 (mới nhất)');
    expect(JSON.parse(params[5])).toMatchObject({ source: 'schedule', scheduleAutoDisabled: true });

    expect(notifyCampaignRunFailedMock).toHaveBeenCalledWith({
      runId: 900,
      campaignId: 395,
      reason: 'Lịch tự tắt sau 3 lần lỗi liên tiếp: lỗi 3 (mới nhất)',
      source: 'schedule_auto_disabled',
    });
  });

  it('2 failed + 1 completed → chưa đủ ngưỡng, vẫn tạo lượt chạy như thường', async () => {
    queryMock
      .mockResolvedValueOnce(NOT_RUNNING)
      .mockResolvedValueOnce({
        rows: [
          failedRow('lỗi mới nhất'),
          { status: 'completed', error_message: null, run_metadata: {} },
          failedRow('lỗi cũ hơn nữa'),
        ],
      })
      .mockResolvedValue({ rows: [] });
    createCampaignRunRecordMock.mockResolvedValue({ id: 500 });

    await trigger(schedule());

    expect(disableUpdateCalls()).toHaveLength(0);
    expect(logWorkspaceMock).not.toHaveBeenCalled();
    expect(createCampaignRunRecordMock).toHaveBeenCalledTimes(1);
    expect(executeCampaignMock).toHaveBeenCalledWith(395, 500, 39);
  });

  it('[mốc tự tắt, failed, failed] → dòng mốc RESET bộ đếm, vẫn tạo lượt chạy (chặn bug bản plan cũ: lịch bật lại xong nổ lần kế tiếp không được tắt ngay)', async () => {
    queryMock
      .mockResolvedValueOnce(NOT_RUNNING)
      .mockResolvedValueOnce({
        rows: [
          failedRow('Lịch tự tắt sau 3 lần lỗi liên tiếp: lỗi cũ', { scheduleAutoDisabled: true }),
          failedRow('lỗi B'),
          failedRow('lỗi A'),
        ],
      })
      .mockResolvedValue({ rows: [] });
    createCampaignRunRecordMock.mockResolvedValue({ id: 501 });

    await trigger(schedule());

    expect(disableUpdateCalls()).toHaveLength(0);
    expect(logWorkspaceMock).not.toHaveBeenCalled();
    expect(createCampaignRunRecordMock).toHaveBeenCalledTimes(1);
    expect(executeCampaignMock).toHaveBeenCalledWith(395, 501, 39);
  });

  it('SELECT lượt gần nhất dùng đúng id_schedule và LIMIT = ngưỡng (mặc định 3)', async () => {
    queryMock.mockResolvedValueOnce(NOT_RUNNING).mockResolvedValue({ rows: [] });
    createCampaignRunRecordMock.mockResolvedValue({ id: 1 });

    await trigger(schedule());

    const recentRunsCall = queryMock.mock.calls.find(([sql]) => /FROM campaign_runs\s+WHERE id_schedule/i.test(sql));
    expect(recentRunsCall).toBeTruthy();
    expect(recentRunsCall[1]).toEqual([177, 3]);
  });

  it('tôn trọng ngưỡng tuỳ chỉnh qua CAMPAIGN_SCHEDULE_MAX_CONSECUTIVE_FAILURES', async () => {
    process.env.CAMPAIGN_SCHEDULE_MAX_CONSECUTIVE_FAILURES = '2';
    queryMock
      .mockResolvedValueOnce(NOT_RUNNING)
      .mockResolvedValueOnce({ rows: [failedRow('lỗi 2'), failedRow('lỗi 1')] })
      .mockResolvedValue({ rows: [] });

    await trigger(schedule());

    expect(disableUpdateCalls()).toHaveLength(1);
    expect(createCampaignRunRecordMock).not.toHaveBeenCalled();
  });
});
