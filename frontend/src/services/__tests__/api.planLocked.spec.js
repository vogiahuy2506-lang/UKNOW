import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import api, { setAuthStore } from '../api';

/**
 * Cổng khoá gói hết hạn (PLAN_CONG_KHOA_GOI_HET_HAN_2026-10-11): `requireActivePlan` trả 403 với mã
 * PLAN_EXPIRED / NO_ACTIVE_PLAN. Interceptor phải ghi mã vào store (để MainLayout dựng modal khoá), đánh dấu
 * `error._planLocked`, và vẫn trả lỗi cho trang gọi — KHÔNG đụng phiên (không refresh token, không đăng xuất).
 * Mọi 403 khác (FORBIDDEN…) không được chạm vào cờ này.
 */

// Adapter tự viết không tự "settle" như adapter thật → dựng sẵn AxiosError cho status lỗi.
const reply = (status, data) => (config) => {
  const response = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response));
};

let state;

beforeEach(() => {
  state = {
    planLockedCode: null,
    activeContext: { type: 'self' },
    setPlanLockedCode: vi.fn((code) => {
      state.planLockedCode = code;
    }),
  };
  setAuthStore({ getState: () => state });
});

describe('api.js — 403 PLAN_EXPIRED / NO_ACTIVE_PLAN', () => {
  it('403 PLAN_EXPIRED → ghi planLockedCode vào store, promise reject, error._planLocked = true', async () => {
    const err = await api
      .get('/products', { adapter: reply(403, { success: false, code: 'PLAN_EXPIRED', message: 'Gói đã hết hạn' }) })
      .then(() => null, (e) => e);

    expect(err).not.toBeNull();
    expect(err.response.status).toBe(403);
    expect(err._planLocked).toBe(true);
    expect(state.planLockedCode).toBe('PLAN_EXPIRED');
    expect(state.setPlanLockedCode).toHaveBeenCalledWith('PLAN_EXPIRED');
  });

  it('403 NO_ACTIVE_PLAN → ghi đúng mã NO_ACTIVE_PLAN', async () => {
    const err = await api
      .get('/customers', { adapter: reply(403, { success: false, code: 'NO_ACTIVE_PLAN' }) })
      .then(() => null, (e) => e);

    expect(err._planLocked).toBe(true);
    expect(state.planLockedCode).toBe('NO_ACTIVE_PLAN');
  });

  it('403 mã khác (FORBIDDEN) → KHÔNG set planLockedCode, không đánh dấu _planLocked', async () => {
    const err = await api
      .get('/campaigns', { adapter: reply(403, { success: false, code: 'FORBIDDEN' }) })
      .then(() => null, (e) => e);

    expect(err.response.status).toBe(403);
    expect(err._planLocked).toBeUndefined();
    expect(state.setPlanLockedCode).not.toHaveBeenCalled();
    expect(state.planLockedCode).toBeNull();
  });

  it('mã PLAN_EXPIRED nhưng status khác 403 → không set (chỉ 403 mới là cổng khoá)', async () => {
    const err = await api
      .get('/campaigns', { adapter: reply(500, { code: 'PLAN_EXPIRED' }) })
      .then(() => null, (e) => e);

    expect(err.response.status).toBe(500);
    expect(state.setPlanLockedCode).not.toHaveBeenCalled();
  });

  it('request thành công không chạm vào cờ khoá', async () => {
    await api.get('/campaigns', { adapter: reply(200, { success: true }) });
    expect(state.setPlanLockedCode).not.toHaveBeenCalled();
  });
});
