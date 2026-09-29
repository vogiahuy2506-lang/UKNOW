import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_TG_WA_DAY_DU_2026-09-29, P4 — engine thật (executeCampaign), kênh adapter GIẢ đăng ký qua __registerChannelForTest:
// tài khoản chạm TRẦN GỬI/NGÀY do người dùng tự đặt -> node HOÃN tới 00:00 giờ VN hôm sau (quotaDeferredUntil, reason
// plan_quota_account_daily_<kênh> để chủ nhận đúng email), run KHÔNG failed, chiến dịch KHÔNG bị tạm dừng/đánh hỏng.
// Khuôn mock lấy từ campaignRunChannelAuthPauseP2.spec.js.

const mockFailRun = jest.fn().mockResolvedValue(null);
const mockCompleteRunWithError = jest.fn().mockResolvedValue(null);
const mockFindCampaignById = jest.fn();
const mockFindNodesByCampaignId = jest.fn();
const mockPauseCampaignIfActive = jest.fn().mockResolvedValue(null);
const mockNotifyCampaignRunFailed = jest.fn().mockResolvedValue({ sent: true });
const mockGetCampaignZaloAccount = jest.fn();
const mockGetConnectedApiOrSyncStatus = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockCheckAccountDailyLimit = jest.fn();
const mockNotifyQuotaPaused = jest.fn().mockResolvedValue({ sent: true });

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockResolvedValue({
      id: 200,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      skipped_sends: 0,
      run_metadata: { source: 'campaign_run' },
    }),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: mockPatchRunMetadata,
    mergeRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: jest.fn().mockResolvedValue(null),
    failRun: mockFailRun,
    completeRunWithError: mockCompleteRunWithError,
    touchRunHeartbeat: jest.fn().mockResolvedValue(null),
    markRunYieldSlot: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCrud.repository.js', () => ({
  default: {
    findCampaignById: mockFindCampaignById,
    findNodesByCampaignId: mockFindNodesByCampaignId,
    findConnectionsByCampaignId: jest.fn().mockResolvedValue([]),
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
    pauseCampaignIfActive: mockPauseCampaignIfActive,
  },
}));

jest.unstable_mockModule('../../../utils/campaignQuotaPauseNotify.util.js', () => ({
  QUOTA_DEFER_CLEAR_KEYS: ['quotaDeferredUntil', 'quotaDeferredReason', 'quotaDeferredAt', 'quotaPauseNotifiedAt'],
  notifyCampaignQuotaPaused: mockNotifyQuotaPaused,
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignRunFailed: mockNotifyCampaignRunFailed,
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {
    flowJsonHasZaloPersonalMultiAccount: jest.fn().mockReturnValue(false),
    buildExecutionOrderMap: jest.fn((nodes) => new Map(nodes.map((node, index) => [String(node.id), index + 1]))),
    buildFlowNodeIdMap: jest.fn().mockReturnValue(new Map()),
    normalizeNodeReferenceConfig: jest.fn((config) => config),
    buildSchemaFromRows: jest.fn().mockReturnValue([]),
    parseEmailList: jest.fn((text) => String(text || '')
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))),
  },
}));

