import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19, PR-2 Việc 2.1 — lưu bộ đếm lượt chạy khi nhả slot.
 *
 * Harness: executeCampaign() thật, node send_zalo_personal (người nhận đã biết uid → không tra số).
 * Hàng campaign_runs và sổ cái người nhận (recipientLedger) được giả lập bằng bộ nhớ, để lượt resume
 * đọc lại đúng thứ lượt trước đã ghi — nếu mock cứng `getRunForExecution` về 0 thì ca "không cộng đôi"
 * không đo được gì.
 */

// "DB" giả: hàng campaign_runs + sổ cái người nhận. Reset ở beforeEach.
let dbRunRow;
let dbLedger;
let ledgerEpoch;

const mockUpdateRunProgress = jest.fn();
const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();
const mockFindKnownZaloUidByPhone = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn(async () => ({ ...dbRunRow })),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: mockPatchRunMetadata,
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
    findCampaignById: jest.fn().mockResolvedValue({
      id: 383,
      id_user: 10,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: jest.fn(() => Promise.resolve([
      {
        id: 500,
        node_type: 'data',
        node_subtype: 'read_sheet',
        execution_order: 1,
        config: {},
      },
      {
        id: 300,
        node_type: 'action',
        node_subtype: 'send_zalo_personal',
        execution_order: 2,
        config: {
          zaloAccountId: 99,
          zaloRecipientSource: 'node',
          zaloRecipientNodeId: '500',
          zaloRecipientType: 'phone',
          zaloRecipientField: 'phone',
          zaloPersonalTemplateSteps: [{ stepIndex: 1, templateId: 1 }],
        },
      },
    ])),
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
    buildNodeSuccessMessage: jest.fn().mockReturnValue('OK'),
  },
}));

jest.unstable_mockModule('../campaignNodeData.service.js', () => ({
  default: {
    getCustomersFromDataNode: mockGetCustomersFromDataNode,
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: jest.fn().mockResolvedValue({
      id: 99,
      userId: 10,
      displayName: 'Tài khoản Zalo cá nhân',
    }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-test'),
    resolveUidFromRecipient: jest.fn(),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    buildTrackedMessageText: jest.fn(async ({ message }) => ({ message })),
    sendPersonalMessageQueued: mockSendPersonalMessageQueued,
    extractZaloSendObservability: jest.fn().mockReturnValue({}),
  },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: {
    findContentByIdForUser: jest.fn().mockResolvedValue({
      id: 1,
      body_text: 'Xin chào bạn, đây là tin nhắn kiểm tra.',
      attachments: [],
    }),
  },
}));

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: {
    normalizePhone: jest.fn((raw) => String(raw || '').trim()),
    isPhoneUnreachable: jest.fn().mockResolvedValue(false),
    isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false),
    getBoundSenderAccountId: jest.fn().mockResolvedValue(null),
    bindSenderAccount: jest.fn().mockResolvedValue(null),
    markPhoneUnreachableFromError: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/customer/customerMutation.repository.js', () => ({
  default: {
    findZaloFriendCustomerByPhone: jest.fn().mockResolvedValue(null),
    insertZaloFriendCustomer: jest.fn().mockResolvedValue(555),
    updateZaloFriendCustomerByPhone: jest.fn().mockResolvedValue(null),
    findZaloPersonalCustomerByIdentifiers: jest.fn().mockResolvedValue(null),
    insertZaloPersonalCustomer: jest.fn().mockResolvedValue(123),
    updateZaloPersonalCustomerWithIdentifiers: jest.fn().mockResolvedValue(null),
    upsertZaloCustomerUidByPhone: jest.fn().mockResolvedValue(null),
    updateCustomerZaloUidIfEmpty: jest.fn().mockResolvedValue(null),
    findKnownZaloUidByPhone: mockFindKnownZaloUidByPhone,
  },
}));

