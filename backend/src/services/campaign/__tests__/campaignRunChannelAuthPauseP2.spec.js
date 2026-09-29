import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_TG_WA_DAY_DU_2026-09-29, P2 bước 3 — engine thật (executeCampaign), kênh adapter GIẢ đăng ký qua
// __registerChannelForTest: tài khoản gửi mất phiên (category 'auth') phải TẠM DỪNG chiến dịch + đóng sổ run
// 'failed' + báo chủ (đường _failRunAndNotify sẵn có), thay vì ném CHANNEL_AUTH trần như trước.
// Khuôn mock lấy từ campaignRunFailureNotifyEngine.spec.js.

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
    patchRunMetadata: jest.fn().mockResolvedValue(null),
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
  notifyCampaignQuotaPaused: jest.fn().mockResolvedValue({ sent: true }),
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

const { default: campaignRunService } = await import('../campaignRun.service.js');
const { createNoopChannelQuotaGate } = await import('../campaignChannelRunner.service.js');
const { __registerChannelForTest, __resetTestChannels, ChannelSendError } = await import('../campaignChannelRegistry.service.js');

function registerFakeChannel(key, sendOne) {
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

describe('P2 — kênh adapter mất phiên: tạm dừng chiến dịch + báo chủ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    campaignRunService.channelQuotaGate = createNoopChannelQuotaGate();
    mockFindCampaignById.mockResolvedValue({ id: 383, id_user: 10, status: 'active', flow_json: {} });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    __resetTestChannels();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('sendOne ném lỗi auth -> pauseCampaignIfActive + failRun (câu tiếng Việt nêu kênh) + notifyCampaignRunFailed source channel_account_unavailable', async () => {
    registerFakeChannel('telegram', jest.fn().mockRejectedValue(new ChannelSendError('auth', 'AUTH_KEY_UNREGISTERED')));
    mockFindNodesByCampaignId.mockResolvedValue([adapterNode('send_telegram')]);

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockPauseCampaignIfActive).toHaveBeenCalledWith(383);
    expect(mockFailRun).toHaveBeenCalledWith(
      200,
      expect.stringMatching(/Tài khoản Telegram đã mất phiên đăng nhập.*tạm dừng.*kích hoạt lại/)
    );
    expect(mockCompleteRunWithError).not.toHaveBeenCalled();
    expect(mockNotifyCampaignRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 200, campaignId: 383, source: 'channel_account_unavailable' })
    );
  });

  it('nhãn kênh theo descriptor: WhatsApp -> câu nói "WhatsApp"', async () => {
    registerFakeChannel('whatsapp', jest.fn().mockRejectedValue(new ChannelSendError('auth', 'Connection Closed')));
    mockFindNodesByCampaignId.mockResolvedValue([adapterNode('send_whatsapp')]);

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockPauseCampaignIfActive).toHaveBeenCalledWith(383);
    expect(mockFailRun).toHaveBeenCalledWith(200, expect.stringContaining('Tài khoản WhatsApp đã mất phiên đăng nhập'));
  });

  it('lỗi not_configured (hạ tầng chưa bật) KHÔNG tạm dừng chiến dịch — vẫn là run failed như cũ', async () => {
    registerFakeChannel('telegram', jest.fn().mockRejectedValue(new ChannelSendError('not_configured', 'gateway is not configured')));
    mockFindNodesByCampaignId.mockResolvedValue([adapterNode('send_telegram')]);

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockPauseCampaignIfActive).not.toHaveBeenCalled();
    expect(mockFailRun).toHaveBeenCalledWith(200, 'gateway is not configured');
    expect(mockNotifyCampaignRunFailed).toHaveBeenCalledWith(expect.objectContaining({ source: 'catch_all' }));
  });
});
