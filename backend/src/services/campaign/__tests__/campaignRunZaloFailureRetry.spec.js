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
const mockSendFriendRequestQueued = jest.fn();
const mockGetAllGroupIdSet = jest.fn().mockResolvedValue(new Set());
const mockSendGroupMessageQueued = jest.fn();
let mockRunMetadata = { source: 'campaign_run' };
// PR-2b — kịch bản nhóm Zalo cần mô phỏng resume (lượt 2 đọc total_recipients đã cộng dồn từ
// lượt 1); các describe khác không đụng biến này nên mặc định 0 giữ nguyên hành vi cũ.
let mockTotalRecipientsSeed = 0;

const PERSONAL_NODE_LIST = [
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

// PR-2b — kịch bản kết bạn cần đổi node list sang send_zalo_friend_request; giữ mock có thể
// đổi lại được (mockResolvedValue) thay vì factory tĩnh như cũ, để mỗi describe tự set rồi
// trả lại PERSONAL_NODE_LIST ở afterEach, không rò sang describe chạy sau trong cùng file.
const mockFindNodesByCampaignId = jest.fn().mockResolvedValue(PERSONAL_NODE_LIST);

const mockGetRunStatus = jest.fn().mockResolvedValue('running');

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockImplementation(() => Promise.resolve({
      id: 200,
      status: 'running',
      total_recipients: mockTotalRecipientsSeed,
      successful_sends: 0,
      failed_sends: 0,
      run_metadata: mockRunMetadata,
    })),
    getRunStatus: mockGetRunStatus,
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
    sendFriendRequestQueued: mockSendFriendRequestQueued,
    getAllGroupIdSet: mockGetAllGroupIdSet,
    sendGroupMessageQueued: mockSendGroupMessageQueued,
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
    findKnownZaloUidByPhone: jest.fn().mockResolvedValue(''),
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

describe('PR-B: CampaignRun — Trần thử lại cho chế độ một lần + Giãn cách hai lần thử', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    mockRunMetadata = { source: 'campaign_run' }; // một lần mặc định
    mockGetRunStatus.mockResolvedValue('running');
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 0 },
    });
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

  it('Ca 1: Một lần, lỗi lần 1 → ledger zaloSendFailureCount: 1, nextDueAt ≈ now + 6h, chưa completed', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0388180856', name: 'Khách Lần 1' }],
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Lỗi mạng tạm thời khi gửi tin nhắn'));

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_personal',
        recipientKey: '0388180856',
        isFullyCompleted: false,
        completedStep: 0,
        metaPayload: expect.objectContaining({
          zaloSendFailureCount: 1,
          nextDueAt: '2026-09-12T15:00:00.000+07:00', // 02:00:00Z (+07) = 09:00:00+07, + 6h = 15:00:00+07:00
          lastFailureReason: expect.any(String),
        }),
      })
    );
  }, 15000);

  it('Ca 2: Một lần, sẵn 2 lỗi, lỗi lần 3 → chạm trần (max=3): chốt sổ abandon, completedStep=totalSteps, tracking failed, skipReason max_zalo_send_failures', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0388180856', name: 'Khách Lần 3' }],
      dataLoadMeta: {},
    });
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: {
        zaloSendFailureCount: 2,
      },
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Lỗi gửi lặp lại lần thứ 3'));

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_personal',
        recipientKey: '0388180856',
        completedStep: 1, // templateSteps.length = 1
        isFullyCompleted: true,
        metaPayload: expect.objectContaining({
          zaloSendFailureCount: 3,
          zaloAbandonReason: 'max_send_failures',
        }),
      })
    );

    // Run hoàn tất mà không bị kẹt hay crash
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({
        failedSends: 1,
        successfulSends: 0,
      }),
      null
    );
  }, 15000);

  it('Ca 3: Một lần, lỗi lần 1 rồi lần sau gửi thành công → khoá đếm lỗi bị gỡ (removeZaloFailureFromMeta: true)', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0388180856', name: 'Khách Thử Lại Thành Công' }],
      dataLoadMeta: {},
    });
    // Giả lập lần chạy trước đã ghi nhận 1 lỗi
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: {
        zaloSendFailureCount: 1,
      },
    });
    // Lần này gửi thành công
    mockSendPersonalMessageQueued.mockResolvedValue({
      messageId: 'msg-success-123',
      response: { msgId: 'msg-success-123' },
      quotaReservationId: 88,
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_personal',
        recipientKey: '0388180856',
        completedStep: 1,
        isFullyCompleted: true,
        removeZaloFailureFromMeta: true,
      })
    );
  }, 15000);

  it('Ca 4: Continuous mode → vẫn dùng CONTINUOUS_ZALO_MAX_SEND_FAILURES (=5), sẵn 2 lỗi chưa chạm trần 5', async () => {
    mockRunMetadata = { continuousMode: true };
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0388180856', name: 'Khách Continuous' }],
      dataLoadMeta: {},
    });
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: {
        zaloSendFailureCount: 2,
      },
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Lỗi gửi continuous'));
    mockUpsertRecipientProgress.mockImplementation(async () => {
      mockGetRunStatus.mockResolvedValue('stopping');
    });

    await runCampaignPumpingTimers(383, 200, 10);

    // Lần 3 chưa chạm trần 5 → KHÔNG abandon, isFullyCompleted = false
    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_personal',
        recipientKey: '0388180856',
        completedStep: 0,
        isFullyCompleted: false,
        metaPayload: expect.objectContaining({
          zaloSendFailureCount: 3,
        }),
      })
    );
    expect(mockUpsertRecipientProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metaPayload: expect.objectContaining({
          zaloAbandonReason: 'max_send_failures',
        }),
      })
    );
  }, 15000);
});

