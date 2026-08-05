import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-rate-limit';

const { rateLimitKeyForRequest } = await import('../../middleware/rateLimiter.middleware.js');
const {
  attachUserIdForRateLimit,
  attachSseUserIdForRateLimit,
} = await import('../../middleware/auth.middleware.js');
const sseService = (await import('../../services/sse.service.js')).default;

function makeRes() {
  const writes = [];
  return {
    writes,
    write: jest.fn((chunk) => {
      writes.push(chunk);
      return true;
    }),
    end: jest.fn(),
  };
}

describe('rateLimitKeyForRequest', () => {
  it('returns user:<id> when rateLimitUserId is set', () => {
    expect(rateLimitKeyForRequest({ rateLimitUserId: 42 })).toBe('user:42');
  });

  it('returns ip:<ip> when no user id', () => {
    const key = rateLimitKeyForRequest({
      ip: '203.0.113.10',
      headers: {},
      socket: { remoteAddress: '203.0.113.10' },
    });
    // Must be the real IP — ipKeyGenerator(req) wrongly yields "[object Object]"
    expect(key).toBe('ip:203.0.113.10');
    expect(key).not.toContain('[object Object]');
  });
});

describe('attachUserIdForRateLimit', () => {
  it('sets rateLimitUserId from valid Bearer token and calls next', () => {
    const token = jwt.sign({ userId: 99 }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();
    attachUserIdForRateLimit(req, {}, next);
    expect(req.rateLimitUserId).toBe(99);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next without 401 when token is invalid', () => {
    const req = { headers: { authorization: 'Bearer not-a-jwt' } };
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();
    attachUserIdForRateLimit(req, res, next);
    expect(req.rateLimitUserId).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('attachSseUserIdForRateLimit', () => {
  it('sets rateLimitUserId from query token', () => {
    const token = jwt.sign({ userId: 7 }, process.env.JWT_SECRET);
    const req = { query: { token } };
    const next = jest.fn();
    attachSseUserIdForRateLimit(req, {}, next);
    expect(req.rateLimitUserId).toBe(7);
    expect(next).toHaveBeenCalled();
  });
});

describe('sseService', () => {
  beforeEach(() => {
    sseService._resetForTests();
  });

  it('evicts oldest client when adding a 6th connection for same user', () => {
    const clients = Array.from({ length: 6 }, () => makeRes());
    for (const res of clients) {
      sseService.addClient(1, res);
    }
    expect(sseService.getClientCountForUser(1)).toBe(5);
    expect(sseService.getTotalClients()).toBe(5);
    expect(clients[0].end).toHaveBeenCalled();
    expect(clients[5].end).not.toHaveBeenCalled();
  });

  it('delivers broadcast when addClient used numeric id and broadcast uses string', () => {
    const res = makeRes();
    sseService.addClient(7, res);
    sseService.broadcast('7', 'inbox:new_message', { hello: true });
    expect(res.write).toHaveBeenCalled();
    expect(res.writes[0]).toContain('inbox:new_message');
    expect(res.writes[0]).toContain('"hello":true');
  });
});
