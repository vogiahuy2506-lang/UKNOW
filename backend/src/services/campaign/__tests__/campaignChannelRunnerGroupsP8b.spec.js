/**
 * P8b — bộ chạy kênh adapter với người nhận là NHÓM WhatsApp (`recipient.isGroup`): không kiểm consent (jid nhóm không
 * có SĐT để đối chiếu), nguồn `whatsapp_groups` được gom như danh sách tĩnh trong config.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockInsertQueued = jest.fn();
const mockConsentRefused = jest.fn();

jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: {
    insertQueued: mockInsertQueued,
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    findExistingSentSameRun: jest.fn().mockResolvedValue(null),
    findExistingSentCrossRun: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: mockConsentRefused },
}));

const { runAdapterSendNode, createNoopChannelQuotaGate } = await import('../campaignChannelRunner.service.js');

const GROUP = '120363012345678901@g.us';

function buildCtx({ resolveRecipients, sendOne, config }) {
  const store = new Map();
  return {
    descriptor: {
      key: 'whatsapp',
      quotaChannel: 'zalo',
      recipientIsPhone: true,
      policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
      adapter: {
        resolveAccount: async () => ({ accountKey: 'acc-1' }),
        resolveRecipients,
        sendOne,
        classifyError: () => 'hard',
      },
    },
    runId: 1,
    campaignId: 2,
    userId: 30,
    workspaceOwnerId: 3,
    node: { id: 4152 },
    config,
    nodeOutputs: {},
    lastOutputItems: [],
    ensureRunStillRunning: async () => {},
    quotaGate: createNoopChannelQuotaGate(),
    toHoChiMinhIso: () => '2026-09-29T10:00:00+07:00',
    getRecipientProgress: async ({ recipientKey }) => store.get(recipientKey) || { updatedAt: null, lastCompletedStep: 0, firstSentAt: null },
    upsertRecipientProgress: async (i) => {
      store.set(i.recipientKey, { updatedAt: 'x', lastCompletedStep: i.completedStep, firstSentAt: i.firstSentAt || null });
    },
    markRecipientStepCompleted: async (i) => {
      store.set(i.recipientKey, { updatedAt: 'x', lastCompletedStep: i.completedStep, firstSentAt: 'x' });
    },
  };
}

describe('runAdapterSendNode — P8b nhóm WhatsApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsertQueued.mockResolvedValue(11);
    mockConsentRefused.mockResolvedValue(true); // nếu bị gọi nhầm với jid nhóm sẽ bỏ người nhận
  });

  it('người nhận isGroup: KHÔNG tra consent, vẫn gửi', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'g1' });
    const ctx = buildCtx({
      resolveRecipients: async () => [{ recipientKey: GROUP, display: 'Khách VIP', vars: {}, isGroup: true }],
      sendOne,
      config: { recipientSource: 'whatsapp_groups', steps: [{ message: 'hi' }] },
    });
    const result = await runAdapterSendNode(ctx);
    expect(mockConsentRefused).not.toHaveBeenCalled();
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(sendOne.mock.calls[0][0].recipientKey).toBe(GROUP);
    expect(result.success).toBe(1);
  });

  it('nguồn whatsapp_groups: runner gom danh sách nhóm từ config.recipientKeys làm rows cho adapter', async () => {
    const resolveRecipients = jest.fn().mockResolvedValue([{ recipientKey: GROUP, display: 'A', vars: {}, isGroup: true }]);
    const ctx = buildCtx({
      resolveRecipients,
      sendOne: jest.fn().mockResolvedValue({ messageId: 'g1' }),
      config: {
        recipientSource: 'whatsapp_groups',
        recipientKeys: [{ recipientKey: GROUP, display: 'A' }],
        steps: [{ message: 'hi' }],
      },
    });
    await runAdapterSendNode(ctx);
    expect(resolveRecipients.mock.calls[0][0].rows).toEqual([{ recipientKey: GROUP, display: 'A' }]);
  });

  it('người nhận SĐT thường (không isGroup) vẫn bị kiểm consent như cũ', async () => {
    const sendOne = jest.fn().mockResolvedValue({ messageId: 'm1' });
    const ctx = buildCtx({
      resolveRecipients: async () => [{ recipientKey: '84900000001', display: 'A', vars: {} }],
      sendOne,
      config: { recipientSource: 'manual', steps: [{ message: 'hi' }] },
    });
    const result = await runAdapterSendNode(ctx);
    expect(mockConsentRefused).toHaveBeenCalledWith(3, '84900000001');
    expect(sendOne).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });
});
