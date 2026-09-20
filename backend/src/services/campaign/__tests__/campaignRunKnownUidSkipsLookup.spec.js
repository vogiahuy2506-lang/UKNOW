import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2: Tiết kiệm lượt tra số Zalo khi đã biết UID.
 * Ba ca cần kiểm tra:
 * 1. Dòng dữ liệu có zalo_id -> resolveUidFromRecipient không được gọi, sendPersonalMessageQueued nhận đúng uid đó, recipientType: 'uid'
 * 2. Dòng không có uid, findKnownZaloUidByPhone trả '123' -> resolveUidFromRecipient không được gọi, sendPersonalMessageQueued nhận '123', recipientType: 'uid'
 * 3. Cả hai rỗng -> resolveUidFromRecipient được gọi đúng 1 lần
 */

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockResolveUidFromRecipient = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();
const mockFindKnownZaloUidByPhone = jest.fn();

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
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
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
    resolveUidFromRecipient: mockResolveUidFromRecipient,
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

jest.uncrawlable = true;
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: {
    logExecutionNode: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: jest.fn().mockResolvedValue(null),
    upsertRecipientProgress: jest.fn().mockResolvedValue(null),
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
  return runPromise;
}

describe('CampaignRun — Tiết kiệm lượt tra số Zalo khi đã biết UID (PR-2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 12/09/2026 giờ Việt Nam — ngoài quiet hours (23:00-06:00).
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
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
    mockFindKnownZaloUidByPhone.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('ca 1: dòng dữ liệu có zalo_id → resolveUidFromRecipient không được gọi, sendPersonalMessageQueued nhận đúng uid đó, recipientType: "uid"', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0901234567', zalo_id: 'uid-from-row-999', name: 'Khách có sẵn UID' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockResolveUidFromRecipient).not.toHaveBeenCalled();
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'uid-from-row-999',
        recipientType: 'uid',
        quotaRecipientKey: '0901234567',
      })
    );
  }, 15000);

  it('ca 2: dòng không có uid, mock findKnownZaloUidByPhone trả "123" → resolveUidFromRecipient không được gọi, sendPersonalMessageQueued nhận "123", recipientType: "uid"', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0901234567', name: 'Khách từng tra UID trước đó' },
      ],
      dataLoadMeta: {},
    });
    mockFindKnownZaloUidByPhone.mockResolvedValue('123');

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockFindKnownZaloUidByPhone).toHaveBeenCalledWith(10, '0901234567');
    expect(mockResolveUidFromRecipient).not.toHaveBeenCalled();
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: '123',
        recipientType: 'uid',
        quotaRecipientKey: '0901234567',
      })
    );
  }, 15000);

  it('ca 3: cả hai rỗng → resolveUidFromRecipient gọi đúng 1 lần (hành vi cũ)', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0901234567', name: 'Khách mới hoàn toàn' },
      ],
      dataLoadMeta: {},
    });
    mockFindKnownZaloUidByPhone.mockResolvedValue(null);

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockFindKnownZaloUidByPhone).toHaveBeenCalledWith(10, '0901234567');
    expect(mockResolveUidFromRecipient).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'resolved-0901234567',
        recipientType: 'uid',
        quotaRecipientKey: '0901234567',
      })
    );
  }, 15000);
});
