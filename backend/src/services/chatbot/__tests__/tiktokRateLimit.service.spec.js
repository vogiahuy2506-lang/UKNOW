/**
 * tiktokRateLimit.service.spec.js
 *
 * Unit test cho rate limit service — mock Redis + DB. Kiểm tra:
 * - allowed=true khi count < 10 (Bẫy 3)
 * - allowed=false khi count >= 10
 * - Redis miss → fallback SQL
 * - SQL log fail → fail-closed (Bẫy 3)
 * - cleanupOldLogs xử lý được bảng chưa tồn tại (42P01)
 */

import { describe, expect, test, beforeEach, jest } from '@jest/globals';

const mockGet = jest.fn();
const mockIncr = jest.fn();
const mockExpire = jest.fn();
jest.unstable_mockModule('ioredis', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      get: mockGet,
      incr: mockIncr,
      expire: mockExpire,
    })),
  };
});

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  __esModule: true,
  default: { query: mockQuery },
}));

const service = (await import('../tiktokRateLimit.service.js')).default;

describe('tiktokRateLimit.service — checkAndLog', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockIncr.mockReset();
    mockExpire.mockReset();
    mockQuery.mockReset();
  });

  test('Redis hit: count < 10 → allowed=true', async () => {
    mockGet.mockResolvedValueOnce('3');
    mockIncr.mockResolvedValueOnce(4);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await service.checkAndLog({
      businessId: 'b', uniqueIdentifier: 'u', conversationId: 'c',
    });
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(4);
  });

  test('Redis hit: count >= 10 → allowed=false (Bẫy 3)', async () => {
    mockGet.mockResolvedValueOnce('10');
    const result = await service.checkAndLog({
      businessId: 'b', uniqueIdentifier: 'u', conversationId: 'c',
    });
    expect(result.allowed).toBe(false);
    expect(result.currentCount).toBe(10);
    expect(mockIncr).not.toHaveBeenCalled(); // Không incr khi đã >= 10
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('Redis miss: fallback SQL count', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 5 }] });
    mockIncr.mockResolvedValueOnce(6);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await service.checkAndLog({
      businessId: 'b', uniqueIdentifier: 'u', conversationId: 'c',
    });
    expect(result.allowed).toBe(true);
    // SQL count được gọi
    const [countSql] = mockQuery.mock.calls[0];
    expect(countSql).toMatch(/SELECT COUNT/);
  });

  test('Redis miss + SQL count = 10 → allowed=false', async () => {
    mockGet.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 10 }] });
    const result = await service.checkAndLog({
      businessId: 'b', uniqueIdentifier: 'u', conversationId: 'c',
    });
    expect(result.allowed).toBe(false);
  });

  test('SQL log INSERT fail → fail-closed (Bẫy 3)', async () => {
    mockGet.mockResolvedValueOnce('0');
    mockIncr.mockResolvedValueOnce(1);
    // Chỉ có 1 call db.query: log INSERT fail
    mockQuery.mockRejectedValueOnce(new Error('SQL log fail'));
    const result = await service.checkAndLog({
      businessId: 'b', uniqueIdentifier: 'u', conversationId: 'c',
    });
    expect(result.allowed).toBe(false);
  });
});

describe('tiktokRateLimit.service — cleanupOldLogs', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('Bảng chưa tồn tại (42P01) → return deleted=0 không throw', async () => {
    const err = new Error('relation does not exist');
    err.code = '42P01';
    mockQuery.mockRejectedValueOnce(err);
    const result = await service.cleanupOldLogs();
    expect(result.deleted).toBe(0);
  });

  test('Xoá thành công trả deleted count', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 42 });
    const result = await service.cleanupOldLogs();
    expect(result.deleted).toBe(42);
  });
});
