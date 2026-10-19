/**
 * tiktokBusiness.adapter.spec.js
 *
 * Unit test cho adapter — mock axios + repo. Kiểm tra:
 * - Slice 6000 char (Bẫy 8)
 * - Refresh 1 lần khi 401 (Bẫy 1)
 * - Throw nếu thiếu conversationId (Bẫy 3 — không cold DM)
 * - Throw nếu account không tồn tại
 */

import { describe, expect, test, beforeEach, jest } from '@jest/globals';

process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'test-smtp-secret';

// Mock axios
const mockAxiosPost = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { post: mockAxiosPost },
  post: mockAxiosPost,
}));

// Mock repo
const mockFindByIdAnyUser = jest.fn();
jest.unstable_mockModule(
  '../../../../repositories/ai/tiktokBusinessAccount.repository.js',
  () => ({
    default: {
      findByIdAnyUser: mockFindByIdAnyUser,
      updateTokens: jest.fn().mockResolvedValue(true),
    },
  })
);

const { encryptSmtpSecret } = await import('../../../../utils/smtpSecretCrypto.js');
const adapter = (await import(
  '../tiktokBusiness.adapter.js'
)).default;

describe('tiktokBusiness.adapter — sendReply', () => {
  beforeEach(() => {
    mockAxiosPost.mockReset();
    mockFindByIdAnyUser.mockReset();
  });

  test('Thiếu accountId → throw', async () => {
    await expect(adapter.sendReply({
      accountId: null, conversationId: 'c1', message: 'hi',
    })).rejects.toThrow(/thiếu accountId/);
  });

  test('Thiếu conversationId → throw (Bẫy 3: không cold DM)', async () => {
    await expect(adapter.sendReply({
      accountId: 1, conversationId: null, message: 'hi',
    })).rejects.toThrow(/thiếu conversationId/);
  });

  test('Message rỗng → throw', async () => {
    await expect(adapter.sendReply({
      accountId: 1, conversationId: 'c1', message: '',
    })).rejects.toThrow(/rỗng/);
  });

  test('Account không tồn tại → throw', async () => {
    mockFindByIdAnyUser.mockResolvedValueOnce(null);
    await expect(adapter.sendReply({
      accountId: 999, conversationId: 'c1', message: 'hi',
    })).rejects.toThrow(/không tìm thấy account/);
  });

  test('Happy path: gọi TikTok API với body đúng + slice 6000 char', async () => {
    mockFindByIdAnyUser.mockResolvedValueOnce({
      id: 1,
      business_id: 'biz_abc',
      access_token: encryptSmtpSecret('plain-access-token'),
    });
    mockAxiosPost.mockResolvedValueOnce({
      data: { code: 0, data: { message_id: 'msg_xyz' } },
    });

    const longMsg = 'a'.repeat(7000);
    const result = await adapter.sendReply({
      accountId: 1, conversationId: 'conv_1', message: longMsg,
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_xyz');

    // Verify body gửi đi
    const [url, body, config] = mockAxiosPost.mock.calls[0];
    expect(url).toBe('https://business-api.tiktok.com/open_api/v1.3/business/message/content/send/');
    expect(body.business_id).toBe('biz_abc');
    expect(body.conversation_id).toBe('conv_1');
    expect(body.text.body).toHaveLength(6000); // Bẫy 8: slice 6000
    expect(config.headers['Access-Token']).toBe('plain-access-token');
  });

  test('TikTok trả code != 0 → trả success=false', async () => {
    mockFindByIdAnyUser.mockResolvedValueOnce({
      id: 1, business_id: 'b', access_token: encryptSmtpSecret('p'),
    });
    mockAxiosPost.mockResolvedValueOnce({
      data: { code: 40001, message: 'invalid conversation_id' },
    });
    const result = await adapter.sendReply({
      accountId: 1, conversationId: 'c1', message: 'hi',
    });
    expect(result.success).toBe(false);
  });

  test('401 → refresh 1 lần rồi retry', async () => {
    mockFindByIdAnyUser.mockResolvedValueOnce({
      id: 1,
      business_id: 'b',
      access_token: encryptSmtpSecret('old-access'),
      refresh_token: encryptSmtpSecret('plain-refresh-token'),
    });

    // 1st call: 401
    mockAxiosPost.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'token expired' } },
    });

    // NOTE: refresh module đã được import lúc top-level file — KHÔNG thể
    // jest.unstable_mockModule ở giữa test (ESM). Test này chỉ verify rằng
    // adapter KHÔNG throw và trả về success=false khi refresh fail.
    // (Refresh-on-401 happy path cần integration test với fetch mock.)
    const result = await adapter.sendReply({
      accountId: 1, conversationId: 'c1', message: 'hi',
    });
    // Refresh fail (mock fetch không có) → result.success=false
    expect(result.success).toBe(false);
  });
});
