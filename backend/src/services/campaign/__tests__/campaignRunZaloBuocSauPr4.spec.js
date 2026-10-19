import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM_2026-10-19, PR-4 — chống bỏ đói bước sau + không "đốt" người nhận khi
 * tài khoản bị cấm nhắn người lạ.
 *
 * Harness: executeCampaign() thật, node send_zalo_personal nhiều bước, chế độ một lần (non-continuous).
 * Sổ cái người nhận (recipientLedger) và hàng campaign_runs giả lập BẰNG BỘ NHỚ có trạng thái, mock đúng hình dạng
 * thật (getRecipientProgress trả hàng có last_completed_step / meta / updated_at; findPhonesWithKnownZaloUid trả Set).
 * `enforceOutboundPolicyBeforeSend` của bộ giới hạn được thay bằng bản giả có kiểm tra `requiresPhoneLookup` y như cổng
 * khoá tra số thật (zaloRateLimiter.js: chỉ chặn khi requiresPhoneLookup=true).
 */

let dbRunRow;
let dbLedger;
let ledgerEpoch;
let nodeConfigOverrides;
let phonesWithKnownUid;
let lastRecipientAudit;

const mockUpdateRunProgress = jest.fn();
const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockMergeRunMetadata = jest.fn();
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockResolveUidFromRecipient = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();
const mockFindKnownZaloUidByPhone = jest.fn();
const mockFindPhonesWithKnownZaloUid = jest.fn();
const mockMarkPhoneUnreachableFromError = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn(async () => ({ ...dbRunRow })),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: mockPatchRunMetadata,
    mergeRunMetadata: mockMergeRunMetadata,
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
          zaloPersonalTemplateSteps: [
            { stepIndex: 1, templateId: 1 },
            { stepIndex: 2, templateId: 1 },
            { stepIndex: 3, templateId: 1 },
          ],
          ...nodeConfigOverrides,
        },
      },
    ])),
    findConnectionsByCampaignId: jest.fn().mockResolvedValue([]),
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
    pauseCampaignIfActive: jest.fn().mockResolvedValue(null),
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
    resolveUidFromRecipient: mockResolveUidFromRecipient,
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    buildTrackedMessageText: jest.fn(async ({ message }) => ({ message })),
    sendPersonalMessageQueued: mockSendPersonalMessageQueued,
    annotateZaloSendError: jest.fn((err) => err),
    extractZaloSendObservability: jest.fn((error) => ({
      stage: 'send',
      message: String(error?.message || error || '').trim(),
    })),
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
    markPhoneUnreachableFromError: mockMarkPhoneUnreachableFromError,
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
    findPhonesWithKnownZaloUid: mockFindPhonesWithKnownZaloUid,
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

// Sổ cái giả lập CÓ trạng thái: ghi ở upsert, đọc ở get — đúng hình dạng hàng thật của PostgreSQL.
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

jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn().mockResolvedValue(false),
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

/** Hàng sổ cái "đã gửi xong `step` bước" của một người đã được xử lý ở lượt trước. */
function ledgerRow({ step, nextDueAt = null, failureCount = 0 }) {
  ledgerEpoch += 1;
  return {
    last_completed_step: step,
    is_fully_completed: false,
    meta: {
      firstSentAt: '2026-10-15T09:00:00.000+07:00',
      lastCompletedAt: '2026-10-15T09:00:00.000+07:00',
      ...(nextDueAt ? { nextDueAt } : {}),
      ...(failureCount ? { zaloSendFailureCount: failureCount } : {}),
    },
    updated_at: '2026-10-15T02:00:00.000Z',
    updated_at_epoch_us: ledgerEpoch,
  };
}

/** Cổng khoá tra số GIẢ nhưng đúng hợp đồng thật: chỉ chặn (nhả slot) khi requiresPhoneLookup=true. */
function makePhoneLookupGate({ locked }) {
  const calls = [];
  const fn = jest.fn(async ({ requiresPhoneLookup = true } = {}) => {
    calls.push({ requiresPhoneLookup });
    if (locked() && requiresPhoneLookup) {
      const err = new Error('Tài khoản đang bị khoá tra số tới 00:00');
      err.code = 'RUN_YIELD_SLOT';
      throw err;
    }
    return undefined;
  });
  fn.calls = calls;
  return fn;
}

