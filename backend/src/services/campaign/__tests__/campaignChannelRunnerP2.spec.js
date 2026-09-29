/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P2 bước 1-2 — bộ chạy kênh adapter: (1) bỏ khách TỪ CHỐI nhận tin (chỉ kênh có
 * recipientKey là SĐT — WhatsApp), (2) thử lại lỗi TẠM trong cùng lượt rồi mới bỏ cuộc, giữ bất biến
 * ok+failed+skipped <= total. Repository/service phụ thuộc giả (không chạm DB); giả ĐÚNG ranh giới: hàm nhận
 * (userId, phone) và trả boolean, như zaloCampaignRecipientService thật.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockInsertQueued = jest.fn();
const mockMarkSent = jest.fn();
const mockMarkFailed = jest.fn();
const mockConsentRefused = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: {
    insertQueued: mockInsertQueued,
    markSent: mockMarkSent,
    markFailed: mockMarkFailed,
    findExistingSentSameRun: jest.fn().mockResolvedValue(null),
    findExistingSentCrossRun: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: mockConsentRefused },
}));

const { runAdapterSendNode, createNoopChannelQuotaGate } = await import('../campaignChannelRunner.service.js');
const { ChannelSendError } = await import('../campaignChannelRegistry.service.js');

/** Ledger giả trong RAM, đúng hình dạng runner đọc: { updatedAt, lastCompletedStep, firstSentAt }. */
function buildLedger() {
  const store = new Map();
  const key = ({ recipientKey }) => recipientKey;
  const upserts = [];
  return {
    upserts,
    getRecipientProgress: async (input) => store.get(key(input)) || { updatedAt: null, lastCompletedStep: 0, firstSentAt: null },
    upsertRecipientProgress: async (input) => {
      upserts.push(input);
      store.set(key(input), { updatedAt: 'x', lastCompletedStep: input.completedStep, firstSentAt: input.firstSentAt || null });
    },
    markRecipientStepCompleted: async (input) => {
      store.set(key(input), { updatedAt: 'x', lastCompletedStep: input.completedStep, firstSentAt: 'x' });
    },
  };
}

function buildCtx({ recipients, sendOne, recipientIsPhone = true, steps = [{ message: 'hi' }] }) {
  const ledger = buildLedger();
  const ctx = {
    descriptor: {
      key: recipientIsPhone ? 'whatsapp' : 'telegram',
      quotaChannel: 'zalo',
      ...(recipientIsPhone ? { recipientIsPhone: true } : {}),
      policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
      adapter: {
        resolveAccount: async () => ({ accountKey: 'acc-1' }),
        resolveRecipients: async () => recipients,
        sendOne,
        classifyError: (err) => (err instanceof ChannelSendError ? err.category : 'hard'),
      },
    },
    runId: 1,
    campaignId: 2,
    userId: 30,
    workspaceOwnerId: 3,
    node: { id: 4152 },
    config: { recipientSource: 'manual', steps },
    nodeOutputs: {},
    lastOutputItems: [],
    ensureRunStillRunning: async () => {},
    quotaGate: createNoopChannelQuotaGate(),
    toHoChiMinhIso: () => '2026-09-29T10:00:00+07:00',
    ...ledger,
  };
  return { ctx, ledger };
}

const person = (phone) => ({ recipientKey: phone, display: phone, vars: {} });
const transientError = () => new ChannelSendError('transient', 'Timed Out');

