/**
 * PR-3: Unit test cho chatbotShare.service — branch phân nhánh theo isExistingUser.
 *
 * Mục tiêu:
 *  - share với user đã có tài khoản → isExistingUser=true, clone ngay, notification gửi.
 *  - share với email NGOÀI hệ thống → isExistingUser=false, KHÔNG clone, notification gửi
 *    với subject "muốn chia sẻ".
 *  - claimPendingAndClone gọi cloneFromSource cho mỗi share pending và trả danh sách.
 *
 * Mock các dependency: db, repo, clone-repo, systemEmail, hàm kiểm suất chatbot (chatbotSlot.service.js — logic đếm/trần
 * của nó có spec riêng, và integration chatbotSlotCloneMarketplace.test.js đo trên CSDL thật).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockFindChatbotById = jest.fn();
const mockFindOrCreatePendingByEmail = jest.fn();
const mockCloneFromSource = jest.fn();
const mockAssertSlot = jest.fn();
const mockClaimPendingByUserId = jest.fn();
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
    claimPendingByUserId: (...args) => mockClaimPendingByUserId(...args),
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

jest.unstable_mockModule('../chatbotSlot.service.js', () => ({
  __esModule: true,
  CHATBOT_LIMIT_EXCEEDED_CODE: 'CHATBOT_LIMIT_EXCEEDED',
  assertChatbotSlotAvailable: (...args) => mockAssertSlot(...args),
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
  mockAssertSlot.mockReset();
  mockClaimPendingByUserId.mockReset();
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
    mockAssertSlot.mockResolvedValue(undefined);
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
    // Kiểm suất chatbot của NGƯỜI NHẬN (id 20), qua CHÍNH client transaction đang clone.
    expect(mockAssertSlot).toHaveBeenCalledWith(20, expect.objectContaining({ client: fakeClient }));
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
    expect(mockAssertSlot).not.toHaveBeenCalled();
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

describe('chatbotShareService — trần chatbot của người nhận (30/09/2026)', () => {
  function limitError(limit = 1, used = 1) {
    return Object.assign(new Error('Bạn đã đạt giới hạn ' + limit + ' chatbot của gói dịch vụ hiện tại.'), {
      status: 403, code: 'CHATBOT_LIMIT_EXCEEDED', used, limit, upgradeRequired: true,
    });
  }

  it('người nhận hết suất → ROLLBACK, KHÔNG clone, lỗi 400 CHATBOT_LIMIT_EXCEEDED hướng về người nhận', async () => {
    const fakeClient = setupTransactionMocks();
    mockFindChatbotById.mockResolvedValue({ id: 1, id_user: 10, name: 'Bot Demo' });
    mockFindOrCreatePendingByEmail.mockResolvedValue({
      share: { id: 100, id_chatbot: 1, status: 'active', id_recipient: 20 },
      isExistingUser: true,
      recipient: { id: 20, full_name: 'Recipient', username: 'r', email: 'r@x.com', role: 'user' },
    });
    mockAssertSlot.mockRejectedValue(limitError(1, 1));

    await expect(
      chatbotShareService.shareChatbot({ chatbotId: 1, ownerId: 10, recipientEmail: 'r@x.com' })
    ).rejects.toMatchObject({
      status: 400,
      code: 'CHATBOT_LIMIT_EXCEEDED',
      limit: 1,
      message: expect.stringContaining('Người nhận'),
    });

    expect(mockCloneFromSource).not.toHaveBeenCalled();
    expect(fakeClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(fakeClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(fakeClient.release).toHaveBeenCalled();
  });

  it('truyền vai người nhận xuống hàm kiểm (super admin nhận chatbot không bị trần)', async () => {
    setupTransactionMocks();
    mockFindChatbotById.mockResolvedValue({ id: 1, id_user: 10, name: 'Bot Demo' });
    mockFindOrCreatePendingByEmail.mockResolvedValue({
      share: { id: 100 },
      isExistingUser: true,
      recipient: { id: 20, full_name: 'Admin', username: 'a', email: 'a@x.com', role: 'admin' },
    });
    mockAssertSlot.mockResolvedValue(undefined);
    mockCloneFromSource.mockResolvedValue({ id: 5, name: 'Bot (Copy)' });
    mockQuery.mockResolvedValue({ rows: [{ name: 'Owner' }] });

    await chatbotShareService.shareChatbot({ chatbotId: 1, ownerId: 10, recipientEmail: 'a@x.com' });

    expect(mockAssertSlot).toHaveBeenCalledWith(20, expect.objectContaining({ roleCode: 'admin' }));
  });

  it('claimPendingAndClone: kiểm suất TRƯỚC mỗi lần clone, cô lập từng share (share hết suất không chặn share khác)', async () => {
    const fakeClient = setupTransactionMocks();
    mockClaimPendingByUserId.mockResolvedValue([
      { id: 1, id_chatbot: 11 },
      { id: 2, id_chatbot: 12 },
    ]);
    mockAssertSlot
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(limitError(1, 1));
    mockCloneFromSource.mockResolvedValue({ id: 500, name: 'Copy' });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // service log lỗi từng share

    const results = await chatbotShareService.claimPendingAndClone(fakeClient, { userId: 30, email: 'n@x.com' });
    errorSpy.mockRestore();

    expect(mockAssertSlot).toHaveBeenCalledTimes(2);
    expect(mockAssertSlot).toHaveBeenNthCalledWith(1, 30, expect.objectContaining({ client: fakeClient }));
    expect(mockCloneFromSource).toHaveBeenCalledTimes(1); // share thứ hai bị chặn trước khi clone
    expect(mockCloneFromSource).toHaveBeenCalledWith(fakeClient, expect.objectContaining({ sourceChatbotId: 11, targetUserId: 30 }));
    expect(results).toEqual([
      { shareId: 1, chatbotId: 11, clonedChatbotId: 500, error: null },
      expect.objectContaining({ shareId: 2, chatbotId: 12, clonedChatbotId: null, error: expect.stringContaining('giới hạn') }),
    ]);
  });
});