const sentLog = () => mockSendPersonalMessageQueued.mock.calls.map(([arg]) => ({
  recipient: arg.recipient,
  stepIndex: arg.stepIndex,
  quotaRecipientKey: arg.quotaRecipientKey,
}));

const lastProgress = () => {
  const calls = mockUpdateRunProgress.mock.calls;
  return calls.length ? calls[calls.length - 1][1] : null;
};

const deferPatch = () => mockPatchRunMetadata.mock.calls
  .map(([, patch]) => patch)
  .find((patch) => patch && patch.zaloDeferredReason);

describe('CampaignRun — Zalo nhiều bước: lượt ưu tiên bước sau (PR-4 Việc 4.1/4.2)', () => {
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
    nodeConfigOverrides = {};
    phonesWithKnownUid = new Set();
    lastRecipientAudit = null;
    mockUpdateRunProgress.mockImplementation(async (_runId, counters) => {
      dbRunRow = {
        ...dbRunRow,
        total_recipients: counters.totalRecipients,
        successful_sends: counters.successfulSends,
        failed_sends: counters.failedSends,
        skipped_sends: counters.skippedSends,
      };
    });
    mockMergeRunMetadata.mockImplementation(async (_runId, patch) => {
      if (patch?.recipientAudit) lastRecipientAudit = patch.recipientAudit;
    });
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    // Mặc định cổng cho qua hết; ca 2 tự đặt cổng khoá tra số.
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = jest.fn().mockResolvedValue(undefined);
    mockSendPersonalMessageQueued.mockResolvedValue({
      messageId: 'msg-1',
      response: { msgId: 'msg-1' },
      quotaReservationId: 88,
    });
    mockResolveUidFromRecipient.mockImplementation(async ({ recipient }) => ({
      uid: `resolved-${recipient}`,
      zaloName: `User ${recipient}`,
    }));
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindKnownZaloUidByPhone.mockImplementation(async (_userId, phone) => (
      phonesWithKnownUid.has(String(phone)) ? `uid-${phone}` : null
    ));
    mockFindPhonesWithKnownZaloUid.mockImplementation(async () => new Set(phonesWithKnownUid));
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('ca 1: A (uid trong dòng) và D (uid trong khách hàng) quá hạn bước 2; B, C mới; khoá tra số nổ ở C → A, D nhận bước 2 TRƯỚC (không tra số), rồi B tra số, C bị hoãn', async () => {
    // Thứ tự nguồn: B, C, D, A — A, D đứng CUỐI. Vòng cũ (bước 1 cho tất cả trước) sẽ nổ ở C và không bao giờ tới A, D.
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0900000002', name: 'B mới' },
        { phone: '0900000003', name: 'C mới' },
        { phone: '0900000004', name: 'D có uid trong khách hàng' },
        { phone: '0900000001', zalo_id: 'uid-A-row', name: 'A có uid trong dòng' },
      ],
      dataLoadMeta: {},
    });
    phonesWithKnownUid = new Set(['0900000004']);
    dbLedger.set('0900000001', ledgerRow({ step: 1 }));
    dbLedger.set('0900000004', ledgerRow({ step: 1 }));
    // Tra số lần 1 (B) thành công, lần 2 (C) Zalo báo tra quá nhiều.
    mockResolveUidFromRecipient
      .mockResolvedValueOnce({ uid: 'uid-B', zaloName: 'B' })
      .mockRejectedValueOnce(new Error('Tìm số điện thoại quá nhiều lần, vui lòng thử lại vào 00:00'));

    await runCampaignPumpingTimers(383, 200, 10);

    expect(sentLog()).toEqual([
      expect.objectContaining({ recipient: 'uid-A-row', stepIndex: 2, quotaRecipientKey: '0900000001' }),
      expect.objectContaining({ recipient: 'uid-0900000004', stepIndex: 2, quotaRecipientKey: '0900000004' }),
      expect.objectContaining({ recipient: 'uid-B', stepIndex: 1, quotaRecipientKey: '0900000002' }),
    ]);
    // A và D không tốn lượt tra số: resolveUid chỉ gọi cho B rồi C (lỗi), không bao giờ cho A, D.
    expect(mockResolveUidFromRecipient.mock.calls.map(([arg]) => arg.recipient)).toEqual(['0900000002', '0900000003']);
    expect(dbLedger.get('0900000001').last_completed_step).toBe(2);
    expect(dbLedger.get('0900000004').last_completed_step).toBe(2);
    expect(dbLedger.get('0900000002').last_completed_step).toBe(1);
    // C bị hoãn (chưa có dòng sổ cái, không bị tính lỗi) — run nhả slot chứ không hỏng.
    expect(dbLedger.has('0900000003')).toBe(false);
    expect(deferPatch()).toMatchObject({ zaloDeferredReason: 'phone_lookup_cooldown_api_error' });
    expect(mockFailRun).not.toHaveBeenCalled();
  }, 30000);

  it('ca 2: tài khoản ĐANG bị khoá tra số từ đầu lượt → A (đã biết uid) vẫn nhận bước 2 vì cổng khoá không chặn họ; B (phải tra số) bị cổng nhả slot', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0900000002', name: 'B mới' },
        { phone: '0900000001', zalo_id: 'uid-A-row', name: 'A có uid trong dòng' },
      ],
      dataLoadMeta: {},
    });
    dbLedger.set('0900000001', ledgerRow({ step: 1 }));
    const gate = makePhoneLookupGate({ locked: () => true });
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = gate;

    await runCampaignPumpingTimers(383, 200, 10);

    expect(sentLog()).toEqual([
      expect.objectContaining({ recipient: 'uid-A-row', stepIndex: 2 }),
    ]);
    // Cổng được hỏi 2 lần: lần 1 cho A với requiresPhoneLookup=false (qua), lần 2 cho B với true (bị chặn).
    expect(gate.calls).toEqual([{ requiresPhoneLookup: false }, { requiresPhoneLookup: true }]);
    expect(mockResolveUidFromRecipient).not.toHaveBeenCalled();
    expect(dbLedger.get('0900000001').last_completed_step).toBe(2);
    expect(dbLedger.has('0900000002')).toBe(false);
  }, 30000);

  it('ca 3: A có uid nhưng bước 2 CHƯA tới hạn → lượt ưu tiên không gửi và KHÔNG cộng skippedCompleted (chỉ 3 lần vòng chính × 3 bước)', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0900000001', zalo_id: 'uid-A-row', name: 'A' }],
      dataLoadMeta: {},
    });
    nodeConfigOverrides = { zaloPersonalSendMode: 'schedule' };
    dbLedger.set('0900000001', ledgerRow({ step: 1, nextDueAt: '2026-10-20T09:00:00.000+07:00' }));

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).not.toHaveBeenCalled();
    // Vòng chính: 3 bước, A không khớp bước nào (chưa tới hạn) → 3. Lượt ưu tiên (bước 3, bước 2) mà cộng nữa thì ra 5.
    expect(lastRecipientAudit).toMatchObject({ skippedCompleted: 3 });
    // Cũng không cộng total lần đầu thấy: A đã có dòng sổ cái từ lượt trước.
    expect(lastProgress().totalRecipients).toBe(0);
  }, 30000);

  it('ca 4: chuỗi độ trễ 0 cho người MỚI (không có uid) → vẫn gửi bước 1, 2, 3 liên tiếp trong cùng lượt, total = 3 một lần', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0900000009', name: 'X mới' }],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(sentLog().map((s) => s.stepIndex)).toEqual([1, 2, 3]);
    expect(lastProgress().totalRecipients).toBe(3);
    expect(dbLedger.get('0900000009').last_completed_step).toBe(3);
  }, 30000);

  it('ca 5: tra uid hàng loạt hỏng (DB lỗi) → bỏ lượt ưu tiên nhưng run vẫn chạy bình thường theo vòng cũ', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0900000004', name: 'D' }],
      dataLoadMeta: {},
    });
    dbLedger.set('0900000004', ledgerRow({ step: 1 }));
    mockFindPhonesWithKnownZaloUid.mockRejectedValue(new Error('db down'));

    await runCampaignPumpingTimers(383, 200, 10);

    // Vòng chính vẫn gửi bước 2, 3 cho D (D được tra số vì mock findKnownZaloUidByPhone không biết D).
    expect(sentLog().map((s) => s.stepIndex)).toEqual([2, 3]);
    expect(mockFailRun).not.toHaveBeenCalled();
  }, 30000);
});

