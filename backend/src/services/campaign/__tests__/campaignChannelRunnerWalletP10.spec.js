/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — bộ chạy kênh adapter trừ VÍ top-up của kênh sau mỗi tin gửi xong ở đường legacy
 * (mode off/shadow, không có reservation): trước P10 tin Telegram/WhatsApp không hề trừ ví (đếm chung vào Zalo, cổng cho qua
 * khi ví còn số dư nhưng KHÔNG ghi debit) nên ví dùng mãi không hết. Reservation đang hoạt động (enforce) thì việc trừ ví do
 * consumeSendQuota lo — không trừ đôi.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockDebit = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: {
    insertQueued: jest.fn().mockResolvedValue(501),
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    findExistingSentSameRun: jest.fn().mockResolvedValue(null),
    findExistingSentCrossRun: jest.fn().mockResolvedValue(null),
  },
}));
jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));
jest.unstable_mockModule('../../quota/accountDailyLimit.service.js', () => ({
  checkAccountDailyLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.unstable_mockModule('../../payment/topupWallet.service.js', () => ({
  debitAdapterMessageIfNeeded: mockDebit,
  maybeDebitWalletForSend: jest.fn(),
  getWalletSnapshot: jest.fn(),
  hasWalletRemaining: jest.fn(),
  WALLET_ITEM_BY_CHANNEL: {},
  debitZaloPersonalInboxIfNeeded: jest.fn(),
  debitDirectEmailIfNeeded: jest.fn(),
}));

const { runAdapterSendNode, __resetPerHourWindowForTest } = await import('../campaignChannelRunner.service.js');

const noLedger = () => {
  const store = new Map();
  return {
    getRecipientProgress: async ({ recipientKey }) => store.get(recipientKey) || { updatedAt: null, lastCompletedStep: 0, firstSentAt: null },
    upsertRecipientProgress: async () => {},
    markRecipientStepCompleted: async (i) => { store.set(i.recipientKey, { updatedAt: 'x', lastCompletedStep: i.completedStep, firstSentAt: 'x' }); },
  };
};

function ctxFor(channel, quotaGate) {
  return {
    descriptor: {
      key: channel,
      quotaChannel: channel,
      policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
      adapter: {
        resolveAccount: async () => ({ accountKey: '12' }),
        resolveRecipients: async () => [{ recipientKey: '1', display: '1', vars: {} }, { recipientKey: '2', display: '2', vars: {} }],
        sendOne: jest.fn().mockResolvedValue({ messageId: 'm' }),
        classifyError: () => 'hard',
      },
    },
    runId: 1, campaignId: 2, userId: 30, workspaceOwnerId: 3, node: { id: 9 },
    config: { recipientSource: 'manual', steps: [{ message: 'hi' }] },
    nodeOutputs: {}, lastOutputItems: [],
    ensureRunStillRunning: async () => {},
    quotaGate,
    toHoChiMinhIso: () => '2026-09-30T10:00:00+07:00',
    ...noLedger(),
  };
}

const inactiveGate = () => ({
  reserve: jest.fn().mockResolvedValue({ reservationId: null, active: false }),
  consume: jest.fn(),
  release: jest.fn(),
});

describe('runAdapterSendNode — trừ ví top-up của kênh (P10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetPerHourWindowForTest();
    mockDebit.mockResolvedValue({ debited: true });
  });

  it.each(['telegram', 'whatsapp'])('%s: mỗi tin gửi xong (reservation không hoạt động) gọi trừ ví đúng kênh + id dòng nhật ký', async (channel) => {
    const result = await runAdapterSendNode(ctxFor(channel, inactiveGate()));
    expect(result.success).toBe(2);
    expect(mockDebit).toHaveBeenCalledTimes(2);
    expect(mockDebit).toHaveBeenCalledWith({ billingUserId: 30, channel, messageId: 501 });
  });

  it('reservation đang hoạt động (enforce) → KHÔNG trừ ví ở runner (consumeSendQuota lo), tránh trừ đôi', async () => {
    const gate = {
      reserve: jest.fn().mockResolvedValue({ reservationId: 88, active: true }),
      consume: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    await runAdapterSendNode(ctxFor('telegram', gate));
    expect(gate.consume).toHaveBeenCalledTimes(2);
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it('gửi thất bại → không trừ ví', async () => {
    const ctx = ctxFor('telegram', inactiveGate());
    ctx.descriptor.adapter.sendOne = jest.fn().mockRejectedValue(new Error('boom'));
    await runAdapterSendNode(ctx);
    expect(mockDebit).not.toHaveBeenCalled();
  });
});
