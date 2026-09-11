import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2b: khi nhánh kết bạn (send_zalo_friend_request) gặp lỗi tra số quá nhiều, cooldown phải
 * được ghi xuống `zalo_settings.phone_lookup_cooldown_until` (không chỉ Map trong bộ nhớ) —
 * để sống sót qua deploy. Test này chạy qua executeCampaign() thật, làm sendFriendRequestQueued
 * ném đúng lỗi Zalo trả về ("Tìm số điện thoại quá nhiều lần...") và xác nhận
 * zaloSettingRepository.setPhoneLookupCooldown được gọi đúng accountId + mốc 00:00 giờ VN kế tiếp.
 */

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockSendFriendRequestQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockSetPhoneLookupCooldown = jest.fn().mockResolvedValue(undefined);
const mockMarkAbandonedIfStillQueued = jest.fn().mockResolvedValue(undefined);

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
          zaloAccountId: 99,
          zaloFriendSource: 'manual',
          zaloFriendPhones: '0909999999',
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
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
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

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    setPhoneLookupCooldown: mockSetPhoneLookupCooldown,
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
    markAbandonedIfStillQueued: mockMarkAbandonedIfStillQueued,
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-11T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRun Zalo kết bạn — lỗi tra số phải ghi cooldown xuống DB (PR-2b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 11/09/2026 giờ Việt Nam — ngoài quiet hours (23:00-06:00).
    jest.setSystemTime(new Date('2026-09-11T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockSendFriendRequestQueued.mockRejectedValue(
      new Error('Tìm số điện thoại quá nhiều lần trong 1 ngày có thể bị xem là hoạt động bất thường. Bạn hãy thử lại vào 00:00.')
    );
    mockSetPhoneLookupCooldown.mockResolvedValue(undefined);
    mockMarkAbandonedIfStillQueued.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('sendFriendRequestQueued lỗi tra số → setPhoneLookupCooldown được gọi đúng accountId + mốc 00:00 giờ VN', async () => {
    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockSendFriendRequestQueued).toHaveBeenCalledTimes(1);
    expect(mockSetPhoneLookupCooldown).toHaveBeenCalledTimes(1);

    const [accountId, untilDate] = mockSetPhoneLookupCooldown.mock.calls[0];
    expect(accountId).toBe(99);
    expect(untilDate).toBeInstanceOf(Date);
    expect(untilDate.getTime()).toBe(new Date('2026-09-12T00:00:00.000Z').getTime() - 7 * 60 * 60 * 1000);

    // Đúng ngữ nghĩa PR-2: lỗi tra số bị nuốt yên lặng (skip/deferred), không đánh fail run.
    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('zaloSettingRepository.setPhoneLookupCooldown ném lỗi → luồng gửi không gãy, chỉ log console.warn', async () => {
    mockSetPhoneLookupCooldown.mockRejectedValue(new Error('DB tạm thời không ghi được'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(campaignRunService.executeCampaign(100, 200, 10)).resolves.not.toThrow();

    expect(mockSetPhoneLookupCooldown).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ZaloCooldown]'),
      expect.anything()
    );
    expect(mockFailRun).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('PR-3: lỗi tra số ở nhánh kết bạn → placeholder zalo_messages phải được đóng sổ (markAbandonedIfStillQueued), không bị bỏ lại "queued"', async () => {
    await campaignRunService.executeCampaign(100, 200, 10);

    // insertCampaignZaloMessage mock resolves 1 → đây chính là zaloMessageId của placeholder
    // được tạo cho lượt gửi lỗi tra số. finally trong catch phải gọi đóng sổ nó.
    expect(mockMarkAbandonedIfStillQueued).toHaveBeenCalledTimes(1);
    expect(mockMarkAbandonedIfStillQueued).toHaveBeenCalledWith(1);
  });
});