describe('CampaignRun — Zalo: người nhận chặn tin người lạ (PR-4 Việc 4.3)', () => {
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
    nodeConfigOverrides = {};
    phonesWithKnownUid = new Set();
    lastRecipientAudit = null;
    mockUpdateRunProgress.mockResolvedValue(null);
    mockMergeRunMetadata.mockResolvedValue(null);
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = jest.fn().mockResolvedValue(undefined);
    mockResolveUidFromRecipient.mockImplementation(async ({ recipient }) => ({
      uid: `resolved-${recipient}`,
      zaloName: `User ${recipient}`,
    }));
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindKnownZaloUidByPhone.mockResolvedValue(null);
    mockFindPhonesWithKnownZaloUid.mockResolvedValue(new Set());
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0900000001', name: 'P chặn người lạ' }],
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Người dùng không thể nhận tin nhắn từ bạn'));
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('một tài khoản: bước 1 báo "không thể nhận tin nhắn từ bạn" → tiến độ = xong hết 3 bước (không bị ghi đè về 1), bước 2, 3 KHÔNG thử lại / tra số lại', async () => {
    await runCampaignPumpingTimers(383, 200, 10);

    // Chỉ gửi (thử) đúng 1 lần — bước 2, 3 không còn lượt.
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockResolveUidFromRecipient).toHaveBeenCalledTimes(1);
    const row = dbLedger.get('0900000001');
    expect(row.last_completed_step).toBe(3);
    expect(row.is_fully_completed).toBe(true);
    expect(row.meta.zaloAbandonReason).toBe('recipient_blocks_strangers');
    expect(row.meta.lastFailureReason).toBe('stranger_blocked');
    // Bị bỏ qua (skipped) chứ không tính failed.
    expect(lastProgress().failedSends).toBe(0);
    expect(lastProgress().skippedSends).toBe(1);
  }, 30000);

  it('nhiều tài khoản (pool): giữ nguyên như cũ — mỗi bước vẫn thử lại, KHÔNG đóng người nhận', async () => {
    nodeConfigOverrides = {
      zaloPersonalMultiAccountEnabled: true,
      zaloPersonalAccountIds: ['99'],
    };

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(3);
    const row = dbLedger.get('0900000001');
    expect(row.last_completed_step).toBe(3);
    expect(row.meta.zaloAbandonReason).toBeUndefined();
  }, 30000);
});

