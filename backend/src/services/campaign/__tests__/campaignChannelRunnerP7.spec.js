/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P7 — bộ chạy kênh adapter: nhiều bước có độ trễ giữa các bước.
 * Bước k >= 2 chưa đến hạn (lastCompletedAt + delay) -> KHÔNG gửi, ghi `nextDueAt`, outputItems 'waiting',
 * `nextDueAtMs` = mốc sớm nhất; đến hạn (lượt sau) thì gửi; đủ bước thì xong. Bất biến ok+failed+skipped <= total.
 * Đồng hồ ĐÓNG BĂNG (mock Date.now) — không ghi cứng ngày. Ledger giả đúng hình dạng runner đọc.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockInsertQueued = jest.fn();
const mockMarkSent = jest.fn();
const mockMarkFailed = jest.fn();
const mockFindSameRun = jest.fn();
const mockFindCrossRun = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: {
    insertQueued: mockInsertQueued,
    markSent: mockMarkSent,
    markFailed: mockMarkFailed,
    findExistingSentSameRun: mockFindSameRun,
    findExistingSentCrossRun: mockFindCrossRun,
  },
}));

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));

const { runAdapterSendNode, createNoopChannelQuotaGate } = await import('../campaignChannelRunner.service.js');
const { resolveStepDelayMs } = await import('../../../utils/channelSteps.util.js');

let nowMs;
const MINUTE = 60 * 1000;

function toIso(ms) {
  // ISO +07:00 đúng như engine (toHoChiMinhIso): dịch UTC+7 rồi gắn hậu tố.
  const d = new Date(ms + 7 * 60 * 60 * 1000);
  return `${d.toISOString().slice(0, 23)}+07:00`;
}

/**
 * Ledger giả: `markRecipientStepCompleted` ghi lastCompletedAt = giờ đồng hồ giả (hoặc completedAtOverride) — đúng
 * việc engine làm; `nextDueAt` chỉ được ghi khi runner upsert.
 */
function buildLedger(store = new Map()) {
  const key = ({ recipientKey }) => recipientKey;
  const upserts = [];
  const marks = [];
  return {
    store,
    upserts,
    marks,
    getRecipientProgress: async (input) => store.get(key(input))
      || { updatedAt: null, lastCompletedStep: 0, firstSentAt: null, lastCompletedAt: null, nextDueAt: null },
    upsertRecipientProgress: async (input) => {
      upserts.push(input);
      const prev = store.get(key(input)) || {};
      store.set(key(input), {
        updatedAt: 'x',
        lastCompletedStep: input.completedStep,
        firstSentAt: input.firstSentAt || prev.firstSentAt || null,
        lastCompletedAt: input.lastCompletedAt || prev.lastCompletedAt || null,
        nextDueAt: input.nextDueAt || prev.nextDueAt || null,
      });
    },
    markRecipientStepCompleted: async (input) => {
      marks.push(input);
      const completedAt = toIso(input.completedAtOverride ? new Date(input.completedAtOverride).getTime() : nowMs);
      const prev = store.get(key(input)) || {};
      store.set(key(input), {
        updatedAt: 'x',
        lastCompletedStep: input.completedStep,
        firstSentAt: prev.firstSentAt || completedAt,
        lastCompletedAt: completedAt,
        nextDueAt: null,
      });
    },
  };
}

