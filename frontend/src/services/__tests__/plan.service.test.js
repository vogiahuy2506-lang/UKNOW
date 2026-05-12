import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const { getPlans, createPayment, getPaymentStatus } = await import('../plan.service');
const { default: api } = await import('../api');

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe('plan.service', () => {
  it('getPlans → GET /plans, trả nguyên axios response (chưa unwrap .data)', async () => {
    const axiosRes = { data: { success: true, data: [{ id: 1, code: 'pro' }] } };
    api.get.mockResolvedValue(axiosRes);
    const res = await getPlans();
    expect(api.get).toHaveBeenCalledWith('/plans');
    expect(res).toBe(axiosRes);
  });

  it('createPayment → POST /payments/create-payment với { planCode, userEmail }', async () => {
    api.post.mockResolvedValue({ data: { qrUrl: '...' } });
    await createPayment('pro_yearly', 'a@x.com');
    expect(api.post).toHaveBeenCalledWith('/payments/create-payment', {
      planCode: 'pro_yearly',
      userEmail: 'a@x.com',
    });
  });

  it('getPaymentStatus → GET /payments/status/:orderCode', async () => {
    api.get.mockResolvedValue({ data: { status: 'PAID' } });
    await getPaymentStatus('ORDER-123');
    expect(api.get).toHaveBeenCalledWith('/payments/status/ORDER-123');
  });

  it('axios reject → propagate lên caller', async () => {
    api.get.mockRejectedValue(new Error('500'));
    await expect(getPlans()).rejects.toThrow('500');
  });
});
