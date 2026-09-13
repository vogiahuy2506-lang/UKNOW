/**
 * Smoke tests for the Telegram endpoints exposed by
 * `chatbotApi.service.js`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockPost = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../../../services/api', () => ({
  default: {
    post: (...args) => mockPost(...args),
    get: (...args) => mockGet(...args),
    delete: (...args) => mockDelete(...args),
  },
}));
vi.mock('../../../../services/chatbotApi', () => ({
  default: {},
}));

const chatbotApi = (await import('../chatbotApi.service.js')).default;

describe('chatbotApi telegram endpoints', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
    mockDelete.mockReset();
    mockPost.mockImplementation(() => Promise.resolve({ data: { ok: true } }));
    mockGet.mockImplementation(() => Promise.resolve({ data: { ok: true } }));
    mockDelete.mockImplementation(() => Promise.resolve({ data: { ok: true } }));
  });

  it('initTelegramLogin() POSTs /ai/chatbot/telegram-accounts/init with an extended timeout', () => {
    chatbotApi.initTelegramLogin();
    expect(mockPost).toHaveBeenCalledWith(
      '/ai/chatbot/telegram-accounts/init',
      {},
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('initTelegramLogin() forwards backend 503 code via rejected AxiosError', async () => {
    const ax = new Error('Request failed with status code 503');
    ax.isAxiosError = true;
    ax.response = {
      status: 503,
      data: {
        success: false,
        code: 'TELEGRAM_STUB_TRANSPORT',
        message: 'Telegram transport is not implemented on this server.',
      },
    };
    mockPost.mockReturnValueOnce(Promise.reject(ax));
    await expect(chatbotApi.initTelegramLogin()).rejects.toMatchObject({
      response: { data: { code: 'TELEGRAM_STUB_TRANSPORT' } },
    });
  });

  it('checkTelegramLoginStatus() GETs /ai/chatbot/telegram-accounts/status/:id', () => {
    chatbotApi.checkTelegramLoginStatus('abc123');
    expect(mockGet).toHaveBeenCalledWith('/ai/chatbot/telegram-accounts/status/abc123');
  });
});
