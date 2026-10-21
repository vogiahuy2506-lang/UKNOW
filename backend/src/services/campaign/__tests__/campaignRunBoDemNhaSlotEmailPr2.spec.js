import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19, PR-2 Việc 2.1 — kênh EMAIL: nhả slot vì hạn mức gói
 * giữa danh sách vẫn phải lưu bộ đếm, và người đang xử lý dở (đã cộng total, chưa có dòng sổ cái) KHÔNG
 * được tính vào total đã lưu — lượt resume sẽ cộng họ đúng một lần.
 * Hàng campaign_runs + sổ cái người nhận giả lập bằng bộ nhớ để lượt resume đọc lại đúng thứ đã ghi.
 */
let dbRunRow;
let mockNodeConfig;
let dbLedger;
let ledgerEpoch;

const mockUpdateRunProgress = jest.fn();
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockSendEmailToCustomer = jest.fn();
const mockCheckSendQuota = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn(async () => ({ ...dbRunRow })),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: jest.fn().mockResolvedValue(null),
    mergeRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: mockUpdateRunProgress,
    finalizeRun: mockFinalizeRun,
    failRun: mockFailRun,
    completeRunWithError: jest.fn().mockResolvedValue(null),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: jest.fn().mockResolvedValue({ id: 100, id_user: 10, status: 'active', flow_json: {} }),
    findNodesByCampaignId: jest.fn(async () => [
      { id: 300, node_type: 'action', node_subtype: 'send_email', execution_order: 1, config: mockNodeConfig },
    ]),
    findConnectionsByCampaignId: jest.fn().mockResolvedValue([]),
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {
    flowJsonHasZaloPersonalMultiAccount: jest.fn().mockReturnValue(false),
    buildExecutionOrderMap: jest.fn((nodes) => new Map(nodes.map((node, index) => [String(node.id), index + 1]))),
    buildFlowNodeIdMap: jest.fn().mockReturnValue(new Map()),
    normalizeNodeReferenceConfig: jest.fn((config) => config),
    buildSchemaFromRows: jest.fn().mockReturnValue([]),
    parseEmailList: jest.fn((text) => String(text || '')
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))),
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({
  default: { sendEmailToCustomer: mockSendEmailToCustomer },
}));
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: { logExecutionNode: jest.fn().mockResolvedValue(null) },
}));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: jest.fn(async ({ recipientKey }) => dbLedger.get(recipientKey) || null),
    upsertRecipientProgress: jest.fn(async ({ recipientKey, completedStep, isFullyCompleted, metaPayload }) => {
      ledgerEpoch += 1;
      const row = {
        last_completed_step: completedStep,
        is_fully_completed: isFullyCompleted,
        meta: { ...(dbLedger.get(recipientKey)?.meta || {}), ...(metaPayload || {}) },
        updated_at: '2026-10-19T02:00:00.000Z',
        updated_at_epoch_us: ledgerEpoch,
      };
      dbLedger.set(recipientKey, row);
      return row;
    }),
    countPendingDue: jest.fn().mockResolvedValue({
      pending_count: 0, pending_without_future_due: 0, pending_with_retry_meta: 0, next_due_at: null,
    }),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: {
    findExistingSentCampaignZaloMessageCrossRun: jest.fn().mockResolvedValue(null),
    insertCampaignZaloMessage: jest.fn().mockResolvedValue(1),
  },
}));
jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: {
    findExistingSentCampaignEmailCrossRun: jest.fn().mockResolvedValue(null),
    findExistingSentCampaignEmail: jest.fn().mockResolvedValue(null),
  },
}));
jest.unstable_mockModule('../../../utils/campaignQuotaPauseNotify.util.js', () => ({
  QUOTA_DEFER_CLEAR_KEYS: ['quotaDeferredUntil', 'quotaDeferredReason', 'quotaDeferredAt', 'quotaPauseNotifiedAt'],
  notifyCampaignQuotaPaused: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignRunFailed: jest.fn().mockResolvedValue({ sent: true }),
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-10-19T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-10-31T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

async function runPumpingTimers(...args) {
  const running = campaignRunService.executeCampaign(...args);
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await jest.advanceTimersByTimeAsync(5000);
  }
  return running;
}

/** Lần gửi thứ `failOnCall` báo hết hạn mức gói tháng (có mốc reset → nhả slot), các lần trước thành công. */
function emailQuotaExceededOnCall(failOnCall) {
  let calls = 0;
  mockSendEmailToCustomer.mockImplementation(async () => {
    calls += 1;
    if (calls === failOnCall) {
      return {
        status: 'failed',
        errorType: 'plan_send_limit_exceeded',
        limitType: 'monthly',
        resetAt: new Date('2026-10-31T17:00:00.000Z').toISOString(),
        error: 'Hết hạn mức gói tháng này',
      };
    }
    return { status: 'success' };
  });
}

describe('CampaignRun email — bộ đếm khi nhả slot vì hạn mức gói giữa danh sách (PR-2 Việc 2.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-19T02:00:00.000Z'));
    dbRunRow = {
      id: 200,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      skipped_sends: 0,
      run_metadata: { source: 'campaign_run' },
    };
    dbLedger = new Map();
    ledgerEpoch = 0;
    mockNodeConfig = {
      recipientSource: 'manual',
      recipientEmails: 'a@example.com, b@example.com, c@example.com, d@example.com, e@example.com',
      fromEmailId: 10,
      emailTemplateId: 1,
    };
    mockUpdateRunProgress.mockImplementation(async (_runId, counters) => {
      dbRunRow = {
        ...dbRunRow,
        total_recipients: counters.totalRecipients,
        successful_sends: counters.successfulSends,
        failed_sends: counters.failedSends,
        skipped_sends: counters.skippedSends,
      };
    });
    mockSendEmailToCustomer.mockResolvedValue({ status: 'success' });
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('email: gửi 3 người rồi lần gửi thứ 4 báo hết hạn mức gói → lưu total=3, ok=3 (người thứ 4 chưa tính); resume gửi nốt 2 → tổng cuối 5', async () => {
    emailQuotaExceededOnCall(4);
    await runPumpingTimers(100, 200, 10);

    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(4);
    expect(mockFinalizeRun).not.toHaveBeenCalled();
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(dbRunRow.total_recipients).toBe(3);
    expect(dbRunRow.successful_sends).toBe(3);

    // Lượt resume: hạn mức đã mở lại.
    mockSendEmailToCustomer.mockReset();
    mockSendEmailToCustomer.mockResolvedValue({ status: 'success' });
    await runPumpingTimers(100, 200, 10, null, { resumedBy: 'scheduler' });

    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(2);
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ totalRecipients: 5, successfulSends: 5, failedSends: 0 }),
      null,
    );
  }, 30000);

  it('email 2 bước: nhả slot ở người thứ 4 của bước 1 → lưu total = 3 người × 2 bước = 6, ok = 3; resume xong → total 10, ok 10', async () => {
    mockNodeConfig = {
      ...mockNodeConfig,
      emailTemplateId: undefined,
      emailSteps: [{ stepIndex: 1, templateId: 1 }, { stepIndex: 2, templateId: 2 }],
    };
    emailQuotaExceededOnCall(4);
    await runPumpingTimers(100, 200, 10);

    expect(dbRunRow.total_recipients).toBe(6);
    expect(dbRunRow.successful_sends).toBe(3);

    mockSendEmailToCustomer.mockReset();
    mockSendEmailToCustomer.mockResolvedValue({ status: 'success' });
    await runPumpingTimers(100, 200, 10, null, { resumedBy: 'scheduler' });

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ totalRecipients: 10, successfulSends: 10, failedSends: 0 }),
      null,
    );
  }, 30000);
});