jest.unstable_mockModule('../../../repositories/customer/customerZaloTracking.repository.js', () => ({
  default: {
    insertZaloSentJourney: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    setPhoneLookupCooldown: jest.fn().mockResolvedValue(undefined),
    listActivePhoneLookupCooldowns: jest.fn().mockResolvedValue([]),
    findSettingByAccountId: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: {
    logExecutionNode: jest.fn().mockResolvedValue(null),
  },
}));

// Sổ cái giả lập: ghi ở upsert, đọc ở get — qua các lượt executeCampaign() như DB thật.
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
      pending_count: 0,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: null,
    }),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: {
    findExistingSentCampaignZaloMessageCrossRun: jest.fn().mockResolvedValue(null),
    insertCampaignZaloMessage: jest.fn().mockResolvedValue(1),
    markAbandonedIfStillQueued: jest.fn().mockResolvedValue(undefined),
    mergeZaloMessageTrackingMetadata: jest.fn().mockResolvedValue(undefined),
    withTransaction: jest.fn((callback) => callback({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
    linkQuotaReservation: jest.fn().mockResolvedValue(undefined),
    updateStatusByTrackingToken: jest.fn().mockResolvedValue(undefined),
    findExistingSentCampaignZaloMessage: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-10-19T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-10-31T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

async function runCampaignPumpingTimers(...args) {
  const runPromise = campaignRunService.executeCampaign(...args);
  for (let i = 0; i < 60; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await jest.advanceTimersByTimeAsync(5000);
  }
  return runPromise;
}

const FIVE_RECIPIENTS = Array.from({ length: 5 }, (_, i) => ({
  phone: `090000000${i + 1}`,
  zalo_id: `uid-${i + 1}`,
  name: `Khách ${i + 1}`,
}));

/** Giả lập "DB": mỗi lần updateRunProgress được gọi thì hàng campaign_runs mang số mới nhất. */
function wireRunProgressToDb() {
  mockUpdateRunProgress.mockImplementation(async (_runId, counters) => {
    dbRunRow = {
      ...dbRunRow,
      total_recipients: counters.totalRecipients,
      successful_sends: counters.successfulSends,
      failed_sends: counters.failedSends,
      skipped_sends: counters.skippedSends,
    };
  });
}

/** Lượt policy thứ `yieldOnCall` ném RUN_YIELD_SLOT (đúng hình persistZaloDeferYieldSlot thật). */
function makePolicyThatYieldsOnCall(yieldOnCall) {
  let calls = 0;
  return jest.fn(async () => {
    calls += 1;
    if (calls === yieldOnCall) {
      const err = new Error('Zalo báo tra số quá nhiều — chờ tới 00:00');
      err.code = 'RUN_YIELD_SLOT';
      throw err;
    }
    return undefined;
  });
}

function lastProgressCall() {
  const calls = mockUpdateRunProgress.mock.calls;
  return calls.length ? calls[calls.length - 1][1] : null;
}

describe('CampaignRun — bộ đếm lượt chạy khi nhả slot (PR-2 Việc 2.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 19/10/2026 giờ Việt Nam — ngoài quiet hours.
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
    wireRunProgressToDb();
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockSendPersonalMessageQueued.mockResolvedValue({
      messageId: 'msg-1',
      response: { msgId: 'msg-1' },
      quotaReservationId: 88,
    });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindKnownZaloUidByPhone.mockResolvedValue(null);
    mockGetCustomersFromDataNode.mockResolvedValue({ items: FIVE_RECIPIENTS, dataLoadMeta: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('ca 1: gửi 3 người rồi RUN_YIELD_SLOT giữa khối → updateRunProgress được gọi với số đã chốt (3 gửi thành công)', async () => {
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = makePolicyThatYieldsOnCall(4);

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(3);
    // Nhả slot KHÔNG phải kết thúc run.
    expect(mockFinalizeRun).not.toHaveBeenCalled();
    expect(mockFailRun).not.toHaveBeenCalled();
    // Khối dở dang chưa tới dòng updateRunProgress cuối khối → bộ đếm chỉ có thể được ghi ở catch.
    expect(mockUpdateRunProgress).toHaveBeenCalled();
    const saved = lastProgressCall();
    expect(saved.successfulSends).toBe(3);
    expect(saved.failedSends).toBe(0);
    // Người thứ 4 (đang bị tra số khi nhả slot) KHÔNG được tính vào total đã lưu: lượt sau họ vẫn
    // chưa có dòng sổ cái nên sẽ được cộng đúng một lần ở đó.
    expect(saved.totalRecipients).toBe(3);
  }, 30000);

  it('ca 2: resume gửi nốt 2 người → tổng cuối = 5 người (không cộng đôi 3 người cũ, không cộng đôi người bị nhả slot)', async () => {
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = makePolicyThatYieldsOnCall(4);
    await runCampaignPumpingTimers(383, 200, 10);
    expect(dbRunRow.total_recipients).toBe(3);
    expect(dbRunRow.successful_sends).toBe(3);

    // Lượt resume: policy cho qua hết.
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = jest.fn().mockResolvedValue(undefined);
    mockSendPersonalMessageQueued.mockClear();
    await runCampaignPumpingTimers(383, 200, 10, null, { resumedBy: 'scheduler' });

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(2);
    expect(dbRunRow.total_recipients).toBe(5);
    expect(dbRunRow.successful_sends).toBe(5);
    expect(dbRunRow.failed_sends).toBe(0);
  }, 30000);

  it('ca 3: yield xảy ra TRƯỚC khi nạp bộ đếm từ DB → KHÔNG ghi đè số cộng dồn của các lượt trước về 0', async () => {
    dbRunRow = { ...dbRunRow, total_recipients: 7, successful_sends: 6, failed_sends: 1 };
    const { default: runRepo } = await import('../../../repositories/campaign/campaignRun.repository.js');
    // Lỗi RUN_YIELD_SLOT ném ngay từ lần đọc metadata đầu tiên của lượt (trước getRunForExecution).
    const yieldErr = new Error('nhả slot sớm');
    yieldErr.code = 'RUN_YIELD_SLOT';
    runRepo.getRunMetadata.mockRejectedValueOnce(yieldErr);

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockUpdateRunProgress).not.toHaveBeenCalled();
    expect(dbRunRow.total_recipients).toBe(7);
  }, 30000);
});
