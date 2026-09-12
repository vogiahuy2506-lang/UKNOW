import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Lỗi tái diễn lần 3: {{Họ Tên}} không được nhận diện (TEMPLATE_VARIABLE_REGEX cũ), đi thẳng
 * nguyên văn tới khách. Việc 1 (commit trước) nới regex để nhận diện được. Bài test này chốt
 * lớp Việc 2 — "chặn cửa sập": DÙ vì lý do gì mà text cuối cùng còn "{{" (mapping trỏ nhầm cột,
 * biến ngoài mọi hình dạng regex nhận được...), chuỗi gửi tới provider Zalo group KHÔNG BAO GIỜ
 * chứa "{{" — đây là ca giữ cho lỗi không quay lại lần thứ tư.
 *
 * Test qua executeCampaign() thật, node send_zalo_group (một trong 5 điểm gửi Zalo đã áp
 * neutralizeUnresolvedTemplateVariables — xem campaignRun.service.js).
 */

const mockFailRun = jest.fn().mockResolvedValue(null);
const mockSendGroupMessageQueued = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockFindContentByIdForUser = jest.fn();
const mockGetAllGroupIdSet = jest.fn();

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
          // Template chứa {{Không Tồn Tại}} — biến không khớp được cột nào của node dữ liệu
          // (không có entry/row nào ở đây, chỉ manual group). deriveVariablesForText rơi về
          // giá trị trung tính RIÊNG bên trong nó, nhưng bài test này khẳng định lớp CHẶN CỬA
          // SẬP ở campaignRun.service.js cũng không để lọt "{{" ra provider, độc lập với đó.
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
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
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

describe('CampaignRun — chặn cửa sập: tin còn "{{" không được rời hệ thống (Zalo nhóm)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 09:00 ngày 14/09/2026 giờ Việt Nam — ngoài quiet hours (23:00-06:00).
    jest.setSystemTime(new Date('2026-09-14T02:00:00.000Z'));
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
    campaignRunService.zaloRateLimiter.zaloPersonalPhoneLookupCooldownUntil.clear();
    mockFindContentByIdForUser.mockResolvedValue({
      body_text: 'Ưu đãi đặc biệt cho {{Không Tồn Tại}} — xem ngay!',
      attachments: [],
    });
    mockGetAllGroupIdSet.mockResolvedValue(new Set());
    mockSendGroupMessageQueued.mockResolvedValue({ response: null, quotaReservationId: 55 });
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('template Zalo nhóm chứa {{Không Tồn Tại}} (không khớp cột nào) → chuỗi gửi tới provider KHÔNG chứa "{{"', async () => {
    await campaignRunService.executeCampaign(383, 210, 10);

    expect(mockSendGroupMessageQueued).toHaveBeenCalledTimes(1);
    const sentMessage = mockSendGroupMessageQueued.mock.calls[0][0].message;
    // Cốt lõi của ca này (đúng yêu cầu PR): KHÔNG được còn "{{"/"}}" — dù layer nào (auto-map
    // fallback có sẵn từ 01/09, hay lớp chặn cửa sập mới) làm việc thay biến, kết quả cuối phải
    // giống nhau ở điều kiện này. Không khẳng định khoảng trắng chính xác từng ký tự — auto-map
    // fallback (deriveVariablesForText) thay rỗng nhưng KHÔNG tự dọn khoảng trắng thừa, khác với
    // neutralizeUnresolvedTemplateVariables (chỉ dọn khi CHÍNH nó là nơi thay, xem test đơn vị
    // trong templateVariableAutoMap.util.spec.js).
    expect(sentMessage).not.toContain('{{');
    expect(sentMessage).not.toContain('}}');
    expect(sentMessage).toContain('Ưu đãi đặc biệt cho');
    expect(sentMessage).toContain('xem ngay!');
    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('template Zalo nhóm có biến TÊN không khớp cột nào ({{Họ Tên}}) → thay bằng "bạn", không throw, không chứa "{{"', async () => {
    mockFindContentByIdForUser.mockResolvedValue({
      body_text: 'Chào {{Họ Tên}}, ưu đãi hôm nay!',
      attachments: [],
    });

    await campaignRunService.executeCampaign(383, 210, 10);

    expect(mockSendGroupMessageQueued).toHaveBeenCalledTimes(1);
    const sentMessage = mockSendGroupMessageQueued.mock.calls[0][0].message;
    expect(sentMessage).toBe('Chào bạn, ưu đãi hôm nay!');
    expect(sentMessage).not.toContain('{{');
    expect(mockFailRun).not.toHaveBeenCalled();
  });

  it('template không có biến gì → không đổi một ký tự', async () => {
    mockFindContentByIdForUser.mockResolvedValue({
      body_text: 'Thông báo chung, không có biến nào cả.',
      attachments: [],
    });

    await campaignRunService.executeCampaign(383, 210, 10);

    const sentMessage = mockSendGroupMessageQueued.mock.calls[0][0].message;
    expect(sentMessage).toBe('Thông báo chung, không có biến nào cả.');
  });
});
