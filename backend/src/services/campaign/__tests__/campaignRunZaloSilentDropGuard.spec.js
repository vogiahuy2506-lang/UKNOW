/**
 * Cơ chế TỰ DỪNG khi Zalo nuốt tin (silent drop) — sự cố production 23/10/2026:
 * UI hiện "Đã gửi 19/200" nhưng Zalo chỉ nhận ~5 tin, và phần mềm vẫn bắn tiếp 20–25 tin.
 *
 * Ở đây ta tái hiện TẦNG PHÁT HIỆN ĐƯỢC: Zalo trả msgId = 0 → lỗi ZALO_SEND_NOT_DELIVERED
 * → category ZALO_SILENT_DROP. Khi tỉ lệ vượt ngưỡng, lượt chạy phải DỪNG + chiến dịch được
 * TẠM DỪNG + chủ chiến dịch được BÁO.
 *
 * (Tầng "msgId > 0 nhưng Zalo âm thầm bỏ" KHÔNG quan sát được từ phía backend — xem chú thích
 * ở zaloSilentDropGuard.util.js.)
 */

process.env.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT = '1';
process.env.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT = '2';
process.env.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS = '1';
process.env.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS = '2';
process.env.ZALO_PERSONAL_PER_HOUR_LIMIT = '1000';
process.env.ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT = '1000';
// Tắt trần đếm lỗi → mỗi lần hỏng đều được tính failedSends (để bộ đếm "attempts" phản ánh
// đúng số lần đã xử lý). Với trần mặc định 3, 3 lần hỏng đầu chỉ ghi sổ cái.
process.env.ZALO_ONESHOT_MAX_SEND_FAILURES = '0';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockMergeRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockUpdateRunProgress = jest.fn().mockResolvedValue(null);
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();
const mockUpsertRecipientProgress = jest.fn().mockResolvedValue(null);
const mockGetRecipientProgress = jest.fn().mockResolvedValue({ lastCompletedStep: 0 });
const mockCountFailedByRecipientAndError = jest.fn().mockResolvedValue(0);
const mockPauseCampaignIfActive = jest.fn().mockResolvedValue(null);
const mockNotifyUsers = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: jest.fn().mockResolvedValue({ rows: [{ id: 10 }] }) },
  withRetry: (fn) => fn(),
  isConnectionError: () => false,
  isNeon: false,
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockResolvedValue({
      id: 200,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      run_metadata: { source: 'campaign_run' },
    }),
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
    claimRunFailureNotification: jest.fn().mockResolvedValue(null),
    markRunFailureNotified: jest.fn().mockResolvedValue(null),
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
    pauseCampaignIfActive: mockPauseCampaignIfActive,
  },
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {
    flowJsonHasZaloPersonalMultiAccount: jest.fn().mockReturnValue(false),
    buildExecutionOrderMap: jest.fn((nodes) => new Map(nodes.map((node, index) => [String(node.id), index + 1]))),
    buildFlowNodeIdMap: jest.fn().mockReturnValue(new Map()),
    normalizeNodeReferenceConfig: jest.fn((config) => config),
    buildSchemaFromRows: jest.fn(() => []),
    buildNodeSuccessMessage: jest.fn(() => 'OK'),
  },
}));

jest.unstable_mockModule('../campaignNodeData.service.js', () => ({
  default: { getCustomersFromDataNode: mockGetCustomersFromDataNode },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: jest.fn().mockResolvedValue({ id: 99, userId: 10, displayName: 'TK Zalo' }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    createTrackingToken: jest.fn().mockReturnValue('token'),
    resolveUidFromRecipient: jest.fn(async ({ recipient }) => ({ uid: `uid-${recipient}`, zaloName: 'U' })),
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
    findContentByIdForUser: jest.fn().mockResolvedValue({ id: 1, body_text: 'tin', attachments: [] }),
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
    insertZaloFriendCustomer: jest.fn().mockResolvedValue(1),
    updateZaloFriendCustomerByPhone: jest.fn().mockResolvedValue(null),
    findZaloPersonalCustomerByIdentifiers: jest.fn().mockResolvedValue(null),
    insertZaloPersonalCustomer: jest.fn().mockResolvedValue(1),
    updateZaloPersonalCustomerWithIdentifiers: jest.fn().mockResolvedValue(null),
    upsertZaloCustomerUidByPhone: jest.fn().mockResolvedValue(null),
    updateCustomerZaloUidIfEmpty: jest.fn().mockResolvedValue(null),
    findKnownZaloUidByPhone: jest.fn().mockResolvedValue(''),
  },
}));