describe('PR-2, Việc 3 — 1 người hỏng cả 3 lượt (one-shot): failedSends chỉ +1 ở lượt chạm trần, KHÔNG +1 mỗi lượt còn hẹn thử lại', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    mockRunMetadata = { source: 'campaign_run' }; // một lần mặc định
    mockGetRunStatus.mockResolvedValue('running');
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockCountFailedByRecipientAndError.mockResolvedValue(0);
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0388180856', name: 'Khách 3 Lượt' }],
      dataLoadMeta: {},
    });
    mockSendPersonalMessageQueued.mockRejectedValue(new Error('Lỗi gửi lặp lại'));
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  // Mỗi it() mô phỏng MỘT lượt chạy (resume) độc lập: zaloSendFailureCount đã có trong ledger là
  // những gì lượt TRƯỚC đã ghi lại — đúng những gì executeCampaign đọc được khi được gọi lại.
  it('lượt 1 (0 lỗi trước đó, dưới trần 3): failedSends=0 — còn hẹn thử lại, KHÔNG cộng', async () => {
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 0 },
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ failedSends: 0, successfulSends: 0 }),
      null
    );
  }, 15000);

  it('lượt 2 (1 lỗi trước đó, dưới trần 3): failedSends=0 — vẫn còn hẹn thử lại', async () => {
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 1 },
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ failedSends: 0, successfulSends: 0 }),
      null
    );
  }, 15000);

  it('lượt 3 (2 lỗi trước đó, chạm trần 3): failedSends=1 đúng một lần (không phải 3)', async () => {
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 2 },
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ failedSends: 1, successfulSends: 0 }),
      null
    );
  }, 15000);
});

describe('PR-2b — kết bạn one-shot: nhánh còn hẹn thử lại (chưa đạt ngưỡng abandon) KHÔNG được cộng failedSends', () => {
  const FRIEND_REQUEST_NODE_LIST = [
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
        zaloFriendRequestMessage: 'Xin chào, kết bạn với mình nhé!',
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    mockRunMetadata = { source: 'campaign_run' };
    mockGetRunStatus.mockResolvedValue('running');
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockCountFailedByRecipientAndError.mockResolvedValue(0);
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindNodesByCampaignId.mockResolvedValue(FRIEND_REQUEST_NODE_LIST);
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '0388180857', name: 'Khách Kết Bạn' }],
      dataLoadMeta: {},
    });
    mockSendFriendRequestQueued.mockRejectedValue(new Error('Lỗi gửi lời mời kết bạn'));
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
    // Trả node list về mặc định zalo_personal — tránh rò sang describe khác chạy sau trong file.
    mockFindNodesByCampaignId.mockResolvedValue(PERSONAL_NODE_LIST);
  });

  it('1 số kết bạn hỏng, chưa tới trần 3 (0 lỗi trước đó): failedSends=0 — còn hẹn thử lại', async () => {
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 0 },
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendFriendRequestQueued).toHaveBeenCalled();
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ failedSends: 0 }),
      null
    );
  }, 15000);

  it('1 số kết bạn hỏng tới trần 3 (2 lỗi trước đó): failedSends=1', async () => {
    mockGetRecipientProgress.mockResolvedValue({
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 2 },
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ failedSends: 1 }),
      null
    );
  }, 15000);
});

