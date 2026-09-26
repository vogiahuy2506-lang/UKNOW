import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-2 (PLAN_ON_DINH_GUI_CHIEN_DICH_2026-09-26) — bất biến bộ đếm run:
// total_recipients = số người-bước đưa vào MỘT LẦN cho cả đời run (không phình khi resume);
// successful/failed/skipped = KẾT CỤC CUỐI (đang chờ thử lại thì chưa tính).

const mockFinalizeRun = jest.fn().mockResolvedValue(null);
const mockGetRunForExecution = jest.fn();
const mockGetRunStatus = jest.fn().mockResolvedValue('running');
const mockFindNodesByCampaignId = jest.fn();
const mockSendEmailToCustomer = jest.fn();
const mockGetRecipientProgress = jest.fn();
const mockUpsertRecipientProgress = jest.fn();
const mockCheckSendQuota = jest.fn().mockResolvedValue({ allowed: true });
const mockLogExecutionNode = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    getRunMetadata: jest.fn().mockResolvedValue({}),
    getRunForExecution: mockGetRunForExecution,
    getRunStatus: mockGetRunStatus,
    patchRunMetadata: jest.fn().mockResolvedValue(null),
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

function buildRunRow({
  runId = 200,
  totalRecipients = 0,
  successfulSends = 0,
  failedSends = 0,
  skippedSends = 0,
  continuousMode = false,
} = {}) {
  return {
    id: runId,
    status: 'running',
    total_recipients: totalRecipients,
    successful_sends: successfulSends,
    failed_sends: failedSends,
    skipped_sends: skippedSends,
    run_metadata: continuousMode
      ? { source: 'campaign_run', continuousMode: true }
      : { source: 'campaign_run' },
  };
}

const EMAIL_MULTISTEP_NODE = {
  id: 300,
  node_type: 'action',
  node_subtype: 'send_email',
  execution_order: 1,
  config: {
    recipientSource: 'manual',
    recipientEmails: 'a@example.com, b@example.com, c@example.com',
    fromEmailId: 10,
    emailSteps: [
      { stepIndex: 1, templateId: 1 },
      { stepIndex: 2, templateId: 2 },
    ],
  },
};

function buildSingleStepEmailNode(email) {
  return {
    id: 300,
    node_type: 'action',
    node_subtype: 'send_email',
    execution_order: 1,
    config: {
      recipientSource: 'manual',
      recipientEmails: email,
      fromEmailId: 10,
      emailTemplateId: 1,
    },
  };
}

async function runOneCycle() {
  const runPromise = campaignRunService.executeCampaign(100, 200, 10);
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await jest.advanceTimersByTimeAsync(5000);
  }
  return runPromise;
}

