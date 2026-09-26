/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, PR-2 Việc 4 — giới hạn gửi/ngày theo TÀI KHOẢN cho kênh
 * `zalo_friend_request`. Kênh này KHÔNG truyền `zaloAccountPolicyHint` cho
 * `enforceZaloOutboundPolicyBeforeSend` trước PR này (chỉ zalo_personal truyền) — nếu thiếu bổ
 * sung, giới hạn ngày sẽ không có tác dụng cho kênh này dù code có vẻ đúng khi đọc lướt.
 * Harness mô phỏng theo campaignRunZaloFriendPhoneLookupCooldownPersist.spec.js.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockSendFriendRequestQueued = jest.fn().mockResolvedValue({ success: true });
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockCheckAccountDailyLimit = jest.fn().mockResolvedValue({ allowed: true });

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
    finalizeRun: jest.fn().mockResolvedValue(null),
    failRun: jest.fn().mockResolvedValue(null),
    completeRunWithError: jest.fn().mockResolvedValue(null),
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: jest.fn().mockResolvedValue({ id: 100, id_user: 10, status: 'active', flow_json: {} }),
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

let mockAccount = { id: 99, userId: 10, displayName: 'Tài khoản kết bạn' };
jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: jest.fn(() => Promise.resolve(mockAccount)),
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
  },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: {
    setPhoneLookupCooldown: jest.fn().mockResolvedValue(undefined),
    listActivePhoneLookupCooldowns: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: { logExecutionNode: jest.fn().mockResolvedValue(null) },
}));
jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: jest.fn().mockResolvedValue(null),
    upsertRecipientProgress: jest.fn().mockResolvedValue(null),
    countPendingDue: jest.fn().mockResolvedValue({
      pending_count: 0, pending_without_future_due: 0, pending_with_retry_meta: 0, next_due_at: null,
    }),
  },
}));
jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: {
    insertCampaignZaloMessage: jest.fn().mockResolvedValue(1),
    markAbandonedIfStillQueued: jest.fn().mockResolvedValue(undefined),
    mergeZaloMessageTrackingMetadata: jest.fn().mockResolvedValue(null),
    withTransaction: jest.fn((callback) => callback({})),
    linkQuotaReservation: jest.fn().mockResolvedValue(null),
  },
}));
jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-23T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));
jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: mockCheckAccountDailyLimit,
}));
jest.unstable_mockModule('../../../utils/campaignQuotaPauseNotify.util.js', () => ({
  QUOTA_DEFER_CLEAR_KEYS: ['quotaDeferredUntil', 'quotaDeferredReason', 'quotaDeferredAt', 'quotaPauseNotifiedAt'],
  notifyCampaignQuotaPaused: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignRunFailed: jest.fn().mockResolvedValue({ sent: true }),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

/**
 * `executeCampaign()` chờ bằng `setTimeout` THẬT ở nhiều chỗ rải rác, không chỉ trong rate limiter
 * — ví dụ giãn cách 250–1250 ms giữa các bước gửi nhóm (campaignRun.service.js:1548, hằng số
 * ZALO_GROUP_TEMPLATE_DELAY_MIN_MS/MAX_MS). Với `jest.useFakeTimers()` thì hẹn giờ thật không bao
 * giờ nổ, nên test treo tới hết timeout — CI 22/09 đỏ ba lượt liên tiếp vì chuyện này, và hai lần
 * đầu tôi chẩn đoán sai (tưởng chậm, rồi tưởng chỉ có một chỗ chờ trong rate limiter).
 *
 * Đẩy thẳng đồng hồ giả song song với lượt chạy thì MỌI khoảng chờ trong đường gửi nổ ngay, không
 * phải đi tìm và chặn từng chỗ một — cách này không phụ thuộc vào việc tôi đã tìm đủ hay chưa.
 */
async function runCampaignWithTimers() {
  const running = campaignRunService.executeCampaign(100, 200, 10);
  await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
  return running;
}


describe('CampaignRun Zalo kết bạn (zalo_friend_request) — giới hạn gửi/ngày theo tài khoản (Việc 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-23T03:00:00.000Z')); // 10:00 giờ VN, ngoài quiet hours
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: true });
    mockSendFriendRequestQueued.mockResolvedValue({ success: true });
    mockAccount = { id: 99, userId: 10, displayName: 'Tài khoản kết bạn' };
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    // Chính sách theo GIỜ không thuộc phạm vi spec này (đã có spec riêng) và là chỗ DUY NHẤT trong
    // đường gửi còn hẹn giờ thật — `enforceOutboundPolicyBeforeSend` chờ qua `yieldOrSleep` /
    // `sleepWithRunCheck`, mà `jest.useFakeTimers()` ở trên thì không bao giờ cho hẹn giờ thật nổ.
    // Đó là lý do CI 22/09 treo đúng những ca mà giới hạn/ngày CHO PHÉP gửi (chạy tiếp vào đây),
    // còn các ca bị hoãn thì xanh (ném RUN_YIELD_SLOT trước khi tới). Chặn ở đây để spec chỉ đo
    // đúng thứ nó nói: giới hạn/ngày theo tài khoản.
    campaignRunService.zaloRateLimiter.enforceOutboundPolicyBeforeSend = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('account model có userDailySendLimit → truyền đúng cho checkAccountDailyLimit (kênh zalo_friend_request KHÔNG bị bỏ sót)', async () => {
    mockAccount = { id: 99, userId: 10, displayName: 'Tài khoản kết bạn', userDailySendLimit: 30 };

    await runCampaignWithTimers();

    expect(mockCheckAccountDailyLimit).toHaveBeenCalledWith({ channel: 'zalo', accountId: 99, limit: 30 });
    expect(mockSendFriendRequestQueued).toHaveBeenCalledTimes(1);
  });

  it('đã chạm giới hạn → HOÃN CẢ RUN (không gửi kết bạn), ghi quotaDeferredReason=plan_quota_account_daily', async () => {
    mockAccount = { id: 99, userId: 10, displayName: 'Tài khoản kết bạn', userDailySendLimit: 30 };
    const resetAt = new Date('2026-09-23T17:00:00.000Z');
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: false, limit: 30, currentCount: 30, resetAt });

    await runCampaignWithTimers();

    expect(mockSendFriendRequestQueued).not.toHaveBeenCalled();
    expect(mockPatchRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ quotaDeferredReason: 'plan_quota_account_daily', quotaDeferredUntil: resetAt.toISOString() })
    );
  });
});
