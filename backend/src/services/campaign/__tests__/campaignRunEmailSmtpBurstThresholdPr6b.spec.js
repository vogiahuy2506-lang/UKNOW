import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26, PR-6b — ca (c): ngưỡng qua env EMAIL_TRANSIENT_BURST_THRESHOLD.
// File RIÊNG (không chung với campaignRunEmailSmtpBurstPr6b.spec.js): this.EMAIL_TRANSIENT_BURST_THRESHOLD
// được đọc MỘT LẦN trong constructor lúc `export default new CampaignRunService()` chạy (module-load time)
// — đặt env SAU khi module đã import không đổi được giá trị đã đóng băng trong instance. Mỗi file test là
// một module registry riêng của Jest nên đặt env TRƯỚC dòng `await import(...)` ở đây là đủ.

process.env.EMAIL_TRANSIENT_BURST_THRESHOLD = '3';

const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockGetRunForExecution = jest.fn();
const mockGetRunStatus = jest.fn().mockResolvedValue('running');
const mockFindNodesByCampaignId = jest.fn();
const mockSendEmailToCustomer = jest.fn();
const mockGetRecipientProgress = jest.fn();
const mockUpsertRecipientProgress = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);
const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockCountPendingDue = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: mockGetRunForExecution,
    getRunStatus: mockGetRunStatus,
    patchRunMetadata: mockPatchRunMetadata,
    mergeRunMetadata: jest.fn().mockResolvedValue(null),
    clearDeferMetadataKeys: jest.fn().mockResolvedValue(null),
    updateRunProgress: jest.fn().mockResolvedValue(null),
    finalizeRun: mockFinalizeRun,
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
    findNodesByCampaignId: mockFindNodesByCampaignId,
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
    getRecipientProgress: mockGetRecipientProgress,
    upsertRecipientProgress: mockUpsertRecipientProgress,
    countPendingDue: mockCountPendingDue,
  },
}));

jest.unstable_mockModule('../../../repositories/campaign/zaloMessage.repository.js', () => ({
  default: { findExistingSentCampaignZaloMessageCrossRun: jest.fn().mockResolvedValue(null), insertCampaignZaloMessage: jest.fn().mockResolvedValue(1) },
}));

jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: {
    findExistingSentCampaignEmailCrossRun: jest.fn().mockResolvedValue(null),
    findExistingSentCampaignEmail: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

function buildRunRow({ runId = 200 } = {}) {
  return {
    id: runId,
    status: 'running',
    total_recipients: 0,
    successful_sends: 0,
    failed_sends: 0,
    skipped_sends: 0,
    run_metadata: { source: 'campaign_run' },
  };
}

function buildEmailNode(recipientEmails) {
  return {
    id: 300,
    node_type: 'action',
    node_subtype: 'send_email',
    execution_order: 1,
    config: {
      recipientSource: 'manual',
      recipientEmails: recipientEmails.join(', '),
      fromEmailId: 10,
      emailTemplateId: 1,
    },
  };
}

const transientResult = () => ({
  status: 'failed',
  errorType: 'smtp_transient_retry_scheduled',
  error: 'Máy chủ email tạm thời không nhận kết nối; sẽ thử lại sau 15 phút (lần 1/5).',
  retryScheduledAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  retryAttemptCount: 1,
  providerResponse: 'Invalid greeting. response=421 too many connections',
  providerResponseCode: 421,
  settingId: 10,
});

describe('PR-6b engine — ca (c) ngưỡng qua env EMAIL_TRANSIENT_BURST_THRESHOLD=3', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRunStatus.mockResolvedValue('running');
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
    mockCountPendingDue.mockResolvedValue({
      pending_count: 0,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: null,
    });
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('ngưỡng env = 3 -> yield sau đúng 3 lần sendMail', async () => {
    expect(campaignRunService.EMAIL_TRANSIENT_BURST_THRESHOLD).toBe(3);

    const emails = Array.from({ length: 10 }, (_, i) => `p${i + 1}@example.com`);
    mockGetRunForExecution.mockResolvedValue(buildRunRow({}));
    mockFindNodesByCampaignId.mockResolvedValue([buildEmailNode(emails)]);
    const ledger = new Map();
    mockGetRecipientProgress.mockImplementation(({ recipientKey }) => (
      Promise.resolve(ledger.get(recipientKey) || null)
    ));
    mockUpsertRecipientProgress.mockImplementation(async (input) => {
      const row = {
        last_completed_step: input.completedStep,
        is_fully_completed: input.isFullyCompleted,
        meta: { ...(ledger.get(input.recipientKey)?.meta || {}), ...input.metaPayload },
        updated_at: new Date().toISOString(),
        updated_at_epoch_us: String(Date.now() * 1000),
      };
      ledger.set(input.recipientKey, row);
      return row;
    });
    mockSendEmailToCustomer.mockImplementation(() => Promise.resolve(transientResult()));

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(3);
    const deferCall = mockPatchRunMetadata.mock.calls.find(
      ([, patch]) => patch?.channelDeferredReason === 'smtp_transient_burst'
    );
    expect(deferCall).toBeTruthy();
    expect(deferCall[1].channelDeferredChannel).toBe('email');
  }, 15000);
});
