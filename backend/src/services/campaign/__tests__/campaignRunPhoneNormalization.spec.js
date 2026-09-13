import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Bug: người nhận Zalo cá nhân/kết bạn giải từ node dữ liệu (Sheet/DB/landing lead) không được
 * chuẩn hoá SĐT — số mất số 0 đầu (Excel/Sheets lưu dạng số, vd 388180856) đi thẳng tới tra số
 * Zalo và rớt. Xem vietnamesePhone.util.js + campaignRun.service.js:collectEntriesFromSource.
 *
 * Test qua executeCampaign() thật (khuôn campaignRunZaloFriendPhoneLookupCooldownPersist.spec.js)
 * — nhánh kết bạn (send_zalo_friend_request) luôn là SĐT, không có nhánh uid, nên là chỗ rẻ
 * nhất để chứng minh chuẩn hoá THẬT SỰ áp dụng end-to-end, không chỉ ở hàm util cô lập
 * (vietnamesePhone.util.spec.js đã test hàm util rồi — bài test này test TÍCH HỢP).
 */

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendFriendRequestQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockGetCustomersFromDataNode = jest.fn();

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

/**
 * Node 500 = nguồn dữ liệu (giả lập Google Sheet), node 300 = kết bạn Zalo đọc từ node 500 qua
 * trường `phone`. `campaignFlowService.normalizeNodeReferenceConfig` mock là passthrough nên
 * `zaloFriendNodeId: '500'` khớp thẳng `nodeOutputs['500']` không qua remap.
 */
jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: jest.fn().mockResolvedValue({
      id: 100,
      id_user: 10,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: jest.fn().mockResolvedValue([
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
          zaloFriendRequestMessage: 'Xin chào, kết bạn với tôi nhé!',
        },
      },
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
      displayName: 'Tài khoản kết bạn',
    }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token'),
    sendFriendRequestQueued: mockSendFriendRequestQueued,
    extractZaloSendObservability: jest.fn().mockReturnValue({}),
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
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-13T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

/**
 * Gửi >1 người nhận thì zaloRateLimiter chờ thật ~20-50s giữa 2 tin (sleepWithRunCheck, một
 * vòng setTimeout thật) — fake timers không tự trôi. Bơm thời gian giả theo từng bước trong
 * lúc executeCampaign() còn đang chạy, thay vì await thẳng rồi mới advance (lúc đó đã treo).
 */
async function runCampaignPumpingTimers(...args) {
  const runPromise = campaignRunService.executeCampaign(...args);
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await jest.advanceTimersByTimeAsync(5000);
  }
  return runPromise;
}

describe('CampaignRun — chuẩn hoá SĐT khi giải người nhận từ node dữ liệu (kết bạn Zalo)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 12/09/2026 giờ Việt Nam — ngoài quiet hours (23:00-06:00).
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockSendFriendRequestQueued.mockResolvedValue({ uid: null, response: null, quotaReservationId: 77 });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('SĐT mất số 0 đầu / có mã +84 từ node dữ liệu → được chuẩn hoá trước khi gửi lời mời kết bạn', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [
        { phone: 388180856 }, // Excel/Sheets lưu dạng SỐ — mất số 0 đầu
        { phone: '844790999' }, // mã quốc gia không dấu +
        { phone: '0901234567' }, // đã đúng — không được đổi
      ],
      dataLoadMeta: {},
    });

    await runCampaignPumpingTimers(100, 200, 10);

    expect(mockSendFriendRequestQueued).toHaveBeenCalledTimes(3);
    const dialedPhones = mockSendFriendRequestQueued.mock.calls.map((call) => call[0].phone).sort();
    expect(dialedPhones).toEqual(['0388180856', '0844790999', '0901234567']);
    expect(mockFailRun).not.toHaveBeenCalled();
  }, 15000);

  it('SĐT trùng nhau SAU khi chuẩn hoá (388180856 và 84388180856 đều là 0388180856) → dedupe về 1', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: 388180856 }, { phone: '84388180856' }],
      dataLoadMeta: {},
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockSendFriendRequestQueued).toHaveBeenCalledTimes(1);
    expect(mockSendFriendRequestQueued.mock.calls[0][0].phone).toBe('0388180856');
  });

  it('ô rỗng trong danh sách nguồn → bỏ qua như hiện tại, không gửi ca rỗng', async () => {
    mockGetCustomersFromDataNode.mockResolvedValue({
      items: [{ phone: '' }, { phone: null }, { phone: '0901234567' }],
      dataLoadMeta: {},
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockSendFriendRequestQueued).toHaveBeenCalledTimes(1);
    expect(mockSendFriendRequestQueued.mock.calls[0][0].phone).toBe('0901234567');
  });
});