describe('runAdapterSendNode — P2 khách từ chối nhận tin (WhatsApp)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsertQueued.mockResolvedValue(11);
    mockMarkSent.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockConsentRefused.mockResolvedValue(false);
  });

  it('kênh có recipientIsPhone: người từ chối bị bỏ (skipped mọi bước), người khác vẫn được gửi', async () => {
    mockConsentRefused.mockImplementation(async (_owner, phone) => phone === '84900000001');
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm1' });
    const { ctx, ledger } = buildCtx({
      recipients: [person('84900000001'), person('84900000002')],
      sendOne,
      steps: [{ message: 'a' }, { message: 'b' }],
    });

    const result = await runAdapterSendNode(ctx);

    expect(sendOne).toHaveBeenCalledTimes(2); // 2 bước của người thứ hai, KHÔNG có bước nào của người từ chối
    expect(sendOne.mock.calls.every(([arg]) => arg.recipientKey === '84900000002')).toBe(true);
    expect(result.total).toBe(4);
    expect(result.skipped).toBe(2); // toàn bộ 2 bước của người từ chối
    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.success + result.failed + result.skipped).toBeLessThanOrEqual(result.total);
    const skippedItem = result.outputItems.find((i) => i.recipientKey === '84900000001');
    expect(skippedItem).toEqual(expect.objectContaining({ status: 'skipped', skipReason: 'consent_refused' }));
    // Sổ người nhận: đóng người từ chối (completedStep = tổng bước) kèm lý do để resume KHÔNG gửi lại.
    const closing = ledger.upserts.find((u) => u.recipientKey === '84900000001' && u.lastFailureReason === 'consent_refused');
    expect(closing).toEqual(expect.objectContaining({ completedStep: 2, totalSteps: 2 }));
    // Không tạo dòng nhật ký gửi (ccm) cho người bị bỏ: chưa hề thử gửi.
    expect(mockInsertQueued.mock.calls.every(([arg]) => arg.recipientKey === '84900000002')).toBe(true);
  });

  it('tra khách theo CHỦ workspace (không phải nhân viên tạo chiến dịch) và SĐT chuẩn hoá của người nhận', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm1' });
    const { ctx } = buildCtx({ recipients: [person('84900000003')], sendOne });
    await runAdapterSendNode(ctx);
    expect(mockConsentRefused).toHaveBeenCalledWith(3, '84900000003');
  });

  it('NULL/chưa hỏi (service trả false) vẫn gửi — chốt 19/09', async () => {
    mockConsentRefused.mockResolvedValue(false);
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm1' });
    const { ctx } = buildCtx({ recipients: [person('84900000004')], sendOne });
    const result = await runAdapterSendNode(ctx);
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('kênh KHÔNG có recipientIsPhone (Telegram) — không tra consent, vẫn gửi', async () => {
    mockConsentRefused.mockResolvedValue(true); // nếu bị gọi nhầm sẽ bỏ người nhận
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm1' });
    const { ctx } = buildCtx({ recipients: [person('123456')], sendOne, recipientIsPhone: false });
    const result = await runAdapterSendNode(ctx);
    expect(mockConsentRefused).not.toHaveBeenCalled();
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(1);
  });
});

