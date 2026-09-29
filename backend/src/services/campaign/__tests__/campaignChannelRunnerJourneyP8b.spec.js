/**
 * P8b — bộ chạy kênh adapter gọi ghi journey SAU mỗi tin gửi thành công (không gọi khi gửi lỗi), và một lỗi journey không
 * làm hỏng lượt gửi. Ranh giới giả: campaignChannelJourney.service (đã có spec riêng cho logic tra khách/ghi).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockRecordJourney = jest.fn();

jest.unstable_mockModule('../campaignChannelJourney.service.js', () => ({
  recordAdapterSentJourney: mockRecordJourney,
  default: { recordAdapterSentJourney: mockRecordJourney },
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignChannelMessage.repository.js', () => ({
  default: {
    insertQueued: jest.fn().mockResolvedValue(701),
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    findExistingSentSameRun: jest.fn().mockResolvedValue(null),
    findExistingSentCrossRun: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../zaloCampaignRecipient.service.js', () => ({
  default: { isLeadPhoneConsentRefused: jest.fn().mockResolvedValue(false) },
}));

const { runAdapterSendNode, createNoopChannelQuotaGate } = await import('../campaignChannelRunner.service.js');
const { ChannelSendError } = await import('../campaignChannelRegistry.service.js');

function buildCtx({ recipients, sendOne, steps = [{ message: 'hi' }] }) {
  const store = new Map();
  return {
    descriptor: {
      key: 'whatsapp',
      quotaChannel: 'zalo',
      recipientIsPhone: true,
      journeyEventType: 'whatsapp_sent',
      policy: { minDelayMs: 0, maxDelayMs: 0, perHourLimit: 0, quietHours: null },
      adapter: {
        resolveAccount: async () => ({ accountKey: 'acc-1' }),
        resolveRecipients: async () => recipients,
        sendOne,
        classifyError: (err) => (err instanceof ChannelSendError ? err.category : 'hard'),
      },
    },
    runId: 9,
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
    getRecipientProgress: async ({ recipientKey }) => store.get(recipientKey) || { updatedAt: null, lastCompletedStep: 0, firstSentAt: null },
    upsertRecipientProgress: async (i) => {
      store.set(i.recipientKey, { updatedAt: 'x', lastCompletedStep: i.completedStep, firstSentAt: i.firstSentAt || null });
    },
    markRecipientStepCompleted: async (i) => {
      store.set(i.recipientKey, { updatedAt: 'x', lastCompletedStep: i.completedStep, firstSentAt: 'x' });
    },
  };
}

const person = (phone) => ({ recipientKey: phone, display: phone, vars: {} });

describe('runAdapterSendNode — P8b journey sau khi gửi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordJourney.mockResolvedValue(true);
  });

  it('gửi thành công -> ghi journey đúng ngữ cảnh: chủ workspace, chiến dịch, run, node, id dòng nhật ký', async () => {
    const ctx = buildCtx({
      recipients: [person('84900000001')],
      sendOne: jest.fn().mockResolvedValue({ messageId: 'wa-1' }),
    });
    const result = await runAdapterSendNode(ctx);
    expect(result.success).toBe(1);
    expect(mockRecordJourney).toHaveBeenCalledTimes(1);
    const arg = mockRecordJourney.mock.calls[0][0];
    expect(arg).toMatchObject({
      workspaceOwnerId: 3,
      campaignId: 2,
      runId: 9,
      nodeId: 4152,
      messageId: 701,
      recipient: { recipientKey: '84900000001' },
    });
    expect(arg.descriptor.journeyEventType).toBe('whatsapp_sent');
  });

  it('nhiều bước -> ghi journey mỗi bước gửi thành công', async () => {
    const ctx = buildCtx({
      recipients: [person('84900000001')],
      sendOne: jest.fn().mockResolvedValue({ messageId: 'wa-1' }),
      steps: [{ message: 'a' }, { message: 'b' }],
    });
    await runAdapterSendNode(ctx);
    expect(mockRecordJourney).toHaveBeenCalledTimes(2);
  });

  it('gửi lỗi (hard) -> KHÔNG ghi journey', async () => {
    const ctx = buildCtx({
      recipients: [person('84900000001')],
      sendOne: jest.fn().mockRejectedValue(new ChannelSendError('hard', 'Số không dùng WhatsApp')),
    });
    const result = await runAdapterSendNode(ctx);
    expect(result.failed).toBe(1);
    expect(mockRecordJourney).not.toHaveBeenCalled();
  });
});
