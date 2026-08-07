import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetConversationById = jest.fn();
const mockWithTransaction = jest.fn();
const mockInsertZalo = jest.fn();
const mockSendMessage = jest.fn();
const mockSetAiPaused = jest.fn();
const mockUpdateSendStatus = jest.fn();
const mockClaimRetry = jest.fn();
const mockFindForRetry = jest.fn();
const mockDebit = jest.fn();
const mockResolveBilling = jest.fn();
const mockSendReply = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: {
    getConversationById: mockGetConversationById,
    withTransaction: mockWithTransaction,
    insertZaloPersonalAgentMessage: mockInsertZalo,
    sendMessage: mockSendMessage,
    setAiPaused: mockSetAiPaused,
    updateMessageSendStatus: mockUpdateSendStatus,
    claimMessageForRetry: mockClaimRetry,
    findAgentMessageForRetry: mockFindForRetry,
    getAllSettingsForUser: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({
  default: { getAllSettingsForUser: jest.fn().mockResolvedValue([]) },
}));

jest.unstable_mockModule('../../sse.service.js', () => ({
  default: { broadcast: jest.fn() },
}));

jest.unstable_mockModule('../../../utils/billingCycle.util.js', () => ({
  resolveBillingUserId: mockResolveBilling,
}));

jest.unstable_mockModule('../../payment/topupWallet.service.js', () => ({
  debitZaloPersonalInboxIfNeeded: mockDebit,
}));

jest.unstable_mockModule('../channelAdapters/zaloOA.adapter.js', () => ({
  default: { sendReply: mockSendReply },
}));

jest.unstable_mockModule('../channelAdapters/facebook.adapter.js', () => ({
  default: { sendReply: mockSendReply },
}));

jest.unstable_mockModule('../channelAdapters/zaloPersonal.adapter.js', () => ({
  default: { sendReply: mockSendReply },
}));

const unifiedInboxService = (await import('../unifiedInbox.service.js')).default;

describe('UnifiedInbox send status + retry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetAiPaused.mockResolvedValue(undefined);
    mockUpdateSendStatus.mockResolvedValue({ id: 10, metadata: { source: 'manual_inbox', send: { status: 'failed' } } });
    mockResolveBilling.mockResolvedValue(1);
    mockDebit.mockResolvedValue({ debited: false });
    mockWithTransaction.mockImplementation(async (fn) => fn({}));
  });

  it('ghi failed khi adapter trả success:false và giữ success:true', async () => {
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockInsertZalo.mockResolvedValue(42);
    mockSendReply.mockResolvedValue({ success: false, error: 'No active Zalo personal session' });

    const result = await unifiedInboxService.sendMessage(1, 5, 'zalo_personal', 'hello');

    expect(result.success).toBe(true);
    expect(result.messageId).toBe(42);
    expect(result.sendStatus).toBe('failed');
    expect(result.error).toMatch(/No active Zalo/);
    expect(mockUpdateSendStatus).toHaveBeenCalledWith(
      'zalo_personal',
      42,
      expect.objectContaining({ status: 'failed', attempts: 1 })
    );
  });

  it('retry claim thất bại → 409, không gọi adapter', async () => {
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      channel: 'zalo_personal',
    });
    mockClaimRetry.mockResolvedValue(null);

    await expect(unifiedInboxService.retryMessage(1, 42, 'zalo_personal'))
      .rejects.toMatchObject({ status: 409, code: 'RETRY_NOT_AVAILABLE' });
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  it('retry thành công sau khi claim', async () => {
    mockFindForRetry.mockResolvedValue({
      id: 42,
      id_conversation: 5,
      content: 'hello',
      role: 'agent',
      id_zalo_setting: 9,
      channel: 'zalo_personal',
      external_id: 'u1',
    });
    mockClaimRetry.mockResolvedValue({ id: 42 });
    mockGetConversationById.mockResolvedValue({
      id: 5,
      channel: 'zalo_personal',
      external_id: 'u1',
      id_zalo_setting: 9,
    });
    mockSendReply.mockResolvedValue({ success: true });
    mockUpdateSendStatus.mockResolvedValue({
      id: 42,
      metadata: { source: 'manual_inbox', send: { status: 'sent' } },
    });

    const result = await unifiedInboxService.retryMessage(1, 42, 'zalo_personal');
    expect(result.sendStatus).toBe('sent');
    expect(mockUpdateSendStatus).toHaveBeenCalledWith(
      'zalo_personal',
      42,
      expect.objectContaining({ status: 'sent' })
    );
  });
});