jest.unstable_mockModule('../campaignNodeData.service.js', () => ({
  default: { getCustomersFromDataNode: jest.fn() },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: mockGetCampaignZaloAccount,
    getConnectedApiOrSyncStatus: mockGetConnectedApiOrSyncStatus,
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-test'),
    resolveUidFromRecipient: jest.fn(async ({ recipient }) => ({ uid: `uid-${recipient}`, zaloName: `User ${recipient}` })),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    buildTrackedMessageText: jest.fn(async ({ message }) => ({ message })),
    sendPersonalMessageQueued: jest.fn().mockResolvedValue({ messageId: 'msg-1', response: { msgId: 'msg-1' }, quotaReservationId: 88 }),
    annotateZaloSendError: jest.fn((err) => err),
    extractZaloSendObservability: jest.fn((error) => ({ stage: 'send', message: String(error?.message || error || '').trim() })),
  },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: {
    findContentByIdForUser: jest.fn().mockResolvedValue({ id: 1, body_text: 'Xin chào', attachments: [] }),
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
    findExistingSentCampaignZaloMessageCrossRun: jest.fn().mockResolvedValue(null),
    insertCampaignZaloMessage: jest.fn().mockResolvedValue(1),
    markAbandonedIfStillQueued: jest.fn().mockResolvedValue(undefined),
    mergeZaloMessageTrackingMetadata: jest.fn().mockResolvedValue(undefined),
    withTransaction: jest.fn((callback) => callback({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
    linkQuotaReservation: jest.fn().mockResolvedValue(undefined),
    updateStatusByTrackingToken: jest.fn().mockResolvedValue(undefined),
    findExistingSentCampaignZaloMessage: jest.fn().mockResolvedValue(null),
    countFailedByRecipientAndError: jest.fn().mockResolvedValue(0),
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

// PR-9 (28/09) Việc 1 — pickFirstUsableZaloAccount() (dùng bởi send_zalo_personal nhiều tài
// khoản) gọi resourceIsLocked() thật nếu không mock — tránh chạm DB thật trong unit test
// (bài học "Unit chạm CSDL: xanh máy, đỏ CI").
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn().mockResolvedValue(false),
}));



// Ranh giới thật của bộ chạy kênh: nhật ký ccm — giả để không chạm DB (giữ chỗ hạn mức: xem quotaGate no-op ở beforeEach).
jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: {
    insertQueued: jest.fn().mockResolvedValue(501),
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    findExistingSentSameRun: jest.fn().mockResolvedValue(null),
    findExistingSentCrossRun: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: mockCheckAccountDailyLimit,
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');
const { createNoopChannelQuotaGate } = await import('../campaignChannelRunner.service.js');
const { __registerChannelForTest, __resetTestChannels, ChannelSendError } = await import('../campaignChannelRegistry.service.js');

function registerFakeChannel(key, sendOne, settings) {
  __registerChannelForTest({
    key,
    sendNodeSubtype: `send_${key}`,
    engine: 'adapter',
    continuousSupported: false,
    continuousReplay: false,
    quotaChannel: 'zalo',
    policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
    adapter: {
      checkReadiness: async () => {},
      resolveAccount: async () => ({ accountKey: 'acc-1', display: 'Acc 1' }),
      resolveRecipients: async ({ rows }) => rows.map((r) => ({ recipientKey: r.recipientKey, display: r.recipientKey, vars: {} })),
      sendOne,
      classifyError: (err) => (err instanceof ChannelSendError ? err.category : 'hard'),
      getAccountSendSettings: async () => settings,
    },
  });
}

function adapterNode(subtype) {
  return {
    id: 300,
    node_type: 'action',
    node_subtype: subtype,
    execution_order: 1,
    config: { recipientSource: 'manual', recipientKeys: ['111', '222'], steps: [{ message: 'hi' }] },
  };
}

describe('P4 — kênh adapter chạm trần gửi/ngày: hoãn node, không failed', () => {
  const resetAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

  beforeEach(() => {
    jest.clearAllMocks();
    campaignRunService.channelQuotaGate = createNoopChannelQuotaGate();
    mockFindCampaignById.mockResolvedValue({ id: 383, id_user: 10, status: 'active', flow_json: {} });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: false, limit: 2, currentCount: 2, resetAt });
  });

  afterEach(() => {
    __resetTestChannels();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('chạm trần -> patch run_metadata quotaDeferredUntil/Reason (plan_quota_account_daily_telegram), KHÔNG failRun, KHÔNG pause, KHÔNG gửi', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    registerFakeChannel('telegram', sendOne, { userDailySendLimit: 2, delayMinMs: null, delayMaxMs: null });
    mockFindNodesByCampaignId.mockResolvedValue([adapterNode('send_telegram')]);

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(sendOne).not.toHaveBeenCalled();
    const deferPatch = mockPatchRunMetadata.mock.calls.map(([, patch]) => patch).find((p) => p?.quotaDeferredReason);
    expect(deferPatch).toBeDefined();
    expect(deferPatch.quotaDeferredReason).toBe('plan_quota_account_daily_telegram');
    const untilMs = new Date(deferPatch.quotaDeferredUntil).getTime();
    expect(untilMs).toBeGreaterThan(Date.now() + 5 * 60 * 60 * 1000);
    expect(untilMs).toBeLessThanOrEqual(resetAt.getTime() + 1000);
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockCompleteRunWithError).not.toHaveBeenCalled();
    expect(mockPauseCampaignIfActive).not.toHaveBeenCalled();
    expect(mockNotifyCampaignRunFailed).not.toHaveBeenCalled();
    // Email chủ đi qua đường "tạm dừng vì hạn mức" (reason mang tiền tố plan_quota_account_daily).
    expect(mockNotifyQuotaPaused).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 383, reason: 'plan_quota_account_daily_telegram' })
    );
  });

  it('WhatsApp cùng cơ chế, reason mang tên kênh', async () => {
    registerFakeChannel('whatsapp', jest.fn(), { userDailySendLimit: 2, delayMinMs: null, delayMaxMs: null });
    mockFindNodesByCampaignId.mockResolvedValue([adapterNode('send_whatsapp')]);

    await campaignRunService.executeCampaign(383, 200, 10);

    const deferPatch = mockPatchRunMetadata.mock.calls.map(([, patch]) => patch).find((p) => p?.quotaDeferredReason);
    expect(deferPatch.quotaDeferredReason).toBe('plan_quota_account_daily_whatsapp');
    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('không đặt trần -> gửi bình thường, không hoãn', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    registerFakeChannel('telegram', sendOne, { userDailySendLimit: null, delayMinMs: null, delayMaxMs: null });
    mockFindNodesByCampaignId.mockResolvedValue([adapterNode('send_telegram')]);

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(sendOne).toHaveBeenCalledTimes(2);
    expect(mockCheckAccountDailyLimit).not.toHaveBeenCalled();
    expect(mockPatchRunMetadata.mock.calls.some(([, patch]) => patch?.quotaDeferredReason)).toBe(false);
  });
});
