import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockFailRun = jest.fn().mockResolvedValue(null);
const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockUpdateRunProgress = jest.fn().mockResolvedValue(null);
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });

const mockSendEmail = jest.fn().mockImplementation((actionNode, customer) => {
  return Promise.resolve({
    to: customer?.email || '',
    status: 'failed',
    errorType: 'smtp_rate_limited_retry_scheduled',
    providerResponse: '450 4.7.1 Daily user sending quota exceeded',
    providerResponseCode: 450,
    settingId: 10,
    retryScheduledAt: '2026-09-02T21:51:40.000Z',
    retryAttemptCount: 1,
  });
});

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: jest.fn().mockResolvedValue({
      id: 366,
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
      id: 338,
      id_user: 39,
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
          recipientEmails: 'user1@example.com, user2@example.com, user3@example.com',
          fromEmailId: 10,
          emailSubject: 'Thông báo',
          emailBody: '<p>Nội dung</p>',
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
    parseEmailList: jest.fn((value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)),
  },
}));

jest.unstable_mockModule('../campaignEmailSender.service.js', () => ({
  default: {
    sendEmailToCustomer: mockSendEmail,
    sendEmailToCustomerDirect: mockSendEmail,
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
    upsertRecipientProgress: jest.fn().mockResolvedValue(null),
    markRecipientStepCompleted: jest.fn().mockResolvedValue(null),
    countPendingDue: jest.fn().mockResolvedValue({
      pending_count: 0,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: null,
    }),
  },
}));

jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: {
    findExistingSentCampaignEmail: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  _clearQuotaCache: jest.fn(),
  checkSendQuota: mockCheckSendQuota,
  nextVnMidnight: jest.fn(() => new Date('2026-09-05T17:00:00.000Z')),
  nextVnMonthStart: jest.fn(() => new Date('2026-09-30T17:00:00.000Z')),
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('CampaignRun: ghi nhận metadata SMTP rate-limit đúng một lần duy nhất', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  it('ghi patchRunMetadata với emailRateLimitResponse đúng 1 lần dù có 3 recipient cùng bị rate limit', async () => {
    await campaignRunService.executeCampaign(338, 366, 39);

    // Xác nhận cả 3 recipient đều được xử lý qua sendEmailToCustomer
    expect(mockSendEmail).toHaveBeenCalledTimes(3);

    // Lọc các lần gọi patchRunMetadata chứa emailRateLimitResponse
    const rateLimitCalls = mockPatchRunMetadata.mock.calls
      .filter(([, patch]) => patch && 'emailRateLimitResponse' in patch);

    // Khẳng định chỉ ghi metadata đúng 1 lần, không lặp lại cho từng recipient
    expect(rateLimitCalls).toHaveLength(1);

    const [calledRunId, patchPayload] = rateLimitCalls[0];
    expect(calledRunId).toBe(366);

    // Nguyên văn phản hồi máy chủ SMTP, không phải câu tiếng Việt tự sinh
    expect(patchPayload.emailRateLimitResponse).toBe('450 4.7.1 Daily user sending quota exceeded');
    expect(patchPayload.emailRateLimitResponseCode).toBe(450);

    // Chỉ lưu tên miền, không lưu địa chỉ email đầy đủ (bẫy 6)
    expect(patchPayload.emailRateLimitRecipientDomain).toBe('example.com');
    expect(patchPayload.emailRateLimitRecipientDomain).not.toContain('@');
    expect(patchPayload.emailRateLimitRecipientDomain).not.toContain('user1');

    // Setting id của hộp thư bị chặn
    expect(patchPayload.emailRateLimitSettingId).toBe(10);
    expect(patchPayload.emailRateLimitAt).toBeTruthy();
  });
});