function buildCtx({ recipients, sendOne, steps, ledger, allowEmptyRecipients }) {
  return {
    descriptor: {
      key: 'telegram',
      quotaChannel: 'zalo',
      policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
      adapter: {
        resolveAccount: async () => ({ accountKey: 'acc-1' }),
        resolveRecipients: async () => recipients,
        sendOne,
        classifyError: () => 'hard',
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
    toHoChiMinhIso: (input = nowMs) => toIso(input),
    allowEmptyRecipients,
    ...ledger,
  };
}

const person = (id) => ({ recipientKey: id, display: id, vars: {} });
const twoSteps = [{ message: 'a' }, { message: 'b', delayValue: 1, delayUnit: 'minutes' }];

describe('resolveStepDelayMs (P7)', () => {
  it('phút mặc định, giờ, ngày; thiếu/sai/âm = 0', () => {
    expect(resolveStepDelayMs({ delayValue: 2 })).toBe(2 * MINUTE);
    expect(resolveStepDelayMs({ delayValue: '3', delayUnit: 'hours' })).toBe(3 * 60 * MINUTE);
    expect(resolveStepDelayMs({ delayValue: 1, delayUnit: 'days' })).toBe(24 * 60 * MINUTE);
    expect(resolveStepDelayMs({ delayValue: -5, delayUnit: 'hours' })).toBe(0);
    expect(resolveStepDelayMs({ delayValue: 'abc' })).toBe(0);
    expect(resolveStepDelayMs({})).toBe(0);
    expect(resolveStepDelayMs(undefined)).toBe(0);
  });
});

describe('runAdapterSendNode — P7 nhiều bước có hẹn giờ', () => {
  let dateNowSpy;
  beforeEach(() => {
    jest.clearAllMocks();
    nowMs = Date.parse('2026-06-15T03:00:00.000Z'); // mốc tuỳ ý — đồng hồ đóng băng, mọi mốc tính tương đối
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    mockInsertQueued.mockResolvedValue(11);
    mockMarkSent.mockResolvedValue(undefined);
    mockMarkFailed.mockResolvedValue(undefined);
    mockFindSameRun.mockResolvedValue(null);
    mockFindCrossRun.mockResolvedValue(null);
  });
  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('kịch bản 2 bước trễ 1 phút: t0 gửi bước 1 + chờ; t0+30s vẫn chờ; t0+61s gửi bước 2; đủ bước', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const ledger = buildLedger();
    const t0 = nowMs;

    // Mốc t0: bước 1 gửi, bước 2 chưa đến hạn.
    let result = await runAdapterSendNode(buildCtx({ recipients: [person('u1')], sendOne, steps: twoSteps, ledger }));
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(sendOne.mock.calls[0][0].stepIndex).toBe(1);
    expect(result).toMatchObject({ total: 2, success: 1, failed: 0, skipped: 0, waiting: 1, nextDueAtMs: t0 + MINUTE });
    expect(result.outputItems.map((i) => i.status)).toEqual(['sent', 'waiting']);
    const waitUpsert = ledger.upserts.find((u) => u.nextDueAt);
    expect(waitUpsert).toMatchObject({ completedStep: 1, totalSteps: 2, nextDueAt: toIso(t0 + MINUTE) });

    // Mốc t0+30s: lượt sau (chu kỳ continuous) — vẫn chờ, KHÔNG gửi, total KHÔNG cộng lại.
    nowMs = t0 + 30 * 1000;
    result = await runAdapterSendNode(buildCtx({ recipients: [person('u1')], sendOne, steps: twoSteps, ledger }));
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ total: 0, success: 0, waiting: 1, nextDueAtMs: t0 + MINUTE });

    // Mốc t0+61s: đến hạn -> gửi bước 2, không còn ai chờ.
    nowMs = t0 + 61 * 1000;
    result = await runAdapterSendNode(buildCtx({ recipients: [person('u1')], sendOne, steps: twoSteps, ledger }));
    expect(sendOne).toHaveBeenCalledTimes(2);
    expect(sendOne.mock.calls[1][0].stepIndex).toBe(2);
    expect(result).toMatchObject({ total: 0, success: 1, waiting: 0, nextDueAtMs: null });

    // Mốc t0+10p: người đã xong đủ bước -> không gửi thêm.
    nowMs = t0 + 10 * MINUTE;
    result = await runAdapterSendNode(buildCtx({ recipients: [person('u1')], sendOne, steps: twoSteps, ledger }));
    expect(sendOne).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ total: 0, success: 0, waiting: 0 });
  });

  it('bước 2 KHÔNG trễ (delayValue 0/thiếu) -> gửi liền như trước P7', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const result = await runAdapterSendNode(buildCtx({
      recipients: [person('u1')], sendOne, steps: [{ message: 'a' }, { message: 'b' }], ledger: buildLedger(),
    }));
    expect(sendOne).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ total: 2, success: 2, waiting: 0, nextDueAtMs: null });
  });

  it('nhiều người: mốc sớm nhất thắng; người chờ không ăn nhịp; bất biến ok+failed+skipped <= total', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const ledger = buildLedger();
    const t0 = nowMs;
    await runAdapterSendNode(buildCtx({ recipients: [person('u1')], sendOne, steps: twoSteps, ledger }));
    nowMs = t0 + 20 * 1000;
    const result = await runAdapterSendNode(buildCtx({
      recipients: [person('u1'), person('u2')], sendOne, steps: twoSteps, ledger,
    }));
    // u1 chờ tới t0+60s; u2 mới: gửi bước 1 (t0+20s) rồi chờ tới t0+80s.
    expect(result).toMatchObject({ total: 2, success: 1, waiting: 2, nextDueAtMs: t0 + MINUTE });
    expect(result.success + result.failed + result.skipped).toBeLessThanOrEqual(result.total);
  });

  it('dedupe bước 1 từ lượt cũ: mốc bước 2 tính theo GIỜ GỬI THẬT của dòng cũ (completedAtOverride)', async () => {
    const sentAt = new Date(nowMs - 10 * MINUTE);
    mockFindCrossRun.mockImplementation(async ({ stepIndex }) => (stepIndex === 1 ? { id: 5, sent_at_tz: sentAt } : null));
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const ledger = buildLedger();
    const result = await runAdapterSendNode(buildCtx({ recipients: [person('u1')], sendOne, steps: twoSteps, ledger }));
    expect(ledger.marks[0]).toMatchObject({ completedStep: 1, sendMode: 'schedule' });
    expect(new Date(ledger.marks[0].completedAtOverride).getTime()).toBe(sentAt.getTime());
    // 10 phút trước + 1 phút trễ đã qua -> bước 2 gửi ngay, không chờ.
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(sendOne.mock.calls[0][0].stepIndex).toBe(2);
    expect(result).toMatchObject({ total: 2, skipped: 1, success: 1, waiting: 0 });
  });

  it('markRecipientStepCompleted nhận steps (delayFrom prev) + sendMode schedule để ledger tính nextDueAt', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm' });
    const ledger = buildLedger();
    await runAdapterSendNode(buildCtx({ recipients: [person('u1')], sendOne, steps: twoSteps, ledger }));
    expect(ledger.marks[0].steps).toEqual([
      { delayValue: undefined, delayUnit: undefined, delayFrom: 'prev' },
      { delayValue: 1, delayUnit: 'minutes', delayFrom: 'prev' },
    ]);
    expect(ledger.marks[0].sendMode).toBe('schedule');
  });

  it('allowEmptyRecipients (continuous): không có người nhận -> trả 0, KHÔNG ném CHANNEL_NO_RECIPIENTS', async () => {
    const sendOne = jest.fn();
    const result = await runAdapterSendNode(buildCtx({
      recipients: [], sendOne, steps: twoSteps, ledger: buildLedger(), allowEmptyRecipients: true,
    }));
    expect(result).toMatchObject({ total: 0, success: 0, waiting: 0, nextDueAtMs: null, outputItems: [] });
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('không có allowEmptyRecipients (one-shot): rỗng vẫn ném CHANNEL_NO_RECIPIENTS như cũ', async () => {
    await expect(runAdapterSendNode(buildCtx({
      recipients: [], sendOne: jest.fn(), steps: twoSteps, ledger: buildLedger(),
    }))).rejects.toMatchObject({ code: 'CHANNEL_NO_RECIPIENTS' });
  });
});
