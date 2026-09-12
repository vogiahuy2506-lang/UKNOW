import { jest } from '@jest/globals';

/**
 * Kiểm tra phòng thủ: lỗi tạo thư mục phiên (EACCES trên production 12/09/2026)
 * KHÔNG được phép giết cả backend lúc module load.
 */

const mockMkdirSync = jest.fn(() => {
  const err = new Error("EACCES: permission denied, mkdir '/app/whatsapp-sessions'");
  err.code = 'EACCES';
  throw err;
});

const mockExistsSync = jest.fn(() => false);

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readdirSync: jest.fn(() => []),
  readFileSync: jest.fn(() => '{}'),
  rmSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.unstable_mockModule('@whiskeysockets/baileys', () => ({
  Browsers: { appropriate: jest.fn() },
  DisconnectReason: { loggedOut: 401 },
  downloadMediaMessage: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(),
  makeWASocket: jest.fn(),
  useMultiFileAuthState: jest.fn(),
  jidNormalizedUser: (jid) => jid,
}));

describe('whatsappBaileys.service — EACCES phòng thủ ở module load', () => {
  let consoleErrorSpy;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('khi mkdirSync ném EACCES: module vẫn import thành công, sessionRootReady=false, console.error ghi cảnh báo', async () => {
    const { isSessionRootReady, sessionRootReady } = await import('../whatsappBaileys.service.js');

    expect(sessionRootReady).toBe(false);
    expect(isSessionRootReady()).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WhatsApp/Baileys] Không tạo được thư mục phiên'),
      expect.stringContaining('EACCES')
    );
  });

  it('gọi connectSession khi sessionRootReady=false thì trả lỗi rõ ràng cho caller, không ném crash', async () => {
    const { connectSession } = await import('../whatsappBaileys.service.js');

    await expect(connectSession('test-key')).rejects.toThrow(
      /Thư mục lưu phiên WhatsApp không khả dụng/
    );
  });

  it('gọi restorePersistedSessions khi sessionRootReady=false thì bỏ qua và không ném lỗi', async () => {
    const { restorePersistedSessions } = await import('../whatsappBaileys.service.js');

    await expect(restorePersistedSessions()).resolves.toBeUndefined();
  });

  it('gọi deleteSessionFiles khi sessionRootReady=false thì trả false an toàn', async () => {
    const { deleteSessionFiles } = await import('../whatsappBaileys.service.js');

    expect(deleteSessionFiles('test-key')).toBe(false);
  });

  it('gọi listPersistedSessions khi sessionRootReady=false thì trả về mảng rỗng []', async () => {
    const { listPersistedSessions } = await import('../whatsappBaileys.service.js');

    expect(listPersistedSessions()).toEqual([]);
  });
});
