import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockUpdateRunProgress = jest.fn().mockResolvedValue(null);
const mockUpdateCampaignLastRunStats = jest.fn().mockResolvedValue(null);
const mockSendGroupMessageQueued = jest.fn().mockResolvedValue({ success: true });
const mockInsertCampaignZaloMessage = jest.fn().mockResolvedValue(1);
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
        node_subtype: 'send_zalo_group',
        execution_order: 1,
        config: {
          zaloAccountId: 99,
          zaloGroupSource: 'manual',
          zaloGroupIds: 'group_quiet_hours',
          zaloGroupMessage: 'Khong duoc gui trong quiet hours',
          zaloGroupAttachments: [],
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
      displayName: 'Quiet-hours account',
    }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllGroupIdSet: jest.fn().mockResolvedValue(new Set(['group_quiet_hours'])),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token-must-not-be-used'),
    sendGroupMessageQueued: mockSendGroupMessageQueued,
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
    insertCampaignZaloMessage: mockInsertCampaignZaloMessage,
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-05T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRun Zalo policy -> atomic reservation boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 23:30 ngày 04/09 ở Việt Nam: nằm trong quiet hours mặc định 23:00-06:00.
    jest.setSystemTime(new Date('2026-09-04T16:30:00.000Z'));
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_START_SAFE = 23;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_QUIET_HOURS_END_SAFE = 6;
    campaignRunService.zaloRateLimiter.ZALO_OUTBOUND_YIELD_SLOT_MIN_WAIT_MS = 60_000;
    campaignRunService.zaloRateLimiter.zaloOutboundRateLimitState.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('quiet-hours defer ghi moc resume va dung truoc worker/reservation boundary', async () => {
    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockCheckSendQuota).toHaveBeenCalledWith({ userId: 10, channel: 'zalo' });
    expect(mockPatchRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        zaloDeferredReason: 'quiet_hours',
        zaloOutboundDeferredUntil: '2026-09-04T23:00:00.000Z',
      })
    );

    // sendGroupMessageQueued() sở hữu final reservation boundary của campaign Zalo.
    // Không bước qua hàm này nghĩa là quiet-hours không tạo reservation sớm.
    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
    expect(mockInsertCampaignZaloMessage).not.toHaveBeenCalled();
    expect(mockFinalizeRun).not.toHaveBeenCalled();
    expect(mockFailRun).not.toHaveBeenCalled();
  });
});
