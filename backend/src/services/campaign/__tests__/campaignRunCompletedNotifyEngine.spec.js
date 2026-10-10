import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1 — engine thật (_doExecuteCampaign qua executeCampaign()), repository/service phụ thuộc
// giả. Khuôn theo campaignRunFailureNotifyEngine.spec.js. Kiểm chỗ NỐI: sau finalizeRun, "chiến dịch chạy xong" chỉ được phát khi
// finalizeRun trả đúng 'completed' (không phải running / null) và payload lấy đúng chủ + người kích hoạt + số liệu.

const mockFinalizeRun = jest.fn();
const mockGetRunForExecution = jest.fn();
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFindCampaignById = jest.fn();
const mockFindNodesByCampaignId = jest.fn();
const mockNotifyCampaignRunCompleted = jest.fn();
const mockGetCampaignZaloAccount = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: mockGetRunForExecution,
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: jest.fn().mockResolvedValue(null),
    mergeRunMetadata: jest.fn().mockResolvedValue(null),
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
    findCampaignById: mockFindCampaignById,
    findNodesByCampaignId: mockFindNodesByCampaignId,
    findConnectionsByCampaignId: jest.fn().mockResolvedValue([]),
    updateNodeExecutionOrder: jest.fn().mockResolvedValue(null),
    updateCampaignLastRunStats: jest.fn().mockResolvedValue(null),
    pauseCampaignIfActive: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../utils/campaignQuotaPauseNotify.util.js', () => ({
  QUOTA_DEFER_CLEAR_KEYS: ['quotaDeferredUntil', 'quotaDeferredReason', 'quotaDeferredAt', 'quotaPauseNotifiedAt'],
  notifyCampaignQuotaPaused: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue({ sent: true }),
  notifyCampaignRunFailed: jest.fn().mockResolvedValue({ sent: true }),
}));

// Giữ shouldNotifyRunCompleted THẬT (chính điều kiện cần kiểm), chỉ giả phần phát.
const realCompletedNotify = await import('../../../utils/campaignRunCompletedNotify.util.js');
jest.unstable_mockModule('../../../utils/campaignRunCompletedNotify.util.js', () => ({
  ...realCompletedNotify,
  notifyCampaignRunCompleted: mockNotifyCampaignRunCompleted,
}));

// Người kích hoạt khác chủ → engine kiểm tài khoản Zalo được giao qua DB (PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN G3). Giả bước kiểm
// này (không phải đối tượng của spec), giữ resolveRunTriggerUserId THẬT vì chính nó quyết định "người kích hoạt" ở chỗ nối.
const realZaloAccess = await import('../campaignZaloAccess.service.js');
jest.unstable_mockModule('../campaignZaloAccess.service.js', () => ({
  ...realZaloAccess,
  assertRunZaloAccountsAssigned: jest.fn().mockResolvedValue({ accessibleIds: null, restrictedActors: [] }),
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {
    flowJsonHasZaloPersonalMultiAccount: jest.fn().mockReturnValue(false),
    buildExecutionOrderMap: jest.fn((nodes) => new Map(nodes.map((node, index) => [String(node.id), index + 1]))),
    buildFlowNodeIdMap: jest.fn().mockReturnValue(new Map()),
    normalizeNodeReferenceConfig: jest.fn((config) => config),
    buildSchemaFromRows: jest.fn().mockReturnValue([]),
    parseEmailList: jest.fn(() => []),
  },
}));

jest.unstable_mockModule('../campaignNodeData.service.js', () => ({
  default: { getCustomersFromDataNode: jest.fn() },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: mockGetCampaignZaloAccount,
    getConnectedApiOrSyncStatus: jest.fn(),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-test'),
    resolveUidFromRecipient: jest.fn(),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    buildTrackedMessageText: jest.fn(async ({ message }) => ({ message })),
    sendPersonalMessageQueued: jest.fn(),
    annotateZaloSendError: jest.fn((err) => err),
    extractZaloSendObservability: jest.fn((error) => ({ stage: 'send', message: String(error?.message || error || '').trim() })),
  },
}));

jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: { findContentByIdForUser: jest.fn().mockResolvedValue({ id: 1, body_text: 'Xin chào', attachments: [] }) },
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

jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn().mockResolvedValue(false),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

