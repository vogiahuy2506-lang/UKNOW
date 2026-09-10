import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-1b — phần mở rộng của PLAN_QUOTA_HET_HAN_DOT_DANH_SACH_2026-09-10.md, Việc 1: phép thử trên
// production (10/09) cho kênh email phát hiện PR-1 gốc chưa vá hết. Kênh email KHÔNG đi qua
// assertSendQuotaOrYield() — nó dùng reserveSendQuota() (campaignEmailSender.service.js:730-759),
// trả về { status:'failed', errorType:'plan_send_limit_exceeded', resetAt:null } thay vì ném lỗi
// có code. Chỗ đọc kết quả đó (campaignRun.service.js, nhánh isPlanQuotaExceeded) khi resetAt:null
// trước đây chỉ `failedSends += 1` rồi tiếp tục — bug giống hệt PR-1 gốc nhưng ở cơ chế khác, nên
// không được PR-1 gốc bắt. Đo thật trên production: gói hết hạn, campaign 3 người nhận → cả 3 đều
// bị đếm fail, run kết thúc 'completed', error_message rỗng — đúng triệu chứng bug cũ.

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockUpdateRunProgress = jest.fn().mockResolvedValue(null);
const mockUpdateCampaignLastRunStats = jest.fn().mockResolvedValue(null);
const mockSendEmailToCustomer = jest.fn();
const mockFindExistingSentCampaignEmail = jest.fn().mockResolvedValue(null);

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
      id: 100,
      id_user: 10,
      status: 'active',
      flow_json: {},
    }),
    findNodesByCampaignId: jest.fn().mockResolvedValue([
      {
        id: 300,
        node_type: 'action',
        node_subtype: 'send_email',
        execution_order: 1,
        config: {
          recipientSource: 'manual',
          recipientEmails: 'a@example.com, b@example.com, c@example.com',
          fromEmailId: 10,
          emailSubject: 'Quota test',
          emailBody: '<p>Test</p>',
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
    parseEmailList: jest.fn((text) => String(text || '')
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))),
  },
}));

jest.unstable_mockModule('../campaignZaloSender.service.js', () => ({ default: {} }));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({
  default: {
    sendEmailToCustomer: mockSendEmailToCustomer,
  },
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
  default: { insertCampaignZaloMessage: jest.fn().mockResolvedValue(1) },
}));

jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: {
    findExistingSentCampaignEmail: mockFindExistingSentCampaignEmail,
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  nextVnMidnight: jest.fn(() => new Date('2026-09-05T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('kênh email — lỗi quota resetAt:null phải DỪNG run, không đếm thất bại rồi chạy tiếp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindExistingSentCampaignEmail.mockResolvedValue(null);
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('resetAt: null (gói hết hạn) -> failRun() ngay ở người nhận đầu, KHÔNG gửi/đếm fail cho người sau', async () => {
    mockSendEmailToCustomer.mockResolvedValue({
      to: 'a@example.com',
      status: 'failed',
      errorType: 'plan_send_limit_exceeded',
      error: 'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.',
      resetAt: null,
      limitType: 'expired',
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockFailRun).toHaveBeenCalledTimes(1);
    expect(mockFailRun).toHaveBeenCalledWith(
      200,
      'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.'
    );
    // Bằng chứng cụ thể của bug đã đo trên production: gọi sendEmailToCustomer cho CẢ 3 người
    // nhận (đếm fail rồi tiếp tục) thay vì dừng ngay sau người đầu tiên.
    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(1);
  });

  it('resetAt có giá trị (hạn mức ngày/tháng, tự reset được) -> vẫn persistQuotaDeferYieldSlot như cũ, KHÔNG failRun', async () => {
    mockSendEmailToCustomer.mockResolvedValue({
      to: 'a@example.com',
      status: 'failed',
      errorType: 'plan_send_limit_exceeded',
      error: 'Đã đạt giới hạn gửi email trong ngày.',
      resetAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      limitType: 'daily',
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockFailRun).not.toHaveBeenCalled();
    expect(mockPatchRunMetadata).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        quotaDeferredReason: 'plan_quota_daily',
        quotaDeferredUntil: expect.any(String),
      })
    );
    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(1);
  });
});
