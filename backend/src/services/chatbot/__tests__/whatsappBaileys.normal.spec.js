import { jest } from '@jest/globals';

/**
 * Kiểm tra trường hợp bình thường: thư mục phiên tạo được hoặc đã tồn tại
 * thì sessionRootReady = true và hoạt động bình thường.
 */

jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  Browsers: { appropriate: jest.fn() },
  DisconnectReason: { loggedOut: 401 },
  downloadMediaMessage: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(),
  makeWASocket: jest.fn(),
  useMultiFileAuthState: jest.fn(),
  jidNormalizedUser: (jid) => jid,
}));

describe('whatsappBaileys.service — trường hợp bình thường', () => {
  it('khi hệ thống file bình thường: sessionRootReady=true, isSessionRootReady()=true', async () => {
    const { isSessionRootReady, sessionRootReady, SESSION_ROOT } = await import(
      '../whatsappBaileys.service.js'
    );

    expect(typeof SESSION_ROOT).toBe('string');
    expect(SESSION_ROOT.endsWith('whatsapp-sessions')).toBe(true);
    expect(sessionRootReady).toBe(true);
    expect(isSessionRootReady()).toBe(true);
  });
});
