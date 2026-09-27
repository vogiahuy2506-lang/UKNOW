import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-6 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) Việc 3 — engine: SMTP lỗi tạm thời TRƯỚC DATA
// (errorType 'smtp_transient_retry_scheduled') phải hẹn thử lại qua ledger như rate-limit, KHÔNG
// đếm failed, KHÔNG đóng băng campaign 12h (markCampaignPausedByEmailRateLimit /
// pauseCampaignForRateLimit chỉ dành riêng cho nhánh rate-limit).
// Khuôn mock lấy từ campaignRunEmailCounterInvariantPr2.spec.js, thêm mockCountPendingDue có thể
// điều khiển để có thể quan sát "run không được đánh dấu completed" qua đối số 2 của finalizeRun
// (hasPendingRecipientDue && !isContinuousMode) — bản mock all-zero mặc định của file kia không
// bao giờ bật cờ này nên không phù hợp để ghim hành vi đó.

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
  default: { insertCampaignZaloMessage: jest.fn().mockResolvedValue(1) },
}));

jest.unstable_mockModule('../../../repositories/email/emailSettings.repository.js', () => ({
  default: {
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

function buildRunRow({ runId = 200, totalRecipients = 0, successfulSends = 0, failedSends = 0, skippedSends = 0 } = {}) {
  return {
    id: runId,
    status: 'running',
    total_recipients: totalRecipients,
    successful_sends: successfulSends,
    failed_sends: failedSends,
    skipped_sends: skippedSends,
    run_metadata: { source: 'campaign_run' },
  };
}

const EMAIL_NODE_3_PEOPLE = {
  id: 300,
  node_type: 'action',
  node_subtype: 'send_email',
  execution_order: 1,
  config: {
    recipientSource: 'manual',
    recipientEmails: 'a@example.com, b@example.com, c@example.com',
    fromEmailId: 10,
    emailTemplateId: 1,
  },
};

describe('PR-6 engine — SMTP lỗi tạm thời TRƯỚC DATA: retry qua ledger, không pause 12h', () => {
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

  it('one-shot 3 người, người 2 transient → ledger người 2 có nextDueAt+retryCount, failedSends=0, người 1/3 gửi bình thường, run KHÔNG completed, KHÔNG pause 12h', async () => {
    const ledger = new Map();
    mockGetRunForExecution.mockResolvedValue(buildRunRow({}));
    mockFindNodesByCampaignId.mockResolvedValue([EMAIL_NODE_3_PEOPLE]);
    mockGetRecipientProgress.mockImplementation(({ recipientKey }) => (
      Promise.resolve(ledger.get(recipientKey) || null)
    ));
    mockUpsertRecipientProgress.mockImplementation(async (input) => {
      const prev = ledger.get(input.recipientKey);
      if (prev?.is_fully_completed) return prev;
      const row = {
        last_completed_step: input.completedStep,
        is_fully_completed: input.isFullyCompleted,
        meta: { ...(prev?.meta || {}), ...input.metaPayload },
        updated_at: new Date().toISOString(),
        updated_at_epoch_us: String(Date.now() * 1000),
      };
      ledger.set(input.recipientKey, row);
      return row;
    });
    const transientRetryScheduledAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    mockSendEmailToCustomer.mockImplementation((runtimeNode, customer) => {
      if (customer?.email === 'b@example.com') {
        return Promise.resolve({
          status: 'failed',
          errorType: 'smtp_transient_retry_scheduled',
          error: 'Máy chủ email tạm thời không nhận kết nối; sẽ thử lại sau 15 phút (lần 1/5).',
          retryScheduledAt: transientRetryScheduledAt,
          retryAttemptCount: 1,
          providerResponse: 'Invalid greeting. response=421 too many connections',
          providerResponseCode: 421,
          settingId: 10,
        });
      }
      return Promise.resolve({ status: 'success' });
    });
    // Mô phỏng syncPendingEmailRetryFromLedger() (R:3002) đọc lại ledger THẬT sau vòng gửi và
    // thấy dòng "b" còn pending với next_due_at tương lai.
    mockCountPendingDue.mockResolvedValue({
      pending_count: 1,
      pending_without_future_due: 0,
      pending_with_retry_meta: 1,
      next_due_at: transientRetryScheduledAt,
    });

    await campaignRunService.executeCampaign(100, 200, 10);

    expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(3);

    const bWrite = ledger.get('b@example.com');
    expect(bWrite.is_fully_completed).toBe(false);
    // Ghi lại đúng mốc, chỉ đổi định dạng hiển thị (normalizeRetryScheduledAt → giờ VN +07:00) —
    // so bằng timestamp thay vì so chuỗi nguyên văn.
    expect(Date.parse(bWrite.meta.nextDueAt)).toBe(Date.parse(transientRetryScheduledAt));
    expect(bWrite.meta.retryCount).toBe(1);

    // Bất biến PR-2: failedSends=0 (còn hẹn thử lại), successfulSends=2 (a, c gửi bình thường).
    expect(mockFinalizeRun).toHaveBeenCalledWith(
      200,
      true, // hasPendingRecipientDue && !isContinuousMode → KHÔNG được đánh dấu completed
      expect.objectContaining({ totalRecipients: 3, successfulSends: 2, failedSends: 0, skippedSends: 0 }),
      expect.anything()
    );

    // KHÔNG có mốc pause 12h — markCampaignPausedByEmailRateLimit chỉ patch các khoá emailRateLimit*.
    expect(mockPatchRunMetadata).not.toHaveBeenCalledWith(
      200,
      expect.objectContaining({ emailRateLimitAt: expect.anything() })
    );
  }, 15000);

  // markCampaignPausedByEmailRateLimit()/pauseCampaignForRateLimit chỉ có tác dụng quan sát được
  // ở CONTINUOUS mode (R:8618 `if (!isContinuousMode) break;` chạy TRƯỚC dòng log
  // pause_until_next_cycle R:8619 — nên với one-shot, gọi hàm này hay không đều vô hình, ca trên
  // không bắt được đột biến 3). Dựng riêng một chu kỳ continuous để bắt đúng dòng log đó.
  // Mốc đóng băng 12h (emailRateLimitPausedUntilMs) chỉ được đọc ở ĐẦU chu kỳ continuous KẾ TIẾP
  // (R:3246-3253). Dừng run ngay sau chu kỳ 1 thì đột biến "gọi markCampaignPausedByEmailRateLimit ở
  // nhánh transient" vẫn xanh — nên cho chạy sang chu kỳ 2: đúng thì chu kỳ 2 GỬI LẠI sau 15',
  // sai thì chu kỳ 2 đóng băng (log email_sender_cooldown, không gửi).
  it('continuous, transient error → chu kỳ kế tiếp gửi lại sau 15\', KHÔNG đóng băng 12h (email_sender_cooldown)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      mockGetRunForExecution.mockResolvedValue({
        id: 200,
        status: 'running',
        total_recipients: 0,
        successful_sends: 0,
        failed_sends: 0,
        skipped_sends: 0,
        run_metadata: { source: 'campaign_run', continuousMode: true },
      });
      mockFindNodesByCampaignId.mockResolvedValue([{
        id: 300,
        node_type: 'action',
        node_subtype: 'send_email',
        execution_order: 1,
        config: {
          recipientSource: 'manual',
          recipientEmails: 'solo@example.com',
          fromEmailId: 10,
          emailTemplateId: 1,
        },
      }]);
      let ledgerRow = null;
      mockGetRecipientProgress.mockImplementation(() => Promise.resolve(ledgerRow));
      mockUpsertRecipientProgress.mockImplementation(async (input) => {
        ledgerRow = {
          last_completed_step: input.completedStep,
          is_fully_completed: input.isFullyCompleted,
          meta: { ...(ledgerRow?.meta || {}), ...input.metaPayload },
          updated_at: new Date().toISOString(),
          updated_at_epoch_us: String(Date.now() * 1000),
        };
        return ledgerRow;
      });
      // Dừng run ngay khi đã gửi lại lần 2 (chu kỳ ngủ có jitter ±30% nên có thể thức trước mốc
      // hẹn vài chục giây — chu kỳ đó chưa tới hạn, không gửi; chu kỳ sau mới gửi).
      let sendCalls = 0;
      mockSendEmailToCustomer.mockImplementation(async () => {
        sendCalls += 1;
        if (sendCalls >= 2) mockGetRunStatus.mockResolvedValue('stopping');
        return transientResult();
      });
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

      let settled = false;
      const runPromise = campaignRunService.executeCampaign(100, 200, 10).finally(() => { settled = true; });
      // Tối đa ~2h giờ giả: đủ qua mốc hẹn 15' + jitter chu kỳ, dư xa dưới mốc đóng băng 12h.
      for (let i = 0; i < 240 && !settled; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await jest.advanceTimersByTimeAsync(30000);
      }
      if (!settled) {
        // Bị đóng băng 12h (đột biến) → không bao giờ gửi lần 2: dừng tay để test kết thúc rồi đỏ ở expect.
        mockGetRunStatus.mockResolvedValue('stopping');
        for (let i = 0; i < 20 && !settled; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await jest.advanceTimersByTimeAsync(30000);
        }
      }
      await runPromise;

      // Chu kỳ 2 đã gửi lại (lần 2) — bằng chứng không bị đóng băng.
      expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(2);
      const cooldownLogs = consoleLogSpy.mock.calls.filter(
        ([msg]) => String(msg || '').includes('email_sender_cooldown')
      );
      expect(cooldownLogs).toHaveLength(0);
    } finally {
      consoleLogSpy.mockRestore();
      jest.useRealTimers();
    }
  }, 15000);
});
