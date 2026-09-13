import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Test: đường chạy thật của Zalo cá nhân (send_zalo_personal) nhận diện cột SĐT
 * theo tiêu đề ngữ nghĩa (isPhoneHeader) thay vì chỉ dò theo tên cột cứng.
 */

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendPersonalMessageQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();

let currentRecipientType = 'phone';
let currentSourceField = 'phone';

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
          zaloRecipientType: currentRecipientType,
          zaloRecipientField: currentSourceField,
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

describe('CampaignRun — nhận diện cột SĐT theo tiêu đề ngữ nghĩa (Zalo cá nhân)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 12/09/2026 giờ Việt Nam — ngoài quiet hours (23:00-06:00).
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    currentRecipientType = 'phone';
    currentSourceField = 'phone';
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

  it('cột sđt (có dấu): nhận đúng, chuẩn hoá số mất 0 đầu, và gửi thành công', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { sđt: 388180856, name: 'Khách A' },
        { sđt: '0844790999', name: 'Khách B' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(2);
    const dialedRecipients = mockSendPersonalMessageQueued.mock.calls.map((c) => c[0].quotaRecipientKey).sort();
    expect(dialedRecipients).toEqual(['0388180856', '0844790999']);
  }, 15000);

  it('cột số điện thoại: nhận diện đúng theo tiêu đề', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { 'số điện thoại': '0912345678', name: 'Khách C' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued.mock.calls[0][0].quotaRecipientKey).toBe('0912345678');
  }, 15000);

  it('cột phone: vẫn chạy như cũ (không hồi quy)', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: '0987654321', name: 'Khách D' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued.mock.calls[0][0].quotaRecipientKey).toBe('0987654321');
  }, 15000);

  it('cả Email và sđt cùng có: chỉ lấy cột SĐT, không lấy nhầm email', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { Email: 'user@example.com', sđt: '0901234567', name: 'Khách E' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued.mock.calls[0][0].quotaRecipientKey).toBe('0901234567');
  }, 15000);

  it('recipientType = uid: không dò theo tiêu đề SĐT', async () => {
    currentRecipientType = 'uid';
    currentSourceField = 'zalo_id';
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { sđt: '0901234567', zalo_id: 'zalo-uid-999', name: 'Khách F' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    // Phải lấy zalo_id chứ không dò sang sđt
    expect(mockSendPersonalMessageQueued.mock.calls[0][0].quotaRecipientKey).toBe('zalo-uid-999');
  }, 15000);

  it('dòng có ô SĐT rỗng: bỏ qua như cũ', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { sđt: '', name: 'Khách rỗng 1' },
        { sđt: null, name: 'Khách rỗng 2' },
        { sđt: '0909999999', name: 'Khách hợp lệ' },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued.mock.calls[0][0].quotaRecipientKey).toBe('0909999999');
  }, 15000);

  it('ca chốt hành vi đầu-cuối: sheet cột sđt chứa 388180856 → hàm gửi nhận đúng 0388180856', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { sđt: 388180856 },
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(383, 200, 10);

    expect(mockSendPersonalMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockSendPersonalMessageQueued.mock.calls[0][0].quotaRecipientKey).toBe('0388180856');
  }, 15000);
});
