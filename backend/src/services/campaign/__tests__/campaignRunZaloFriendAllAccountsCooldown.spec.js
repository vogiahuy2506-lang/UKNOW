import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2 (mục 2d): khi TẤT CẢ tài khoản trong pool đa tài khoản đều đang cooldown tra số,
 * picker (pickFriendMultiAccount / pickMultiZaloPersonalAccount) không được lấy đại một
 * tài khoản đang bị phạt để gửi tiếp — phải chờ tới mốc cooldown gần nhất và nhả slot.
 *
 * Test này dựng lại đúng kịch bản cho nhánh kết bạn (send_zalo_friend_request, đa tài khoản):
 * seed cooldown tra số cho CẢ HAI tài khoản trong pool trước khi chạy, rồi xác nhận run
 * nhả slot (RUN_YIELD_SLOT — không fail run) và KHÔNG gửi lời mời kết bạn nào.
 */

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockUpdateRunProgress = jest.fn().mockResolvedValue(null);
const mockUpdateCampaignLastRunStats = jest.fn().mockResolvedValue(null);
const mockSendFriendRequestQueued = jest.fn().mockResolvedValue({ success: true });
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });

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
      id: 100,
      id_user: 10,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: jest.fn().mockResolvedValue([
      {
        id: 300,
        node_type: 'action',
        node_subtype: 'send_zalo_friend_request',
        execution_order: 1,
        config: {
          zaloFriendAccountIds: ['501', '502'],
          zaloFriendMultiAccountEnabled: true,
          zaloFriendSource: 'manual',
          zaloFriendPhones: '0909999999',
          zaloFriendContentMode: 'manual',
          zaloFriendRequestMessage: 'Xin chào, kết bạn với tôi nhé!',
        },
      },
    ]),
    findConnectionsByCampaignId: jest.fn().mockResolvedValue([]),
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: mockUpdateCampaignLastRunStats,
  },
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {
    flowJsonHasZaloPersonalMultiAccount: jest.fn().mockReturnValue(false),
    buildExecutionOrderMap: jest.fn((nodes) => new Map(nodes.map((node, index) => [String(node.id), index + 1]))),
    buildFlowNodeIdMap: jest.fn().mockReturnValue(new Map()),
    normalizeNodeReferenceConfig: jest.fn((config) => config),
    buildSchemaFromRows: jest.fn().mockReturnValue([]),
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: jest.fn().mockResolvedValue({
      id: 99,
      userId: 10,
      displayName: 'Tài khoản mặc định (không dùng vì đa tài khoản)',
    }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllGroupIdSet: jest.fn().mockResolvedValue(new Set()),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-must-not-be-used'),
    sendFriendRequestQueued: mockSendFriendRequestQueued,
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
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-11T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRun Zalo kết bạn đa tài khoản — mọi tài khoản đều cooldown tra số', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 11/09/2026 giờ Việt Nam (UTC = giờ VN - 7h).
    jest.setSystemTime(new Date('2026-09-11T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    // Cả hai tài khoản trong pool đều đang bị Zalo khoá tra số — mốc cooldown tính ra
    // đúng là 00:00 giờ VN kế tiếp (2026-09-12 00:00 VN = 2026-09-11T17:00:00.000Z).
    campaignRunService.zaloRateLimiter.scheduleZaloPersonalPhoneLookupCooldown('501');
    campaignRunService.zaloRateLimiter.scheduleZaloPersonalPhoneLookupCooldown('502');
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('không lấy đại tài khoản đang bị phạt — nhả slot, chờ đến 00:00 giờ VN, không gửi lời mời kết bạn nào', async () => {
    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockPatchRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        zaloDeferredReason: 'all_accounts_phone_lookup_cooldown',
        zaloOutboundDeferredUntil: '2026-09-11T17:00:00.000Z',
      })
    );

    // Đây là bằng chứng chính: picker phải CHỜ, không được chọn tài khoản 501/502 đang phạt
    // để gửi lời mời kết bạn tiếp.
    expect(mockSendFriendRequestQueued).not.toHaveBeenCalled();

    // RUN_YIELD_SLOT là tín hiệu điều phối, không phải lỗi — run không được đánh fail/hoàn tất.
    expect(mockFinalizeRun).not.toHaveBeenCalled();
    expect(mockFailRun).not.toHaveBeenCalled();
  });
});
