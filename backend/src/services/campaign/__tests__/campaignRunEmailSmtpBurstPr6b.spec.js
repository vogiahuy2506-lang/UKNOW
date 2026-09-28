import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26, PR-6b — cầu dao SMTP: N (EMAIL_TRANSIENT_BURST_THRESHOLD,
// mặc định 10) kết quả smtp_transient_retry_scheduled LIÊN TIẾP trong MỘT lần chạy node email (reset
// khi có kết quả khác) -> persistRunDeferYieldSlot (channelDeferredUntil/Reason/Channel — khoá CHUNG
// của PR-5 tách tầng kênh, KHÔNG phải khoá mới) thay vì gõ cửa hết cả danh sách khi SMTP đang sập.
// Khuôn mock lấy nguyên từ campaignRunEmailTransientRetry.spec.js (PR-6).

const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockGetRunForExecution = jest.fn();
const mockGetRunStatus = jest.fn().mockResolvedValue('running');
const mockFindNodesByCampaignId = jest.fn();
const mockSendEmailToCustomer = jest.fn();
const mockGetRecipientProgress = jest.fn();
const mockUpsertRecipientProgress = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockCountPendingDue = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: mockGetRunForExecution,
    getRunStatus: mockGetRunStatus,
    patchRunMetadata: mockPatchRunMetadata,
    mergeRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: mockFinalizeRun,
    failRun: jest.fn().mockResolvedValue(null),
    completeRunWithError: jest.fn().mockResolvedValue(null),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: jest.fn().mockResolvedValue({
      id: 100,
      id_user: 10,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: mockFindNodesByCampaignId,
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
  default: {
    sendEmailToCustomer: mockSendEmailToCustomer,
  },
}));

jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: {
    logExecutionNode: mockLogExecutionNode,
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: mockGetRecipientProgress,
    upsertRecipientProgress: mockUpsertRecipientProgress,
    countPendingDue: mockCountPendingDue,
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: { findExistingSentCampaignZaloMessageCrossRun: jest.fn().mockResolvedValue(null), insertCampaignZaloMessage: jest.fn().mockResolvedValue(1) },
}));

jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: {
    findExistingSentCampaignEmailCrossRun: jest.fn().mockResolvedValue(null),
    findExistingSentCampaignEmail: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

function buildRunRow({ runId = 200, totalRecipients = 0, successfulSends = 0, failedSends = 0, skippedSends = 0 } = {}) {
  return {
    id: runId,
    status: 'running',
    total_recipients: totalRecipients,
    successful_sends: successfulSends,
    failed_sends: failedSends,
    skipped_sends: skippedSends,
    run_metadata: { source: 'campaign_run' },
  };
}

function buildEmailNode(recipientEmails) {
  return {
    id: 300,
    node_type: 'action',
    node_subtype: 'send_email',
    execution_order: 1,
    config: {
      recipientSource: 'manual',
      recipientEmails: recipientEmails.join(', '),
      fromEmailId: 10,
      emailTemplateId: 1,
    },
  };
}

const transientResult = (n) => ({
  status: 'failed',
  errorType: 'smtp_transient_retry_scheduled',
  error: `Máy chủ email tạm thời không nhận kết nối; sẽ thử lại sau 15 phút (lần 1/5).`,
  retryScheduledAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  retryAttemptCount: 1,
  providerResponse: 'Invalid greeting. response=421 too many connections',
  providerResponseCode: 421,
  settingId: 10,
  seq: n,
});

function wireLedgerMocks() {
  const ledger = new Map();
  mockGetRecipientProgress.mockImplementation(({ recipientKey }) => (
    Promise.resolve(ledger.get(recipientKey) || null)
  ));
  mockUpsertRecipientProgress.mockImplementation(async (input) => {
    const prev = ledger.get(input.recipientKey);
    if (prev?.is_fully_completed) return prev;
    const row = {
      last_completed_step: input.completedStep,
      is_fully_completed: input.isFullyCompleted,
      meta: { ...(prev?.meta || {}), ...input.metaPayload },
      updated_at: new Date().toISOString(),
      updated_at_epoch_us: String(Date.now() * 1000),
    };
    ledger.set(input.recipientKey, row);
    return row;
  });
  return ledger;
}

describe('PR-6b engine — cầu dao SMTP: nhiều lỗi transient TRƯỚC DATA liên tiếp thì nhả slot 15 phút', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRunStatus.mockResolvedValue('running');
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockCountPendingDue.mockResolvedValue({
      pending_count: 0,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: null,
    });
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('(a) one-shot 30 người, sendMail luôn transient -> đúng 10 lần sendMail rồi RUN_YIELD_SLOT (ngưỡng mặc định)', async () => {
    const emails = Array.from({ length: 30 }, (_, i) => `p${i + 1}@example.com`);
    mockGetRunForExecution.mockResolvedValue(buildRunRow({}));
    mockFindNodesByCampaignId.mockResolvedValue([buildEmailNode(emails)]);
    wireLedgerMocks();

    let calls = 0;
    mockSendEmailToCustomer.mockImplementation(() => {
      calls += 1;
      return Promise.resolve(transientResult(calls));
    });

    const beforeMs = Date.now();
    await campaignRunService.executeCampaign(100, 200, 10);

    // Đúng ngưỡng mặc định (10) — không hơn không kém: mọi lần trước đó phải được xem là transient
    // (nếu có 1 lần bị đếm sai kiểu khác thì bộ đếm reset, phải hơn 10 lần mới chạm ngưỡng).
    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(10);

    // RUN_YIELD_SLOT bị nuốt ở catch top-level (return, KHÔNG failRun) — finalizeRun cho node email
    // không bao giờ chạy tới vì throw xảy ra giữa vòng lặp for tuần tự.
    expect(mockFinalizeRun).not.toHaveBeenCalled();

    const deferCall = mockPatchRunMetadata.mock.calls.find(
      ([, patch]) => patch?.channelDeferredReason === 'smtp_transient_burst'
    );
    expect(deferCall).toBeTruthy();
    const [, patch] = deferCall;
    expect(patch.channelDeferredChannel).toBe('email');
    const untilMs = Date.parse(patch.channelDeferredUntil);
    const expectedMs = beforeMs + 15 * 60 * 1000;
    expect(Math.abs(untilMs - expectedMs)).toBeLessThanOrEqual(60000);

    // failedSends KHÔNG tăng cho các lần transient — không có dòng log 'failed' nào được ghi (chỉ
    // 'warning' cho từng người transient + 1 'warning' cầu dao).
    const failedLogs = mockLogExecutionNode.mock.calls.filter(([arg]) => arg?.status === 'failed');
    expect(failedLogs).toHaveLength(0);
    const burstLog = mockLogExecutionNode.mock.calls.find(
      ([arg]) => typeof arg?.executionData?.message === 'string'
        && arg.executionData.message.includes('lỗi kết nối')
    );
    expect(burstLog).toBeTruthy();
    expect(burstLog[0].executionData.message).toContain('10 lần liên tiếp');
    expect(burstLog[0].executionData.message).toContain('15 phút');
  }, 15000);

  it('(b) 9 transient + 1 thành công + 9 transient (19 người) -> KHÔNG yield, đủ 19 lần sendMail', async () => {
    const transientEmails1 = Array.from({ length: 9 }, (_, i) => `t1_${i + 1}@example.com`);
    const okEmail = 'ok@example.com';
    const transientEmails2 = Array.from({ length: 9 }, (_, i) => `t2_${i + 1}@example.com`);
    const allEmails = [...transientEmails1, okEmail, ...transientEmails2];

    mockGetRunForExecution.mockResolvedValue(buildRunRow({}));
    mockFindNodesByCampaignId.mockResolvedValue([buildEmailNode(allEmails)]);
    wireLedgerMocks();

    mockSendEmailToCustomer.mockImplementation((runtimeNode, customer) => {
      if (customer?.email === okEmail) {
        return Promise.resolve({ status: 'success' });
      }
      return Promise.resolve(transientResult(0));
    });
    // syncPendingEmailRetryFromLedger() thấy còn người pending — run giữ 'running', không completed
    // (không liên quan gì tới việc CÓ yield cầu dao hay không, chỉ để executeCampaign kết thúc gọn).
    mockCountPendingDue.mockResolvedValue({
      pending_count: 18,
      pending_without_future_due: 0,
      pending_with_retry_meta: 18,
      next_due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(19);
    const deferCall = mockPatchRunMetadata.mock.calls.find(
      ([, patch]) => patch?.channelDeferredReason === 'smtp_transient_burst'
    );
    expect(deferCall).toBeUndefined();
  }, 15000);

  // PR-6b — continuous xử lý một batch bằng runTasksWithConcurrency (Promise.all song song, mặc định
  // CONTINUOUS_EMAIL_BATCH_SIZE=12), KHÁC one-shot (for tuần tự) — lo ngại chính của lệnh giao: nhiều
  // lần gửi CÙNG LÚC chạm ngưỡng thì RUN_YIELD_SLOT ném từ handler bên trong Promise.all có bị nuốt
  // (Promise.all resolve 'thành công' bỏ qua lỗi của phần tử khác) hay bay ra đúng như one-shot không.
  // Cách kiểm: 15 người transient hết, batch đầu (12 người) đã đủ chạm ngưỡng 10 — nếu lỗi bị nuốt thì
  // continuous sẽ chạy tiếp hết batch 2 (đủ 15 lần gọi, không patch channelDeferredReason); nếu lỗi bay
  // ra đúng, Promise.all của batch 1 reject ngay khi phần tử đầu tiên ném RUN_YIELD_SLOT nên KHÔNG bao
  // giờ chạm tới batch 2 (luôn < 15 lần gọi) và channelDeferredReason PHẢI được patch.
  it('(d) continuous, batch chạy song song, chạm ngưỡng vẫn yield -> không nuốt lỗi trong Promise.all/runTasksWithConcurrency', async () => {
    const emails = Array.from({ length: 15 }, (_, i) => `c${i + 1}@example.com`);
    mockGetRunForExecution.mockResolvedValue({
      id: 200,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      skipped_sends: 0,
      run_metadata: { source: 'campaign_run', continuousMode: true },
    });
    mockFindNodesByCampaignId.mockResolvedValue([buildEmailNode(emails)]);
    wireLedgerMocks();
    mockSendEmailToCustomer.mockImplementation(() => Promise.resolve(transientResult(0)));

    await campaignRunService.executeCampaign(100, 200, 10);

    // KHÔNG được xử lý hết cả 15 người — chứng minh RUN_YIELD_SLOT đã cắt ngang, không bị Promise.all
    // nuốt để "chạy tiếp như không có gì". Ít nhất 10 (chạm ngưỡng) — không đòi hỏi CHÍNH XÁC 10 vì
    // các cuộc gọi trong CÙNG batch song song, thứ tự hoàn tất không đảm bảo tuần tự như one-shot.
    const callCount = mockSendEmailToCustomer.mock.calls.length;
    expect(callCount).toBeGreaterThanOrEqual(10);
    expect(callCount).toBeLessThan(15);

    const deferCall = mockPatchRunMetadata.mock.calls.find(
      ([, patch]) => patch?.channelDeferredReason === 'smtp_transient_burst'
    );
    expect(deferCall).toBeTruthy();
    expect(deferCall[1].channelDeferredChannel).toBe('email');

    // RUN_YIELD_SLOT không được đối xử như một lỗi run — không failRun, không finalize kiểu lỗi.
    expect(mockFinalizeRun).not.toHaveBeenCalled();
  }, 15000);
});