jest.unstable_mockModule('../../../repositories/customer/customerZaloTracking.repository.js', () => ({
  default: { insertZaloSentJourney: jest.fn().mockResolvedValue(null) },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    setPhoneLookupCooldown: jest.fn().mockResolvedValue(undefined),
    listActivePhoneLookupCooldowns: jest.fn().mockResolvedValue([]),
    findSettingByAccountId: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({ default: {} }));

jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: { logExecutionNode: mockLogExecutionNode },
}));

jest.unstable_mockModule('../../notification/notificationDispatch.service.js', () => ({
  notifyUsers: mockNotifyUsers,
}));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: mockGetRecipientProgress,
    upsertRecipientProgress: mockUpsertRecipientProgress,
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
    countFailedByRecipientAndError: mockCountFailedByRecipientAndError,
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-13T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

async function runCampaignPumpingTimers(...args) {
  const runPromise = campaignRunService.executeCampaign(...args);
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await jest.advanceTimersByTimeAsync(5000);
  }
  await runPromise;
}

const makeRecipients = (count) => Array.from({ length: count }, (_, index) => ({
  phone: `0900000${String(index).padStart(4, '0')}`,
  name: `Khách ${index + 1}`,
}));

/** Lỗi silent-drop: Zalo nhận lệnh nhưng không trả msgId hợp lệ. */
const createSilentDropError = () => {
  const err = new Error('[ZALO_SEND_NOT_DELIVERED] Zalo did not confirm delivery op=send_personal_message dispatch=1/1');
  err.code = 'ZALO_SEND_NOT_DELIVERED';
  return err;
};

describe('Zalo cá nhân — tự dừng khi Zalo nuốt tin (silent drop)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockGetRecipientProgress.mockResolvedValue({ lastCompletedStep: 0 });
    mockCountFailedByRecipientAndError.mockResolvedValue(0);
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockNotifyUsers.mockResolvedValue({ inApp: 1, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: makeRecipients(30),
      dataLoadMeta: {},
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('Zalo nuốt nhiều tin → DỪNG lượt chạy, TẠM DỪNG chiến dịch, BÁO chủ (không bắn tiếp 200 tin)', async () => {
    let index = 0;
    mockSendPersonalMessageQueued.mockImplementation(async () => {
      index += 1;
      // 5 tin đầu gửi được, từ tin thứ 6 trở đi Zalo nuốt hết.
      if (index <= 5) {
        return { messageId: `msg-${index}`, response: { msgId: `msg-${index}` }, quotaReservationId: 88 };
      }
      throw createSilentDropError();
    });

    await runCampaignPumpingTimers(383, 200, 10);

    // KHÔNG bắn hết 30 tin — phải dừng sớm.
    expect(index).toBeLessThan(30);
    // Chiến dịch được tạm dừng.
    expect(mockPauseCampaignIfActive).toHaveBeenCalledWith(383);
    // Run được đóng sổ 'failed' kèm lý do rõ.
    expect(mockFailRun).toHaveBeenCalled();
    const failMessage = mockFailRun.mock.calls.at(-1)?.[1] || '';
    expect(failMessage).toMatch(/không xác nhận phát tin/i);
    // Chủ chiến dịch được báo.
    await new Promise((resolve) => setImmediate(resolve));
    const slowCalls = mockNotifyUsers.mock.calls.filter(([arg]) => arg.eventType === 'campaign_sending_slow');
    expect(slowCalls).toHaveLength(1);
    expect(slowCalls[0][0]).toMatchObject({
      metadata: { cause: 'silent_drop' },
      severity: 'warning',
    });
    expect(slowCalls[0][0].message).toMatch(/không xác nhận phát tin/i);
  });

  it('số lần hỏng ít (dưới ngưỡng) → KHÔNG dừng, chiến dịch chạy tiếp bình thường', async () => {
    let index = 0;
    mockSendPersonalMessageQueued.mockImplementation(async () => {
      index += 1;
      if (index <= 27) {
        return { messageId: `msg-${index}`, response: { msgId: `msg-${index}` }, quotaReservationId: 88 };
      }
      // 3 tin cuối hỏng → tỉ lệ 3/30 = 10% < 30%.
      throw createSilentDropError();
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(index).toBe(30);
    expect(mockPauseCampaignIfActive).not.toHaveBeenCalled();
  });
});