describe('runAdapterSendNode — P2 thử lại lỗi tạm (transient) trong lượt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CHANNEL_TRANSIENT_RETRY_MS = '0';
    delete process.env.CHANNEL_TRANSIENT_MAX_ATTEMPTS;
    let id = 100;
    mockInsertQueued.mockImplementation(async () => { id += 1; return id; });
    mockMarkSent.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockConsentRefused.mockResolvedValue(false);
  });

  afterEach(() => {
    delete process.env.CHANNEL_TRANSIENT_RETRY_MS;
    delete process.env.CHANNEL_TRANSIENT_MAX_ATTEMPTS;
  });

  it('lỗi tạm 2 lần rồi thành công ở lần 3 -> success 1, failed 0, không có outputItem failed', async () => {
    const sendOne = jest.fn()
      .mockRejectedValueOnce(transientError())
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce({ messageId: 'ok' });
    const { ctx } = buildCtx({ recipients: [person('84900000001')], sendOne });

    const result = await runAdapterSendNode(ctx);

    expect(sendOne).toHaveBeenCalledTimes(3);
    expect(result).toEqual(expect.objectContaining({ total: 1, success: 1, failed: 0, skipped: 0 }));
    expect(result.outputItems).toHaveLength(1);
    expect(result.outputItems[0].status).toBe('sent');
    // Hai lần thử hỏng ĐÃ được thử lại mang nhãn transient_retry (báo cáo lỗi sẽ không đếm chúng).
    expect(mockMarkFailed).toHaveBeenCalledTimes(2);
    expect(mockMarkFailed.mock.calls.every(([, arg]) => arg.errorCategory === 'transient_retry')).toBe(true);
  });

  it('lỗi tạm mãi: đúng 3 lần gọi rồi bỏ cuộc — failed +1 (KHÔNG +3), ghi số lần vào dòng cuối', async () => {
    const sendOne = jest.fn().mockRejectedValue(transientError());
    const { ctx, ledger } = buildCtx({ recipients: [person('84900000001'), person('84900000002')], sendOne });

    const result = await runAdapterSendNode(ctx);

    expect(sendOne).toHaveBeenCalledTimes(6); // 3 lần x 2 người
    expect(result.total).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.success + result.failed + result.skipped).toBeLessThanOrEqual(result.total);
    const failedItems = result.outputItems.filter((i) => i.status === 'failed');
    expect(failedItems).toHaveLength(2); // mỗi người MỘT outputItem, không phải mỗi lần thử một cái
    expect(failedItems[0]).toEqual(expect.objectContaining({ errorCategory: 'transient', attempts: 3 }));
    // Dòng nhật ký: 2 lần đầu transient_retry, lần cuối giữ 'transient' + tiền tố "[lần 3/3]".
    const firstPersonCalls = mockMarkFailed.mock.calls.slice(0, 3).map(([, arg]) => arg);
    expect(firstPersonCalls.map((a) => a.errorCategory)).toEqual(['transient_retry', 'transient_retry', 'transient']);
    expect(firstPersonCalls[2].errorMessage).toMatch(/^\[lần 3\/3\] /);
    // Người bỏ cuộc được đóng sổ (completedStep = tổng bước) để resume không gửi lại.
    expect(ledger.upserts.some((u) => u.recipientKey === '84900000001' && u.lastFailureReason === 'transient' && u.completedStep === 1)).toBe(true);
  });

  it('CHANNEL_TRANSIENT_MAX_ATTEMPTS=1 -> không thử lại (đúng 1 lần gọi)', async () => {
    process.env.CHANNEL_TRANSIENT_MAX_ATTEMPTS = '1';
    const sendOne = jest.fn().mockRejectedValue(transientError());
    const { ctx } = buildCtx({ recipients: [person('84900000001')], sendOne });
    const result = await runAdapterSendNode(ctx);
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
  });

  it('bộ đếm lần thử về 0 khi sang bước mới: bước 1 hỏng 2 lần rồi ok, bước 2 hỏng 2 lần rồi ok -> cả hai thành công', async () => {
    const sendOne = jest.fn()
      .mockRejectedValueOnce(transientError())
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce({ messageId: 's1' })
      .mockRejectedValueOnce(transientError())
      .mockRejectedValueOnce(transientError())
      .mockResolvedValueOnce({ messageId: 's2' });
    const { ctx } = buildCtx({
      recipients: [person('84900000001')],
      sendOne,
      steps: [{ message: 'a' }, { message: 'b' }],
    });
    const result = await runAdapterSendNode(ctx);
    expect(sendOne).toHaveBeenCalledTimes(6);
    expect(result).toEqual(expect.objectContaining({ total: 2, success: 2, failed: 0 }));
  });

  it('lỗi hard KHÔNG thử lại (1 lần gọi, failed 1)', async () => {
    const sendOne = jest.fn().mockRejectedValue(new ChannelSendError('hard', 'PEER_ID_INVALID'));
    const { ctx } = buildCtx({ recipients: [person('84900000001')], sendOne });
    const result = await runAdapterSendNode(ctx);
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
    expect(mockMarkFailed.mock.calls[0][1].errorCategory).toBe('hard');
  });

  it('lỗi auth KHÔNG thử lại: ném CHANNEL_AUTH kèm partialResult (engine sẽ tạm dừng chiến dịch)', async () => {
    const sendOne = jest.fn().mockRejectedValue(new ChannelSendError('auth', 'AUTH_KEY_UNREGISTERED'));
    const { ctx } = buildCtx({ recipients: [person('84900000001')], sendOne });
    const error = await runAdapterSendNode(ctx).then(() => null, (e) => e);
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(error.code).toBe('CHANNEL_AUTH');
    expect(error.partialResult).toEqual(expect.objectContaining({ total: 1, failed: 0 }));
  });
});
