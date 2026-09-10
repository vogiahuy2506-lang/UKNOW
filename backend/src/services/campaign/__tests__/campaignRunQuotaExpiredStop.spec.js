import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-1 (PLAN_QUOTA_HET_HAN_DOT_DANH_SACH_2026-09-10.md, Việc 1): khi checkSendQuota trả
// resetAt: null (gói hết hạn/không có gói/bị khoá), assertSendQuotaOrYield phải đóng sổ run
// bằng failRun() TRƯỚC khi ném RUN_STOPPED — nếu không, 7 catch site theo từng người nhận chỉ
// log rồi return (không tự đóng sổ), run kẹt 'running' và scheduler resume lại, tái lập đúng
// vòng lặp "đếm thất bại rồi continue" đã đo trên production (run 374/381: 25.165 thất bại,
// 0 thành công, quét danh sách ở 5.908 lượt/giờ, xuyên khung giờ yên lặng).

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
          zaloGroupIds: 'group_quota_test',
          zaloGroupMessage: 'Noi dung khong quan trong o day',
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
      displayName: 'Quota-test account',
    }),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllGroupIdSet: jest.fn().mockResolvedValue(new Set(['group_quota_test'])),
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

describe('assertSendQuotaOrYield — loi quota het han/khong reset duoc phai dung run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Chi lam Date/Date.now gia; setTimeout thuc de sleepWithRunCheck cua nhanh
    // resetAt-gan-tuong-lai tu tro ve binh thuong ma khong can advance timer thu cong.
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    // 23:30 gio VN — trong khung gio yen lang 23:00-06:00, giong campaignRunZaloQuotaBoundary.spec.js.
    // Muc dich: sau khi assertSendQuotaOrYield tra ve binh thuong (case gan-tuong-lai), cong ke tiep
    // (enforceZaloOutboundPolicyBeforeSend) tu dung sach o quiet-hours THAY VI di tiep vao pipeline
    // gui That — tranh phai mock toan bo chuoi gui/ghi tracking-metadata/billing (khong lien quan
    // gi toi assertSendQuotaOrYield dang kiem o day). Voi resetAt:null / resetAt xa, quota gate tu
    // dung TRUOC khi cham toi cong nay nen quiet-hours khong anh huong toi hai case con lai.
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

  it('resetAt: null (goi het han) -> failRun() TRUOC khi dung, khong dem that bai roi chay tiep', async () => {
    mockCheckSendQuota.mockResolvedValue({
      allowed: false,
      resetAt: null,
      limitType: 'expired',
      message: 'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.',
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockFailRun).toHaveBeenCalledTimes(1);
    expect(mockFailRun).toHaveBeenCalledWith(
      200,
      'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.'
    );
    // Run phai dung o luot dau tien — khong duoc buoc toi gui/dem that bai roi sang so tiep theo.
    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
    expect(mockInsertCampaignZaloMessage).not.toHaveBeenCalled();
    // finalizeRun/updateRunProgress ghi failed_sends cho tung nguoi nhan roi continue — day la
    // dau hieu cu the cua bug: neu con goi thi nghia la van roi xuong nhanh dem-that-bai.
    expect(mockUpdateRunProgress).not.toHaveBeenCalled();
  });

  it('resetAt gan tuong lai (duoi nguong yield-slot) -> van sleep roi tiep tuc, KHONG failRun', async () => {
    mockCheckSendQuota.mockResolvedValue({
      allowed: false,
      resetAt: new Date(Date.now() + 20).toISOString(),
      limitType: 'per_hour',
      message: 'Đã đạt hạn mức gửi trong giờ.',
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockPatchRunMetadata).not.toHaveBeenCalledWith(
      200,
      expect.objectContaining({ quotaDeferredReason: expect.anything() })
    );
    // Bang chung assertSendQuotaOrYield da tra ve BINH THUONG (khong bi chan): cong ke tiep
    // (enforceZaloOutboundPolicyBeforeSend) chay toi va tu dung o quiet-hours — patch nay chi xay
    // ra neu code da vuot qua assertSendQuotaOrYield ma khong nem loi.
    expect(mockPatchRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ zaloDeferredReason: 'quiet_hours' })
    );
    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
  });

  it('resetAt xa hon nguong yield-slot -> persistQuotaDeferYieldSlot, KHONG failRun', async () => {
    mockCheckSendQuota.mockResolvedValue({
      allowed: false,
      resetAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      limitType: 'per_hour',
      message: 'Đã đạt hạn mức gửi trong giờ.',
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockPatchRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        quotaDeferredReason: 'plan_quota_per_hour',
        quotaDeferredUntil: expect.any(String),
      })
    );
    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
  });
});
