/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, PR-2 Việc 4 — giới hạn gửi/ngày do NGƯỜI DÙNG tự đặt cho
 * TÀI KHOẢN Zalo. Harness mô phỏng theo campaignRunZaloQuotaBoundary.spec.js (chiến dịch zalo_group,
 * executeCampaign() thật). Mock thẳng accountDailyLimit.service.js — không cần dựng lại DB đếm.
 *
 * Ca quan trọng nhất: `zaloAccountPolicyHint.userDailySendLimit` (nạp từ mapCampaignZaloAccount(),
 * KHÔNG tra thêm DB mỗi tin) được truyền đúng cho checkAccountDailyLimit; chạm giới hạn thì hoãn cả
 * run bằng persistQuotaDeferYieldSlot(reason: 'plan_quota_account_daily') — reason PHẢI có tiền tố
 * `plan_quota_`, nếu không notifyCampaignQuotaPaused() bỏ qua âm thầm không gửi mail cho chủ.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockSendGroupMessageQueued = jest.fn().mockResolvedValue({ success: true });
const mockInsertCampaignZaloMessage = jest.fn().mockResolvedValue(1);
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockCheckAccountDailyLimit = jest.fn().mockResolvedValue({ allowed: true });
const mockNotifyCampaignQuotaPaused = jest.fn().mockResolvedValue({ sent: true });

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
          zaloGroupIds: 'group_daily_limit',
          zaloGroupMessage: 'Kiem tra gioi han ngay',
          zaloGroupAttachments: [],
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

// Account model trả về ĐÃ map userDailySendLimit (mô phỏng mapCampaignZaloAccount() thật sau khi
// thêm cột user_daily_send_limit vào SELECT — spec riêng của repository/service đã phủ phần map).
let mockAccount = { id: 99, userId: 10, displayName: 'Account có giới hạn ngày' };
jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({
  default: {
    parseListText: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
    getCampaignZaloAccount: jest.fn(() => Promise.resolve(mockAccount)),
    getConnectedApiOrSyncStatus: jest.fn().mockResolvedValue({}),
    getAllGroupIdSet: jest.fn().mockResolvedValue(new Set(['group_daily_limit'])),
    prepareZaloAttachmentSources: jest.fn().mockResolvedValue([]),
    createTrackingToken: jest.fn().mockReturnValue('tracking-token'),
    buildTrackedMessageText: jest.fn((text) => text),
    sendGroupMessageQueued: mockSendGroupMessageQueued,
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({ default: {} }));
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
jest.unstable_mockModule('../campaignExecutionLog.service.js', () => ({
  default: { logExecutionNode: mockLogExecutionNode },
}));
jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: jest.fn().mockResolvedValue(null),
    countPendingDue: jest.fn().mockResolvedValue({
      pending_count: 0, pending_without_future_due: 0, pending_with_retry_meta: 0, next_due_at: null,
    }),
  },
}));
jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: {
    insertCampaignZaloMessage: mockInsertCampaignZaloMessage,
    mergeZaloMessageTrackingMetadata: jest.fn().mockResolvedValue(null),
    markAbandonedIfStillQueued: jest.fn().mockResolvedValue(null),
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
  notifyCampaignQuotaPaused: mockNotifyCampaignQuotaPaused,
  notifyCampaignQuotaStopped: jest.fn().mockResolvedValue({ sent: true }),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRun Zalo group — giới hạn gửi/ngày theo tài khoản (Việc 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 10:00 giờ VN — ngoài quiet hours, không bị chặn bởi lý do nào khác.
    jest.setSystemTime(new Date('2026-09-23T03:00:00.000Z'));
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: true });
    mockAccount = { id: 99, userId: 10, displayName: 'Account có giới hạn ngày' };
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

  it('chưa đặt giới hạn (userDailySendLimit undefined) → checkAccountDailyLimit gọi với limit=null, gửi bình thường', async () => {
    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockCheckAccountDailyLimit).toHaveBeenCalledWith({ channel: 'zalo', accountId: 99, limit: null });
    expect(mockSendGroupMessageQueued).toHaveBeenCalledTimes(1);
    expect(mockPatchRunMetadata).not.toHaveBeenCalledWith(200, expect.objectContaining({ quotaDeferredReason: expect.anything() }));
  });

  it('account model có userDailySendLimit → truyền đúng giá trị đó cho checkAccountDailyLimit', async () => {
    mockAccount = { id: 99, userId: 10, displayName: 'Account có giới hạn ngày', userDailySendLimit: 50 };

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockCheckAccountDailyLimit).toHaveBeenCalledWith({ channel: 'zalo', accountId: 99, limit: 50 });
  });

  it('đã chạm giới hạn → HOÃN CẢ RUN (không gửi), ghi quotaDeferredReason=plan_quota_account_daily, KHÔNG failRun', async () => {
    mockAccount = { id: 99, userId: 10, displayName: 'Account có giới hạn ngày', userDailySendLimit: 50 };
    const resetAt = new Date('2026-09-23T17:00:00.000Z'); // 00:00 VN hôm sau
    mockCheckAccountDailyLimit.mockResolvedValue({ allowed: false, limit: 50, currentCount: 50, resetAt });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
    expect(mockInsertCampaignZaloMessage).not.toHaveBeenCalled();
    expect(mockPatchRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        quotaDeferredReason: 'plan_quota_account_daily',
        quotaDeferredUntil: resetAt.toISOString(),
      })
    );
  });

  it('reason mang tiền tố plan_quota_ → notifyCampaignQuotaPaused KHÔNG bị isPlanQuotaReason() bỏ qua (chủ vẫn nhận được mail tạm dừng)', async () => {
    mockAccount = { id: 99, userId: 10, displayName: 'Account có giới hạn ngày', userDailySendLimit: 50 };
    mockCheckAccountDailyLimit.mockResolvedValue({
      allowed: false, limit: 50, currentCount: 50, resetAt: new Date('2026-09-23T17:00:00.000Z'),
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockNotifyCampaignQuotaPaused).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'plan_quota_account_daily' })
    );
  });

  // Việc 4 "hai cơ chế dùng chung một đường thoát" — với Zalo, assertSendQuotaOrYield('zalo') (hạn
  // mức GÓI) LUÔN chạy TRƯỚC enforceZaloOutboundPolicyBeforeSend ở cả 3 điểm gọi trong
  // campaignRun.service.js, nên gói hết hạn (resetAt=null) hard-stop ngay, không bao giờ tới lượt
  // checkAccountDailyLimit — khác thứ tự với email nên phải kiểm riêng bằng đúng code thật.
  it('gói hết hạn (checkSendQuota trả resetAt=null) → dừng hẳn TRƯỚC khi chạm tới giới hạn tài khoản; checkAccountDailyLimit KHÔNG được gọi', async () => {
    mockAccount = { id: 99, userId: 10, displayName: 'Account có giới hạn ngày', userDailySendLimit: 50 };
    mockCheckSendQuota.mockResolvedValue({ allowed: false, resetAt: null, limitType: 'expired', message: 'Gói dịch vụ đã hết hạn.' });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockCheckAccountDailyLimit).not.toHaveBeenCalled();
    expect(mockSendGroupMessageQueued).not.toHaveBeenCalled();
  });
});
