/**
 * S-15 (04/10/2026) — Nhân viên có quyền Marketplace bấm "Đăng Marketplace" luôn nhận 403
 * "Bạn không có quyền tạo listing từ chatbot này".
 *
 * Gốc: `custom_chatbots.id_user` là BIGINT nên `pg` trả CHUỖI ("146"), còn id chủ không gian của nhân viên
 * (`activeContext.ownerId`, auth.middleware.js) là Number(146). `chatbot.id_user !== userId` thẳng thì
 * "146" !== 146 → luôn từ chối. Chủ tài khoản không bị vì `user.id` cũng là chuỗi.
 * Sửa: so bằng Number() ở cả createFromChatbot / publish / pause. Kiểm sai chủ vẫn bị 403.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindChatbotById = jest.fn();
const mockIsChatbotPurchased = jest.fn();
const mockFindByChatbotId = jest.fn();
const mockCreate = jest.fn();
const mockFindById = jest.fn();
const mockUpdate = jest.fn();

jest.unstable_mockModule('../../../repositories/marketplace/marketplaceListing.repository.js', () => ({
  default: {
    findById: mockFindById,
    update: mockUpdate,
    findByChatbotId: mockFindByChatbotId,
    create: mockCreate,
  },
}));
jest.unstable_mockModule('../../../repositories/marketplace/marketplacePurchase.repository.js', () => ({
  default: { isChatbotPurchased: mockIsChatbotPurchased },
}));
jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: { findChatbotById: mockFindChatbotById },
}));

const { default: marketplaceListingService } = await import('../marketplaceListing.service.js');

describe('marketplaceListing.service — id chủ là chuỗi (pg BIGINT) so với Number của nhân viên', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsChatbotPurchased.mockResolvedValue(false);
    mockFindByChatbotId.mockResolvedValue(null);
    mockCreate.mockImplementation(async (payload) => ({ id: 1, ...payload }));
    mockUpdate.mockResolvedValue({ id: 5, status: 'published' });
  });

  it('createFromChatbot: nhân viên (userId = Number 146) đăng bot của công ty (id_user = "146") → KHÔNG 403', async () => {
    mockFindChatbotById.mockResolvedValue({ id: 3, id_user: '146', name: 'Bot công ty' });

    const listing = await marketplaceListingService.createFromChatbot(146, { chatbotId: 3, priceCredits: 10 });

    expect(listing.idUser).toBe(146);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('createFromChatbot: bot của công ty KHÁC vẫn bị 403', async () => {
    mockFindChatbotById.mockResolvedValue({ id: 3, id_user: '999', name: 'Bot người khác' });

    await expect(
      marketplaceListingService.createFromChatbot(146, { chatbotId: 3 })
    ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('không có quyền') });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('publish / pause: listing.id_user = "146" và userId = 146 → được phép; sai chủ → 403', async () => {
    mockFindById.mockResolvedValue({ id: 5, id_user: '146' });

    await expect(marketplaceListingService.publish(5, 146)).resolves.toBeTruthy();
    await expect(marketplaceListingService.pause(5, 146)).resolves.toBeTruthy();
    await expect(marketplaceListingService.publish(5, 147)).rejects.toMatchObject({ status: 403 });
    await expect(marketplaceListingService.pause(5, 147)).rejects.toMatchObject({ status: 403 });
  });
});
