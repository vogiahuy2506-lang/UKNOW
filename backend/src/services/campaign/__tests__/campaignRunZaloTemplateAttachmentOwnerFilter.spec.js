import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-2 an ninh (nối tiếp c8cbd190) — Việc 1: campaignRun.service.js gọi
 * prepareZaloAttachmentSources cho attachment của template Zalo khi chạy chiến dịch nhưng
 * KHÔNG truyền ownerUserId → client chèn key `uploads/<workspace khác>/...` vào mẫu Zalo của
 * mình rồi chạy chiến dịch là đọc trộm được tệp của workspace khác (lỗ hổng gốc ghi trong
 * _internal, PR-2 chặn tại điểm ĐỌC còn lại này: campaignRun.service.js:~2918).
 *
 * Test này KHÔNG mock prepareZaloAttachmentSources thành no-op như các spec khác trong thư
 * mục — dùng một bản giả lập lại ĐÚNG cơ chế lọc thật (`campaignZaloSender.service.js` dòng
 * 421-433: bỏ key không bắt đầu `uploads/<ownerUserId>/`, console.warn, không lọc khi
 * ownerUserId rỗng — giữ tương thích ngược cho nơi gọi chưa có owner id) để khẳng định
 * HÀNH VI CUỐI CÙNG khi campaignRun.service.js gọi đúng, không chỉ tham số truyền vào.
 */

const mockFailRun = jest.fn().mockResolvedValue(null);
const mockSendGroupMessageQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockFindContentByIdForUser = jest.fn();
const mockGetAllGroupIdSet = jest.fn();

/**
 * Bản giả lập lại đúng cơ chế lọc owner thật của campaignZaloSender.service.js
 * (prepareZaloAttachmentSources): bỏ key không thuộc `uploads/<ownerUserId>/`, cảnh báo qua
 * console.warn, không tải file thật (test không cần nội dung buffer thật).
 */
const mockPrepareZaloAttachmentSources = jest.fn(async (attachments, options = {}) => {
  const source = Array.isArray(attachments) ? attachments : [];
  const ownerUserId = options?.ownerUserId || null;
  const outputs = [];
  for (const attachment of source) {
    const key = String(attachment?.key || '');
    if (ownerUserId && key && !key.startsWith(`uploads/${ownerUserId}/`)) {
      console.warn(`[Test-fake CampaignZaloSender] Bỏ qua attachment không thuộc workspace ${ownerUserId}: ${key}`);
      continue;
    }
    outputs.push({ data: Buffer.from('fake'), filename: key, metadata: { totalSize: 4 } });
  }
  return outputs;
});

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockResolvedValue({
      id: 210,
      status: 'running',
      total_recipients: 0,
      successful_sends: 0,
      failed_sends: 0,
      run_metadata: { source: 'campaign_run' },
    }),
    getRunStatus: jest.fn().mockResolvedValue('running'),
    patchRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: jest.fn().mockResolvedValue(null),
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
      workspace_owner_id: null,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: jest.fn().mockResolvedValue([
      {
        id: 700,
        node_type: 'action',
        node_subtype: 'send_zalo_group',
        execution_order: 1,
        config: {
          zaloAccountId: 88,
          zaloGroupSource: 'manual',
          zaloGroupIds: 'group_abc',
          zaloGroupTemplateSteps: [{ templateId: 1, templateMappings: [] }],
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

jest.unstable_mockModule('../../../repositories/zalo/zaloTemplate.repository.js', () => ({
  default: {
    findContentByIdForUser: mockFindContentByIdForUser,
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: jest.fn().mockResolvedValue({
      id: 88,
      userId: 10,
      displayName: 'Tài khoản nhóm',
    }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllGroupIdSet: mockGetAllGroupIdSet,
    createTrackingToken: jest.fn().mockReturnValue('tracking-token'),
    buildTrackedMessageText: jest.fn(({ message }) => String(message || '')),
    prepareZaloAttachmentSources: mockPrepareZaloAttachmentSources,
    sendGroupMessageQueued: mockSendGroupMessageQueued,
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
    upsertRecipientProgress: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: {
    insertCampaignZaloMessage: jest.fn().mockResolvedValue(1),
    markAbandonedIfStillQueued: jest.fn().mockResolvedValue(undefined),
    mergeZaloMessageTrackingMetadata: jest.fn().mockResolvedValue(undefined),
    withTransaction: jest.fn((callback) => callback({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
    linkQuotaReservation: jest.fn().mockResolvedValue(undefined),
    findExistingSentCampaignZaloMessage: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-14T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRun — attachment template Zalo chỉ lấy key thuộc đúng workspace chủ campaign', () => {
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-14T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockGetAllGroupIdSet.mockResolvedValue(new Set());
    mockSendGroupMessageQueued.mockResolvedValue({ response: null, quotaReservationId: 55 });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('mẫu chứa 1 key hợp lệ (chủ campaign id_user=10) + 1 key workspace khác → chỉ gửi tệp hợp lệ, có cảnh báo log', async () => {
    mockFindContentByIdForUser.mockResolvedValue({
      body_text: 'Ưu đãi hôm nay!',
      attachments: [
        { key: 'uploads/10/email_template/hop-le.pdf', originalName: 'hop-le.pdf' },
        { key: 'uploads/999/email_template/trom.pdf', originalName: 'trom.pdf' },
      ],
    });

    await campaignRunService.executeCampaign(383, 210, 10);

    expect(mockSendGroupMessageQueued).toHaveBeenCalledTimes(1);

    // Đúng ownerUserId được truyền xuống — campaign.workspace_owner_id (null ở đây) ||
    // campaign.id_user (10).
    expect(mockPrepareZaloAttachmentSources).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: 'uploads/10/email_template/hop-le.pdf' }),
        expect.objectContaining({ key: 'uploads/999/email_template/trom.pdf' }),
      ]),
      expect.objectContaining({ ownerUserId: 10 })
    );

    // Chỉ tệp hợp lệ được gửi đi — tệp workspace khác đã bị lọc trước khi tới provider.
    const sentAttachments = mockSendGroupMessageQueued.mock.calls[0][0].attachments;
    expect(sentAttachments).toHaveLength(1);
    expect(sentAttachments[0].filename).toBe('uploads/10/email_template/hop-le.pdf');

    // Có cảnh báo log cho tệp bị bỏ.
    const warnedWithLeak = warnSpy.mock.calls.some((args) =>
      String(args[0] || '').includes('uploads/999/email_template/trom.pdf')
    );
    expect(warnedWithLeak).toBe(true);

    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('mẫu chỉ có key hợp lệ → gửi đủ, không cảnh báo', async () => {
    mockFindContentByIdForUser.mockResolvedValue({
      body_text: 'Ưu đãi hôm nay!',
      attachments: [{ key: 'uploads/10/email_template/hop-le.pdf', originalName: 'hop-le.pdf' }],
    });

    await campaignRunService.executeCampaign(383, 210, 10);

    const sentAttachments = mockSendGroupMessageQueued.mock.calls[0][0].attachments;
    expect(sentAttachments).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
