import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-3 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — engine thật (_doExecuteCampaign qua
// executeCampaign()), repository/service phụ thuộc giả. Khuôn theo
// campaignRunEmailCounterInvariantPr2.spec.js.

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

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('PR-3 — failRun/notifyCampaignRunFailed đúng chỗ (catch tổng + pool Zalo không sẵn sàng)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindCampaignById.mockResolvedValue({
      id: 383, id_user: 10, status: 'active', flow_json: {},
    });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('catch tổng (lỗi không phân loại) → failRun + notifyCampaignRunFailed được gọi với source catch_all', async () => {
    mockFindNodesByCampaignId.mockRejectedValue(new Error('Đã có lỗi kiểm thử không phân loại'));

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockFailRun).toHaveBeenCalledWith(200, 'Đã có lỗi kiểm thử không phân loại');
    expect(mockCompleteRunWithError).not.toHaveBeenCalled();
    expect(mockNotifyCampaignRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 200,
        campaignId: 383,
        reason: 'Đã có lỗi kiểm thử không phân loại',
        source: 'catch_all',
      })
    );
  });

  it('pool Zalo không tài khoản nào sẵn sàng → failRun (KHÔNG completeRunWithError) + notify source zalo_pool_unavailable', async () => {
    mockFindNodesByCampaignId.mockResolvedValue([
      {
        id: 300,
        node_type: 'action',
        node_subtype: 'send_zalo_personal',
        execution_order: 1,
        config: {
          zaloPersonalMultiAccountEnabled: true,
          zaloPersonalAccountIds: ['acc-1'],
          zaloRecipientSource: 'manual',
          zaloRecipientPhones: '0900000001',
          zaloPersonalTemplateSteps: [{ stepIndex: 1, templateId: 1 }],
        },
      },
    ]);
    mockGetCampaignZaloAccount.mockResolvedValue({ id: 'acc-1', userId: 10, displayName: 'Acc 1' });
    // Duy nhất 1 tài khoản trong pool và tài khoản đó luôn "chưa sẵn sàng" → chạm ngay
    // ALL_ZALO_POOL_ACCOUNTS_UNAVAILABLE ở lần thử đầu tiên (xem campaignRun.service.js ~5257-5297).
    mockGetConnectedApiOrSyncStatus.mockRejectedValue(
      new Error('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng')
    );

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockCompleteRunWithError).not.toHaveBeenCalled();
    expect(mockFailRun).toHaveBeenCalledWith(
      200,
      expect.stringContaining('Tất cả tài khoản Zalo trong pool đều mất đăng nhập hoặc không sẵn sàng')
    );
    expect(mockNotifyCampaignRunFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 200,
        campaignId: 383,
        source: 'zalo_pool_unavailable',
      })
    );
  });

  // PR-9 (28/09) Việc 1 — trước đây pool [chết, sống] chết ngay ở bước giải tài khoản đại diện
  // (cứng multiAccountIds[0]) TRƯỚC KHI cơ chế xoay vòng pickMultiZaloPersonalAccount (đã có sẵn,
  // không đụng) có cơ hội chạy. Không recipient nào để tránh phải giả lập toàn bộ luồng gửi —
  // chỉ cần chứng minh bước giải tài khoản đại diện không còn chết ngay vì id đầu.
  it('pool [acc-1 chết, acc-2 sống] → thử cả hai id, KHÔNG failRun ngay ở bước giải tài khoản đại diện', async () => {
    mockFindNodesByCampaignId.mockResolvedValue([
      {
        id: 301,
        node_type: 'action',
        node_subtype: 'send_zalo_personal',
        execution_order: 1,
        config: {
          zaloPersonalMultiAccountEnabled: true,
          zaloPersonalAccountIds: ['acc-1', 'acc-2'],
          zaloRecipientSource: 'manual',
          zaloRecipientPhones: '',
          zaloPersonalTemplateSteps: [{ stepIndex: 1, templateId: 1 }],
        },
      },
    ]);
    mockGetCampaignZaloAccount.mockImplementation(async ({ accountId }) => {
      if (accountId === 'acc-1') {
        throw new Error('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng');
      }
      return { id: accountId, userId: 10, displayName: 'Acc 2' };
    });

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1' }));
    expect(mockGetCampaignZaloAccount).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-2' }));
    // KHÔNG bị failRun/notify ngay lúc giải tài khoản (khác hẳn test "pool không tài khoản nào
    // sẵn sàng" ở trên — ở đây acc-2 sống nên node phải qua được bước này).
    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockNotifyCampaignRunFailed).not.toHaveBeenCalled();
  });

  // PR-9 Việc 1 — select_zalo_account: R:3630 trước đây đánh dấu __zaloAccountSelected=true cho
  // PHẦN TỬ ĐẦU (index === 0) của pool, bất kể đó có phải tài khoản THẬT SỰ được chọn hay không.
  // Sau fix, phải đánh dấu đúng tài khoản pickFirstUsableZaloAccount đã chọn (id === 202, không
  // phải id đầu 201 vốn đã chết).
  it('select_zalo_account pool [201 chết, 202 sống] → đánh dấu __zaloAccountSelected đúng 202 (không phải phần tử đầu 201)', async () => {
    mockFindNodesByCampaignId.mockResolvedValue([
      {
        id: 400,
        node_type: 'action',
        node_subtype: 'select_zalo_account',
        execution_order: 1,
        config: {
          zaloPoolMultiAccountEnabled: true,
          zaloPoolAccountIds: ['201', '202'],
        },
      },
    ]);
    mockGetCampaignZaloAccount.mockImplementation(async ({ accountId }) => {
      if (accountId === '201') {
        throw new Error('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng');
      }
      return { id: accountId, userId: 10, displayName: `Acc ${accountId}` };
    });

    await campaignRunService.executeCampaign(383, 200, 10);

    expect(mockFailRun).not.toHaveBeenCalled();
    const logCall = mockLogExecutionNode.mock.calls.find((call) => call[0]?.node?.id === 400);
    expect(logCall).toBeDefined();
    const { items, meta } = logCall[0].executionData;
    expect(meta.accountId).toBe('202');
    expect(items.find((it) => it.id === '202').__zaloAccountSelected).toBe(true);
    expect(items.find((it) => it.id === '201').__zaloAccountSelected).toBe(false);
  });
});
