import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/** D-13 — repository chốt trần `extra_context`: đường ghi nào cũng không lách được (controller đã chặn trước). */
const mockQuery = jest.fn();
jest.unstable_mockModule('../../config/database.js', () => ({ default: { query: mockQuery } }));

const { default: repo } = await import('../ai/businessProfile.repository.js');

const profile = (extra_context) => ({ company_name: 'Shop A', industry: 'Bán lẻ', target_audience: '[]', extra_context });

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({ rows: [{ id: 1 }] });
});

describe('businessProfileRepository.upsert — trần extra_context', () => {
  it('20.001 ký tự → ném lỗi 400 mã EXTRA_CONTEXT_TOO_LONG, KHÔNG chạy SQL', async () => {
    const err = await repo.upsert(7, profile('a'.repeat(20001))).catch((e) => e);

    expect(err.status).toBe(400);
    expect(err.code).toBe('EXTRA_CONTEXT_TOO_LONG');
    expect(err.message).toMatch(/quá dài/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('đúng 20.000 ký tự, rỗng, null, undefined → ghi bình thường', async () => {
    for (const value of ['a'.repeat(20000), '', null, undefined]) {
      mockQuery.mockClear();
      await expect(repo.upsert(7, profile(value))).resolves.toEqual({ id: 1 });
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1][8]).toBe(value);
    }
  });
});
