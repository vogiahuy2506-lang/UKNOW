/**
 * PR-3: Unit test cho chatbotShare.service — branch phân nhánh theo isExistingUser.
 *
 * Mục tiêu:
 *  - share với user đã có tài khoản → isExistingUser=true, clone ngay, notification gửi.
 *  - share với email NGOÀI hệ thống → isExistingUser=false, KHÔNG clone, notification gửi
 *    với subject "muốn chia sẻ".
 *  - claimPendingAndClone gọi cloneFromSource cho mỗi share pending và trả danh sách.
 *
 * Mock các dependency: db, repo, clone-repo, systemEmail, enforce limit.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockFindChatbotById = jest.fn();
const mockFindOrCreatePendingByEmail = jest.fn();
const mockCloneFromSource = jest.fn();
const mockEnforceLimit = jest.fn();
const mockQuery = jest.fn();
const mockGetClient = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  __esModule: true,
  default: {
    query: (...args) => mockQuery(...args),
    getClient: (...args) => mockGetClient(...args),
  },
}));

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  __esModule: true,
  default: { findChatbotById: (...args) => mockFindChatbotById(...args) },
}));

jest.unstable_mockModule('../../../repositories/ai/chatbotShare.repository.js', () => ({
  __esModule: true,
  default: {
    findOrCreatePendingByEmail: (...args) => mockFindOrCreatePendingByEmail(...args),
    claimPendingByUserId: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../repositories/ai/chatbotClone.repository.js', () => ({
  __esModule: true,
  default: { cloneFromSource: (...args) => mockCloneFromSource(...args) },
}));

jest.unstable_mockModule('../../../utils/systemEmail.util.js', () => ({
  __esModule: true,
  SENDER_NAME: 'Founder AI',
  sendSystemEmail: jest.fn().mockResolvedValue({ messageId: '<sys@test>' }),
  buildBaseTemplate: ({ content }) =>
    `<!doctype html><html><body>${content}</body></html>`,
}));

jest.unstable_mockModule('../../../utils/userResourceLimit.util.js', () => ({
  __esModule: true,
  enforceResourceLimitTx: (...args) => mockEnforceLimit(...args),
}));

const chatbotShareService = (await import('../../../services/ai/chatbotShare.service.js')).default;

function setupTransactionMocks() {
  const fakeClient = {
    query: jest.fn().mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0 };
      return { rows: [], rowCount: 0 };
    }),
    release: jest.fn(),
  };
  mockGetClient.mockResolvedValue(fakeClient);
  return fakeClient;
}

beforeEach(() => {
  mockFindChatbotById.mockReset();
  mockFindOrCreatePendingByEmail.mockReset();
  mockCloneFromSource.mockReset();
  mockEnforceLimit.mockReset();
  mockQuery.mockReset();
  mockGetClient.mockReset();
});

describe('chatbotShareService.shareChatbot (PR-3)', () => {
  it('share với user đã có tài khoản → isExistingUser=true, clone ngay, gửi mail "đã chia sẻ"', async () => {
    const fakeClient = setupTransactionMocks();
    mockFindChatbotById.mockResolvedValue({ id: 1, id_user: 10, name: 'Bot Demo' });
    mockFindOrCreatePendingByEmail.mockResolvedValue({
      share: { id: 100, id_chatbot: 1, status: 'active', id_recipient: 20 },
      isExistingUser: true,
      recipient: { id: 20, full_name: 'Recipient', username: 'r', email: 'r@x.com' },
    });
    mockEnforceLimit.mockResolvedValue(undefined);
    mockCloneFromSource.mockResolvedValue({ id: 999, name: 'Bot Demo (Copy)' });
    mockQuery.mockResolvedValue({ rows: [{ name: 'Owner Name' }] });

    const result = await chatbotShareService.shareChatbot({
      chatbotId: 1,
      ownerId: 10,
      recipientEmail: 'r@x.com',
    });

    expect(result.success).toBe(true);
    expect(result.isExistingUser).toBe(true);
    expect(result.clonedChatbot).toEqual({ id: 999, name: 'Bot Demo (Copy)' });
    expect(result.notificationSent).toBe(true);
    expect(fakeClient.query).toHaveBeenCalledWith('BEGIN');
    expect(fakeClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockEnforceLimit).toHaveBeenCalledWith(fakeClient, expect.objectContaining({ userId: 20 }));
    expect(mockCloneFromSource).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ sourceChatbotId: 1, targetUserId: 20 })
    );
  });

  it('share với email NGOÀI hệ thống → isExistingUser=false, KHÔNG clone, gửi mail "muốn chia sẻ"', async () => {
    setupTransactionMocks();
    mockFindChatbotById.mockResolvedValue({ id: 2, id_user: 10, name: 'Bot Pending' });
    mockFindOrCreatePendingByEmail.mockResolvedValue({
      share: { id: 200, id_chatbot: 2, status: 'pending', id_recipient: null },
      isExistingUser: false,
      recipient: null,
    });
    mockQuery.mockResolvedValue({ rows: [{ name: 'Owner Name' }] });

    const result = await chatbotShareService.shareChatbot({
      chatbotId: 2,
      ownerId: 10,
      recipientEmail: 'newuser@external.com',
    });

    expect(result.success).toBe(true);
    expect(result.isExistingUser).toBe(false);
    expect(result.clonedChatbot).toBe(null);
    expect(result.notificationSent).toBe(true);
    expect(mockCloneFromSource).not.toHaveBeenCalled();
    expect(mockEnforceLimit).not.toHaveBeenCalled();
  });

  it('share chính mình (existing user trùng owner) → throw 400', async () => {
    setupTransactionMocks();
    mockFindChatbotById.mockResolvedValue({ id: 3, id_user: 10, name: 'Self' });
    mockFindOrCreatePendingByEmail.mockResolvedValue({
      share: { id: 300, status: 'active' },
      isExistingUser: true,
      recipient: { id: 10, full_name: 'Owner', username: 'o', email: 'o@x.com' },
    });

    await expect(
      chatbotShareService.shareChatbot({
        chatbotId: 3,
        ownerId: 10,
        recipientEmail: 'o@x.com',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('chatbot không thuộc owner → throw 403', async () => {
    setupTransactionMocks();
    mockFindChatbotById.mockResolvedValue({ id: 4, id_user: 999, name: 'Other' });

    await expect(
      chatbotShareService.shareChatbot({
        chatbotId: 4,
        ownerId: 10,
        recipientEmail: 'a@b.com',
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
