/**
 * tiktokBusinessWebhook.controller.spec.js
 *
 * Kiểm tra luồng tự trả lời tin nhắn TikTok Business: nhận tin → lưu → gom (debounce) → kiểm tra
 * (chatbot bật, khoá topup, tạm dừng AI, giờ hoạt động, hạn mức AI, giới hạn TikTok) → AI → gửi → lưu.
 */

import {
  describe, expect, test, beforeEach, jest,
} from '@jest/globals';

const mockFindActiveByExternal = jest.fn();
const mockFindActiveChannelById = jest.fn();
const mockGetOrCreateConversation = jest.fn();
const mockAddMessage = jest.fn();
const mockUpdateLastActivity = jest.fn();
const mockGetLatestMessageId = jest.fn();
jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({
  default: {
    findActiveByExternalChannelId: mockFindActiveByExternal,
    findActiveChannelById: mockFindActiveChannelById,
    getOrCreateConversation: mockGetOrCreateConversation,
    addMessage: mockAddMessage,
    updateLastActivity: mockUpdateLastActivity,
    getLatestMessageId: mockGetLatestMessageId,
  },
}));

const mockFindByBusinessId = jest.fn();
const mockTouchWebhook = jest.fn();
jest.unstable_mockModule('../../repositories/ai/tiktokBusinessAccount.repository.js', () => ({
  default: {
    findByBusinessIdAnyUser: mockFindByBusinessId,
    touchWebhook: mockTouchWebhook,
    deactivate: jest.fn(),
  },
}));

const mockFindChatbotById = jest.fn();
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: { findChatbotById: mockFindChatbotById },
}));

const mockIsAiPaused = jest.fn();
jest.unstable_mockModule('../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: { isAiPaused: mockIsAiPaused },
}));

const mockRoute = jest.fn();
jest.unstable_mockModule('../../services/chatbot/chatRouter.service.js', () => ({
  default: { routeChatbotMessage: mockRoute },
}));

const mockRateCheck = jest.fn();
const mockMarkRateNotified = jest.fn();
jest.unstable_mockModule('../../services/chatbot/chatbotRateLimit.service.js', () => ({
  default: { checkBeforeAi: mockRateCheck, markRateLimitNotified: mockMarkRateNotified },
}));

const mockActiveHoursCheck = jest.fn();
const mockActiveHoursNotified = jest.fn();
jest.unstable_mockModule('../../services/chatbot/chatbotActiveHours.service.js', () => ({
  default: { checkBeforeAi: mockActiveHoursCheck, markNotified: mockActiveHoursNotified },
}));

const mockIsLocked = jest.fn();
jest.unstable_mockModule('../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: mockIsLocked,
}));

const mockSendReply = jest.fn();
jest.unstable_mockModule('../../services/chatbot/channelAdapters/tiktokBusiness.adapter.js', () => ({
  default: { sendReply: mockSendReply },
}));

const mockTiktokLimit = jest.fn();
jest.unstable_mockModule('../../services/chatbot/tiktokRateLimit.service.js', () => ({
  default: { checkAndLog: mockTiktokLimit },
}));

// Debounce: chạy flush ngay để test đồng bộ
const mockEnqueue = jest.fn();
jest.unstable_mockModule('../../services/chatbot/inboundReplyDebounce.service.js', () => ({
  default: { enqueue: mockEnqueue },
}));

const controller = (await import('../tiktokBusinessWebhook.controller.js')).default;

const ACCOUNT = { id: 11, id_user: 7, business_id: 'biz_1' };
const CHANNEL = { id: 21, id_chatbot: 31 };
const CHATBOT = { id: 31, id_user: 7, is_active: true, active_hours: null, replies_enabled: true };
const CONV = { id: 41 };

function receiveEvent(overrides = {}) {
  return {
    event: 'im_receive_msg',
    content: JSON.stringify({
      conversation_id: 'conv_1',
      message_id: 'm1',
      from_user: { id: 'visitor_1' },
      to_user: { id: 'biz_1' },
      text: { body: 'Xin chào' },
      ...overrides,
    }),
  };
}

/** Chạy flushCallback của lần enqueue gần nhất với 1 batch giả. */
async function flushLast(messages = [{ content: 'Xin chào', persistedMessageId: 100 }]) {
  const { flushCallback } = mockEnqueue.mock.calls.at(-1)[0];
  await flushCallback({ messages, waitMs: 0, reason: 'test' });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFindByBusinessId.mockResolvedValue(ACCOUNT);
  mockFindActiveByExternal.mockResolvedValue(CHANNEL);
  mockFindActiveChannelById.mockResolvedValue(CHANNEL);
  mockFindChatbotById.mockResolvedValue(CHATBOT);
  mockGetOrCreateConversation.mockResolvedValue(CONV);
  mockAddMessage.mockResolvedValue({ id: 100 });
  mockGetLatestMessageId.mockResolvedValue(101);
  mockIsLocked.mockResolvedValue(false);
  mockIsAiPaused.mockResolvedValue(false);
  mockActiveHoursCheck.mockResolvedValue({ allowed: true });
  mockRateCheck.mockResolvedValue({ allowed: true });
  mockTiktokLimit.mockResolvedValue({ allowed: true, currentCount: 1, limit: 10 });
  mockRoute.mockResolvedValue({ content: 'Chào bạn, mình giúp được gì?' });
  mockSendReply.mockResolvedValue({ success: true, messageId: 'out_1' });
});

