/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P4 — bộ chạy kênh adapter: (1) TRẦN GỬI/NGÀY do người dùng tự đặt cho tài khoản -> hoãn
 * CẢ NODE (lỗi CHANNEL_DAILY_LIMIT mang waitMs), KHÔNG đánh failed, KHÔNG gửi thêm; (2) ghi đè giãn cách theo tài khoản
 * đọc MỘT lần mỗi node và không bao giờ dưới sàn cứng. Giả ĐÚNG ranh giới: checkAccountDailyLimit trả
 * `{allowed:true}` | `{allowed:false, limit, currentCount, resetAt: Date}` như bản thật.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockInsertQueued = jest.fn();
const mockMarkSent = jest.fn();
const mockMarkFailed = jest.fn();
const mockCheckDailyLimit = jest.fn();

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
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));

jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: mockCheckDailyLimit,
}));

const { runAdapterSendNode, createNoopChannelQuotaGate, __resetPerHourWindowForTest } = await import('../campaignChannelRunner.service.js');
const { ChannelSendError } = await import('../campaignChannelRegistry.service.js');

function buildLedger() {
  const store = new Map();
  return {
    getRecipientProgress: async ({ recipientKey }) => store.get(recipientKey) || { updatedAt: null, lastCompletedStep: 0, firstSentAt: null },
    upsertRecipientProgress: async (input) => {
      store.set(input.recipientKey, { updatedAt: 'x', lastCompletedStep: input.completedStep, firstSentAt: input.firstSentAt || null });
    },
    markRecipientStepCompleted: async (input) => {
      store.set(input.recipientKey, { updatedAt: 'x', lastCompletedStep: input.completedStep, firstSentAt: 'x' });
    },
  };
}

function buildCtx({ recipients, sendOne, settings, key = 'telegram', policy }) {
  const getAccountSendSettings = jest.fn().mockResolvedValue(settings);
  const ctx = {
    descriptor: {
      key,
      quotaChannel: 'zalo',
      policy: policy || { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
      adapter: {
        resolveAccount: async () => ({ accountKey: '12' }),
        resolveRecipients: async () => recipients,
        sendOne,
        classifyError: (err) => (err instanceof ChannelSendError ? err.category : 'hard'),
        ...(settings === undefined ? {} : { getAccountSendSettings }),
      },
    },
    runId: 1,
    campaignId: 2,
    userId: 30,
    workspaceOwnerId: 3,
    node: { id: 4152 },
    config: { recipientSource: 'manual', steps: [{ message: 'hi' }] },
    nodeOutputs: {},
    lastOutputItems: [],
    ensureRunStillRunning: async () => {},
    quotaGate: createNoopChannelQuotaGate(),
    toHoChiMinhIso: () => '2026-09-29T10:00:00+07:00',
    ...buildLedger(),
  };
  return { ctx, getAccountSendSettings };
}

const person = (id) => ({ recipientKey: id, display: id, vars: {} });
const RESET_AT = () => new Date(Date.now() + 5 * 60 * 60 * 1000);

describe('runAdapterSendNode — P4 trần gửi/ngày theo tài khoản', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPerHourWindowForTest();
    mockInsertQueued.mockResolvedValue(11);
    mockMarkSent.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockCheckDailyLimit.mockResolvedValue({ allowed: true });
  });

  it('không đặt trần (limit NULL) -> KHÔNG gọi kiểm trần, gửi hết', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx } = buildCtx({
      recipients: [person('1'), person('2')],
      sendOne,
      settings: { userDailySendLimit: null, delayMinMs: null, delayMaxMs: null },
    });
    const result = await runAdapterSendNode(ctx);
    expect(mockCheckDailyLimit).not.toHaveBeenCalled();
    expect(result.success).toBe(2);
  });

  it('chạm trần giữa chừng -> hoãn CẢ NODE (CHANNEL_DAILY_LIMIT + waitMs), KHÔNG failed, KHÔNG gửi thêm', async () => {
    const resetAt = RESET_AT();
    mockCheckDailyLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValue({ allowed: false, limit: 2, currentCount: 2, resetAt });
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx } = buildCtx({
      recipients: [person('1'), person('2'), person('3'), person('4')],
      sendOne,
      settings: { userDailySendLimit: 2, delayMinMs: null, delayMaxMs: null },
    });

    const error = await runAdapterSendNode(ctx).catch((e) => e);

    expect(error.code).toBe('CHANNEL_DAILY_LIMIT');
    expect(error.waitMs).toBeGreaterThan(4 * 60 * 60 * 1000);
    expect(error.waitMs).toBeLessThanOrEqual(5 * 60 * 60 * 1000);
    expect(error.message).toMatch(/2 tin\/ngày do bạn đặt/);
    expect(sendOne).toHaveBeenCalledTimes(2); // KHÔNG gửi người thứ 3 khi đã chạm trần
    expect(error.partialResult.success).toBe(2);
    expect(error.partialResult.failed).toBe(0); // hoãn, không đốt danh sách
    expect(mockMarkFailed).not.toHaveBeenCalled();
    // Người thứ 3 ĐÃ vào sổ "lần đầu thấy" (total) nhưng chưa xong -> resume gửi lại đúng chỗ, không cộng total lần nữa.
    expect(error.partialResult.total).toBe(3);
    expect(error.partialResult.success + error.partialResult.failed + error.partialResult.skipped).toBeLessThanOrEqual(error.partialResult.total);
  });

  it('kiểm trần với ĐÚNG kênh, account_key và limit của tài khoản', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx } = buildCtx({
      recipients: [person('1')],
      sendOne,
      key: 'whatsapp',
      settings: { userDailySendLimit: 40, delayMinMs: null, delayMaxMs: null },
    });
    await runAdapterSendNode(ctx);
    expect(mockCheckDailyLimit).toHaveBeenCalledWith({ channel: 'whatsapp', accountId: '12', limit: 40 });
  });

  it('cấu hình tài khoản đọc MỘT lần mỗi node (không mỗi người nhận), với chủ workspace', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx, getAccountSendSettings } = buildCtx({
      recipients: [person('1'), person('2'), person('3')],
      sendOne,
      settings: { userDailySendLimit: 100, delayMinMs: null, delayMaxMs: null },
    });
    await runAdapterSendNode(ctx);
    expect(getAccountSendSettings).toHaveBeenCalledTimes(1);
    expect(getAccountSendSettings).toHaveBeenCalledWith({ account: { accountKey: '12' }, workspaceOwnerId: 3 });
  });

  it('adapter không có hook cấu hình (kênh thử nghiệm) -> chạy như cũ, không kiểm trần', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx } = buildCtx({ recipients: [person('1')], sendOne, settings: undefined });
    const result = await runAdapterSendNode(ctx);
    expect(result.success).toBe(1);
    expect(mockCheckDailyLimit).not.toHaveBeenCalled();
  });
});

