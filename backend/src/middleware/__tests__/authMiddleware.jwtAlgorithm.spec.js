process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-algorithm-pin';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

/**
 * Mọi jwt.verify trong auth.middleware.js chỉ nhận HS256 (thuật toán hệ thống ký).
 */

const mockQuery = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const {
  default: authMiddleware,
  attachUserIdForRateLimit,
  attachSseUserIdForRateLimit,
} = await import('../auth.middleware.js');

function createRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const sign = (alg) => jwt.sign({ userId: 5 }, process.env.JWT_SECRET, { algorithm: alg });

/** Token alg=none (không chữ ký) dựng tay. */
function unsignedToken() {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ userId: 5 })}.`;
}

describe('authMiddleware — chỉ nhận JWT HS256', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it.each(['HS384', 'HS512'])('token %s (đúng khoá) → 401, không tra DB', async (alg) => {
    const req = { headers: { authorization: `Bearer ${sign(alg)}` } };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('token alg=none → 401', async () => {
    const req = { headers: { authorization: `Bearer ${unsignedToken()}` } };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('token HS256 → nạp user và gọi next', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 5, status: 'active', active_plan_id: null, updated_at: null, grace_period_days: 0 }],
    });
    const req = { headers: { authorization: `Bearer ${sign('HS256')}` } };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(5);
  });
});

describe('attachUserIdForRateLimit / attachSseUserIdForRateLimit — chỉ nhận HS256', () => {
  it('Bearer HS512 → không gắn rateLimitUserId; HS256 → gắn', () => {
    const bad = { headers: { authorization: `Bearer ${sign('HS512')}` } };
    const good = { headers: { authorization: `Bearer ${sign('HS256')}` } };
    const next = jest.fn();

    attachUserIdForRateLimit(bad, {}, next);
    attachUserIdForRateLimit(good, {}, next);

    expect(bad.rateLimitUserId).toBeUndefined();
    expect(good.rateLimitUserId).toBe(5);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('query token HS384 → không gắn; HS256 → gắn', () => {
    const bad = { query: { token: sign('HS384') } };
    const good = { query: { token: sign('HS256') } };
    const next = jest.fn();

    attachSseUserIdForRateLimit(bad, {}, next);
    attachSseUserIdForRateLimit(good, {}, next);

    expect(bad.rateLimitUserId).toBeUndefined();
    expect(good.rateLimitUserId).toBe(5);
  });
});