describe('tiktokBusinessWebhook — nhận tin', () => {
  test('im_send_msg (tin do chính tài khoản gửi) → KHÔNG trả lời, tránh vòng lặp', async () => {
    await controller._processEvent(receiveEvent() && { ...receiveEvent(), event: 'im_send_msg' });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  test('im_receive_msg → lưu tin khách + đưa vào hàng gom với khoá theo kênh/hội thoại', async () => {
    await controller._processEvent(receiveEvent());
    expect(mockGetOrCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        chatbotId: 31, channelId: 21, externalId: 'visitor_1', source: 'tiktok_business',
      })
    );
    expect(mockAddMessage).toHaveBeenCalledWith(
      41,
      expect.objectContaining({ role: 'visitor', content: 'Xin chào', external_id: 'm1' })
    );
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'tiktok_business:21:41' })
    );
  });

  test('im_referral_msg cũng được trả lời', async () => {
    await controller._processEvent({ ...receiveEvent(), event: 'im_referral_msg' });
    expect(mockEnqueue).toHaveBeenCalled();
  });

  test('Tin trùng message_id (TikTok gửi lại) → bỏ qua', async () => {
    mockAddMessage.mockResolvedValueOnce({ id: 100, isDuplicate: true });
    await controller._processEvent(receiveEvent());
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('Chưa có chatbot nào gắn với tài khoản → không làm gì', async () => {
    mockFindActiveByExternal.mockResolvedValueOnce(null);
    await controller._processEvent(receiveEvent());
    expect(mockGetOrCreateConversation).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('Chatbot đang tắt → không lưu, không trả lời', async () => {
    mockFindChatbotById.mockResolvedValueOnce({ ...CHATBOT, is_active: false });
    await controller._processEvent(receiveEvent());
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  test('Tin không có text → bỏ qua', async () => {
    await controller._processEvent(receiveEvent({ text: undefined }));
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('tiktokBusinessWebhook — trả lời (flush)', () => {
  async function receiveAndFlush() {
    await controller._processEvent(receiveEvent());
    await flushLast();
  }

  test('Happy path: gọi AI đúng tham số → gửi qua TikTok → lưu tin của bot', async () => {
    await receiveAndFlush();
    expect(mockRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        chatbotId: 31,
        message: 'Xin chào',
        conversationId: 41,
        throughMessageId: 101,
        excludeMessageIds: [100],
      })
    );
    expect(mockSendReply).toHaveBeenCalledWith({
      accountId: 11,
      conversationId: 'conv_1',
      message: 'Chào bạn, mình giúp được gì?',
    });
    expect(mockAddMessage).toHaveBeenLastCalledWith(
      41,
      expect.objectContaining({ role: 'bot', content: 'Chào bạn, mình giúp được gì?' })
    );
  });

  test('Chạm giới hạn 10 tin / 48h của TikTok → không gọi AI, không gửi', async () => {
    mockTiktokLimit.mockResolvedValueOnce({ allowed: false, currentCount: 10, limit: 10 });
    await receiveAndFlush();
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  test('Nhân viên đã tiếp quản (AI tạm dừng) → AI im lặng', async () => {
    mockIsAiPaused.mockResolvedValueOnce(true);
    await receiveAndFlush();
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  test('Tài nguyên bị khoá topup → không trả lời', async () => {
    mockIsLocked.mockResolvedValueOnce(true);
    await receiveAndFlush();
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  test('Kênh bị tắt/đổi chatbot trong lúc chờ gom → không trả lời', async () => {
    mockFindActiveChannelById.mockResolvedValueOnce(null);
    await receiveAndFlush();
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  test('Ngoài giờ hoạt động có tin tĩnh → gửi tin tĩnh, KHÔNG gọi AI', async () => {
    mockActiveHoursCheck.mockResolvedValueOnce({
      allowed: false, shouldNotify: true, staticReply: 'Hiện ngoài giờ làm việc',
    });
    await receiveAndFlush();
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Hiện ngoài giờ làm việc' })
    );
    expect(mockActiveHoursNotified).toHaveBeenCalled();
  });

  test('Hết hạn mức AI có tin tĩnh → gửi tin tĩnh, KHÔNG gọi AI', async () => {
    mockRateCheck.mockResolvedValueOnce({
      allowed: false, shouldNotify: true, staticReply: 'Hết lượt AI', reason: 'quota',
    });
    await receiveAndFlush();
    expect(mockRoute).not.toHaveBeenCalled();
    expect(mockSendReply).toHaveBeenCalledWith(expect.objectContaining({ message: 'Hết lượt AI' }));
    expect(mockMarkRateNotified).toHaveBeenCalled();
  });

  test('AI không trả nội dung → không gửi', async () => {
    mockRoute.mockResolvedValueOnce({ content: '' });
    await receiveAndFlush();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  test('Gửi TikTok thất bại → không lưu tin bot', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSendReply.mockResolvedValueOnce({ success: false, error: 'boom' });
    await receiveAndFlush();
    const botSaves = mockAddMessage.mock.calls.filter(([, m]) => m.role === 'bot');
    expect(botSaves).toHaveLength(0);
  });
});