describe('PR-2b — nhóm Zalo one-shot nhiều bước: total chỉ cộng lần đầu thấy nhóm, không phình khi resume', () => {
  const GROUP_NODE_LIST = [
    {
      id: 300,
      node_type: 'action',
      node_subtype: 'send_zalo_group',
      execution_order: 1,
      config: {
        zaloAccountId: 99,
        zaloGroupSource: 'manual',
        zaloGroupIds: 'group-a,group-b',
        zaloGroupTemplateSteps: [
          { stepIndex: 1, templateId: 1 },
          { stepIndex: 2, templateId: 2 },
        ],
      },
    },
  ];

  let ledger;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    mockRunMetadata = { source: 'campaign_run' };
    mockTotalRecipientsSeed = 0;
    mockGetRunStatus.mockResolvedValue('running');
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindNodesByCampaignId.mockResolvedValue(GROUP_NODE_LIST);
    mockGetAllGroupIdSet.mockResolvedValue(new Set());
    // quotaReservationId bắt buộc phải có: thiếu nó thì updateZaloMessageTrackingMeta() (status
    // 'sent', không quotaReservationId) rơi vào nhánh legacy gọi resolveBillingUserId() → DB thật
    // (không mock trong file này) → timeout thật 6 lần retry, tính nhầm thành gửi thất bại.
    mockSendGroupMessageQueued.mockResolvedValue({
      messageId: 'msg-group', response: { msgId: 'msg-group' }, quotaReservationId: 88,
    });
    // Ledger giả GIỮ trạng thái theo recipientKey (= groupId) — bắt buộc, vì
    // runZaloGroupTemplateStep gọi getRecipientProgress lại cho MỖI bước; khuôn giống hệt
    // campaignRunEmailCounterInvariantPr2.spec.js test (a).
    ledger = new Map();
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
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
    // Trả node list + seed về mặc định — tránh rò sang describe khác chạy sau trong file.
    mockFindNodesByCampaignId.mockResolvedValue(PERSONAL_NODE_LIST);
    mockTotalRecipientsSeed = 0;
  });

  it('lượt 1: 2 nhóm x 2 bước, tất cả gửi thành công → total=4 (không phải 8)', async () => {
    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendGroupMessageQueued).toHaveBeenCalledTimes(4);
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ totalRecipients: 4, successfulSends: 4, failedSends: 0 }),
      null
    );
  }, 15000);

  it('lượt 2 (resume): DB đã có total=4, cả 2 nhóm đã fully-completed trong ledger → total vẫn 4, KHÔNG gửi lại', async () => {
    const doneAt = new Date('2026-09-12T01:00:00.000Z');
    ['group-a', 'group-b'].forEach((groupId) => {
      ledger.set(groupId, {
        last_completed_step: 2,
        is_fully_completed: true,
        meta: {},
        updated_at: doneAt.toISOString(),
        updated_at_epoch_us: String(doneAt.getTime() * 1000),
      });
    });
    mockTotalRecipientsSeed = 4;

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ totalRecipients: 4 }),
      null
    );
  }, 15000);
});

