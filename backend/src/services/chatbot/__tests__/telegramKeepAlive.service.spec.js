/**
 * P3 — keep-alive Telegram: chọn đúng tài khoản để khôi phục.
 * Ranh giới mock đúng hình dạng thật: repo.getSessionString trả blob `{ authKeys: { permanent } }`
 * hoặc null (không bọc `{data}`), sessionManager có isListening/ensureListening.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockRepo = {
  listActiveSessionKeys: jest.fn(),
  getSessionString: jest.fn(),
};

jest.unstable_mockModule('../../../repositories/chatbot/chatbotTelegram.repository.js', () => ({
  default: mockRepo,
}));

const GOOD_BLOB = { authKeys: { permanent: { 2: 'key' } } };
const BAD_BLOB = { authKeys: { permanent: {} } };

let svc;
let manager;

beforeEach(async () => {
  jest.clearAllMocks();
  jest.resetModules();
  manager = { isListening: jest.fn(() => false), ensureListening: jest.fn(async () => 'restored') };
  mockRepo.listActiveSessionKeys.mockResolvedValue([]);
  mockRepo.getSessionString.mockResolvedValue(GOOD_BLOB);
  svc = await import('../telegramKeepAlive.service.js');
});

afterEach(() => {
  svc.stopTelegramKeepAliveScheduler();
  jest.useRealTimers();
});

describe('performKeepAlive', () => {
  it('tài khoản đang listening: không đụng tới, không đọc blob', async () => {
    mockRepo.listActiveSessionKeys.mockResolvedValue([1]);
    manager.isListening.mockReturnValue(true);
    const r = await svc.performKeepAlive({ sessionManager: manager });
    expect(r).toEqual({ total: 1, alive: 1, restored: 0, failed: 0, skipped: 0 });
    expect(mockRepo.getSessionString).not.toHaveBeenCalled();
    expect(manager.ensureListening).not.toHaveBeenCalled();
  });

  it('session_ok=true mà không listening: khôi phục', async () => {
    mockRepo.listActiveSessionKeys.mockResolvedValue([7]);
    const r = await svc.performKeepAlive({ sessionManager: manager });
    expect(manager.ensureListening).toHaveBeenCalledWith(7);
    expect(r.restored).toBe(1);
  });

  it('session_ok=false (blob hết khoá hoặc null): KHÔNG thử khôi phục', async () => {
    mockRepo.listActiveSessionKeys.mockResolvedValue([8, 9]);
    mockRepo.getSessionString.mockResolvedValueOnce(BAD_BLOB).mockResolvedValueOnce(null);
    const r = await svc.performKeepAlive({ sessionManager: manager });
    expect(manager.ensureListening).not.toHaveBeenCalled();
    expect(r.skipped).toBe(2);
  });

  it('chỉ tài khoản hợp lệ được thử khi lẫn tài khoản hỏng; một tài khoản lỗi không chặn tài khoản sau', async () => {
    mockRepo.listActiveSessionKeys.mockResolvedValue([1, 2, 3]);
    mockRepo.getSessionString
      .mockResolvedValueOnce(GOOD_BLOB)
      .mockResolvedValueOnce(BAD_BLOB)
      .mockResolvedValueOnce(GOOD_BLOB);
    manager.ensureListening.mockResolvedValueOnce('failed').mockResolvedValueOnce('restored');
    const r = await svc.performKeepAlive({ sessionManager: manager });
    expect(manager.ensureListening.mock.calls.map((c) => c[0])).toEqual([1, 3]);
    expect(r).toMatchObject({ total: 3, failed: 1, restored: 1, skipped: 1 });
  });

  it('đọc danh sách lỗi: trả tổng 0, không ném', async () => {
    mockRepo.listActiveSessionKeys.mockRejectedValue(new Error('db down'));
    const r = await svc.performKeepAlive({ sessionManager: manager });
    expect(r.total).toBe(0);
  });
});

describe('startTelegramKeepAliveScheduler', () => {
  it('KHÔNG quét ngay lúc khởi động, quét sau mỗi 5 phút', async () => {
    jest.useFakeTimers();
    jest.unstable_mockModule('../inProcChannelGateway/index.js', () => ({
      getSessionManager: () => manager,
    }));
    svc = await import('../telegramKeepAlive.service.js');
    mockRepo.listActiveSessionKeys.mockResolvedValue([5]);
    svc.startTelegramKeepAliveScheduler();
    expect(mockRepo.listActiveSessionKeys).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(svc.__test__.KEEP_ALIVE_INTERVAL_MS);
    expect(mockRepo.listActiveSessionKeys).toHaveBeenCalledTimes(1);
    expect(manager.ensureListening).toHaveBeenCalledWith(5);
  });
});
