import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClientPost, mockCreate } = vi.hoisted(() => {
  const post = vi.fn();
  const create = vi.fn(() => ({ post }));
  return { mockClientPost: post, mockCreate: create };
});

vi.mock('axios', () => ({
  default: { create: mockCreate },
}));

import { postPublicLead } from '../leadPublicApi';

beforeEach(() => {
  mockClientPost.mockReset();
});

describe('postPublicLead', () => {
  it('axios.create được gọi với baseURL fallback /api + Content-Type JSON + timeout 20s', () => {
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const cfg = mockCreate.mock.calls[0][0];
    expect(cfg).toMatchObject({
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    expect(typeof cfg.baseURL).toBe('string');
    expect(cfg.baseURL.length).toBeGreaterThan(0);
  });

  it('POST /public/leads với payload + trả về response axios', async () => {
    const payload = { email: 'a@b.com', name: 'Alice' };
    const response = { data: { success: true, data: { id: 5 } }, status: 200 };
    mockClientPost.mockResolvedValueOnce(response);

    const result = await postPublicLead(payload);
    expect(mockClientPost).toHaveBeenCalledWith('/public/leads', payload);
    expect(result).toBe(response);
  });

  it('lỗi từ axios bubble lên caller (không nuốt error)', async () => {
    const err = new Error('Network down');
    mockClientPost.mockRejectedValueOnce(err);
    await expect(postPublicLead({ email: 'x' })).rejects.toThrow('Network down');
  });
});
