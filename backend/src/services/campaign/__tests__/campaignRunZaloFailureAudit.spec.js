import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockMergeRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();
const mockUpsertRecipientProgress = jest.fn().mockResolvedValue(null);
const mockGetRecipientProgress = jest.fn().mockResolvedValue(null);
const mockCountFailedByRecipientAndError = jest.fn().mockResolvedValue(0);
const mockMarkPhoneUnreachableFromError = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockResolvedValue({
      id: 200,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      run_metadata: { source: 'campaign_run' }, // một lần, không có continuousMode
    }),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: mockPatchRunMetadata,
    mergeRunMetadata: mockMergeRunMetadata,
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
    resolveUidFromRecipient: jest.fn(async ({ recipient }) => ({
      uid: `uid-${recipient}`,
      zaloName: `User ${recipient}`,
    })),
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
  return runPromise;
}

describe('CampaignRun — Ghi lý do hỏng Zalo cá nhân & Sổ recipientAudit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockGetRecipientProgress.mockResolvedValue({ lastCompletedStep: 0 });
    mockCountFailedByRecipientAndError.mockResolvedValue(0);
    mockSendPersonalMessageQueued.mockResolvedValue({
      messageId: 'msg-1',
      response: { msgId: 'msg-1' },
      quotaReservationId: 88,
    });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('Việc 1.1: Chế độ một lần, gửi hỏng → ledger có lastFailureReason', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0388180856', name: 'Khách Hỏng' },
      ],
      dataLoadMeta: {},
    });

    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Gửi thất bại: Tham số không hợp lệ'));

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_personal',
        recipientKey: '0388180856',
        metaPayload: expect.objectContaining({
          lastFailureReason: 'invalid_parameter',
        }),
      })
    );
  }, 15000);

  it('Việc 1.3: Sổ recipientAudit đếm đúng 6 hàng nguồn trong đó 3 không có số', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0388180856', name: 'Khách 1' },
        { phone: '0844790999', name: 'Khách 2' },
        { phone: '0901234567', name: 'Khách 3' },
        { phone: '', name: 'Khách không số 1' },
        { phone: null, name: 'Khách không số 2' },
        { name: 'Khách không số 3' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockMergeRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        recipientAudit: expect.objectContaining({
          sourceRows: 6,
          withRecipient: 3,
          deduped: 3,
          skippedNoRecipient: 3,
          attempted: 3,
        }),
      })
    );
  }, 15000);

  it('Việc 1.2: invalid_parameter lần thứ hai cùng số → markPhoneUnreachableFromError và skippedSends', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0388180856', name: 'Khách Lặp Lại' },
      ],
      dataLoadMeta: {},
    });

    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Tham số không hợp lệ'));
    // Lần thứ 2: đã có 1 lần hỏng trước đó
    mockCountFailedByRecipientAndError.mockResolvedValue(1);

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockMarkPhoneUnreachableFromError).toHaveBeenCalledWith(
      10,
      '0388180856',
      expect.any(Error),
      200
    );
  }, 15000);
});
