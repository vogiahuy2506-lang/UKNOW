import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-5: Chặn đồng ý (consent) cho kênh Zalo
 * 1. Người nhận Zalo cá nhân có lead FALSE → skipReason: 'consent_refused', resolveUidFromRecipient KHÔNG được gọi.
 * 2. Người nhận Zalo cá nhân có lead NULL → gửi bình thường, resolveUidFromRecipient ĐƯỢC gọi.
 * 3. Kênh kết bạn Zalo có lead FALSE → skipReason: 'consent_refused', không gửi kết bạn.
 */

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockSendFriendRequestQueued = jest.fn();
const mockResolveUidFromRecipient = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();
const mockFindKnownZaloUidByPhone = jest.fn();
const mockIsLeadPhoneConsentRefused = jest.fn();
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);

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

let currentCampaignNodes = [];

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: jest.fn().mockResolvedValue({
      id: 383,
      id_user: 10,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: jest.fn(() => Promise.resolve(currentCampaignNodes)),
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
    sendFriendRequestQueued: mockSendFriendRequestQueued,
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
    isLeadPhoneConsentRefused: mockIsLeadPhoneConsentRefused,
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
    logExecutionNode: mockLogExecutionNode,
    buildActionNodeSummaryMessage: jest.fn().mockReturnValue('OK'),
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

describe('CampaignRun — Chặn đồng ý kênh Zalo (PR-5)', () => {
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
    mockSendFriendRequestQueued.mockResolvedValue({
      success: true,
      messageId: 'friend-req-1',
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

  it('ca 1: Zalo cá nhân, lead FALSE (từ chối) → skipReason: "consent_refused", resolveUidFromRecipient KHÔNG được gọi', async () => {
    currentCampaignNodes = [
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
    ];

    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0912345678', name: 'Khách từ chối consent' },
      ],
      dataLoadMeta: {},
    });

    // Mock lead từ chối (FALSE)
    mockIsLeadPhoneConsentRefused.mockResolvedValue(true);

    await runCampaignPumpingTimers(383, 200, 10);

    // B2: Chốt đặt TRƯỚC khi tra số → resolveUidFromRecipient KHÔNG được gọi
    expect(mockIsLeadPhoneConsentRefused).toHaveBeenCalledWith(10, '0912345678');
    expect(mockResolveUidFromRecipient).not.toHaveBeenCalled();
    expect(mockSendPersonalMessageQueued).not.toHaveBeenCalled();

    // Kiểm tra log execution node đã ghi skip payload đúng khuôn
    expect(mockLogExecutionNode).toHaveBeenCalledWith(
      expect.objectContaining({
        executionData: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              status: 'skipped',
              skipReason: 'consent_refused',
              skipDetail: 'Khách đã từ chối nhận tin ở biểu mẫu/landing — bỏ qua, không tra số.',
            }),
          ]),
        }),
      })
    );

    // Finalize run với skipped = 1
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({
        skippedSends: 1,
        successfulSends: 0,
      }),
      null
    );
  }, 15000);

  it('ca 2: Zalo cá nhân, lead NULL (chưa hỏi) → gửi bình thường, resolveUidFromRecipient ĐƯỢC gọi', async () => {
    currentCampaignNodes = [
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
    ];

    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0945678901', name: 'Khách chưa hỏi consent' },
      ],
      dataLoadMeta: {},
    });

    // Mock lead chưa hỏi (NULL trả false)
    mockIsLeadPhoneConsentRefused.mockResolvedValue(false);

    await runCampaignPumpingTimers(383, 200, 10);

    // Lead NULL không bị chặn → tra số và gửi bình thường
    expect(mockIsLeadPhoneConsentRefused).toHaveBeenCalledWith(10, '0945678901');
    expect(mockResolveUidFromRecipient).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({
        successfulSends: 1,
        skippedSends: 0,
      }),
      null
    );
  }, 15000);

  it('ca 3: Kênh kết bạn Zalo, lead FALSE (từ chối) → skipReason: "consent_refused", không gửi kết bạn', async () => {
    currentCampaignNodes = [
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
        node_subtype: 'send_zalo_friend_request',
        execution_order: 2,
        config: {
          zaloAccountId: 99,
          zaloFriendSource: 'node',
          zaloFriendNodeId: '500',
          zaloFriendField: 'phone',
          zaloFriendContentMode: 'manual',
          zaloFriendRequestMessage: 'Xin chào, kết bạn với mình nhé!',
        },
      },
    ];

    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0912345678', name: 'Khách từ chối kết bạn' },
      ],
      dataLoadMeta: {},
    });

    // Mock lead từ chối (FALSE)
    mockIsLeadPhoneConsentRefused.mockResolvedValue(true);

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockIsLeadPhoneConsentRefused).toHaveBeenCalledWith(10, '0912345678');
    expect(mockSendFriendRequestQueued).not.toHaveBeenCalled();

    // Log execution node skip reason consent_refused
    expect(mockLogExecutionNode).toHaveBeenCalledWith(
      expect.objectContaining({
        executionData: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              status: 'skipped',
              skipReason: 'consent_refused',
            }),
          ]),
        }),
      })
    );

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({
        skippedSends: 1,
        successfulSends: 0,
      }),
      null
    );
  }, 15000);
});
