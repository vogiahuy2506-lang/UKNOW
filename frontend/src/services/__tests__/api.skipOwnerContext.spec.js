import { describe, it, expect, beforeEach } from 'vitest';
import api, { setAuthStore } from '../api';

/**
 * Chuông thông báo (PR-2 thông báo, 10/10/2026): `/api/notifications/*` thuộc về NGƯỜI đăng nhập. authMiddleware
 * thấy `X-Owner-Context` sẽ kiểm tư cách nhân viên của công ty đó và trả 403 (EMPLOYEE_LOCKED / INVALID_CONTEXT)
 * — nhân viên bị khoá ở một công ty sẽ mất luôn chuông. Request chuông truyền `skipOwnerContext: true` để
 * interceptor không gắn header đó; mọi request khác giữ nguyên hành vi cũ.
 */

const okAdapter = (seen) => (config) => {
  seen.push(config);
  return Promise.resolve({ data: { success: true }, status: 200, statusText: 'OK', headers: {}, config });
};

beforeEach(() => {
  setAuthStore({
    getState: () => ({ activeContext: { type: 'employee', ownerId: 42 } }),
  });
});

describe('api.js — cờ skipOwnerContext', () => {
  it('mặc định: ngữ cảnh nhân viên → gắn X-Owner-Context (hành vi cũ không đổi)', async () => {
    const seen = [];
    await api.get('/campaigns', { adapter: okAdapter(seen) });
    expect(seen[0].headers['X-Owner-Context']).toBe('42');
  });

  it('skipOwnerContext: true → KHÔNG gắn X-Owner-Context dù đang ở ngữ cảnh nhân viên', async () => {
    const seen = [];
    await api.get('/notifications', { adapter: okAdapter(seen), skipOwnerContext: true });
    expect(seen[0].headers['X-Owner-Context']).toBeUndefined();
  });

  it('skipOwnerContext áp cả cho lệnh ghi (POST/PUT)', async () => {
    const seen = [];
    await api.post('/notifications/read-all', null, { adapter: okAdapter(seen), skipOwnerContext: true });
    await api.put('/notifications/preferences', { eventType: 'x', emailEnabled: false }, { adapter: okAdapter(seen), skipOwnerContext: true });
    expect(seen).toHaveLength(2);
    expect(seen.every((c) => c.headers['X-Owner-Context'] === undefined)).toBe(true);
  });
});
