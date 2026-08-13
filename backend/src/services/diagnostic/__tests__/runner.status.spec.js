import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUpdateMessage = jest.fn();
const mockIncrementFailed = jest.fn();
const mockIncrementSent = jest.fn();
const mockFindRunMessages = jest.fn();
const mockCompleteRun = jest.fn();

jest.unstable_mockModule('../../../repositories/diagnostic.repository.js', () => ({
  default: {
    updateMessage: mockUpdateMessage,
    incrementFailedCount: mockIncrementFailed,
    incrementSentCount: mockIncrementSent,
    findRunMessages: mockFindRunMessages,
    completeRun: mockCompleteRun,
  },
}));

const { default: diagnosticRunner } = await import('../runner.service.js');

describe('diagnostic runner outbound status contract', () => {
  beforeEach(() => {
    mockUpdateMessage.mockReset().mockResolvedValue(undefined);
    mockIncrementFailed.mockReset().mockResolvedValue(undefined);
    mockIncrementSent.mockReset().mockResolvedValue(undefined);
    mockFindRunMessages.mockReset();
    mockCompleteRun.mockReset().mockResolvedValue(undefined);
  });

  const runWithStaged = async (staged, channelKey = 'zalo_group') => {
    mockFindRunMessages.mockResolvedValue([{ seq: 1, recipient: '0901234567' }]);
    await diagnosticRunner._executeRun({
      runId: 9,
      adapter: {
        getChannelKey: () => channelKey,
        getApi: async () => ({}),
        sendStaged: async () => staged,
      },
      accountId: 1,
      userId: 1,
      roleCode: 'owner',
      messageText: 'hi',
      delayMs: 0,
      mode: 'fast',
      dryRun: false,
      runLimiter: null,
    });
  };

  it('does not mark sent when completed status is not success', async () => {
    await runWithStaged({ status: 'partial', lookupMs: null, sendMs: 12 });
    expect(mockIncrementSent).not.toHaveBeenCalled();
    expect(mockIncrementFailed).toHaveBeenCalledWith(9);
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      9,
      1,
      expect.objectContaining({ status: 'failed', errorCategory: 'ZALO_PARTIAL_DELIVERY' })
    );
  });

  it('does not mark sent for unknown completed status', async () => {
    await runWithStaged({ status: 'queued' });
    expect(mockIncrementSent).not.toHaveBeenCalled();
    expect(mockIncrementFailed).toHaveBeenCalledWith(9);
  });

  it('marks sent only when status is success', async () => {
    await runWithStaged({ status: 'success', uid: 'u1', sendMs: 5 });
    expect(mockIncrementFailed).not.toHaveBeenCalled();
    expect(mockIncrementSent).toHaveBeenCalledWith(9);
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      9,
      1,
      expect.objectContaining({ status: 'sent' })
    );
  });

  it('email completed result without status is sent, not a Zalo failure', async () => {
    await runWithStaged({
      messageId: 'smtp-1',
      lookupMs: null,
      sendMs: 40,
    }, 'email');
    expect(mockIncrementFailed).not.toHaveBeenCalled();
    expect(mockIncrementSent).toHaveBeenCalledWith(9);
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      9,
      1,
      expect.objectContaining({ status: 'sent' })
    );
    expect(mockUpdateMessage).not.toHaveBeenCalledWith(
      9,
      1,
      expect.objectContaining({ errorCategory: expect.stringMatching(/ZALO_/) })
    );
  });
});