// PR-5 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 1 — nhóm Zalo one-shot giờ thử lại theo
// đúng khuôn zalo_personal (trước đây chỉ continuous mới thử lại; one-shot lỗi lần đầu là "failed"
// ngay, không hẹn lại) + Việc 1 (R:7988 cũ) — failedSends không được cộng khi còn hẹn thử lại.
describe('PR-5 Việc 1 — nhóm Zalo one-shot thử lại theo khuôn cá nhân (ca a-c)', () => {
  const GROUP_ONESHOT_NODE_LIST = [
    {
      id: 300,
      node_type: 'action',
      node_subtype: 'send_zalo_group',
      execution_order: 1,
      config: {
        zaloAccountId: 99,
        zaloGroupSource: 'manual',
        zaloGroupIds: 'group-a',
        zaloGroupTemplateSteps: [{ stepIndex: 1, templateId: 1 }],
      },
    },
  ];

  let ledger;
  const makeSilentDropError = () => Object.assign(
    new Error('Zalo did not confirm delivery'),
    { code: 'ZALO_SEND_NOT_DELIVERED' }
  );
  const makeLedgerUpsertImpl = () => async (input) => {
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    mockRunMetadata = { source: 'campaign_run' };
    mockTotalRecipientsSeed = 0;
    mockGetRunStatus.mockResolvedValue('running');
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockFindNodesByCampaignId.mockResolvedValue(GROUP_ONESHOT_NODE_LIST);
    mockGetAllGroupIdSet.mockResolvedValue(new Set());
    mockSendGroupMessageQueued.mockRejectedValue(makeSilentDropError());
    ledger = new Map();
    mockGetRecipientProgress.mockImplementation(({ recipientKey }) => (
      Promise.resolve(ledger.get(recipientKey) || null)
    ));
    mockUpsertRecipientProgress.mockImplementation(makeLedgerUpsertImpl());
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
    mockFindNodesByCampaignId.mockResolvedValue(PERSONAL_NODE_LIST);
    mockTotalRecipientsSeed = 0;
  });

  it('a) lần 1 (ledger rỗng) → upsert zaloSendFailureCount:1, nextDueAt ≈ now+6h, failedSends=0 (còn hẹn thử lại)', async () => {
    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_group',
        recipientKey: 'group-a',
        isFullyCompleted: false,
        completedStep: 0,
        metaPayload: expect.objectContaining({
          zaloSendFailureCount: 1,
          nextDueAt: '2026-09-12T15:00:00.000+07:00', // 02:00:00Z (+07=09:00) + 6h = 15:00:00+07:00
          lastFailureReason: 'not_delivered',
        }),
      })
    );
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ failedSends: 0 }),
      null
    );
  }, 15000);

  it('b) ledger zaloSendFailureCount:2 → chạm trần 3 (one-shot): abandon, failedSends=1, ledger completedStep=totalSteps', async () => {
    ledger.set('group-a', {
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 2 },
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_group',
        recipientKey: 'group-a',
        completedStep: 1, // totalGroupSteps = 1 (một bước cấu hình)
        isFullyCompleted: true,
        metaPayload: expect.objectContaining({
          zaloSendFailureCount: 3,
          zaloAbandonReason: 'max_send_failures',
        }),
      })
    );
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      expect.objectContaining({ failedSends: 1 }),
      null
    );
  }, 15000);

  it('c) continuous, ledger zaloSendFailureCount:1 (dưới trần 5) → failedSends=0 (chặn cộng vô điều kiện của bản cũ)', async () => {
    mockRunMetadata = { continuousMode: true };
    ledger.set('group-a', {
      last_completed_step: 0,
      is_fully_completed: false,
      meta: { zaloSendFailureCount: 1 },
    });
    const baseUpsertImpl = makeLedgerUpsertImpl();
    mockUpsertRecipientProgress.mockImplementation(async (input) => {
      const row = await baseUpsertImpl(input);
      // Continuous mode lặp tới khi run dừng — dừng ngay sau lượt đầu, khuôn Ca 4 (zalo_personal).
      mockGetRunStatus.mockResolvedValue('stopping');
      return row;
    });

    await runCampaignPumpingTimers(383, 200, 10);

    // Continuous bị dừng ngay sau lượt đầu (mockGetRunStatus → 'stopping') nên không đi tới
    // finalizeRun như ca one-shot — khuôn Ca 4 (zalo_personal) ở trên: bằng chứng "không abandon,
    // không cộng failedSends" là chính lệnh ghi ledger này — isFullyCompleted:false và KHÔNG có
    // zaloAbandonReason chỉ xảy ra ở nhánh "chưa tới trần", nhánh đó luôn skip failedSends += 1.
    expect(mockUpsertRecipientProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: 300,
        channel: 'zalo_group',
        recipientKey: 'group-a',
        isFullyCompleted: false,
        metaPayload: expect.objectContaining({ zaloSendFailureCount: 2 }),
      })
    );
    expect(mockUpsertRecipientProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({
        metaPayload: expect.objectContaining({ zaloAbandonReason: 'max_send_failures' }),
      })
    );
  }, 15000);
});

// PR-5 Việc 2 — ZC: silent drop map sang mã ledger 'not_delivered' (không phải 'unknown')
describe('PR-5 Việc 2 — zaloSendErrorClassifier: silent drop → not_delivered', () => {
  it('d) mapZaloErrorCategoryToLedgerReason(\'ZALO_SILENT_DROP\') === \'not_delivered\'', async () => {
    const { mapZaloErrorCategoryToLedgerReason } = await import('../../../utils/zaloSendErrorClassifier.util.js');
    expect(mapZaloErrorCategoryToLedgerReason('ZALO_SILENT_DROP')).toBe('not_delivered');
  });
});