describe('PR-2 — bộ đếm run: total chỉ cộng lần đầu thấy người-bước, ok/failed/skipped là kết cục cuối', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRunStatus.mockResolvedValue('running');
    mockCheckSendQuota.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    campaignRunService.activeRunIds.clear();
    campaignRunService.continuousRunIds.clear();
  });

  describe('(a) resume không đếm lại total của người-bước đã hoàn tất', () => {
    it('lượt 1: 3 người x 2 bước, tất cả gửi thành công → total=6, ok=6, failed=0', async () => {
      // Ledger giả GIỮ trạng thái theo recipientKey trong nội bộ 1 lượt gọi — bắt buộc, vì
      // runEmailTemplateStep gọi getRecipientProgress lại cho MỖI bước; nếu mock tĩnh trả null mãi
      // mãi thì bước 2 vẫn tưởng "lần đầu thấy" và cộng total lần nữa (đã thấy sai: ra 12 thay vì 6).
      const ledger = new Map();
      mockGetRunForExecution.mockResolvedValue(buildRunRow({}));
      mockFindNodesByCampaignId.mockResolvedValue([EMAIL_MULTISTEP_NODE]);
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
      mockSendEmailToCustomer.mockResolvedValue({ status: 'success' });

      await campaignRunService.executeCampaign(100, 200, 10);

      expect(mockSendEmailToCustomer).toHaveBeenCalledTimes(6);
      expect(mockFinalizeRun).toHaveBeenCalledWith(
        200,
        false,
        expect.objectContaining({
          totalRecipients: 6, successfulSends: 6, failedSends: 0, skippedSends: 0,
        }),
        null
      );
    });

    it('lượt 2 (resume): DB đã có total=6/ok=6, cả 3 người đã fully-completed trong ledger → total vẫn 6, KHÔNG gửi lại', async () => {
      mockGetRunForExecution.mockResolvedValue(buildRunRow({ totalRecipients: 6, successfulSends: 6 }));
      mockFindNodesByCampaignId.mockResolvedValue([EMAIL_MULTISTEP_NODE]);
      mockGetRecipientProgress.mockResolvedValue({
        last_completed_step: 2,
        is_fully_completed: true,
        meta: {},
        updated_at: new Date('2026-09-12T02:00:00.000Z'),
        updated_at_epoch_us: String(Date.parse('2026-09-12T02:00:00.000Z') * 1000),
      });
      mockUpsertRecipientProgress.mockResolvedValue(null);

      await campaignRunService.executeCampaign(100, 200, 10);

      expect(mockSendEmailToCustomer).not.toHaveBeenCalled();
      expect(mockFinalizeRun).toHaveBeenCalledWith(
        200,
        false,
        expect.objectContaining({
          totalRecipients: 6, successfulSends: 6, failedSends: 0, skippedSends: 0,
        }),
        null
      );
    });
  });

  describe('(d) run đã có total_recipients=10 sẵn trong DB, lượt gọi mới không có người mới → total vẫn 10', () => {
    it('người nhận duy nhất đã fully-completed từ trước → total giữ nguyên 10', async () => {
      mockGetRunForExecution.mockResolvedValue(buildRunRow({ totalRecipients: 10, successfulSends: 10 }));
      mockFindNodesByCampaignId.mockResolvedValue([buildSingleStepEmailNode('already-done@example.com')]);
      mockGetRecipientProgress.mockResolvedValue({
        last_completed_step: 1,
        is_fully_completed: true,
        meta: {},
        updated_at: new Date('2026-09-12T02:00:00.000Z'),
        updated_at_epoch_us: String(Date.parse('2026-09-12T02:00:00.000Z') * 1000),
      });
      mockUpsertRecipientProgress.mockResolvedValue(null);

      await campaignRunService.executeCampaign(100, 200, 10);

      expect(mockSendEmailToCustomer).not.toHaveBeenCalled();
      expect(mockFinalizeRun).toHaveBeenCalledWith(
        200,
        false,
        expect.objectContaining({ totalRecipients: 10 }),
        null
      );
    });
  });

  describe('(c) continuous: trần thất bại — dưới trần không cộng failedSends, tới trần +1 và đánh dấu hoàn thành', () => {
    let ledgerRow;

    beforeEach(() => {
      ledgerRow = null;
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-12T02:00:00.000Z'));
      mockGetRunForExecution.mockResolvedValue(buildRunRow({ continuousMode: true }));
      mockFindNodesByCampaignId.mockResolvedValue([buildSingleStepEmailNode('fails-forever@example.com')]);
      mockGetRecipientProgress.mockImplementation(() => Promise.resolve(ledgerRow));
      mockUpsertRecipientProgress.mockImplementation(async (input) => {
        if (ledgerRow?.is_fully_completed) return ledgerRow; // meta đóng băng, giống repository thật
        ledgerRow = {
          last_completed_step: input.completedStep,
          is_fully_completed: input.isFullyCompleted,
          meta: { ...(ledgerRow?.meta || {}), ...input.metaPayload },
          updated_at: new Date().toISOString(),
          updated_at_epoch_us: String(Date.now() * 1000),
        };
        // Buộc vòng lặp continuous nội bộ dừng sau đúng 1 lần thử mỗi lượt gọi executeCampaign,
        // để mỗi lượt gọi trong test này tương ứng đúng 1 "chu kỳ continuous" độc lập — tránh phải
        // dựng lại toán chu kỳ/poll-interval thật của continuous scheduler bên trong 1 lần gọi.
        mockGetRunStatus.mockResolvedValue('stopping');
        return ledgerRow;
      });
      mockSendEmailToCustomer.mockRejectedValue(new Error('Lỗi mạng khi gửi email (continuous)'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // Run continuous bị dừng bằng cách đẩy getRunStatus() sang 'stopping' ngay sau lần thử đầu
    // tiên (xem upsertRecipientProgress ở trên) — ensureRunStillRunning() ném RUN_STOPPED, run
    // return sớm KHÔNG qua finalizeRun (finalizeRun chỉ nằm sau vòng while(true), continuous không
    // bao giờ `break` khỏi vòng đó bằng đường bình thường). Vì vậy đọc kết cục của MỖI chu kỳ qua
    // executionData.meta.failed mà logExecutionNode ghi ngay trong nhánh catch, KHÔNG qua finalizeRun.
    function lastFailedLogMeta() {
      const failedCalls = mockLogExecutionNode.mock.calls.filter(([arg]) => arg?.status === 'failed');
      const last = failedCalls[failedCalls.length - 1];
      return last?.[0]?.executionData?.meta;
    }

    it('4 chu kỳ đầu (dưới trần 5): failed=0 mỗi lượt; chu kỳ 5 chạm trần → failed=1 + đánh dấu hoàn thành', async () => {
      for (let cycle = 1; cycle <= 4; cycle += 1) {
        mockGetRunStatus.mockResolvedValue('running');
        // eslint-disable-next-line no-await-in-loop
        await runOneCycle();
        expect(lastFailedLogMeta()).toEqual(expect.objectContaining({ failed: 0, sent: 0 }));
        expect(ledgerRow?.meta?.emailSendFailureCount).toBe(cycle);
        expect(ledgerRow?.is_fully_completed).toBe(false);
      }

      mockGetRunStatus.mockResolvedValue('running');
      await runOneCycle();
      expect(ledgerRow?.meta?.emailSendFailureCount).toBe(5);
      expect(ledgerRow?.is_fully_completed).toBe(true);
      expect(ledgerRow?.meta?.emailAbandonReason).toBe('max_send_failures');
      expect(lastFailedLogMeta()).toEqual(expect.objectContaining({ failed: 1, sent: 0 }));

      // "Chu kỳ 6 không gửi lại người đó" (plan PR-2): ledgerRow.is_fully_completed=true ở đây
      // CHÍNH LÀ cờ mà nhánh continuous (không đổi bởi PR-2) dùng để bỏ qua recipient đã xong
      // (`if (progress.isFullyCompleted ...) return;`) — đã có bằng chứng riêng ở test (a) "lượt 2"
      // phía trên (ledger fully-completed từ trước → sendEmailToCustomer không được gọi lại). Không
      // lặp lại bằng một lượt executeCampaign() thứ 6 ở đây: khi recipient bị bỏ qua ngay từ đầu
      // (không gửi, không upsert), continuous không có cách nào ném RUN_STOPPED sớm — phải chờ hết
      // trọn chu kỳ poll thật (nhiều triệu ms) mới quay lại kiểm tra trạng thái, vượt xa ngân sách
      // pump timer hợp lý của 1 unit test (đã tái hiện: treo, Exceeded timeout of 20000 ms).
    }, 20000);

    // Review PR-2: bộ đếm lỗi email phải về 0 khi gửi thành công — cùng khuôn Zalo
    // (removeZaloFailureFromMeta: true ở mọi nhánh thành công). Thiếu cờ này thì email continuous nhiều
    // bước lỗi 4 lần ở bước 1 rồi thành công, sang bước 2 chỉ cần lỗi 1 lần là bị bỏ hẳn.
    it('lỗi 2 chu kỳ rồi thành công ở chu kỳ 3 → lần ghi thành công xoá bộ đếm lỗi email', async () => {
      for (let cycle = 1; cycle <= 2; cycle += 1) {
        mockGetRunStatus.mockResolvedValue('running');
        // eslint-disable-next-line no-await-in-loop
        await runOneCycle();
      }
      expect(ledgerRow?.meta?.emailSendFailureCount).toBe(2);

      mockSendEmailToCustomer.mockResolvedValue({ status: 'success' });
      mockGetRunStatus.mockResolvedValue('running');
      await runOneCycle();

      const upsertCalls = mockUpsertRecipientProgress.mock.calls.map(([input]) => input);
      const successWrite = upsertCalls[upsertCalls.length - 1];
      expect(successWrite.completedStep).toBe(1);
      expect(successWrite.removeEmailFailureFromMeta).toBe(true);
    }, 20000);
  });
});
