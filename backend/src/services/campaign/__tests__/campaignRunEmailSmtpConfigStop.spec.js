import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Bằng chứng production 07–08/09/2026: 2.464 email_messages status='failed' bounce_reason
// 'Invalid login: 535…' của tài khoản 39 trong một đợt — run đếm failedSends rồi lặp hết danh sách.
// campaignEmailSender.service.js:949 trả { status:'failed', errorType:'smtp_config' }.
// Khi errorType === 'smtp_config', campaignRun.service.js phải dừng run ngay lập tức:
// logExecutionNode failed với message 535, failRun(), và KHÔNG gửi cho người nhận kế tiếp.

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockUpdateRunProgress = jest.fn().mockResolvedValue(null);
const mockUpdateCampaignLastRunStats = jest.fn().mockResolvedValue(null);
const mockSendEmailToCustomer = jest.fn();
const mockFindExistingSentCampaignEmail = jest.fn().mockResolvedValue(null);
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
          recipientEmails: 'first@example.com, second@example.com, third@example.com',
          fromEmailId: 10,
          emailSubject: 'SMTP Test',
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
    logExecutionNode: mockLogExecutionNode,
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/recipientLedger.repository.js', () => ({
  default: {
    getRecipientProgress: jest.fn().mockResolvedValue(null),
    upsertRecipientProgress: jest.fn().mockResolvedValue(null),
    markStepCompleted: jest.fn().mockResolvedValue(null),
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

describe('kênh email — lỗi cấu hình SMTP (errorType: smtp_config) phải DỪNG run ngay lập tức', () => {
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

  it('người nhận đầu tiên trả smtp_config (535) → failRun(), KHÔNG gọi sendEmailToCustomer cho người thứ hai, execution log có message 535', async () => {
    const smtp535Error = 'Invalid login: 535 5.7.8 Username and Password not accepted';

    mockSendEmailToCustomer.mockResolvedValueOnce({
      to: 'first@example.com',
      status: 'failed',
      errorType: 'smtp_config',
      error: smtp535Error,
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    // 1. failRun được gọi đúng 1 lần với lý do lỗi chứa 535
    expect(mockFailRun).toHaveBeenCalledTimes(1);
    expect(mockFailRun).toHaveBeenCalledWith(200, smtp535Error);

    // 2. KHÔNG gọi sendEmailToCustomer cho người thứ hai / thứ ba (chỉ gọi 1 lần cho người đầu)
    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(1);

    // 3. Execution log ghi nhận status 'failed' với message chứa 535
    expect(mockLogExecutionNode).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 100,
        runId: 200,
        recipientEmail: 'first@example.com',
        status: 'failed',
        errorMessage: smtp535Error,
      })
    );
  });

  it('lỗi smtp_delivery (giao thư lỗi bình thường) → KHÔNG failRun, tiếp tục xử lý người nhận thứ hai', async () => {
    mockSendEmailToCustomer
      .mockResolvedValueOnce({
        to: 'first@example.com',
        status: 'failed',
        errorType: 'smtp_delivery',
        error: 'Mailbox full or temporarily unavailable',
      })
      .mockResolvedValueOnce({
        to: 'second@example.com',
        status: 'success',
      })
      .mockResolvedValueOnce({
        to: 'third@example.com',
        status: 'success',
      });

    await campaignRunService.executeCampaign(100, 200, 10);

    // Run KHÔNG bị fail
    expect(mockFailRun).not.toHaveBeenCalled();

    // Vẫn tiếp tục gọi gửi cho các người nhận tiếp theo
    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(3);
  });
});