describe('runAdapterSendNode — P4 ghi đè giãn cách theo tài khoản', () => {
  let delays;
  let setTimeoutSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetPerHourWindowForTest();
    mockInsertQueued.mockResolvedValue(11);
    mockMarkSent.mockResolvedValue(undefined);
    mockCheckDailyLimit.mockResolvedValue({ allowed: true });
    delays = [];
    // Ngủ giả: ghi số ms rồi chạy callback ngay (không đợi thật).
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
      delays.push(ms);
      fn();
      return 0;
    });
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
  });

  it('không ghi đè -> giãn cách theo policy env của kênh', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx } = buildCtx({
      recipients: [person('1'), person('2')],
      sendOne,
      settings: { userDailySendLimit: null, delayMinMs: null, delayMaxMs: null },
      policy: { minDelayMs: 7_000, maxDelayMs: 7_000, perHourLimit: 0, quietHours: null },
    });
    await runAdapterSendNode(ctx);
    expect(delays).toContain(7_000);
  });

  it('ghi đè 3–6s (mức fast WhatsApp/very_fast) -> giãn cách nằm trong 3000..6000, không phải mức env', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx } = buildCtx({
      recipients: [person('1'), person('2')],
      sendOne,
      key: 'whatsapp',
      settings: { userDailySendLimit: null, delayMinMs: 3_000, delayMaxMs: 6_000 },
      policy: { minDelayMs: 20_000, maxDelayMs: 20_000, perHourLimit: 0, quietHours: null },
    });
    await runAdapterSendNode(ctx);
    const delay = delays.find((ms) => ms >= 1_000);
    expect(delay).toBeGreaterThanOrEqual(3_000);
    expect(delay).toBeLessThanOrEqual(6_000);
  });

  it('ghi đè dưới sàn (đặt tay 0–500ms) -> kẹp lên sàn cứng Telegram 2000ms — ca sàn', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const { ctx } = buildCtx({
      recipients: [person('1'), person('2')],
      sendOne,
      key: 'telegram',
      settings: { userDailySendLimit: null, delayMinMs: 0, delayMaxMs: 500 },
      policy: { minDelayMs: 9_000, maxDelayMs: 9_000, perHourLimit: 0, quietHours: null },
    });
    await runAdapterSendNode(ctx);
    expect(delays).toContain(2_000);
    expect(delays.every((ms) => ms === 2_000)).toBe(true);
  });
});
