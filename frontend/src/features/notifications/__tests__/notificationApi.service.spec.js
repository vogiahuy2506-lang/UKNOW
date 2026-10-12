/**
 * Đánh dấu đã đọc gửi thân `{}`: thân `null` thành JSON "null" và bị express.json() strict trả 400 (production 10–12/10/2026).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api, setAuthStore: vi.fn() }));

const { default: notificationApi } = await import('../services/notificationApi.service');

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({ data: { data: { ok: true } } });
});

describe('notificationApi — đánh dấu đã đọc', () => {
  it('markRead gửi thân {} và skipOwnerContext', async () => {
    await notificationApi.markRead(12);
    expect(api.post).toHaveBeenCalledWith('/notifications/12/read', {}, { skipOwnerContext: true });
  });

  it('markAllRead gửi thân {} và skipOwnerContext', async () => {
    await notificationApi.markAllRead();
    expect(api.post).toHaveBeenCalledWith('/notifications/read-all', {}, { skipOwnerContext: true });
  });
});
