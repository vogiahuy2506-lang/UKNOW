/**
 * Tests for `telegram.adapter.js`. `verifyWebhookSecret` is async —
 * the shared secret is pulled from the in-process channel gateway
 * state.
 */

import { describe, expect, it, afterAll } from '@jest/globals';

const { configureChannel } = await import(
  '../inProcChannelGateway/index.js'
);

const TEST_SECRET = 'test-telegram-secret';
configureChannel('telegram', { secret: TEST_SECRET });

const telegramAdapter = (await import('../channelAdapters/telegram.adapter.js')).default;

// Reset singleton secret khi tất cả test xong — tránh leak vào test
// khác trong cùng Jest worker (đặc biệt `telegramGatewayLazyClient.spec.js`
// yêu cầu `isConfigured()===false`).
afterAll(() => {
  configureChannel('telegram', { secret: '' });
});

describe('telegram.adapter', () => {
  describe('verifyWebhookSecret', () => {
    it('accepts the matching shared secret', async () => {
      await expect(
        telegramAdapter.verifyWebhookSecret(TEST_SECRET)
      ).resolves.not.toThrow();
    });

    it('rejects mismatched secrets', async () => {
      await expect(
        telegramAdapter.verifyWebhookSecret('wrong')
      ).rejects.toThrow(/Invalid Telegram gateway secret/);
    });

    it('rejects missing secret', async () => {
      await expect(
        telegramAdapter.verifyWebhookSecret(null)
      ).rejects.toThrow(/Invalid Telegram gateway secret/);
    });

    it('throws when backend secret is unconfigured', async () => {
      const facade = (await import(
        '../inProcChannelGateway/index.js'
      )).getChannelGateway('telegram');
      const prev = facade.getSecret();
      facade.setSharedSecret('');
      try {
        await expect(
          telegramAdapter.verifyWebhookSecret('anything')
        ).rejects.toThrow(/not configured/);
      } finally {
        facade.setSharedSecret(prev);
      }
    });
  });

  describe('parseWebhookEvent', () => {
    it('parses a private-chat text message', () => {
      const parsed = telegramAdapter.parseWebhookEvent({
        telegram_user_id: 123456789,
        chat_id: 98765,
        message_id: 100,
        text: 'hello',
        sender_id: 111,
        sender_name: 'Bob',
        is_group: false,
        is_private: true,
      });

      expect(parsed).toEqual({
        event: 'message',
        message: 'hello',
        senderId: '111',
        senderName: 'Bob',
        chatId: '98765',
        isGroup: false,
        isPrivate: true,
        telegramUserId: 123456789,
        // Bug #3 fix: surface messageId for InboundReplyDebounceService dedupe.
        messageId: 100,
      });
    });

    it('falls back to `message` field if `text` missing', () => {
      const parsed = telegramAdapter.parseWebhookEvent({
        telegram_user_id: 123,
        chat_id: 1,
        message: 'hi via message fallback',
        sender_id: 9,
      });
      expect(parsed.message).toBe('hi via message fallback');
    });

    it('returns null fields for a non-object body', () => {
      const parsed = telegramAdapter.parseWebhookEvent(null);
      expect(parsed.event).toBeNull();
      expect(parsed.message).toBeNull();
      expect(parsed.senderId).toBeNull();
    });

    it('coerces isPrivate from absence of is_group flag', () => {
      const parsed = telegramAdapter.parseWebhookEvent({
        telegram_user_id: 123,
        chat_id: 1,
        text: 'hi',
        sender_id: 9,
      });
      expect(parsed.isGroup).toBe(false);
      expect(parsed.isPrivate).toBe(true);
    });
  });
});