describe('CampaignRun — Zalo: tài khoản bị cấm nhắn người lạ (PR-4 Việc 4.4)', () => {
  let notifySpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 19/10/2026 giờ VN → sáng kế tiếp = 06:00 ngày 20/10 giờ VN = 2026-10-19T23:00:00.000Z.
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
    nodeConfigOverrides = {};
    lastRecipientAudit = null;
    mockUpdateRunProgress.mockResolvedValue(null);
    mockMergeRunMetadata.mockResolvedValue(null);
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = jest.fn().mockResolvedValue(undefined);
    mockResolveUidFromRecipient.mockImplementation(async ({ recipient }) => ({
      uid: `resolved-${recipient}`,
      zaloName: `User ${recipient}`,
    }));
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindKnownZaloUidByPhone.mockResolvedValue(null);
    mockFindPhonesWithKnownZaloUid.mockResolvedValue(new Set());
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0900000001', name: 'P1' },
        { phone: '0900000002', name: 'P2' },
        { phone: '0900000003', name: 'P3' },
      ],
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Bạn đang bị cấm nhắn tin cho người lạ'));
    notifySpy = jest.spyOn(campaignRunService, '_notifySendingSlowFireAndForget').mockImplementation(() => {});
  });

  afterEach(() => {
    notifySpy.mockRestore();
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('một tài khoản: lỗi "cấm nhắn người lạ" → hoãn cả lượt tới 06:00 VN kế tiếp, KHÔNG tăng zaloSendFailureCount, KHÔNG ghi failed, có chuông stranger_ban', async () => {
    await runCampaignPumpingTimers(383, 200, 10);

    // Lỗi của TÀI KHOẢN → dừng ngay ở người đầu tiên, không đốt P2, P3.
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(deferPatch()).toMatchObject({
      zaloDeferredReason: 'stranger_messaging_banned',
      zaloOutboundDeferredUntil: '2026-10-19T23:00:00.000Z',
      zaloOutboundResumeEffectiveAt: '2026-10-19T23:00:00.000Z',
      zaloDeferredAccountName: 'Tài khoản Zalo cá nhân',
    });
    // Không dòng sổ cái nào mang bộ đếm lỗi / lý do bỏ cuộc; không ai bị tính failed.
    for (const row of dbLedger.values()) {
      expect(row.meta.zaloSendFailureCount).toBeUndefined();
      expect(row.meta.zaloAbandonReason).toBeUndefined();
    }
    expect(dbLedger.size).toBe(0);
    const saved = mockUpdateRunProgress.mock.calls.map(([, counters]) => counters);
    expect(saved.every((c) => c.failedSends === 0)).toBe(true);
    // Nhả slot chứ không kết thúc / hỏng run.
    expect(mockFinalizeRun).not.toHaveBeenCalled();
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({
      runId: 200,
      campaignId: 383,
      cause: 'stranger_ban',
      accountName: 'Tài khoản Zalo cá nhân',
    }));
  }, 30000);

  it('lỗi quyền riêng tư CỦA NGƯỜI NHẬN ("chặn không nhận tin nhắn từ người lạ") KHÔNG phải cấm tài khoản → giữ nhánh cũ (đánh dấu không liên hệ được, đi tiếp người sau)', async () => {
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Người dùng chặn không nhận tin nhắn từ người lạ'));

    await runCampaignPumpingTimers(383, 200, 10);

    expect(deferPatch()).toBeUndefined();
    expect(notifySpy).not.toHaveBeenCalled();
    expect(mockMarkPhoneUnreachableFromError).toHaveBeenCalled();
    // Cả 3 người đều được thử (mỗi người 3 bước nhưng bị đóng sau bước 1 → 3 lần gửi).
    expect(mockSendPersonalMessageQueued.mock.calls.length).toBeGreaterThanOrEqual(3);
  }, 30000);

  it('người nhận gửi theo UID (không qua nhánh "không liên hệ được" của SĐT): lỗi quyền riêng tư CỦA NGƯỜI NHẬN vẫn là lỗi từng người — đếm lỗi như cũ, KHÔNG hoãn cả lượt', async () => {
    nodeConfigOverrides = { zaloRecipientType: 'uid', zaloRecipientField: 'zalo_id' };
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ zalo_id: 'uid-người-nhận-1', name: 'U1' }],
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Người dùng chặn không nhận tin nhắn từ người lạ'));

    await runCampaignPumpingTimers(383, 200, 10);

    expect(deferPatch()).toBeUndefined();
    expect(notifySpy).not.toHaveBeenCalled();
    // Lỗi đếm cho từng người như cũ: lần 1 → zaloSendFailureCount = 1, còn hẹn thử lại.
    expect(dbLedger.get('uid-người-nhận-1').meta.zaloSendFailureCount).toBe(1);
  }, 30000);

  it('nhiều tài khoản (pool): giữ nguyên như cũ — không hoãn cả lượt, không chuông stranger_ban', async () => {
    nodeConfigOverrides = {
      zaloPersonalMultiAccountEnabled: true,
      zaloPersonalAccountIds: ['99'],
    };

    await runCampaignPumpingTimers(383, 200, 10);

    expect(deferPatch()).toBeUndefined();
    expect(notifySpy).not.toHaveBeenCalled();
    // Mỗi người vẫn được thử (đếm lỗi từng người như cũ).
    expect(mockSendPersonalMessageQueued.mock.calls.length).toBeGreaterThan(1);
  }, 30000);
});