// Node không người nhận: engine chạy thẳng tới finalizeRun mà không gửi gì (cùng khuôn ca "pool [acc-1 chết, acc-2 sống]" của
// campaignRunFailureNotifyEngine.spec.js). Bộ đếm của lượt lấy từ dòng getRunForExecution (như khi resume).
const IDLE_NODES = [
  {
    id: 301,
    node_type: 'action',
    node_subtype: 'send_zalo_personal',
    execution_order: 1,
    config: {
      zaloPersonalMultiAccountEnabled: true,
      zaloPersonalAccountIds: ['acc-1'],
      zaloRecipientSource: 'manual',
      zaloRecipientPhones: '',
      zaloPersonalTemplateSteps: [{ stepIndex: 1, templateId: 1 }],
    },
  },
];

describe('chiến dịch chạy xong — chỗ nối sau finalizeRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifyCampaignRunCompleted.mockResolvedValue({ inApp: 2, emailSent: 0, emailSkipped: 0, emailFailed: 0 });
    mockFindCampaignById.mockResolvedValue({
      id: 383, id_user: 11, workspace_owner_id: 10, campaign_name: 'Khuyến mãi tháng 10', status: 'active', flow_json: {},
    });
    mockFindNodesByCampaignId.mockResolvedValue(IDLE_NODES);
    mockGetCampaignZaloAccount.mockResolvedValue({ id: 'acc-1', userId: 10, displayName: 'Acc 1' });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockGetRunForExecution.mockResolvedValue({
      id: 200,
      status: 'running',
      total_recipients: 5,
      successful_sends: 4,
      failed_sends: 1,
      skipped_sends: 0,
      triggered_by: 77,
      schedule_created_by: null,
      run_metadata: { source: 'campaign_run' },
    });
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it("finalizeRun trả 'completed' → phát đúng MỘT thông báo: chủ workspace (không phải id_user), người kích hoạt, số liệu của lượt", async () => {
    mockFinalizeRun.mockResolvedValue({ status: 'completed' });

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockFinalizeRun).toHaveBeenCalledTimes(1);
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      false,
      { totalRecipients: 5, successfulSends: 4, failedSends: 1, skippedSends: 0 },
      null
    );
    expect(mockNotifyCampaignRunCompleted).toHaveBeenCalledTimes(1);
    expect(mockNotifyCampaignRunCompleted).toHaveBeenCalledWith({
      runId: 200,
      campaignId: 383,
      campaignName: 'Khuyến mãi tháng 10',
      ownerId: 10,
      triggeredBy: 77,
      totalRecipients: 5,
      successfulSends: 4,
      failedSends: 1,
      skippedSends: 0,
    });
    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('lượt theo lịch (triggered_by NULL): người kích hoạt = người tạo lịch trong run_metadata.triggeredBy', async () => {
    mockFinalizeRun.mockResolvedValue({ status: 'completed' });
    mockGetRunForExecution.mockResolvedValue({
      id: 200, status: 'running', total_recipients: 5, successful_sends: 5, failed_sends: 0, skipped_sends: 0,
      triggered_by: null, schedule_created_by: 33, run_metadata: { source: 'campaign_run', triggeredBy: 88 },
    });

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockNotifyCampaignRunCompleted).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 10, triggeredBy: 88 }));
  });

  it("finalizeRun trả 'running' (còn người nhận chờ thử lại) → KHÔNG phát", async () => {
    mockFinalizeRun.mockResolvedValue({ status: 'running' });

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockFinalizeRun).toHaveBeenCalledTimes(1);
    expect(mockNotifyCampaignRunCompleted).not.toHaveBeenCalled();
  });

  it('finalizeRun trả null (lượt đã bị dừng/huỷ nên UPDATE không chạm dòng nào) → KHÔNG phát', async () => {
    mockFinalizeRun.mockResolvedValue(null);

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockFinalizeRun).toHaveBeenCalledTimes(1);
    expect(mockNotifyCampaignRunCompleted).not.toHaveBeenCalled();
  });

  it('lượt không có người nhận và không gửi gì → KHÔNG phát dù completed', async () => {
    mockFinalizeRun.mockResolvedValue({ status: 'completed' });
    mockGetRunForExecution.mockResolvedValue({
      id: 200, status: 'running', total_recipients: 0, successful_sends: 0, failed_sends: 0, skipped_sends: 0,
      triggered_by: 77, schedule_created_by: null, run_metadata: { source: 'campaign_run' },
    });

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockNotifyCampaignRunCompleted).not.toHaveBeenCalled();
  });

  it('thông báo ném lỗi (reject) → engine KHÔNG ném, lượt chạy không bị đánh failed', async () => {
    mockFinalizeRun.mockResolvedValue({ status: 'completed' });
    mockNotifyCampaignRunCompleted.mockRejectedValue(new Error('dispatcher down'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(campaignRunService.executeCampaign(383, 200, 10)).resolves.toBeUndefined();

    expect(mockFailRun).not.toHaveBeenCalled();
  });
});
